import type { CampaignRecord, ContentRecord } from "@markos/shared-types";

/** Build identities before filtering; actionIndex belongs to the week, not the visible day. */
export function campaignRows(campaign: CampaignRecord, items: ContentRecord[]) {
  return campaign.content.weeklyCadence.flatMap((week) => {
    let index = 0;
    return week.days.flatMap((day) =>
      day.posts.map((post) => {
        const actionIndex = index++;
        const item = items.find((entry) => entry.campaignWeek === week.week && entry.campaignActionIndex === actionIndex);
        const date = new Date(campaign.startsAt);
        date.setUTCDate(date.getUTCDate() + day.day - 1);
        return {
          post,
          week: week.week,
          focus: week.focus,
          day: day.day,
          actionIndex,
          key: `${week.week}:${actionIndex}`,
          date: date.toISOString(),
          item,
          type: item?.contentType ?? post.contentType,
          status: item?.status ?? "IDEA"
        };
      })
    );
  });
}
