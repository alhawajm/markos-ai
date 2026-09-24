import React, { useState } from "react";
import { RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import type { ContentStatus } from "@markos/shared-types";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Loading, Screen, Txt } from "../../src/ui";
import { ContentCard, QueryFailure } from "../../src/content";
import { groupCalendar, weekRange } from "../../src/publishing/model";
import { Choices } from "../../src/publishing/components";
const filters: Record<string, ContentStatus[] | undefined> = {
  all: undefined,
  planned: ["DRAFT", "IN_REVIEW", "APPROVED"],
  scheduled: ["SCHEDULED"],
  attention: ["FAILED"],
  published: ["PUBLISHED"]
};
export default function Calendar() {
  const { api, scope } = useAccount();
  const { t, locale, colors } = useAppearance();
  const router = useRouter();
  const focused = useIsFocused();
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("week");
  const range = weekRange(offset);
  const result = useQuery({
    queryKey: [scope, "calendar", range.from, filter, page],
    queryFn: () =>
      api.calendar({
        from: range.from,
        to: range.to,
        ...(filters[filter] ? { statuses: filters[filter] } : {}),
        unscheduledOffset: page,
        unscheduledLimit: 20
      }),
    enabled: focused,
    refetchOnWindowFocus: "always",
    refetchInterval: 30000
  });
  const groups = groupCalendar(result.data?.items ?? []);
  const dateLabel = (day: string) => new Date(`${day}T12:00:00+03:00`).toLocaleDateString(locale, { timeZone: "Asia/Bahrain", dateStyle: "medium" });
  return (
    <Screen refreshControl={<RefreshControl refreshing={result.isRefetching} onRefresh={() => void result.refetch()} tintColor={colors.accent} />}>
      <Txt variant="title">{t("Calendar", "التقويم")}</Txt>
      <Txt muted>{t("Plan your week. Scheduling is a separate, deliberate step.", "خطّط لأسبوعك. الجدولة خطوة مستقلة تؤكّدها بنفسك.")}</Txt>
      <Button secondary label={t("Publishing activity", "نشاط النشر")} onPress={() => router.push("/publishing")} />
      <Choices
        value={view}
        options={[
          { value: "week", label: t("Week agenda", "جدول الأسبوع") },
          { value: "unscheduled", label: t("Unscheduled", "غير مجدول") }
        ]}
        onChange={setView}
      />
      {view === "week" ? (
        <>
          <Txt variant="heading">
            {dateLabel(range.from)} — {dateLabel(range.to)}
          </Txt>
          <Txt variant="meta" muted>
            {t("Bahrain · UTC+3", "البحرين · UTC+3")}
          </Txt>
          <Choices
            value=""
            options={[
              { value: "previous", label: t("Previous week", "الأسبوع السابق") },
              { value: "today", label: t("This week", "هذا الأسبوع") },
              { value: "next", label: t("Next week", "الأسبوع القادم") }
            ]}
            onChange={(value) => setOffset(value === "today" ? 0 : offset + (value === "next" ? 1 : -1))}
          />
        </>
      ) : null}
      <Choices
        value={filter}
        options={[
          { value: "all", label: t("All", "الكل") },
          { value: "planned", label: t("Planned", "مخطّط") },
          { value: "scheduled", label: t("Scheduled", "مجدول") },
          { value: "attention", label: t("Needs attention", "يحتاج انتباهك") },
          { value: "published", label: t("Published", "منشور") }
        ]}
        onChange={(value) => {
          setFilter(value);
          setPage(0);
        }}
      />
      {result.isPending ? (
        <Loading />
      ) : result.isError ? (
        <QueryFailure error={result.error} retry={() => void result.refetch()} />
      ) : view === "week" ? (
        <>
          {!groups.length ? (
            <Card tone="tint">
              <Txt variant="heading">{t("Nothing in this view", "لا يوجد محتوى في هذا العرض")}</Txt>
              <Txt>
                {t("Choose another week or filter, or open Unscheduled to prepare a draft.", "اختر أسبوعًا أو مرشّحًا آخر، أو افتح غير مجدول لإعداد مسودة.")}
              </Txt>
            </Card>
          ) : (
            groups.map((group) => (
              <React.Fragment key={group.day}>
                <Txt variant="heading">{dateLabel(group.day)}</Txt>
                {group.items.map((item) => (
                  <React.Fragment key={item.id}>
                    <ContentCard item={item} />
                    {["SCHEDULED", "FAILED", "PUBLISHED"].includes(item.status) ? (
                      <Button
                        secondary
                        label={t("Publishing details", "تفاصيل النشر")}
                        onPress={() => router.push({ pathname: "/content/publication", params: { id: item.id } })}
                      />
                    ) : (
                      <Txt variant="meta" muted>
                        {t("Planned only · not queued for publishing", "مخطّط فقط · ليس في قائمة النشر")}
                      </Txt>
                    )}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))
          )}
        </>
      ) : (
        <>
          <Txt muted>
            {result.data.unscheduled.total.toLocaleString(locale)} {t("items match this view", "عنصر يطابق هذا العرض")}
          </Txt>
          {result.data.unscheduled.items.map((item) => (
            <ContentCard key={item.id} item={item} />
          ))}
          {!result.data.unscheduled.items.length ? (
            <Card>
              <Txt>{t("No unscheduled drafts match this filter.", "لا توجد مسودات غير مجدولة تطابق هذا المرشّح.")}</Txt>
            </Card>
          ) : null}
          {page > 0 ? <Button secondary label={t("Previous page", "الصفحة السابقة")} onPress={() => setPage(Math.max(0, page - 20))} /> : null}
          {result.data.unscheduled.nextOffset !== undefined ? (
            <Button secondary label={t("Next page", "الصفحة التالية")} onPress={() => setPage(result.data.unscheduled.nextOffset!)} />
          ) : null}
        </>
      )}
    </Screen>
  );
}
