import React, { useState } from "react";
import { RefreshControl } from "react-native";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useAccount, useAppearance } from "../src/providers";
import { Button, Card, Loading, Screen, Txt } from "../src/ui";
import { QueryFailure } from "../src/content";
import { Choices } from "../src/publishing/components";
import { notificationPresentation } from "../src/publishing/model";
export default function Notifications() {
  const { api, scope, queryClient } = useAccount();
  const { t, locale, colors } = useAppearance();
  const router = useRouter();
  const focused = useIsFocused();
  const [filter, setFilter] = useState("all");
  const result = useInfiniteQuery({
    queryKey: [scope, "notification-feed", filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.notificationFeed({ ...(pageParam ? { cursor: pageParam } : {}), unreadOnly: filter === "unread" }),
    getNextPageParam: (page) => page.nextCursor,
    enabled: focused,
    refetchOnWindowFocus: "always",
    refetchInterval: 30000
  });
  const mark = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [scope, "notification-feed"] });
      void queryClient.invalidateQueries({ queryKey: [scope, "notification-count"] });
    }
  });
  const items = [...new Map((result.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item])).values()];
  return (
    <Screen refreshControl={<RefreshControl refreshing={result.isRefetching} onRefresh={() => void result.refetch()} tintColor={colors.accent} />}>
      <Txt variant="title">{t("Notifications", "الإشعارات")}</Txt>
      {result.data ? (
        <Txt muted>
          {result.data.pages[0]!.unreadCount.toLocaleString(locale)} {t("unread", "غير مقروء")}
        </Txt>
      ) : null}
      <Choices
        value={filter}
        options={[
          { value: "all", label: t("All", "الكل") },
          { value: "unread", label: t("Unread", "غير المقروء") }
        ]}
        onChange={setFilter}
      />
      {result.isPending ? (
        <Loading />
      ) : result.isError && !result.data ? (
        <QueryFailure error={result.error} retry={() => void result.refetch()} />
      ) : !items.length ? (
        <Card tone="tint">
          <Txt>{t("You’re all caught up.", "أنت على اطلاع بكل جديد.")}</Txt>
        </Card>
      ) : (
        items.map((item) => {
          const presentation = notificationPresentation(item, t);
          return (
            <Card key={item.id} tone={!item.readAt ? "tint" : undefined}>
              <Txt variant="heading">{presentation.title}</Txt>
              {presentation.message ? <Txt>{presentation.message}</Txt> : null}
              <Txt variant="meta" muted>
                {new Date(item.createdAt).toLocaleString(locale)}
              </Txt>
              {presentation.contentId ? (
                <Button
                  label={t("Open post status", "فتح حالة المنشور")}
                  onPress={() => {
                    if (!item.readAt) mark.mutate(item.id);
                    router.push({ pathname: "/content/publication", params: { id: presentation.contentId! } });
                  }}
                />
              ) : null}
              {!item.readAt ? (
                <Button secondary label={t("Mark as read", "تحديد كمقروء")} disabled={mark.isPending} onPress={() => mark.mutate(item.id)} />
              ) : null}
            </Card>
          );
        })
      )}
      {result.isError && result.data ? <QueryFailure error={result.error} retry={() => void result.refetch()} /> : null}
      {result.hasNextPage ? (
        <Button
          secondary
          busy={result.isFetchingNextPage}
          label={t("Load older notifications", "تحميل الإشعارات الأقدم")}
          onPress={() => void result.fetchNextPage()}
        />
      ) : null}
      {mark.isError ? <QueryFailure error={mark.error} retry={() => mark.mutate(mark.variables!)} /> : null}
    </Screen>
  );
}
