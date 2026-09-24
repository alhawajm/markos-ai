import React, { useState } from "react";
import { RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useAccount, useAppearance } from "../src/providers";
import { Button, Card, Loading, Screen, Txt } from "../src/ui";
import { QueryFailure, StatusBadge } from "../src/content";
import { Choices } from "../src/publishing/components";
import { publicationLabel, publicationState, publishingMessage } from "../src/publishing/model";
export default function Publishing() {
  const { api, scope } = useAccount();
  const { t, locale, colors } = useAppearance();
  const router = useRouter();
  const focused = useIsFocused();
  const [status, setStatus] = useState<"ALL" | "SCHEDULED" | "FAILED" | "PUBLISHED">("ALL");
  const [offset, setOffset] = useState(0);
  const result = useQuery({
    queryKey: [scope, "publishing-activity", status, offset],
    queryFn: () => api.publishingActivity({ ...(status === "ALL" ? {} : { status }), offset }),
    enabled: focused,
    refetchInterval: 15000,
    refetchOnWindowFocus: "always"
  });
  return (
    <Screen refreshControl={<RefreshControl refreshing={result.isRefetching} onRefresh={() => void result.refetch()} tintColor={colors.accent} />}>
      <Txt variant="title">{t("Publishing activity", "نشاط النشر")}</Txt>
      <Txt muted>
        {t(
          "Follow your posts from scheduled to published. Resolve anything that needs attention.",
          "تابع منشوراتك من الجدولة إلى النشر، وعالج ما يحتاج انتباهك."
        )}
      </Txt>
      <Choices
        value={status}
        options={[
          { value: "ALL", label: t("All", "الكل") },
          { value: "SCHEDULED", label: t("Upcoming", "القادم") },
          { value: "FAILED", label: t("Needs attention", "يحتاج انتباهك") },
          { value: "PUBLISHED", label: t("Published", "منشور") }
        ]}
        onChange={(value) => {
          setStatus(value);
          setOffset(0);
        }}
      />
      {result.isPending ? (
        <Loading />
      ) : result.isError ? (
        <QueryFailure error={result.error} retry={() => void result.refetch()} />
      ) : (
        <>
          {!result.data.items.length ? (
            <Card tone="tint">
              <Txt>{t("No publishing activity matches this view.", "لا يوجد نشاط نشر يطابق هذا العرض.")}</Txt>
              <Button secondary label={t("Open calendar", "فتح التقويم")} onPress={() => router.push("/(tabs)/calendar")} />
            </Card>
          ) : (
            result.data.items.map(({ content, job }) => (
              <Card key={content.id} tone={content.status === "FAILED" ? "warning" : undefined}>
                <Txt variant="heading" numberOfLines={3}>
                  {content.brief?.split("\n")[0] || content.caption || t("Instagram post", "منشور إنستغرام")}
                </Txt>
                <StatusBadge status={content.status} />
                <Txt>{publicationLabel(publicationState(content, job), t)}</Txt>
                {content.publishedAt || content.scheduledAt ? (
                  <Txt variant="meta" muted>
                    {new Date(content.publishedAt || content.scheduledAt!).toLocaleString(locale, { timeZone: "Asia/Bahrain" })} ·{" "}
                    {t("Bahrain time", "توقيت البحرين")}
                  </Txt>
                ) : null}
                {content.status === "FAILED" ? <Txt>{publishingMessage(content.failureReason || job?.lastErrorCode, t)}</Txt> : null}
                <Button
                  secondary
                  label={t("View publishing details", "عرض تفاصيل النشر")}
                  onPress={() => router.push({ pathname: "/content/publication", params: { id: content.id } })}
                />
              </Card>
            ))
          )}
          {offset > 0 ? <Button secondary label={t("Previous page", "الصفحة السابقة")} onPress={() => setOffset(Math.max(0, offset - 20))} /> : null}
          {result.data.nextOffset !== undefined ? (
            <Button secondary label={t("Next page", "الصفحة التالية")} onPress={() => setOffset(result.data.nextOffset!)} />
          ) : null}
        </>
      )}
    </Screen>
  );
}
