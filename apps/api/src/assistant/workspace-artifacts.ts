import type { WorkspaceAssistantTurn, WorkspaceAssistantArtifact } from "@markos/shared-types";
import { prisma } from "../db/prisma";

/** Cards describe persisted work. Provider prose is never evidence of a completed artifact. */
export async function assistantArtifacts(workspaceId: string, turns: WorkspaceAssistantTurn[]) {
  const campaignIds = [...new Set(turns.flatMap((turn) => (turn.status === "COMPLETED" && turn.campaignId ? [turn.campaignId] : [])))];
  const contentIds = [...new Set(turns.flatMap((turn) => (turn.contentItemId ? [turn.contentItemId] : [])))];
  const [campaigns, contents] = await Promise.all([
    campaignIds.length
      ? prisma.campaign.findMany({
          where: { workspaceId, deletedAt: null, id: { in: campaignIds } },
          select: {
            id: true,
            title: true,
            objective: true,
            content: true,
            startsAt: true,
            endsAt: true,
            durationDays: true,
            publishesPerDay: true,
            status: true
          }
        })
      : [],
    contentIds.length
      ? prisma.contentItem.findMany({
          where: { workspaceId, deletedAt: null, id: { in: contentIds } },
          select: { id: true, brief: true, caption: true, contentType: true, status: true }
        })
      : []
  ]);
  return turns.map((turn) => {
    let result: WorkspaceAssistantArtifact | undefined;
    const campaign = campaigns.find((row) => row.id === turn.campaignId),
      content = contents.find((row) => row.id === turn.contentItemId);
    if (campaign) {
      const plan = campaign.content as { summary?: unknown; weeklyCadence?: { days?: { posts?: unknown[] }[] }[] };
      const weeks = Array.isArray(plan.weeklyCadence) ? plan.weeklyCadence : [];
      const count = weeks.reduce(
        (total, week) => total + (Array.isArray(week.days) ? week.days.reduce((n, day) => n + (Array.isArray(day.posts) ? day.posts.length : 0), 0) : 0),
        0
      );
      result = {
        kind: "CAMPAIGN",
        id: campaign.id,
        title: campaign.title,
        summary: (typeof plan.summary === "string" ? plan.summary : (campaign.objective ?? "")).slice(0, 280),
        status: campaign.status,
        startsAt: campaign.startsAt.toISOString(),
        endsAt: campaign.endsAt.toISOString(),
        durationDays: campaign.durationDays,
        publishesPerDay: campaign.publishesPerDay,
        ...(count ? { postCount: count } : {})
      };
    } else if (content)
      result = {
        kind: "CONTENT",
        id: content.id,
        title: content.brief?.split("\n")[0]?.slice(0, 120) || content.caption.slice(0, 100) || "",
        summary: content.caption.slice(0, 280),
        contentType: content.contentType,
        status: content.status
      };
    else if (turn.strategy && turn.status === "COMPLETED")
      result = {
        kind: "STRATEGY",
        id: turn.id,
        title: turn.proposal?.summary.slice(0, 120) || "",
        summary: typeof turn.strategy.summary === "string" ? turn.strategy.summary.slice(0, 280) : ""
      };
    return result ? { ...turn, result } : turn;
  });
}
