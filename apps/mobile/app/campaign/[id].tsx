import React from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react-native";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Loading, Notice, Row, Screen, Txt } from "../../src/ui";
import { ContentCard, QueryFailure, StatusBadge, typeLabel } from "../../src/content";
import { errorMessage } from "../../src/errors";

export default function CampaignReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, scope, queryClient } = useAccount();
  const { t, colors, locale } = useAppearance();
  const router = useRouter();
  const result = useQuery({ queryKey: [scope, "campaign", id], queryFn: () => api.campaignReview(id) });
  const create = useMutation({
    mutationFn: (slot: { week: number; actionIndex: number }) => api.approveCampaignSuggestion(id, slot),
    onSuccess: async (item) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [scope, "campaign", id] }),
        queryClient.invalidateQueries({ queryKey: [scope, "content"] }),
        queryClient.invalidateQueries({ queryKey: [scope, "campaigns"] })
      ]);
      router.push({ pathname: "/content/[id]", params: { id: item.id } });
    }
  });
  if (result.isPending)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (result.isError)
    return (
      <Screen>
        <QueryFailure
          error={result.error}
          retry={() => {
            void result.refetch();
          }}
        />
      </Screen>
    );
  const { campaign, items } = result.data;
  const plan = campaign.content;
  return (
    <Screen>
      <Txt variant="title">{campaign.title}</Txt>
      <StatusBadge status={campaign.status} />
      <Txt muted>
        {new Date(campaign.startsAt).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Bahrain" })} · {campaign.durationDays}{" "}
        {t("days", "أيام")} · {campaign.publishesPerDay} {t("/ day", "/ يوم")}
      </Txt>
      <Txt>{plan.summary}</Txt>
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
            <Row key={`${file.filename}-${index}`}>
              <FileText size={20} strokeWidth={1.5} color={colors.accent} />
              <Txt variant="meta">{file.filename}</Txt>
            </Row>
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
      <Txt variant="heading">{t("Campaign content", "محتوى الحملة")}</Txt>
      <Txt muted>
        {t("Open an idea to prepare its draft. Ready and scheduled are separate steps.", "افتح فكرة لإعداد مسودتها. الجاهزية والجدولة خطوتان منفصلتان.")}
      </Txt>
      {create.isError ? <Notice error>{errorMessage(create.error, t)}</Notice> : null}
      {plan.weeklyCadence.map((week) => {
        let actionIndex = 0;
        return (
          <View key={week.week} style={{ gap: 16 }}>
            <Txt variant="heading">
              {t("Week", "الأسبوع")} {week.week} · {week.focus}
            </Txt>
            {week.days.map((day) => (
              <View key={day.day} style={{ gap: 12 }}>
                <Txt variant="label">
                  {t("Day", "اليوم")} {day.day}
                </Txt>
                {day.posts.map((post) => {
                  const index = actionIndex++;
                  const item = items.find((content) => content.campaignWeek === week.week && content.campaignActionIndex === index);
                  return item ? (
                    <ContentCard key={index} item={item} />
                  ) : (
                    <Card key={index}>
                      <Txt variant="heading">{post.title}</Txt>
                      <Txt variant="meta" muted>
                        {typeLabel(post.contentType, t)}
                      </Txt>
                      <Txt>{post.description}</Txt>
                      <Button
                        secondary
                        busy={create.isPending && create.variables?.week === week.week && create.variables.actionIndex === index}
                        disabled={create.isPending}
                        label={t("Prepare draft", "إعداد المسودة")}
                        onPress={() => create.mutate({ week: week.week, actionIndex: index })}
                      />
                    </Card>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })}
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
    </Screen>
  );
}
