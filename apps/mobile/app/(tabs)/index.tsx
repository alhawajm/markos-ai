import React from "react";
import { RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { BriefcaseBusiness, CalendarDays, History } from "lucide-react-native";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, ListGroup, ListRow, Loading, Screen, Txt } from "../../src/ui";
import { QueryFailure } from "../../src/content";

export default function Overview() {
  const { api, scope, session } = useAccount();
  const { t, colors } = useAppearance();
  const router = useRouter();
  const result = useQuery({ queryKey: [scope, "campaigns", "overview"], queryFn: () => api.campaignSummaries({ limit: 8 }) });
  const activity = useQuery({
    queryKey: [scope, "publishing-activity", "overview"],
    queryFn: () => api.publishingActivity({ status: "FAILED" }),
    refetchOnWindowFocus: "always"
  });
  const next = result.data?.items.find((item) => item.postCounts.idea + item.postCounts.draft + item.postCounts.inReview > 0) ?? result.data?.items[0];
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={result.isRefetching}
          onRefresh={() => {
            void result.refetch();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Txt variant="title">
        {t("Hello", "أهلًا")}, {session.user.fullName.split(" ")[0]}
      </Txt>
      <Txt muted>{t("Here is what needs your attention.", "إليك ما يحتاج انتباهك.")}</Txt>
      {activity.data?.total ? (
        <Card tone="warning">
          <Txt variant="heading">{t("Publishing needs attention", "النشر يحتاج انتباهك")}</Txt>
          <Txt>
            {activity.data.total} {t("posts need review before another attempt.", "منشور يحتاج المراجعة قبل محاولة أخرى.")}
          </Txt>
          <Button label={t("Review publishing activity", "مراجعة نشاط النشر")} onPress={() => router.push("/publishing")} />
        </Card>
      ) : null}
      {result.isPending ? (
        <Loading />
      ) : result.isError ? (
        <QueryFailure
          error={result.error}
          retry={() => {
            void result.refetch();
          }}
        />
      ) : (
        <>
          <Card tone="tint">
            <Txt variant="label">{t("Your next step", "خطوتك القادمة")}</Txt>
            <Txt>
              {next ? next.title : t("Bring your next event, offer or idea to life with a campaign.", "حوّل فعاليتك أو عرضك أو فكرتك القادمة إلى حملة.")}
            </Txt>
            <Button
              label={next ? t("Continue campaign", "متابعة الحملة") : t("Create a campaign", "إنشاء حملة")}
              onPress={() => (next ? router.push({ pathname: "/campaign/[id]", params: { id: next.id } }) : router.push("/campaign/new"))}
            />
          </Card>
        </>
      )}
      <ListGroup title={t("Your workspace", "مساحة عملك")}>
        <ListRow
          icon={CalendarDays}
          label={t("Open calendar", "فتح التقويم")}
          detail={t("Your drafts and scheduled posts", "مسوداتك ومنشوراتك المجدولة")}
          onPress={() => router.push("/(tabs)/calendar")}
        />
        <ListRow icon={History} label={t("Publishing activity", "نشاط النشر")} onPress={() => router.push("/publishing")} />
        <ListRow
          icon={BriefcaseBusiness}
          last
          label={t("Edit business profile", "تعديل ملف النشاط")}
          detail={t("Audience, voice and business details", "الجمهور والنبرة وتفاصيل النشاط")}
          onPress={() => router.push("/business")}
        />
      </ListGroup>
    </Screen>
  );
}
