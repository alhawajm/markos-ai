import React, { useState } from "react";
import { RefreshControl, View } from "react-native";
import { ArrowLeft, ArrowRight, History, SlidersHorizontal } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import type { ContentStatus } from "@markos/shared-types";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, IconButton, ListGroup, ListRow, Loading, Row, Screen, Segmented, Sheet, TextAction, TitleBar, Txt } from "../../src/ui";
import { ContentCard, QueryFailure } from "../../src/content";
import { groupCalendar, weekRange } from "../../src/publishing/model";
const filters: Record<string, ContentStatus[] | undefined> = {
  all: undefined,
  planned: ["DRAFT", "IN_REVIEW", "APPROVED"],
  scheduled: ["SCHEDULED"],
  attention: ["FAILED"],
  published: ["PUBLISHED"]
};
export default function Calendar() {
  const { api, scope } = useAccount();
  const { t, locale, colors, rtl } = useAppearance();
  const router = useRouter();
  const focused = useIsFocused();
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("week");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterOptions = [
    { value: "all", label: t("All", "الكل") },
    { value: "planned", label: t("Planned", "مخطّط") },
    { value: "scheduled", label: t("Scheduled", "مجدول") },
    { value: "attention", label: t("Needs attention", "يحتاج انتباهك") },
    { value: "published", label: t("Published", "منشور") }
  ];
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
      <TitleBar title={t("Calendar", "التقويم")}>
        <IconButton icon={History} label={t("Publishing activity", "نشاط النشر")} onPress={() => router.push("/publishing")} />
      </TitleBar>
      <Segmented
        value={view}
        options={[
          { value: "week", label: t("Week agenda", "جدول الأسبوع") },
          { value: "unscheduled", label: t("Unscheduled", "غير مجدول") }
        ]}
        onChange={setView}
      />
      {view === "week" ? (
        <>
          <Row>
            <IconButton icon={rtl ? ArrowRight : ArrowLeft} label={t("Previous week", "الأسبوع السابق")} onPress={() => setOffset(offset - 1)} />
            <Txt variant="label" style={{ flex: 1, textAlign: "center", fontSize: 16 }}>
              {dateLabel(range.from)} — {dateLabel(range.to)}
            </Txt>
            <IconButton icon={rtl ? ArrowLeft : ArrowRight} label={t("Next week", "الأسبوع القادم")} onPress={() => setOffset(offset + 1)} />
          </Row>
          {offset !== 0 ? <TextAction label={t("This week", "هذا الأسبوع")} onPress={() => setOffset(0)} /> : null}
        </>
      ) : null}
      <Row style={{ justifyContent: "space-between" }}>
        <Txt variant="meta" muted>
          {t("Bahrain · UTC+3", "البحرين · UTC+3")}
        </Txt>
        <TextAction icon={SlidersHorizontal} label={filterOptions.find((option) => option.value === filter)!.label} onPress={() => setFiltersOpen(true)} />
      </Row>
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
                      <TextAction
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
      <Sheet title={t("Show calendar", "عرض التقويم")} visible={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <ListGroup>
          {filterOptions.map((option, index) => (
            <ListRow
              key={option.value}
              label={option.label}
              selected={filter === option.value}
              last={index === filterOptions.length - 1}
              onPress={() => {
                setFilter(option.value);
                setPage(0);
                setFiltersOpen(false);
              }}
            />
          ))}
        </ListGroup>
      </Sheet>
    </Screen>
  );
}
