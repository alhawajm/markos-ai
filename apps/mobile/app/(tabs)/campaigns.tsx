import React, { useEffect, useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { Plus, Target } from "lucide-react-native";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Field, Loading, Row, Screen, Txt } from "../../src/ui";
import { QueryFailure, StatusBadge } from "../../src/content";

export default function Campaigns() {
  const focused = useIsFocused();
  const { api, scope } = useAccount();
  const { colors, t, locale } = useAppearance();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const result = useInfiniteQuery({
    queryKey: [scope, "campaigns", query],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.campaignSummaries({ limit: 20, query: query || undefined, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined
  });
  const items = result.data?.pages.flatMap((page) => page.items) ?? [];
  const generations = useQuery({
    queryKey: [scope, "campaign-generations"],
    queryFn: () => api.campaignGenerations(),
    refetchInterval: 5000,
    enabled: focused
  });
  useEffect(() => {
    if (generations.data?.some((job) => job.status === "COMPLETED")) void result.refetch();
  }, [
    generations.data
      ?.filter((job) => job.status === "COMPLETED")
      .map((job) => job.id)
      .join(",")
  ]);
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
      <Txt variant="title">{t("Campaigns", "الحملات")}</Txt>
      <Txt muted>{t("From a clear idea to a considered campaign.", "من فكرة واضحة إلى حملة مدروسة.")}</Txt>
      <Button icon={Plus} label={t("New campaign", "حملة جديدة")} onPress={() => router.push("/campaign/new")} />
      {generations.data
        ?.filter((job) => job.status !== "COMPLETED")
        .map((job) => (
          <Card key={job.id} tone={job.status === "FAILED" ? "warning" : "tint"}>
            <Txt variant="heading">{job.objective || t("Your campaign", "حملتك")}</Txt>
            <Txt>
              {job.status === "FAILED"
                ? t("Generation needs your attention", "يتطلب الإنشاء انتباهك")
                : t("MARKOS is drafting your campaign", "ماركوس يعدّ حملتك")}
            </Txt>
            <Button
              secondary
              label={t("View progress", "عرض التقدّم")}
              onPress={() => router.push({ pathname: "/campaign/generation", params: { requestId: job.requestId } })}
            />
          </Card>
        ))}
      <Field label={t("Search", "بحث")} placeholder={t("Search campaigns", "ابحث عن حملة")} value={search} onChangeText={setSearch} returnKeyType="search" />
      {result.isPending ? (
        <Loading />
      ) : result.isError ? (
        <QueryFailure
          error={result.error}
          retry={() => {
            void result.refetch();
          }}
        />
      ) : null}
      {!result.isPending && !result.isError && items.length === 0 ? (
        <Card tone="tint">
          <Target size={32} strokeWidth={1.5} color={colors.accent} />
          <Txt variant="heading">{query ? t("No matching campaigns", "لا توجد حملات مطابقة") : t("Your next idea starts here", "فكرتك القادمة تبدأ هنا")}</Txt>
          <Txt muted>
            {query
              ? t("Try another search.", "جرّب بحثًا آخر.")
              : t(
                  "Add an event, an offer, or a goal. Give MARKOS your references and shape the plan together.",
                  "أضف فعالية أو عرضًا أو هدفًا. شارك مراجعك مع ماركوس لتصميم الخطة."
                )}
          </Txt>
        </Card>
      ) : null}
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          onPress={() => router.push({ pathname: "/campaign/[id]", params: { id: item.id } })}
        >
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <View style={{ padding: 20, gap: 12, backgroundColor: colors.primarySoft }}>
              <Target size={28} strokeWidth={1.5} color={colors.accent} />
              <Txt variant="heading">{item.title}</Txt>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <StatusBadge status={item.status} />
              <Txt variant="meta" muted>
                {new Date(item.startsAt).toLocaleDateString(locale, { timeZone: "Asia/Bahrain", dateStyle: "medium" })} · {item.durationDays}{" "}
                {t("days", "أيام")} · {item.publishesPerDay} {t("/ day", "/ يوم")}
              </Txt>
              {item.objective ? <Txt numberOfLines={3}>{item.objective}</Txt> : null}
              <Row>
                <Txt variant="meta" muted>
                  {item.postCounts.idea + item.postCounts.draft + item.postCounts.inReview} {t("to prepare", "للإعداد")}
                </Txt>
                <Txt variant="meta" muted>
                  {item.postCounts.scheduled} {t("scheduled", "مجدولة")}
                </Txt>
              </Row>
            </View>
          </Card>
        </Pressable>
      ))}
      {result.hasNextPage ? (
        <Button
          secondary
          busy={result.isFetchingNextPage}
          label={t("Load more", "عرض المزيد")}
          onPress={() => {
            void result.fetchNextPage();
          }}
        />
      ) : null}
    </Screen>
  );
}
