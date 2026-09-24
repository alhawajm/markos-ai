import React, { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Share2 } from "lucide-react-native";
import type { ContentType } from "@markos/shared-types";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Field, Loading, Notice, Row, Screen, Txt } from "../../src/ui";
import { ContentCard, QueryFailure, StatusBadge, typeLabel, statusLabel } from "../../src/content";
import { errorMessage } from "../../src/errors";
import { shareFile } from "../../src/share-file";
import { campaignRows } from "../../src/campaigns/review-model";

export default function CampaignReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, scope, epoch, queryClient } = useAccount();
  const { t, colors, locale, rtl } = useAppearance();
  const router = useRouter();
  const focused = useIsFocused();
  const [view, setView] = useState<"plan" | "strategy">("plan");
  const [day, setDay] = useState<number | null>(null);
  const [format, setFormat] = useState<ContentType | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const result = useQuery({ queryKey: [scope, "campaign", id], queryFn: () => api.campaignReview(id), enabled: focused, refetchInterval: 6000 });
  const exportPdf = useMutation({
    mutationFn: async () =>
      shareFile(
        new Uint8Array(await api.exportCampaignPdf(id)),
        `MARKOS-campaign-${id}.pdf`,
        "application/pdf",
        epoch,
        t("Share campaign PDF", "مشاركة ملف الحملة PDF")
      )
  });
  const create = useMutation({
    mutationFn: (slot: { week: number; actionIndex: number }) => api.approveCampaignSuggestion(id, slot),
    onSuccess: async (item) => {
      queryClient.setQueryData([scope, "content", item.id], item);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [scope, "campaign", id] }),
        queryClient.invalidateQueries({ queryKey: [scope, "content"] }),
        queryClient.invalidateQueries({ queryKey: [scope, "campaigns"] })
      ]);
      router.push({ pathname: "/content/[id]", params: { id: item.id } });
    }
  });
  if (!result.data) return <Screen>{result.isPending ? <Loading /> : <QueryFailure error={result.error} retry={() => void result.refetch()} />}</Screen>;
  const { campaign, items } = result.data;
  const plan = campaign.content;
  const rows = campaignRows(campaign, items);
  const visible = rows.filter(
    (row) =>
      (day === null || row.day === day) &&
      (!format || row.type === format) &&
      (!status || row.status === status) &&
      `${row.post.title} ${row.item?.brief ?? row.post.description} ${row.item?.caption ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );
  const days = [...new Set(rows.map((row) => row.day))];
  const states = ["IDEA", "DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED"];
  return (
    <Screen refreshControl={<RefreshControl refreshing={result.isRefetching} onRefresh={() => void result.refetch()} tintColor={colors.accent} />}>
      <Txt variant="title">{campaign.title}</Txt>
      <StatusBadge status={campaign.status} />
      <Txt muted>
        {new Date(campaign.startsAt).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Bahrain" })} · {campaign.durationDays}{" "}
        {t("days", "أيام")} · {campaign.publishesPerDay} {t("/ day", "/ يوم")}
      </Txt>
      <Button secondary icon={Share2} busy={exportPdf.isPending} label={t("Share campaign PDF", "مشاركة الحملة PDF")} onPress={() => exportPdf.mutate()} />
      {exportPdf.isError ? <Notice error>{errorMessage(exportPdf.error, t)}</Notice> : null}
      <Row>
        <View style={{ flex: 1 }}>
          <Button secondary={view !== "plan"} label={t("Content plan", "خطة المحتوى")} onPress={() => setView("plan")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button secondary={view !== "strategy"} label={t("Strategy & context", "الاستراتيجية والسياق")} onPress={() => setView("strategy")} />
        </View>
      </Row>
      {view === "strategy" ? (
        <>
          <Txt>{plan.summary}</Txt>
          {plan.objectives.length ? (
            <Card>
              <Txt variant="heading">{t("Objectives", "الأهداف")}</Txt>
              {plan.objectives.map((objective, index) => (
                <Txt key={index}>{objective}</Txt>
              ))}
            </Card>
          ) : null}
          {plan.description ? (
            <Card>
              <Txt variant="heading">{t("Your context", "سياق حملتك")}</Txt>
              <Txt>{plan.description}</Txt>
            </Card>
          ) : null}
          {plan.referenceFiles?.length ? (
            <Card tone="tint">
              <Txt variant="heading">{t("Grounded in your references", "مبنية على مراجعك")}</Txt>
              {plan.referenceSummary ? <Txt>{plan.referenceSummary}</Txt> : null}
              {plan.referenceFiles.map((file, index) => (
                <Row key={index}>
                  <FileText size={20} color={colors.accent} />
                  <Txt variant="meta">{file.filename}</Txt>
                </Row>
              ))}
            </Card>
          ) : null}
          {plan.pillars.map((pillar, index) => (
            <Card key={index}>
              <Txt variant="heading">{pillar.name}</Txt>
              <Txt>{pillar.rationale}</Txt>
              {pillar.contentAngles.map((angle, i) => (
                <Txt key={i}>• {angle}</Txt>
              ))}
            </Card>
          ))}
          {plan.kpis.length ? (
            <Card>
              <Txt variant="heading">{t("What success looks like", "مؤشرات النجاح")}</Txt>
              {plan.kpis.map((kpi, index) => (
                <Txt key={index}>
                  {kpi.name}: {kpi.target}
                </Txt>
              ))}
            </Card>
          ) : null}
          {plan.risks.length ? (
            <Card tone="warning">
              <Txt variant="heading">{t("Details to review", "تفاصيل للمراجعة")}</Txt>
              {plan.risks.map((risk, index) => (
                <Txt key={index}>{risk}</Txt>
              ))}
            </Card>
          ) : null}
          {plan.nextActions.length ? (
            <Card>
              <Txt variant="heading">{t("Next actions", "الخطوات التالية")}</Txt>
              {plan.nextActions.map((action, index) => (
                <Txt key={index}>
                  {index + 1}. {action}
                </Txt>
              ))}
            </Card>
          ) : null}
        </>
      ) : (
        <>
          <Txt muted>
            {t("Prepare each idea, generate its media, review it, then mark ready and schedule.", "أعدّ كل فكرة وأنشئ وسائطها وراجعها ثم اعتمدها وجدولها.")}
          </Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: rtl ? "row-reverse" : "row", gap: 8 }}>
            <Button secondary={status !== null} label={`${t("All", "الكل")} · ${rows.length}`} onPress={() => setStatus(null)} />
            {states
              .filter((state) => rows.some((row) => row.status === state))
              .map((state) => (
                <Button
                  key={state}
                  secondary={status !== state}
                  label={`${state === "APPROVED" ? t("Ready", "جاهز") : statusLabel(state, t)} · ${rows.filter((row) => row.status === state).length}`}
                  onPress={() => setStatus(state)}
                />
              ))}
          </ScrollView>
          <Field label={t("Search the campaign", "البحث في الحملة")} value={search} onChangeText={setSearch} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: rtl ? "row-reverse" : "row", gap: 8 }}>
            <Button secondary={day !== null} label={t("All days", "كل الأيام")} onPress={() => setDay(null)} />
            {days.map((value) => (
              <Button
                key={value}
                secondary={day !== value}
                label={new Date(rows.find((row) => row.day === value)!.date).toLocaleDateString(locale, {
                  timeZone: "Asia/Bahrain",
                  day: "numeric",
                  month: "short"
                })}
                onPress={() => setDay(value)}
              />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: rtl ? "row-reverse" : "row", gap: 8 }}>
            <Button secondary={format !== null} label={t("All formats", "كل الأنواع")} onPress={() => setFormat(null)} />
            {(["POST", "CAROUSEL", "REEL", "STORY"] as const).map((type) => (
              <Button key={type} secondary={format !== type} label={typeLabel(type, t)} onPress={() => setFormat(type)} />
            ))}
          </ScrollView>
          {create.isError ? <Notice error>{errorMessage(create.error, t)}</Notice> : null}
          {visible.length === 0 ? (
            <Card>
              <Txt>{t("No items match these filters.", "لا توجد عناصر تطابق هذه المرشحات.")}</Txt>
              <Button
                secondary
                label={t("Show the full plan", "عرض الخطة كاملة")}
                onPress={() => {
                  setDay(null);
                  setStatus(null);
                  setFormat(null);
                  setSearch("");
                }}
              />
            </Card>
          ) : null}
          {visible.map((row) => (
            <View key={row.key} style={{ gap: 8 }}>
              <Txt variant="label">
                {new Date(row.date).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Bahrain" })} ·{" "}
                {t("Week", "الأسبوع")} {row.week}
              </Txt>
              <Txt variant="meta" muted>
                {row.focus}
              </Txt>
              {row.item ? (
                <ContentCard item={row.item} />
              ) : (
                <Card>
                  <Txt variant="heading">{row.post.title}</Txt>
                  <Row>
                    <Txt variant="meta">{typeLabel(row.type, t)}</Txt>
                    <StatusBadge status="IDEA" />
                  </Row>
                  <Txt>{row.post.description}</Txt>
                  <Txt variant="meta" muted>
                    {row.post.goal} · {row.post.contentPillar}
                  </Txt>
                  <Button
                    busy={create.isPending && create.variables?.week === row.week && create.variables.actionIndex === row.actionIndex}
                    disabled={create.isPending}
                    label={t("Prepare draft", "إعداد المسودة")}
                    onPress={() => create.mutate({ week: row.week, actionIndex: row.actionIndex })}
                  />
                </Card>
              )}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}
