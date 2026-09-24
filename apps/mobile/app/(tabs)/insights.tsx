import React, { useState } from "react";
import { RefreshControl, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Loading, Notice, Screen, Txt } from "../../src/ui";
import { QueryFailure, typeLabel } from "../../src/content";
import { Choices } from "../../src/publishing/components";
import { percentageChange } from "../../src/publishing/model";
export default function Insights() {
  const { api, scope } = useAccount();
  const { t, colors, locale } = useAppearance();
  const router = useRouter();
  const focused = useIsFocused();
  const [range, setRange] = useState("30");
  const result = useQuery({
    queryKey: [scope, "analytics", Number(range)],
    queryFn: () => api.analytics({ days: Number(range) }),
    enabled: focused,
    refetchOnWindowFocus: "always"
  });
  const metrics = [
    { key: "reach", label: t("Reach", "الوصول") },
    { key: "engagement", label: t("Engagement", "التفاعل") },
    { key: "followers", label: t("Followers", "المتابعون") },
    { key: "views", label: t("Views", "المشاهدات") }
  ] as const;
  const value = (number: number | null | undefined) => (number == null ? "—" : number.toLocaleString(locale));
  return (
    <Screen refreshControl={<RefreshControl refreshing={result.isRefetching} onRefresh={() => void result.refetch()} tintColor={colors.accent} />}>
      <Txt variant="title">{t("Insights", "الأداء")}</Txt>
      <Txt muted>
        {t("See what your audience responds to, using your connected account’s data.", "تعرّف على ما يتفاعل معه جمهورك من بيانات حسابك المرتبط.")}
      </Txt>
      <Choices
        value={range}
        options={[
          { value: "7", label: t("Last 7 days", "آخر ٧ أيام") },
          { value: "30", label: t("Last 30 days", "آخر ٣٠ يومًا") }
        ]}
        onChange={setRange}
      />
      {result.isPending ? (
        <Loading />
      ) : result.isError ? (
        <QueryFailure error={result.error} retry={() => void result.refetch()} />
      ) : (
        <>
          {result.data.lastSync && result.data.lastSync.status !== "COMPLETE" ? (
            <Notice>
              {result.data.lastSync.status === "PARTIAL"
                ? t(
                    "The latest sync was partial. Available results are shown; missing metrics are not treated as zero.",
                    "كانت المزامنة الأخيرة جزئية. نعرض النتائج المتاحة ولا نعتبر المقاييس المفقودة صفرًا."
                  )
                : t("The last sync failed. These are the latest saved results.", "فشلت المزامنة الأخيرة. هذه أحدث النتائج المحفوظة.")}
            </Notice>
          ) : null}
          {!result.data.records.length ? (
            <Card tone="tint">
              <Txt variant="heading">{t("Performance will appear here", "سيظهر الأداء هنا")}</Txt>
              <Txt>
                {t(
                  "Connect an eligible Instagram account and publish content. Insights appear after the provider makes data available and MARKOS syncs it.",
                  "اربط حساب إنستغرام مؤهلًا وانشر محتوى. يظهر الأداء بعد إتاحة البيانات من المزوّد ومزامنتها مع ماركوس."
                )}
              </Txt>
            </Card>
          ) : (
            <>
              {metrics.map((metric) => (
                <Card key={metric.key}>
                  <Txt variant="label">{metric.label}</Txt>
                  <Txt variant="title">{value(result.data.totals[metric.key])}</Txt>
                  <Txt muted>
                    {percentageChange(result.data.comparison.percentageChanges[metric.key], locale)} {t("vs the previous period", "مقارنة بالفترة السابقة")}
                  </Txt>
                </Card>
              ))}
              <Txt variant="heading">{t("Daily reach", "الوصول اليومي")}</Txt>
              <Card>
                {result.data.daily.slice(-7).map((day) => {
                  const maximum = Math.max(1, ...result.data.daily.slice(-7).map((row) => row.totals.reach ?? 0));
                  return (
                    <View key={day.dataDate} style={{ gap: 4 }}>
                      <Txt variant="meta">
                        {new Date(day.dataDate).toLocaleDateString(locale, { timeZone: "Asia/Bahrain", month: "short", day: "numeric" })} ·{" "}
                        {value(day.totals.reach)}
                      </Txt>
                      {day.totals.reach !== null ? (
                        <View accessible={false} style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted }}>
                          <View
                            style={{
                              height: 6,
                              borderRadius: 3,
                              width: `${Math.max(0, Math.min(100, (day.totals.reach / maximum) * 100))}%`,
                              backgroundColor: colors.accent
                            }}
                          />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                <Txt variant="meta" muted>
                  {t("Latest seven days in this range; missing values remain blank.", "أحدث سبعة أيام في هذه الفترة؛ تبقى القيم غير المتاحة فارغة.")}
                </Txt>
              </Card>
              <Txt variant="heading">{t("Top content", "أفضل المحتوى")}</Txt>
              {!result.data.topContent.length ? (
                <Txt muted>{t("No post-level results are available yet.", "لا تتوفّر نتائج على مستوى المنشور بعد.")}</Txt>
              ) : (
                result.data.topContent.slice(0, 10).map((item) => (
                  <Card key={item.contentItemId}>
                    <Txt variant="label">{typeLabel(item.contentType, t)}</Txt>
                    <Txt numberOfLines={3}>{item.caption || t("Instagram post", "منشور إنستغرام")}</Txt>
                    <Txt>
                      {t("Engagement: ", "التفاعل: ") + value(item.engagement)} · {t("Reach: ", "الوصول: ") + value(item.metrics.reach)}
                    </Txt>
                    <Button
                      secondary
                      label={t("Review this post", "مراجعة هذا المنشور")}
                      onPress={() => router.push({ pathname: "/content/[id]", params: { id: item.contentItemId } })}
                    />
                  </Card>
                ))
              )}
            </>
          )}
          {result.data.latestSyncedAt ? (
            <Txt variant="meta" muted>
              {t("Last synced: ", "آخر مزامنة: ") + new Date(result.data.latestSyncedAt).toLocaleString(locale)}
            </Txt>
          ) : null}
        </>
      )}
      <Button secondary label={t("Instagram connection", "اتصال إنستغرام")} onPress={() => router.push("/instagram")} />
      <Button secondary label={t("Refresh saved results", "تحديث النتائج المحفوظة")} busy={result.isFetching} onPress={() => void result.refetch()} />
      <Txt variant="meta" muted>
        {t(
          "A dash means unavailable, not zero. Refresh reads saved results; provider synchronization runs separately.",
          "الشرطة تعني غير متاح وليست صفرًا. التحديث يقرأ النتائج المحفوظة؛ مزامنة المزوّد تتم بشكل مستقل."
        )}
      </Txt>
    </Screen>
  );
}
