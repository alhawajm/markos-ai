import React from "react";
import { RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Loading, Screen, Txt } from "../../src/ui";
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
          </Card>
          <Button
            label={next ? t("Continue campaign", "متابعة الحملة") : t("Create a campaign", "إنشاء حملة")}
            onPress={() => (next ? router.push({ pathname: "/campaign/[id]", params: { id: next.id } }) : router.push("/campaign/new"))}
          />
        </>
      )}
      <Txt variant="heading">{t("Coming up", "القادم")}</Txt>
      <Card>
        <Txt>{t("See your scheduled posts and drafts ready for a publishing time.", "استعرض منشوراتك المجدولة والمسودات الجاهزة لتحديد وقت نشرها.")}</Txt>
        <Button secondary label={t("Open calendar", "فتح التقويم")} onPress={() => router.push("/(tabs)/calendar")} />
        <Button secondary label={t("Publishing activity", "نشاط النشر")} onPress={() => router.push("/publishing")} />
      </Card>
      <Txt variant="heading">{t("Your business context", "سياق نشاطك التجاري")}</Txt>
      <Card>
        <Txt variant="label">{t("Keep MARKOS informed", "أبقِ ماركوس على اطلاع")}</Txt>
        <Txt>{t("Review your audience, tone and business details when something changes.", "راجع جمهورك ونبرتك وتفاصيل نشاطك عندما يتغيّر شيء.")}</Txt>
        <Button secondary label={t("Edit business profile", "تعديل ملف النشاط")} onPress={() => router.push("/business")} />
      </Card>
    </Screen>
  );
}
