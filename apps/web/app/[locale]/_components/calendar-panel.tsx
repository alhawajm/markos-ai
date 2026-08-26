"use client";

import Link from "next/link";
import { type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  X
} from "lucide-react";
import type { CalendarSummary, ContentRecord, ContentStatus, ContentType, Locale, MediaAssetRecord } from "@markos/shared-types";
import { useMarkosClient, useMarkosSession } from "./browser-session";
import {
  cancelCalendarAnimations,
  finishCalendarAnimations,
  playCalendarEntrance,
  playCalendarExit,
  prefersReducedCalendarMotion,
  readCalendarMotionOrigin,
  type CalendarMotionIntent,
  type CalendarMotionOrigin
} from "./calendar-motion";

const BAHRAIN_TIME_ZONE = "Asia/Bahrain";
const BAHRAIN_UTC_OFFSET = "+03:00";

type CalendarView = "month" | "week";
type CalendarLayer = "overview" | "day" | "record";
type CalendarFilter = "draft" | "ready" | "scheduled" | "published" | "failed" | null;
type CalendarNotice = { text: string; tone: "error" | "success" };

interface CalendarUrlState {
  activeFilter: CalendarFilter;
  anchorDateKey: string;
  contentTypeFilter?: ContentType | null;
  layer: CalendarLayer;
  selectedDateKey: string;
  selectedRecordId: string | null;
  view: CalendarView;
}

interface CalendarCopy {
  addContent: string;
  all: string;
  allContentTypes: string;
  allTimes: string;
  backToCalendar: string;
  backToDay: string;
  cancel: string;
  cancelConfirm: string;
  cancelSchedule: string;
  calendarTitle: string;
  close: string;
  contentType: string;
  details: string;
  draft: string;
  emptyDay: string;
  failed: string;
  loading: string;
  loadMore: string;
  loadingMore: string;
  month: string;
  nextDay: string;
  openDay: string;
  openEditor: string;
  previousDay: string;
  planned: string;
  published: string;
  ready: string;
  refresh: string;
  reschedule: string;
  saveNewTime: string;
  schedule: string;
  schedulePost: string;
  scheduled: string;
  scheduledThisWeek: string;
  today: string;
  unscheduled: string;
  unscheduledDescription: string;
  unscheduledEmpty: string;
  updated: string;
  viewInsights: string;
  week: string;
}

export function CalendarPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const copy = calendarCopy(locale);
  const todayKey = bahrainDateKey(new Date());
  const [view, setView] = useState<CalendarView>("week");
  const [layer, setLayer] = useState<CalendarLayer>("overview");
  const [activeFilter, setActiveFilter] = useState<CalendarFilter>(null);
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentType | null>(null);
  const [anchorDateKey, setAnchorDateKey] = useState(todayKey);
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAssetRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [scheduleValue, setScheduleValue] = useState(defaultScheduleInput());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [unscheduledTotal, setUnscheduledTotal] = useState(0);
  const [unscheduledNextOffset, setUnscheduledNextOffset] = useState<number | null>(null);
  const [loadingMoreUnscheduled, setLoadingMoreUnscheduled] = useState(false);
  const [summary, setSummary] = useState<CalendarSummary>({ needsAttention: 0, ready: 0, scheduledThisWeek: 0 });
  const [notice, setNotice] = useState<CalendarNotice | null>(null);
  const focusDialogRef = useRef<HTMLElement | null>(null);
  const focusBackdropRef = useRef<HTMLDivElement | null>(null);
  const cancelDialogRef = useRef<HTMLElement | null>(null);
  const restoreOverviewFocusRef = useRef<HTMLElement | null>(null);
  const overviewFallbackFocusRef = useRef<HTMLHeadingElement | null>(null);
  const cancelTriggerRef = useRef<HTMLElement | null>(null);
  const calendarMotionOriginRef = useRef<CalendarMotionOrigin | null>(null);
  const detailMotionOriginRef = useRef<CalendarMotionOrigin | null>(null);
  const motionIntentRef = useRef<CalendarMotionIntent | null>(null);
  const motionAnimationsRef = useRef<Animation[]>([]);
  const motionLockedRef = useRef(false);
  const previousLayerRef = useRef<CalendarLayer>("overview");
  const layerRef = useRef<CalendarLayer>("overview");
  layerRef.current = layer;

  useEffect(() => {
    function syncFromUrl() {
      const next = readCalendarUrlState(window.location.search, todayKey);
      setView(next.view);
      setLayer(next.layer);
      setActiveFilter(next.activeFilter);
      setContentTypeFilter(next.contentTypeFilter ?? null);
      setAnchorDateKey(next.anchorDateKey);
      setSelectedDateKey(next.selectedDateKey);
      setSelectedRecordId(next.selectedRecordId);
    }

    syncFromUrl();
    const initial = readCalendarUrlState(window.location.search, todayKey);
    writeCalendarUrl(initial, "replace", calendarHistoryDepth());
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [todayKey]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), notice.tone === "success" ? 4_500 : 8_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const weekStartKey = startOfWeek(anchorDateKey);
  const weekDateKeys = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStartKey, index)), [weekStartKey]);
  const monthStartKey = `${anchorDateKey.slice(0, 7)}-01`;
  const monthDateKeys = useMemo(() => calendarMonthGrid(monthStartKey), [monthStartKey]);
  const queryDateKeys = view === "week" ? weekDateKeys : monthDateKeys;
  const queryFrom = queryDateKeys[0] ?? anchorDateKey;
  const queryTo = queryDateKeys.at(-1) ?? anchorDateKey;

  const refresh = useCallback(async () => {
    if (!session) return;

    setLoading(true);

    try {
      const result = await client.calendar({
        from: queryFrom,
        to: queryTo,
        ...(activeFilter ? { statuses: calendarFilterStatuses(activeFilter) } : {}),
        ...(contentTypeFilter ? { contentTypes: [contentTypeFilter] } : {}),
        unscheduledLimit: 12,
        unscheduledOffset: 0
      });
      const nextRecords = [...result.items, ...result.unscheduled.items];
      setRecords(nextRecords);
      setMediaAssets(result.mediaAssets);
      setSummary(result.summary);
      setUnscheduledTotal(result.unscheduled.total);
      setUnscheduledNextOffset(result.unscheduled.nextOffset ?? null);
      setSelectedRecordId((current) => (current && nextRecords.some((record) => record.id === current) ? current : null));
    } catch (error) {
      setNotice({ text: calendarError(error, locale), tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [activeFilter, client, contentTypeFilter, locale, queryFrom, queryTo, session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useLayoutEffect(() => {
    if (layer === "overview") return;

    const surface = focusDialogRef.current;
    if (!surface) return;

    const inferredIntent = previousLayerRef.current === "record" && layer === "day" ? "record-to-day" : null;
    const intent = motionIntentRef.current ?? inferredIntent;
    motionIntentRef.current = null;
    cancelCalendarAnimations(motionAnimationsRef.current);
    motionAnimationsRef.current = [];

    if (!intent) {
      surface.dataset.calendarMotionKind = "deep-link";
      surface.dataset.calendarMotionState = "settled";
      return;
    }

    surface.dataset.calendarMotionKind = intent;
    if (prefersReducedCalendarMotion()) {
      surface.dataset.calendarMotionState = "reduced";
      return;
    }

    surface.dataset.calendarMotionState = "entering";
    const animations = playCalendarEntrance({
      backdrop: focusBackdropRef.current,
      detailOrigin: detailMotionOriginRef.current,
      intent,
      isRtl: locale === "ar",
      origin: calendarMotionOriginRef.current,
      surface
    });
    motionAnimationsRef.current = animations;

    if (animations.length === 0) {
      surface.dataset.calendarMotionState = "settled";
      return;
    }

    void finishCalendarAnimations(animations).then(() => {
      if (motionAnimationsRef.current !== animations) return;
      cancelCalendarAnimations(animations);
      motionAnimationsRef.current = [];
      if (surface.isConnected) surface.dataset.calendarMotionState = "settled";
    });

    return () => {
      if (motionAnimationsRef.current !== animations) return;
      cancelCalendarAnimations(animations);
      motionAnimationsRef.current = [];
    };
  }, [layer, locale, selectedDateKey, selectedRecordId]);

  useEffect(() => {
    const previousLayer = previousLayerRef.current;
    previousLayerRef.current = layer;

    if (layer !== "overview") {
      window.requestAnimationFrame(() => focusDialogRef.current?.focus());
    } else if (previousLayer !== "overview") {
      window.requestAnimationFrame(() => {
        const previousControl = restoreOverviewFocusRef.current;
        if (previousControl?.isConnected) previousControl.focus();
        else overviewFallbackFocusRef.current?.focus();
      });
    }
  }, [layer]);

  useEffect(() => {
    if (!showCancelConfirmation) return;
    window.requestAnimationFrame(() => cancelDialogRef.current?.focus());
  }, [showCancelConfirmation]);

  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null;

  useEffect(() => {
    if (loading || layer !== "record" || selectedRecord) return;

    motionIntentRef.current = "record-to-day";
    setSelectedRecordId(null);
    setLayer("day");
    writeCalendarUrl(
      { activeFilter, anchorDateKey: selectedDateKey, layer: "day", selectedDateKey, selectedRecordId: null, view },
      "replace",
      Math.max(0, calendarHistoryDepth() - 1)
    );
  }, [activeFilter, layer, loading, selectedDateKey, selectedRecord, selectedRecordId, view]);

  useEffect(() => {
    setScheduleValue(defaultScheduleInput(selectedRecord?.scheduledAt ?? selectedRecord?.plannedAt));
    setShowCancelConfirmation(false);
  }, [selectedRecord?.id, selectedRecord?.plannedAt, selectedRecord?.scheduledAt]);

  const mediaById = useMemo(() => new Map(mediaAssets.map((asset) => [asset.id, asset])), [mediaAssets]);
  const recordsByDate = useMemo(() => groupCalendarRecords(records), [records]);
  const filteredRecords = useMemo(
    () => records.filter((record) => matchesCalendarFilter(record, activeFilter) && (!contentTypeFilter || record.contentType === contentTypeFilter)),
    [activeFilter, contentTypeFilter, records]
  );
  const overviewRecordsByDate = useMemo(() => groupCalendarRecords(filteredRecords), [filteredRecords]);
  const unscheduledRecords = useMemo(
    () =>
      filteredRecords
        .filter(
          (record) => calendarPlacementInstant(record) === null && (record.status === "DRAFT" || record.status === "IN_REVIEW" || record.status === "APPROVED")
        )
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [filteredRecords]
  );
  const selectedDayRecords = overviewRecordsByDate.get(selectedDateKey) ?? [];
  const scheduledThisWeek = summary.scheduledThisWeek;
  const readyCount = summary.ready;
  const failedCount = summary.needsAttention;

  async function loadMoreUnscheduled() {
    if (unscheduledNextOffset === null || loadingMoreUnscheduled) return;

    setLoadingMoreUnscheduled(true);
    try {
      const result = await client.calendar({
        from: queryFrom,
        to: queryTo,
        ...(activeFilter ? { statuses: calendarFilterStatuses(activeFilter) } : {}),
        ...(contentTypeFilter ? { contentTypes: [contentTypeFilter] } : {}),
        unscheduledLimit: 12,
        unscheduledOffset: unscheduledNextOffset
      });
      setRecords((current) => mergeRecords(current, result.unscheduled.items));
      setMediaAssets((current) => mergeMediaAssets(current, result.mediaAssets));
      setUnscheduledTotal(result.unscheduled.total);
      setUnscheduledNextOffset(result.unscheduled.nextOffset ?? null);
    } catch (error) {
      setNotice({ text: calendarError(error, locale), tone: "error" });
    } finally {
      setLoadingMoreUnscheduled(false);
    }
  }

  async function runFocusExit(target: "calendar" | "day") {
    if (motionLockedRef.current) return false;

    const surface = focusDialogRef.current;
    if (!surface) return true;

    const exitKind = target === "calendar" ? `${layer}-to-calendar` : "record-to-day";
    surface.dataset.calendarMotionKind = exitKind;
    if (prefersReducedCalendarMotion()) {
      surface.dataset.calendarMotionState = "reduced";
      return true;
    }

    motionLockedRef.current = true;
    cancelCalendarAnimations(motionAnimationsRef.current);
    const animations = playCalendarExit({
      backdrop: focusBackdropRef.current,
      isRtl: locale === "ar",
      origin: calendarMotionOriginRef.current,
      surface,
      target
    });
    motionAnimationsRef.current = animations;
    surface.dataset.calendarMotionState = "exiting";

    try {
      await finishCalendarAnimations(animations);
    } finally {
      cancelCalendarAnimations(animations);
      if (motionAnimationsRef.current === animations) motionAnimationsRef.current = [];
      motionLockedRef.current = false;
    }

    return true;
  }

  function rememberOverviewFocus() {
    if (layer !== "overview") return;
    restoreOverviewFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function openDay(dateKey: string, origin?: HTMLElement | null) {
    rememberOverviewFocus();
    calendarMotionOriginRef.current = readCalendarMotionOrigin(origin);
    detailMotionOriginRef.current = null;
    motionIntentRef.current = "calendar-to-day";
    setSelectedDateKey(dateKey);
    setAnchorDateKey(dateKey);
    setSelectedRecordId(null);
    setLayer("day");
    writeCalendarUrl(
      { activeFilter, anchorDateKey: dateKey, layer: "day", selectedDateKey: dateKey, selectedRecordId: null, view },
      "push",
      calendarHistoryDepth() + 1
    );
  }

  function chooseRecord(record: ContentRecord, origin?: HTMLElement | null) {
    rememberOverviewFocus();
    const nextOrigin = readCalendarMotionOrigin(origin);
    detailMotionOriginRef.current = nextOrigin;
    if (layer === "overview") {
      calendarMotionOriginRef.current = nextOrigin;
      motionIntentRef.current = "calendar-to-record";
    } else {
      motionIntentRef.current = layer === "day" ? "day-to-record" : "record-switch";
    }
    setSelectedRecordId(record.id);
    const recordDate = calendarDateKey(record) ?? selectedDateKey;
    setSelectedDateKey(recordDate);
    setAnchorDateKey(recordDate);
    setLayer("record");
    if (layer === "overview") {
      const currentDepth = calendarHistoryDepth();
      writeCalendarUrl(
        { activeFilter, anchorDateKey: recordDate, layer: "day", selectedDateKey: recordDate, selectedRecordId: null, view },
        "push",
        currentDepth + 1
      );
      writeCalendarUrl(
        { activeFilter, anchorDateKey: recordDate, layer: "record", selectedDateKey: recordDate, selectedRecordId: record.id, view },
        "push",
        currentDepth + 2
      );
      return;
    }

    writeCalendarUrl(
      { activeFilter, anchorDateKey: recordDate, layer: "record", selectedDateKey: recordDate, selectedRecordId: record.id, view },
      layer === "record" ? "replace" : "push",
      layer === "record" ? calendarHistoryDepth() : calendarHistoryDepth() + 1
    );
  }

  function closeDrillDown() {
    const depth = calendarHistoryDepth();
    const closingLayer = layer;

    void (async () => {
      if (!(await runFocusExit("calendar")) || layerRef.current !== closingLayer) return;

      if (closingLayer === "record" && depth >= 2) {
        window.history.go(-2);
        return;
      }
      if (closingLayer === "day" && depth >= 1) {
        window.history.back();
        return;
      }

      setSelectedRecordId(null);
      setLayer("overview");
      writeCalendarUrl({ activeFilter, anchorDateKey, layer: "overview", selectedDateKey: anchorDateKey, selectedRecordId: null, view }, "replace", 0);
    })();
  }

  function backToDay() {
    const closingLayer = layer;

    void (async () => {
      if (!(await runFocusExit("day")) || layerRef.current !== closingLayer) return;

      motionIntentRef.current = "record-to-day";
      if (calendarHistoryDepth() > 0) {
        window.history.back();
        return;
      }

      setSelectedRecordId(null);
      setLayer("day");
      writeCalendarUrl({ activeFilter, anchorDateKey: selectedDateKey, layer: "day", selectedDateKey, selectedRecordId: null, view }, "replace", 0);
    })();
  }

  function navigateDay(direction: -1 | 1) {
    navigateDayTo(addDays(selectedDateKey, direction));
  }

  function navigateDayTo(next: string) {
    motionIntentRef.current = layer === "record" ? "record-to-day" : "day-switch";
    setSelectedDateKey(next);
    setAnchorDateKey(next);
    setSelectedRecordId(null);
    setLayer("day");
    writeCalendarUrl(
      { activeFilter, anchorDateKey: next, layer: "day", selectedDateKey: next, selectedRecordId: null, view },
      "replace",
      calendarHistoryDepth()
    );
  }

  function changeFilter(nextFilter: CalendarFilter) {
    setActiveFilter(nextFilter);
    setSelectedRecordId(null);
    setLayer("overview");
    writeCalendarUrl(
      { activeFilter: nextFilter, anchorDateKey, layer: "overview", selectedDateKey: anchorDateKey, selectedRecordId: null, view },
      "replace",
      0
    );
  }

  function toggleFilter(filter: Exclude<CalendarFilter, null>) {
    changeFilter(activeFilter === filter ? null : filter);
  }

  function changeContentType(next: ContentType | null) {
    setContentTypeFilter(next);
    setSelectedRecordId(null);
    setLayer("overview");
    writeCalendarUrl(
      {
        activeFilter,
        anchorDateKey,
        contentTypeFilter: next,
        layer: "overview",
        selectedDateKey: anchorDateKey,
        selectedRecordId: null,
        view
      },
      "replace",
      0
    );
  }

  function closeCancelConfirmation() {
    setShowCancelConfirmation(false);
    window.requestAnimationFrame(() => cancelTriggerRef.current?.focus());
  }

  function requestScheduleCancellation() {
    cancelTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShowCancelConfirmation(true);
  }

  function upsertRecord(record: ContentRecord) {
    const previous = records.find((item) => item.id === record.id);
    setRecords((current) => {
      const index = current.findIndex((item) => item.id === record.id);
      if (index === -1) return [record, ...current];
      const next = [...current];
      next[index] = record;
      return next;
    });
    if (previous && (!contentTypeFilter || record.contentType === contentTypeFilter)) {
      setSummary((current) => ({
        needsAttention: Math.max(0, current.needsAttention + Number(record.status === "FAILED") - Number(previous.status === "FAILED")),
        ready: Math.max(0, current.ready + Number(record.status === "APPROVED") - Number(previous.status === "APPROVED")),
        scheduledThisWeek: Math.max(0, current.scheduledThisWeek + Number(isScheduledInWeek(record, todayKey)) - Number(isScheduledInWeek(previous, todayKey)))
      }));
    }
    setSelectedRecordId(record.id);
  }

  async function saveSchedule() {
    if (!selectedRecord || !["APPROVED", "FAILED", "SCHEDULED"].includes(selectedRecord.status)) return;

    setSaving(true);
    setNotice(null);

    try {
      const scheduledAt = bahrainInputToIso(scheduleValue);
      const updated =
        selectedRecord.status === "APPROVED"
          ? await client.scheduleContent(selectedRecord.id, scheduledAt)
          : await client.rescheduleContent(selectedRecord.id, scheduledAt);
      upsertRecord(updated);
      const newDateKey = calendarDateKey(updated);
      if (newDateKey) {
        setSelectedDateKey(newDateKey);
        setAnchorDateKey(newDateKey);
        writeCalendarUrl(
          { activeFilter, anchorDateKey: newDateKey, layer: "record", selectedDateKey: newDateKey, selectedRecordId: updated.id, view },
          "replace",
          calendarHistoryDepth()
        );
      }
      setNotice({
        text:
          locale === "ar"
            ? `تم حفظ الموعد في MARKOS: ${formatCalendarDateTime(updated.scheduledAt ?? scheduledAt, locale)}.`
            : `Saved in MARKOS for ${formatCalendarDateTime(updated.scheduledAt ?? scheduledAt, locale)}.`,
        tone: "success"
      });
    } catch (error) {
      setNotice({ text: calendarError(error, locale), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function cancelSchedule() {
    if (!selectedRecord || selectedRecord.status !== "SCHEDULED") return;

    setCancelling(true);
    setNotice(null);

    try {
      const updated = await client.unscheduleContent(selectedRecord.id);
      upsertRecord(updated);
      setUnscheduledTotal((current) => current + 1);
      const nextFilter = activeFilter === "scheduled" ? null : activeFilter;
      setActiveFilter(nextFilter);
      motionIntentRef.current = "record-to-day";
      setSelectedRecordId(null);
      setLayer("day");
      setShowUnscheduled(true);
      setShowCancelConfirmation(false);

      const dayState: CalendarUrlState = {
        activeFilter: nextFilter,
        anchorDateKey: selectedDateKey,
        layer: "day",
        selectedDateKey,
        selectedRecordId: null,
        view
      };
      const historyDepth = calendarHistoryDepth();
      if (historyDepth > 0) {
        if (nextFilter !== activeFilter) {
          window.addEventListener(
            "popstate",
            () => {
              setActiveFilter(nextFilter);
              if (historyDepth >= 2) {
                writeCalendarUrl({ ...dayState, layer: "overview", selectedDateKey: dayState.anchorDateKey }, "replace", 0);
                writeCalendarUrl(dayState, "push", 1);
              } else {
                writeCalendarUrl(dayState, "replace", 0);
              }
              setLayer("day");
              setSelectedDateKey(dayState.selectedDateKey);
            },
            { once: true }
          );
          window.history.go(-historyDepth);
        } else {
          window.history.back();
        }
      } else {
        writeCalendarUrl(dayState, "replace", 0);
      }
      setNotice({
        text:
          locale === "ar"
            ? "أُلغي الموعد. أصبح المنشور جاهزاً ونُقل إلى قائمة غير المجدول."
            : "Schedule cancelled. The post is Ready and has moved to Unscheduled.",
        tone: "success"
      });
    } catch (error) {
      setNotice({ text: calendarError(error, locale), tone: "error" });
    } finally {
      setCancelling(false);
    }
  }

  function navigate(direction: -1 | 1) {
    const next = view === "week" ? addDays(anchorDateKey, direction * 7) : addMonths(anchorDateKey, direction);
    setAnchorDateKey(next);
    setSelectedDateKey(next);
    writeCalendarUrl({ activeFilter, anchorDateKey: next, layer: "overview", selectedDateKey: next, selectedRecordId: null, view }, "replace", 0);
  }

  function resetToToday() {
    const currentToday = bahrainDateKey(new Date());
    setAnchorDateKey(currentToday);
    setSelectedDateKey(currentToday);
    writeCalendarUrl(
      { activeFilter, anchorDateKey: currentToday, layer: "overview", selectedDateKey: currentToday, selectedRecordId: null, view },
      "replace",
      0
    );
  }

  function changeView(nextView: CalendarView) {
    setView(nextView);
    writeCalendarUrl({ activeFilter, anchorDateKey, layer: "overview", selectedDateKey: anchorDateKey, selectedRecordId: null, view: nextView }, "replace", 0);
  }

  return (
    <section className={`relative ${layer === "overview" ? "" : "min-h-[52rem]"}`} data-calendar-layer={layer}>
      <div
        aria-hidden={layer !== "overview"}
        className={`space-y-6 motion-safe:transition motion-safe:duration-200 xl:space-y-7 ${
          layer === "overview" ? "" : "pointer-events-none select-none opacity-35 blur-[1px] motion-safe:scale-[.985]"
        }`}
        inert={layer === "overview" ? undefined : true}
      >
        <section className="sunlit-panel overflow-hidden rounded-[1.75rem] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <h1
              className="font-display text-2xl font-black tracking-[-.035em] text-[var(--sunlit-ink)] outline-none sm:text-3xl"
              ref={overviewFallbackFocusRef}
              tabIndex={-1}
            >
              {copy.calendarTitle}
            </h1>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button
                className="sunlit-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-extrabold"
                onClick={() => void refresh()}
                type="button"
              >
                <RefreshCw className={loading ? "animate-spin" : ""} size={17} /> {copy.refresh}
              </button>
              <Link
                className="sunlit-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-extrabold"
                href={`/${locale}/app/content-studio`}
              >
                <Plus size={18} /> {copy.addContent}
              </Link>
            </div>
          </div>
          <div aria-label={locale === "ar" ? "ملخص التقويم" : "Calendar summary"} className="mt-4 grid grid-cols-3 gap-2" role="group">
            <CalendarMetric
              active={activeFilter === "scheduled"}
              icon={CalendarDays}
              label={copy.scheduledThisWeek}
              onClick={() => toggleFilter("scheduled")}
              tone="aqua"
              value={scheduledThisWeek}
            />
            <CalendarMetric
              active={activeFilter === "ready"}
              icon={CheckCircle2}
              label={copy.ready}
              onClick={() => toggleFilter("ready")}
              tone="yellow"
              value={readyCount}
            />
            <CalendarMetric
              active={activeFilter === "failed"}
              icon={AlertCircle}
              label={copy.failed}
              onClick={() => toggleFilter("failed")}
              tone="coral"
              value={failedCount}
            />
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t border-[var(--sunlit-line)] pt-4 xl:flex-row xl:items-center xl:justify-between">
            <div aria-label={locale === "ar" ? "تصفية حالة المحتوى" : "Filter by content status"} className="flex flex-wrap gap-1.5" role="group">
              {calendarFilterOptions(copy).map((option) => {
                const selected = activeFilter === option.value;
                return (
                  <button
                    aria-pressed={selected}
                    className={
                      selected
                        ? "min-h-9 rounded-xl bg-[var(--sunlit-ink)] px-3 text-xs font-extrabold text-white"
                        : "min-h-9 rounded-xl border border-[var(--sunlit-line)] bg-white px-3 text-xs font-bold text-[var(--sunlit-ink-soft)] hover:border-[var(--sunlit-line-strong)]"
                    }
                    key={option.value ?? "all"}
                    onClick={() => changeFilter(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <label className="flex min-w-52 items-center gap-2 text-xs font-extrabold text-[var(--sunlit-muted)]">
              <span className="shrink-0">{copy.contentType}</span>
              <select
                aria-label={copy.contentType}
                className="sunlit-field min-h-10 min-w-0 flex-1 rounded-xl px-3 text-sm font-bold text-[var(--sunlit-ink)] outline-none"
                id="calendar-content-type-filter"
                name="calendar-content-type"
                onChange={(event) => changeContentType(event.target.value ? (event.target.value as ContentType) : null)}
                value={contentTypeFilter ?? ""}
              >
                <option value="">{copy.allContentTypes}</option>
                {(["POST", "CAROUSEL", "STORY", "REEL"] as ContentType[]).map((contentType) => (
                  <option key={contentType} value={contentType}>
                    {contentTypeName(contentType, locale)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="sunlit-panel min-w-0 rounded-[1.75rem] p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-xl font-black text-[var(--sunlit-ink)] sm:text-2xl">
              {view === "week" ? formatWeekRange(weekDateKeys, locale) : formatMonthLabel(monthStartKey, locale)}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="sunlit-secondary inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-extrabold"
                onClick={resetToToday}
                type="button"
              >
                {copy.today}
              </button>
              <div className="flex rounded-xl border border-[var(--sunlit-line)] bg-white p-1">
                <button
                  aria-label={locale === "ar" ? "الفترة السابقة" : "Previous period"}
                  className="grid h-9 w-9 place-items-center rounded-lg text-[var(--sunlit-ink-soft)] hover:bg-[var(--sunlit-paper)]"
                  onClick={() => navigate(-1)}
                  type="button"
                >
                  {locale === "ar" ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
                <button
                  aria-label={locale === "ar" ? "الفترة التالية" : "Next period"}
                  className="grid h-9 w-9 place-items-center rounded-lg text-[var(--sunlit-ink-soft)] hover:bg-[var(--sunlit-paper)]"
                  onClick={() => navigate(1)}
                  type="button"
                >
                  {locale === "ar" ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                </button>
              </div>
              <div
                className="flex rounded-xl border border-[var(--sunlit-line)] bg-white p-1"
                role="group"
                aria-label={locale === "ar" ? "طريقة عرض التقويم" : "Calendar view"}
              >
                <button
                  aria-pressed={view === "week"}
                  className={
                    view === "week"
                      ? "flex min-h-9 items-center gap-2 rounded-lg bg-[var(--sunlit-ink)] px-3 text-xs font-extrabold text-white"
                      : "flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold text-[var(--sunlit-muted)]"
                  }
                  onClick={() => changeView("week")}
                  type="button"
                >
                  <List size={15} /> {copy.week}
                </button>
                <button
                  aria-pressed={view === "month"}
                  className={
                    view === "month"
                      ? "flex min-h-9 items-center gap-2 rounded-lg bg-[var(--sunlit-ink)] px-3 text-xs font-extrabold text-white"
                      : "flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold text-[var(--sunlit-muted)]"
                  }
                  onClick={() => changeView("month")}
                  type="button"
                >
                  <LayoutGrid size={15} /> {copy.month}
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="mt-6 grid min-h-64 place-items-center rounded-2xl bg-[var(--sunlit-paper)] text-sm font-bold text-[var(--sunlit-muted)]">
              {copy.loading}
            </div>
          ) : view === "week" ? (
            <div className="mt-6 grid gap-3 md:grid-cols-7">
              {weekDateKeys.map((dateKey) => (
                <CalendarDayColumn
                  dateKey={dateKey}
                  key={dateKey}
                  locale={locale}
                  onChooseDate={(origin) => openDay(dateKey, origin)}
                  onChooseRecord={chooseRecord}
                  openDayLabel={copy.openDay}
                  records={overviewRecordsByDate.get(dateKey) ?? []}
                  selectedDateKey={selectedDateKey}
                  todayKey={todayKey}
                />
              ))}
            </div>
          ) : (
            <MonthOverview
              anchorMonthKey={monthStartKey}
              dateKeys={monthDateKeys}
              locale={locale}
              onChooseDate={openDay}
              recordsByDate={overviewRecordsByDate}
              selectedDateKey={selectedDateKey}
              todayKey={todayKey}
            />
          )}
        </section>

        <UnscheduledCollection
          copy={copy}
          expanded={showUnscheduled}
          hasMore={unscheduledNextOffset !== null}
          loadingMore={loadingMoreUnscheduled}
          locale={locale}
          onLoadMore={() => void loadMoreUnscheduled()}
          onToggle={() => setShowUnscheduled((current) => !current)}
          records={unscheduledRecords}
          total={unscheduledTotal}
        />
      </div>

      {layer !== "overview" ? (
        <div className="absolute inset-0 z-20 flex items-start justify-center rounded-[2rem] p-3 sm:p-5 lg:p-7" data-calendar-motion="focus-overlay">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[2rem] bg-[rgb(255_250_245_/_64%)] backdrop-blur-[2px]"
            data-calendar-motion="focus-backdrop"
            ref={focusBackdropRef}
          />
          <section
            aria-labelledby="calendar-focus-title"
            aria-modal="true"
            className={`sunlit-panel relative z-10 max-h-[calc(100vh-7rem)] w-full max-w-[1180px] rounded-[2rem] p-4 shadow-[0_28px_80px_rgb(53_38_31_/_20%)] outline-none sm:p-6 ${
              layer === "record" ? "overflow-y-auto lg:overflow-hidden" : "overflow-y-auto"
            }`}
            data-calendar-motion="focus-surface"
            onKeyDown={(event) => handleFocusDialogKeyDown(event, layer, backToDay, closeDrillDown)}
            ref={focusDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            {layer === "record" && selectedRecord ? (
              <CalendarRecordFocus
                copy={copy}
                dateKey={selectedDateKey}
                locale={locale}
                mediaById={mediaById}
                onBackToCalendar={closeDrillDown}
                onBackToDay={backToDay}
                onCancelRequest={requestScheduleCancellation}
                onChooseRecord={chooseRecord}
                onClose={closeDrillDown}
                onGoToday={() => navigateDayTo(todayKey)}
                onNavigate={navigateDay}
                onSaveSchedule={() => void saveSchedule()}
                record={selectedRecord}
                records={selectedDayRecords}
                saving={saving}
                scheduleValue={scheduleValue}
                setScheduleValue={setScheduleValue}
                todayKey={todayKey}
              />
            ) : (
              <CalendarDayView
                copy={copy}
                dateKey={selectedDateKey}
                locale={locale}
                mediaById={mediaById}
                onChooseRecord={chooseRecord}
                onClose={closeDrillDown}
                onGoToday={() => navigateDayTo(todayKey)}
                onNavigate={navigateDay}
                records={selectedDayRecords}
                todayKey={todayKey}
              />
            )}
          </section>
        </div>
      ) : null}

      {showCancelConfirmation && selectedRecord?.status === "SCHEDULED" ? (
        <div
          aria-labelledby="calendar-cancel-title"
          aria-modal="true"
          className="fixed inset-0 z-[80] grid place-items-center bg-[rgb(32_33_43_/_52%)] p-5 backdrop-blur-sm"
          role="dialog"
        >
          <section
            className="sunlit-panel w-full max-w-md rounded-[1.75rem] p-6 shadow-2xl outline-none sm:p-7"
            onKeyDown={(event) => handleConfirmationKeyDown(event, closeCancelConfirmation)}
            ref={cancelDialogRef}
            tabIndex={-1}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="sunlit-eyebrow">{copy.cancelSchedule}</p>
                <h2 className="mt-2 text-xl font-black text-[var(--sunlit-ink)]" id="calendar-cancel-title">
                  {copy.cancelConfirm}
                </h2>
              </div>
              <button
                aria-label={copy.close}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--sunlit-line)] text-[var(--sunlit-muted)]"
                onClick={closeCancelConfirmation}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--sunlit-muted)]">{contentTitle(selectedRecord, locale)}</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button className="sunlit-secondary min-h-11 rounded-xl px-5 text-sm font-extrabold" onClick={closeCancelConfirmation} type="button">
                {copy.cancel}
              </button>
              <button
                className="min-h-11 rounded-xl bg-[#B64051] px-5 text-sm font-extrabold text-white disabled:opacity-60"
                disabled={cancelling}
                onClick={() => void cancelSchedule()}
                type="button"
              >
                {cancelling ? (locale === "ar" ? "جارٍ الإلغاء..." : "Cancelling...") : copy.cancelSchedule}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {notice ? (
        <div
          aria-live={notice.tone === "error" ? "assertive" : "polite"}
          className={`fixed bottom-5 end-5 z-[90] flex w-[min(26rem,calc(100vw-2.5rem))] items-start gap-3 rounded-2xl border bg-white p-4 shadow-[0_18px_48px_rgb(53_38_31_/_20%)] ${
            notice.tone === "error" ? "border-[#E8A8B2]" : "border-[rgb(33_191_174_/_38%)]"
          }`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          <span
            className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
              notice.tone === "error" ? "bg-[#FFF0F1] text-[#A43C49]" : "bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]"
            }`}
          >
            {notice.tone === "error" ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
          </span>
          <p className="min-w-0 flex-1 pt-1 text-sm font-bold leading-6 text-[var(--sunlit-ink-soft)]">{notice.text}</p>
          <button
            aria-label={locale === "ar" ? "إخفاء الرسالة" : "Dismiss message"}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--sunlit-muted)] transition hover:bg-[var(--sunlit-paper)]"
            onClick={() => setNotice(null)}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
    </section>
  );
}

function CalendarRecordFocus({
  copy,
  dateKey,
  locale,
  mediaById,
  onBackToCalendar,
  onBackToDay,
  onCancelRequest,
  onChooseRecord,
  onClose,
  onGoToday,
  onNavigate,
  onSaveSchedule,
  record,
  records,
  saving,
  scheduleValue,
  setScheduleValue,
  todayKey
}: {
  copy: CalendarCopy;
  dateKey: string;
  locale: Locale;
  mediaById: Map<string, MediaAssetRecord>;
  onBackToCalendar: () => void;
  onBackToDay: () => void;
  onCancelRequest: () => void;
  onChooseRecord: (record: ContentRecord, origin?: HTMLElement | null) => void;
  onClose: () => void;
  onGoToday: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onSaveSchedule: () => void;
  record: ContentRecord;
  records: ContentRecord[];
  saving: boolean;
  scheduleValue: string;
  setScheduleValue: (value: string) => void;
  todayKey: string;
}) {
  const media = record.mediaIds.map((id) => mediaById.get(id)).find((asset): asset is MediaAssetRecord => asset !== undefined) ?? null;
  const temporalContext = calendarPlacementInstant(record) ?? record.updatedAt;

  return (
    <div
      className="grid min-w-0 lg:h-[calc(100vh-10rem)] lg:min-h-[32rem] lg:max-h-[44rem] lg:grid-cols-[20rem_minmax(0,1fr)] lg:overflow-hidden"
      data-calendar-motion-part="record-focus"
    >
      <aside
        className="min-w-0 border-b border-[var(--sunlit-line)] pb-5 lg:flex lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-e lg:pe-5 lg:pb-0"
        data-calendar-motion-part="day-context"
      >
        <button
          className="sunlit-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-extrabold"
          onClick={onBackToCalendar}
          type="button"
        >
          {locale === "ar" ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          {copy.backToCalendar}
        </button>

        <div className="mt-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="sunlit-eyebrow">{formatWeekday(dateKey, locale)}</p>
            <h3 className="mt-1 text-xl font-black leading-7 text-[var(--sunlit-ink)]">{formatCompactDate(dateKey, locale)}</h3>
            <p className="mt-1 text-xs font-bold text-[var(--sunlit-muted)]">{formatItemCount(records.length, locale)}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              aria-label={copy.previousDay}
              className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--sunlit-line)] bg-white text-[var(--sunlit-ink-soft)] hover:bg-[var(--sunlit-paper)]"
              onClick={() => onNavigate(-1)}
              type="button"
            >
              {locale === "ar" ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
            </button>
            <button
              aria-label={copy.nextDay}
              className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--sunlit-line)] bg-white text-[var(--sunlit-ink-soft)] hover:bg-[var(--sunlit-paper)]"
              onClick={() => onNavigate(1)}
              type="button"
            >
              {locale === "ar" ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
            </button>
          </div>
        </div>

        <button
          className="sunlit-secondary mt-3 min-h-9 rounded-xl px-3 text-xs font-extrabold"
          disabled={dateKey === todayKey}
          onClick={onGoToday}
          type="button"
        >
          {copy.today}
        </button>

        <div className="mt-5 grid max-h-[34rem] gap-2 overflow-y-auto pe-1 lg:min-h-0 lg:flex-1">
          {records.map((dayRecord) => {
            const dayMedia = dayRecord.mediaIds.map((id) => mediaById.get(id)).find((asset): asset is MediaAssetRecord => asset !== undefined) ?? null;
            const selected = dayRecord.id === record.id;

            return (
              <button
                aria-current={selected ? "true" : undefined}
                className={`group flex min-w-0 items-center gap-3 rounded-2xl border p-2.5 text-start transition ${
                  selected
                    ? "border-[var(--sunlit-coral)] bg-[#FFF1EC] shadow-sm"
                    : "border-[var(--sunlit-line)] bg-white hover:border-[var(--sunlit-line-strong)] hover:shadow-sm"
                }`}
                key={dayRecord.id}
                onClick={(event) => onChooseRecord(dayRecord, event.currentTarget)}
                type="button"
              >
                <span className="grid h-14 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-black/5 bg-[var(--sunlit-paper)] text-[var(--sunlit-muted)]">
                  {dayMedia ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="h-full w-full object-cover" src={dayMedia.publicUrl} />
                  ) : (
                    <ImageIcon size={18} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[10px] font-extrabold text-[var(--sunlit-muted)]">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(dayRecord.status)}`} />
                    {statusLabel(dayRecord.status, locale)}
                  </span>
                  <span className="mt-1 block truncate text-xs font-black text-[var(--sunlit-ink)]">{contentTitle(dayRecord, locale)}</span>
                  <span className="mt-1 block text-[10px] font-bold text-[var(--sunlit-muted)]">{recordMomentLabel(dayRecord, copy, locale)}</span>
                </span>
                {selected ? <span className="h-8 w-1 shrink-0 rounded-full bg-[var(--sunlit-coral)]" /> : null}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0 pt-5 lg:h-full lg:overflow-y-auto lg:ps-6 lg:pe-2 lg:pt-0" data-calendar-motion-part="record-detail" key={record.id}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--sunlit-line)] pb-5">
          <div className="min-w-0">
            <button
              className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--sunlit-muted)] hover:text-[var(--sunlit-ink)]"
              onClick={onBackToDay}
              type="button"
            >
              {locale === "ar" ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
              {copy.backToDay}
            </button>
            <p className="mt-3 text-xs font-bold text-[var(--sunlit-muted)]">
              {copy.calendarTitle} / {formatDayHeading(dateKey, locale)} / {formatCalendarTime(temporalContext, locale)}
            </p>
            <h2 className="mt-1 text-xl font-black text-[var(--sunlit-ink)]" id="calendar-focus-title">
              {copy.details}
            </h2>
          </div>
          <button
            aria-label={copy.close}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--sunlit-line)] text-[var(--sunlit-muted)] transition hover:bg-[var(--sunlit-paper)]"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6">
          <CalendarDetails
            copy={copy}
            locale={locale}
            media={media}
            onCancelRequest={onCancelRequest}
            onSaveSchedule={onSaveSchedule}
            record={record}
            saving={saving}
            scheduleValue={scheduleValue}
            setScheduleValue={setScheduleValue}
          />
        </div>
      </div>
    </div>
  );
}

function CalendarDetails({
  copy,
  locale,
  media,
  onCancelRequest,
  onSaveSchedule,
  record,
  saving,
  scheduleValue,
  setScheduleValue
}: {
  copy: CalendarCopy;
  locale: Locale;
  media: MediaAssetRecord | null;
  onCancelRequest: () => void;
  onSaveSchedule: () => void;
  record: ContentRecord;
  saving: boolean;
  scheduleValue: string;
  setScheduleValue: (value: string) => void;
}) {
  const canChooseTime = ["APPROVED", "FAILED", "SCHEDULED"].includes(record.status);
  const caption = locale === "ar" ? (record.captionAr ?? record.captionEn) : (record.captionEn ?? record.captionAr);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,.92fr)] lg:items-start">
      <div>
        {media ? (
          <div className="mx-auto aspect-[4/5] max-h-[42rem] overflow-hidden rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)]">
            {/* Workspace media can be an API proxy URL or a short-lived provider URL, so it intentionally bypasses Next image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={media.filename} className="h-full w-full object-contain" src={media.publicUrl} />
          </div>
        ) : (
          <div className="grid aspect-[4/5] max-h-[42rem] place-items-center rounded-2xl border border-dashed border-[var(--sunlit-line-strong)] bg-[var(--sunlit-paper)] text-[var(--sunlit-muted)]">
            <div className="text-center">
              <ImageIcon className="mx-auto" size={32} />
              <p className="mt-2 text-sm font-bold">{locale === "ar" ? "لا توجد وسائط مرفقة" : "No media attached"}</p>
            </div>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${statusBadgeClass(record.status)}`}>{statusLabel(record.status, locale)}</span>
          <span className="text-xs font-bold text-[var(--sunlit-muted)]">{recordMomentLabel(record, copy, locale)}</span>
        </div>
        <h3 className="mt-4 text-2xl font-black leading-8 text-[var(--sunlit-ink)]">{contentTitle(record, locale)}</h3>
        {caption ? <p className="mt-3 whitespace-pre-line text-sm font-medium leading-6 text-[var(--sunlit-ink-soft)]">{caption}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[var(--sunlit-muted)]">
          <span className="rounded-full bg-[var(--sunlit-paper)] px-3 py-1.5">{contentTypeLabel(record, locale)}</span>
          {record.contentPillar ? <span className="rounded-full bg-[var(--sunlit-paper)] px-3 py-1.5">{record.contentPillar}</span> : null}
          <span className="rounded-full bg-[var(--sunlit-paper)] px-3 py-1.5">
            {record.mediaIds.length} {locale === "ar" ? "وسائط" : "media"}
          </span>
        </div>

        {record.failureReason ? (
          <div className="mt-5 rounded-2xl bg-[#FFF0F1] p-4 text-sm font-semibold leading-6 text-[#8F3340]">
            <AlertCircle className="me-2 inline" size={17} /> {record.failureReason}
          </div>
        ) : null}

        {canChooseTime ? (
          <div className="mt-6 border-t border-[var(--sunlit-line)] pt-5">
            <label className="block text-sm font-extrabold text-[var(--sunlit-ink)]" htmlFor={`calendar-time-${record.id}`}>
              {record.status === "APPROVED" ? copy.schedulePost : copy.reschedule}
            </label>
            <p className="mt-1 text-xs leading-5 text-[var(--sunlit-muted)]">{copy.allTimes}</p>
            <input
              className="sunlit-field mt-3 min-h-12 w-full rounded-xl px-3 text-sm font-bold outline-none"
              id={`calendar-time-${record.id}`}
              min={minimumScheduleInput()}
              onChange={(event) => setScheduleValue(event.target.value)}
              type="datetime-local"
              value={scheduleValue}
            />
            <button
              className="sunlit-primary mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:opacity-60"
              disabled={saving || !scheduleValue}
              onClick={onSaveSchedule}
              type="button"
            >
              <Send size={16} /> {saving ? (locale === "ar" ? "جارٍ الحفظ..." : "Saving...") : record.status === "APPROVED" ? copy.schedule : copy.saveNewTime}
            </button>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Link
            className="sunlit-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold"
            href={`/${locale}/app/content-studio?item=${record.id}`}
          >
            <Pencil size={16} /> {copy.openEditor}
          </Link>
          {record.status === "PUBLISHED" ? (
            <Link
              className="sunlit-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold"
              href={`/${locale}/app/analytics`}
            >
              <Sparkles size={16} /> {copy.viewInsights}
            </Link>
          ) : null}
          {record.status === "SCHEDULED" ? (
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E49AAA] bg-white px-4 text-sm font-extrabold text-[#A43C49] sm:col-span-2 lg:col-span-1"
              onClick={onCancelRequest}
              type="button"
            >
              <X size={16} /> {copy.cancelSchedule}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CalendarDayView({
  copy,
  dateKey,
  locale,
  mediaById,
  onChooseRecord,
  onClose,
  onGoToday,
  onNavigate,
  records,
  todayKey
}: {
  copy: CalendarCopy;
  dateKey: string;
  locale: Locale;
  mediaById: Map<string, MediaAssetRecord>;
  onChooseRecord: (record: ContentRecord, origin?: HTMLElement | null) => void;
  onClose: () => void;
  onGoToday: () => void;
  onNavigate: (direction: -1 | 1) => void;
  records: ContentRecord[];
  todayKey: string;
}) {
  return (
    <div data-calendar-motion-part="day-view">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--sunlit-line)] pb-5">
        <button className="sunlit-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-extrabold" onClick={onClose} type="button">
          {locale === "ar" ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          <span className="hidden sm:inline">{copy.backToCalendar}</span>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="text-xl font-black leading-7 text-[var(--sunlit-ink)] sm:text-2xl" id="calendar-focus-title">
            {formatDayHeading(dateKey, locale)}
          </h2>
          <p className="mt-1 text-sm font-bold text-[var(--sunlit-muted)]">{formatItemCount(records.length, locale)}</p>
        </div>
        <button
          aria-label={copy.close}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--sunlit-line)] text-[var(--sunlit-muted)] transition hover:bg-[var(--sunlit-paper)]"
          onClick={onClose}
          type="button"
        >
          <X size={18} />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          aria-label={copy.previousDay}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--sunlit-line)] bg-white text-[var(--sunlit-ink-soft)] transition hover:bg-[var(--sunlit-paper)]"
          onClick={() => onNavigate(-1)}
          type="button"
        >
          {locale === "ar" ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
        <button className="sunlit-secondary min-h-10 rounded-xl px-4 text-sm font-extrabold" disabled={dateKey === todayKey} onClick={onGoToday} type="button">
          {copy.today}
        </button>
        <button
          aria-label={copy.nextDay}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--sunlit-line)] bg-white text-[var(--sunlit-ink-soft)] transition hover:bg-[var(--sunlit-paper)]"
          onClick={() => onNavigate(1)}
          type="button"
        >
          {locale === "ar" ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      {records.length > 0 ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {records.map((record) => (
            <CalendarDayRecordButton
              key={record.id}
              locale={locale}
              media={record.mediaIds.map((id) => mediaById.get(id)).find((asset): asset is MediaAssetRecord => asset !== undefined) ?? null}
              onClick={(origin) => onChooseRecord(record, origin)}
              record={record}
              copy={copy}
            />
          ))}
        </div>
      ) : (
        <div className="mt-6 grid min-h-64 place-items-center rounded-2xl border border-dashed border-[var(--sunlit-line-strong)] bg-[var(--sunlit-paper)] p-6 text-center">
          <div className="max-w-sm">
            <CalendarDays className="mx-auto text-[var(--sunlit-aqua)]" size={36} />
            <p className="mt-3 text-sm font-bold leading-6 text-[var(--sunlit-muted)]">{copy.emptyDay}</p>
            <Link
              className="sunlit-primary mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold"
              href={`/${locale}/app/content-studio`}
            >
              <Plus size={17} /> {copy.addContent}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UnscheduledCollection({
  copy,
  expanded,
  hasMore,
  loadingMore,
  locale,
  onLoadMore,
  onToggle,
  records,
  total
}: {
  copy: CalendarCopy;
  expanded: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  locale: Locale;
  onLoadMore: () => void;
  onToggle: () => void;
  records: ContentRecord[];
  total: number;
}) {
  return (
    <section className="sunlit-panel overflow-hidden rounded-[1.75rem]">
      <button
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-start transition hover:bg-white/65 sm:px-5"
        onClick={onToggle}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[var(--sunlit-pink)]">
            <CalendarDays size={19} />
          </span>
          <span className="min-w-0">
            <span className="block font-black text-[var(--sunlit-ink)]">
              {copy.unscheduled} <span className="text-[var(--sunlit-muted)]">· {formatCompactCount(total, locale)}</span>
            </span>
            <span className="mt-0.5 block text-xs font-semibold leading-5 text-[var(--sunlit-muted)]">{copy.unscheduledDescription}</span>
          </span>
        </span>
        <ChevronDown className={`shrink-0 text-[var(--sunlit-muted)] transition ${expanded ? "rotate-180" : ""}`} size={19} />
      </button>
      {expanded ? (
        records.length > 0 ? (
          <div className="border-t border-[var(--sunlit-line)]">
            <div className="grid max-h-72 gap-2 overflow-y-auto p-3 sm:grid-cols-2 sm:p-4">
              {records.map((record) => (
                <Link
                  className="rounded-xl border border-[var(--sunlit-line)] bg-white px-4 py-3 transition hover:border-[var(--sunlit-line-strong)] hover:shadow-sm"
                  href={`/${locale}/app/content-studio?item=${record.id}`}
                  key={record.id}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-[var(--sunlit-ink)]">{contentTitle(record, locale)}</span>
                      <span className="mt-1 block text-xs font-bold text-[var(--sunlit-muted)]">
                        {contentTypeLabel(record, locale)} · {copy.updated} {formatCalendarDateTime(record.updatedAt, locale)}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusBadgeClass(record.status)}`}>
                      {statusLabel(record.status, locale)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            {hasMore ? (
              <div className="border-t border-[var(--sunlit-line)] p-3 text-center">
                <button
                  className="sunlit-secondary min-h-10 rounded-xl px-5 text-sm font-extrabold disabled:opacity-60"
                  disabled={loadingMore}
                  onClick={onLoadMore}
                  type="button"
                >
                  {loadingMore ? copy.loadingMore : copy.loadMore}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="border-t border-[var(--sunlit-line)] px-5 py-5 text-sm font-bold text-[var(--sunlit-muted)]">{copy.unscheduledEmpty}</p>
        )
      ) : null}
    </section>
  );
}

function CalendarDayColumn({
  dateKey,
  locale,
  onChooseDate,
  onChooseRecord,
  openDayLabel,
  records,
  selectedDateKey,
  todayKey
}: {
  dateKey: string;
  locale: Locale;
  onChooseDate: (origin: HTMLElement) => void;
  onChooseRecord: (record: ContentRecord, origin?: HTMLElement | null) => void;
  openDayLabel: string;
  records: ContentRecord[];
  selectedDateKey: string;
  todayKey: string;
}) {
  const isSelected = dateKey === selectedDateKey;
  const isToday = dateKey === todayKey;

  return (
    <section
      className={
        isSelected
          ? "min-w-0 rounded-2xl border border-[rgb(33_191_174_/_45%)] bg-[var(--sunlit-aqua-soft)] p-3 text-start shadow-sm lg:min-h-[28rem] xl:min-h-[32rem]"
          : "min-w-0 rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-3 text-start lg:min-h-[28rem] xl:min-h-[32rem]"
      }
    >
      <button
        aria-label={`${openDayLabel}: ${formatDayHeading(dateKey, locale)} · ${formatItemCount(records.length, locale)}`}
        className="flex w-full items-center justify-between gap-2 rounded-xl text-start outline-none transition hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-[var(--sunlit-aqua)] md:block"
        onClick={(event) => onChooseDate(event.currentTarget.closest("section") ?? event.currentTarget)}
        type="button"
      >
        <span className="block text-[11px] font-extrabold uppercase tracking-[.1em] text-[var(--sunlit-muted)]">{formatWeekday(dateKey, locale)}</span>
        <span
          className={
            isToday
              ? "mt-1 inline-grid h-8 w-8 place-items-center rounded-full bg-[var(--sunlit-coral)] text-sm font-black text-white"
              : "mt-1 block text-lg font-black text-[var(--sunlit-ink)]"
          }
        >
          {Number(dateKey.slice(-2))}
        </span>
      </button>
      <div className="mt-3 grid gap-2">
        {records.length > 0 ? (
          <>
            {records.slice(0, 4).map((record) => (
              <button
                aria-label={`${statusLabel(record.status, locale)}: ${contentTitle(record, locale)} · ${contentTypeLabel(record, locale)} · ${formatCalendarTime(calendarPlacementInstant(record) ?? record.updatedAt, locale)}`}
                className="min-w-0 rounded-xl border border-[var(--sunlit-line)] bg-white/85 px-2.5 py-2 text-start outline-none transition hover:-translate-y-0.5 hover:border-[var(--sunlit-line-strong)] hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--sunlit-aqua)]"
                key={record.id}
                onClick={(event) => onChooseRecord(record, event.currentTarget)}
                type="button"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(record.status)}`} />
                  <span className="min-w-0 flex-1 truncate text-[10px] font-extrabold text-[var(--sunlit-ink)]">{contentTitle(record, locale)}</span>
                </span>
                <span className="mt-1 block truncate text-[9px] font-bold text-[var(--sunlit-muted)]">
                  {contentTypeLabel(record, locale)} · {formatCalendarTime(calendarPlacementInstant(record) ?? record.updatedAt, locale)}
                </span>
              </button>
            ))}
            {records.length > 4 ? (
              <button
                className="rounded-lg py-1 text-center text-[10px] font-extrabold text-[var(--sunlit-muted)] hover:text-[var(--sunlit-ink)]"
                onClick={(event) => onChooseDate(event.currentTarget.closest("section") ?? event.currentTarget)}
                type="button"
              >
                +{formatCompactCount(records.length - 4, locale)}
              </button>
            ) : null}
          </>
        ) : (
          <button
            aria-label={`${openDayLabel}: ${formatDayHeading(dateKey, locale)}`}
            className="rounded-xl border border-dashed border-[var(--sunlit-line)] bg-white/70 px-2 py-3 text-center text-[10px] font-bold text-[var(--sunlit-muted)] hover:border-[var(--sunlit-line-strong)]"
            onClick={(event) => onChooseDate(event.currentTarget.closest("section") ?? event.currentTarget)}
            type="button"
          >
            —
          </button>
        )}
      </div>
    </section>
  );
}

function MonthOverview({
  anchorMonthKey,
  dateKeys,
  locale,
  onChooseDate,
  recordsByDate,
  selectedDateKey,
  todayKey
}: {
  anchorMonthKey: string;
  dateKeys: string[];
  locale: Locale;
  onChooseDate: (dateKey: string, origin?: HTMLElement | null) => void;
  recordsByDate: Map<string, ContentRecord[]>;
  selectedDateKey: string;
  todayKey: string;
}) {
  const weekdayKeys = Array.from({ length: 7 }, (_, index) => addDays("2026-08-16", index));

  return (
    <div className="mt-6">
      <div
        aria-label={locale === "ar" ? "دليل حالات المحتوى" : "Content status legend"}
        className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] px-3 py-2.5"
      >
        {(["DRAFT", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED"] as ContentStatus[]).map((status) => (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-[var(--sunlit-muted)] sm:text-xs" key={status}>
            <span className={`grid h-5 w-5 place-items-center rounded-md ${monthStatusMarkerClass(status)}`}>
              <MonthStatusGlyph size={11} status={status} />
            </span>
            {statusLabel(status, locale)}
          </span>
        ))}
      </div>
      <div aria-label={locale === "ar" ? "تقويم الشهر" : "Month calendar"} className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {weekdayKeys.map((dateKey) => (
          <div className="pb-1 text-center text-[10px] font-extrabold uppercase tracking-[.08em] text-[var(--sunlit-muted)] sm:text-xs" key={dateKey}>
            {formatWeekday(dateKey, locale)}
          </div>
        ))}
        {dateKeys.map((dateKey) => {
          const dayRecords = recordsByDate.get(dateKey) ?? [];
          const currentMonth = dateKey.slice(0, 7) === anchorMonthKey.slice(0, 7);
          const selected = dateKey === selectedDateKey;
          const today = dateKey === todayKey;
          const statusGroups = monthStatusGroups(dayRecords);
          const visibleStatusGroups = [...statusGroups]
            .sort((left, right) => monthStatusDisplayPriority(left.status) - monthStatusDisplayPriority(right.status))
            .slice(0, 4);
          const visibleStatuses = new Set(visibleStatusGroups.map((group) => group.status));
          const hiddenItemCount = statusGroups.filter((group) => !visibleStatuses.has(group.status)).reduce((total, group) => total + group.count, 0);
          const statusSummary = statusGroups.map((group) => `${statusLabel(group.status, locale)}: ${formatCompactCount(group.count, locale)}`).join(", ");

          return (
            <button
              aria-label={`${formatDayHeading(dateKey, locale)} · ${formatItemCount(dayRecords.length, locale)}${statusSummary ? ` · ${statusSummary}` : ""}`}
              className={
                selected
                  ? "min-h-20 rounded-xl border border-[rgb(33_191_174_/_40%)] bg-[var(--sunlit-aqua-soft)] p-2 text-start sm:min-h-24"
                  : "min-h-20 rounded-xl border border-[var(--sunlit-line)] bg-white p-2 text-start hover:border-[var(--sunlit-line-strong)] sm:min-h-24"
              }
              key={dateKey}
              onClick={(event) => onChooseDate(dateKey, event.currentTarget)}
              type="button"
            >
              <span className="flex items-start justify-between gap-1">
                <span
                  className={
                    today
                      ? "grid h-6 w-6 place-items-center rounded-full bg-[var(--sunlit-coral)] text-[11px] font-black text-white"
                      : currentMonth
                        ? "text-xs font-black text-[var(--sunlit-ink)]"
                        : "text-xs font-bold text-[var(--sunlit-muted)] opacity-45"
                  }
                >
                  {formatCompactCount(Number(dateKey.slice(-2)), locale)}
                </span>
                {dayRecords.length > 0 ? (
                  <span
                    aria-hidden="true"
                    className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--sunlit-paper-deep)] px-1.5 text-[9px] font-black text-[var(--sunlit-ink-soft)]"
                  >
                    {formatCompactCount(dayRecords.length, locale)}
                  </span>
                ) : null}
              </span>
              {visibleStatusGroups.length > 0 ? (
                <span aria-hidden="true" className="mt-2 flex flex-wrap gap-1">
                  {visibleStatusGroups.map((group) => (
                    <span
                      className={`inline-flex min-h-5 items-center gap-1 rounded-md px-1.5 text-[9px] font-black ${monthStatusMarkerClass(group.status)}`}
                      key={group.status}
                    >
                      <MonthStatusGlyph size={10} status={group.status} />
                      {formatCompactCount(group.count, locale)}
                    </span>
                  ))}
                  {hiddenItemCount > 0 ? (
                    <span className="inline-flex min-h-5 items-center rounded-md bg-[var(--sunlit-paper-deep)] px-1.5 text-[9px] font-black text-[var(--sunlit-muted)]">
                      +{formatCompactCount(hiddenItemCount, locale)}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthStatusGlyph({ size, status }: { size: number; status: ContentStatus }) {
  if (status === "FAILED") return <AlertCircle aria-hidden="true" size={size} />;
  if (status === "SCHEDULED") return <CalendarDays aria-hidden="true" size={size} />;
  if (status === "PUBLISHED") return <CheckCircle2 aria-hidden="true" size={size} />;
  if (status === "APPROVED") return <Sparkles aria-hidden="true" size={size} />;
  if (status === "DRAFT") return <Pencil aria-hidden="true" size={size} />;
  return <List aria-hidden="true" size={size} />;
}

function CalendarDayRecordButton({
  copy,
  locale,
  media,
  onClick,
  record
}: {
  copy: CalendarCopy;
  locale: Locale;
  media: MediaAssetRecord | null;
  onClick: (origin: HTMLButtonElement) => void;
  record: ContentRecord;
}) {
  return (
    <button
      className={`group min-w-0 rounded-2xl border p-3 text-start transition hover:-translate-y-0.5 hover:shadow-md ${statusCardClass(record.status)}`}
      onClick={(event) => onClick(event.currentTarget)}
      type="button"
    >
      <span className="flex gap-3">
        <span className="grid h-20 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-black/5 bg-white/70 text-[var(--sunlit-muted)]">
          {media ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="h-full w-full object-cover" src={media.publicUrl} />
            </>
          ) : (
            <ImageIcon size={22} />
          )}
        </span>
        <span className="min-w-0 flex-1 py-0.5">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusBadgeClass(record.status)}`}>
            {statusLabel(record.status, locale)}
          </span>
          <span className="mt-2 block min-w-0 text-sm font-black leading-5 text-[var(--sunlit-ink)]">{contentTitle(record, locale)}</span>
          <span className="mt-1.5 block text-xs font-bold text-[var(--sunlit-muted)]">{recordMomentLabel(record, copy, locale)}</span>
        </span>
        <span className="self-center text-[var(--sunlit-muted)] transition group-hover:text-[var(--sunlit-ink)]">
          {locale === "ar" ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </span>
      </span>
    </button>
  );
}

function CalendarMetric({
  active,
  icon: Icon,
  label,
  onClick,
  tone,
  value
}: {
  active: boolean;
  icon: typeof CalendarDays;
  label: string;
  onClick: () => void;
  tone: "aqua" | "coral" | "yellow";
  value: number;
}) {
  const styles = {
    aqua: {
      active: "border-[rgb(33_191_174_/_55%)] bg-[var(--sunlit-aqua-soft)] shadow-[0_8px_24px_rgb(33_191_174_/_12%)]",
      icon: "bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]"
    },
    coral: {
      active: "border-[rgb(217_76_97_/_45%)] bg-[#FFF0F1] shadow-[0_8px_24px_rgb(217_76_97_/_10%)]",
      icon: "bg-[#FFF0F1] text-[#A43C49]"
    },
    yellow: {
      active: "border-[rgb(234_184_72_/_55%)] bg-[var(--sunlit-yellow-soft)] shadow-[0_8px_24px_rgb(234_184_72_/_12%)]",
      icon: "bg-[var(--sunlit-yellow-soft)] text-[#8A6510]"
    }
  }[tone];

  return (
    <button
      aria-pressed={active}
      className={`flex min-h-[4.75rem] items-center gap-2 rounded-2xl border px-2 py-2.5 text-start transition hover:-translate-y-0.5 hover:border-[var(--sunlit-line-strong)] sm:min-h-16 sm:gap-3 sm:px-3 ${
        active ? styles.active : "border-[var(--sunlit-line)] bg-white/70"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl sm:h-9 sm:w-9 ${styles.icon}`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-black leading-none text-[var(--sunlit-ink)] sm:text-xl">{value}</span>
        <span className="mt-1 block text-[11px] font-bold leading-4 text-[var(--sunlit-muted)] sm:text-xs">{label}</span>
      </span>
    </button>
  );
}

function calendarFilterOptions(copy: CalendarCopy): Array<{ label: string; value: CalendarFilter }> {
  return [
    { label: copy.all, value: null },
    { label: copy.draft, value: "draft" },
    { label: copy.ready, value: "ready" },
    { label: copy.scheduled, value: "scheduled" },
    { label: copy.published, value: "published" },
    { label: copy.failed, value: "failed" }
  ];
}

function calendarCopy(locale: Locale): CalendarCopy {
  if (locale === "ar") {
    return {
      addContent: "إنشاء محتوى",
      all: "الكل",
      allContentTypes: "كل الأنواع",
      allTimes: "جميع المواعيد بتوقيت البحرين.",
      backToCalendar: "العودة إلى التقويم",
      backToDay: "العودة إلى اليوم",
      cancel: "رجوع",
      cancelConfirm: "هل تريد إلغاء موعد هذا المحتوى؟",
      cancelSchedule: "إلغاء الموعد",
      calendarTitle: "تقويم المحتوى",
      close: "إغلاق",
      contentType: "نوع المحتوى",
      details: "تفاصيل المحتوى",
      draft: "مسودة",
      emptyDay: "لا يوجد محتوى مخطط أو مجدول أو منشور في هذا اليوم.",
      failed: "يحتاج انتباهاً",
      loading: "جارٍ تحميل تقويم مساحة العمل...",
      loadMore: "تحميل المزيد",
      loadingMore: "جارٍ التحميل...",
      month: "الشهر",
      nextDay: "اليوم التالي",
      openDay: "فتح اليوم",
      openEditor: "تعديل المحتوى",
      planned: "مخطط",
      previousDay: "اليوم السابق",
      published: "منشور",
      ready: "جاهز للجدولة",
      refresh: "تحديث",
      reschedule: "اختيار موعد جديد",
      saveNewTime: "حفظ الموعد الجديد",
      schedule: "جدولة المحتوى",
      schedulePost: "اختيار موعد النشر",
      scheduled: "مجدول في MARKOS",
      scheduledThisWeek: "مجدول هذا الأسبوع",
      today: "اليوم",
      unscheduled: "غير المجدول",
      unscheduledDescription: "المسودات والمحتوى الجاهز الذي لا يملك موعد نشر مخططاً له.",
      unscheduledEmpty: "لا يوجد محتوى غير مجدول ضمن عامل التصفية الحالي.",
      updated: "آخر تحديث",
      viewInsights: "عرض الإحصاءات",
      week: "الأسبوع"
    };
  }

  return {
    addContent: "Create content",
    all: "All",
    allContentTypes: "All types",
    allTimes: "All times are shown in Bahrain time.",
    backToCalendar: "Back to calendar",
    backToDay: "Back to day",
    cancel: "Go back",
    cancelConfirm: "Cancel this content schedule?",
    cancelSchedule: "Cancel schedule",
    calendarTitle: "Content calendar",
    close: "Close",
    contentType: "Content type",
    details: "Content details",
    draft: "Draft",
    emptyDay: "No content is planned, scheduled, or published on this day.",
    failed: "Needs attention",
    loading: "Loading the workspace calendar...",
    loadMore: "Load more",
    loadingMore: "Loading...",
    month: "Month",
    nextDay: "Next day",
    openDay: "Open day",
    openEditor: "Edit content",
    planned: "Planned",
    previousDay: "Previous day",
    published: "Published",
    ready: "Ready to schedule",
    refresh: "Refresh",
    reschedule: "Choose a new time",
    saveNewTime: "Save new time",
    schedule: "Schedule content",
    schedulePost: "Choose publishing time",
    scheduled: "Scheduled in MARKOS",
    scheduledThisWeek: "Scheduled this week",
    today: "Today",
    unscheduled: "Unscheduled",
    unscheduledDescription: "Drafts and Ready content that do not yet have a planned publication time.",
    unscheduledEmpty: "There is no unscheduled content in the current filter.",
    updated: "Updated",
    viewInsights: "View insights",
    week: "Week"
  };
}

function groupCalendarRecords(records: ContentRecord[]): Map<string, ContentRecord[]> {
  const grouped = new Map<string, ContentRecord[]>();

  for (const record of records) {
    const dateKey = calendarDateKey(record);
    if (!dateKey) continue;
    const existing = grouped.get(dateKey) ?? [];
    existing.push(record);
    grouped.set(dateKey, existing);
  }

  for (const [dateKey, items] of grouped) {
    grouped.set(
      dateKey,
      items.sort((left, right) => {
        const leftInstant = calendarPlacementInstant(left);
        const rightInstant = calendarPlacementInstant(right);
        if (!leftInstant || !rightInstant) return 0;
        return Date.parse(leftInstant) - Date.parse(rightInstant);
      })
    );
  }

  return grouped;
}

function matchesCalendarFilter(record: ContentRecord, filter: CalendarFilter): boolean {
  if (filter === "draft") return record.status === "DRAFT";
  if (filter === "scheduled") return record.status === "SCHEDULED";
  if (filter === "ready") return record.status === "APPROVED";
  if (filter === "published") return record.status === "PUBLISHED";
  if (filter === "failed") return record.status === "FAILED";
  return true;
}

function calendarFilterStatuses(filter: Exclude<CalendarFilter, null>): ContentStatus[] {
  if (filter === "draft") return ["DRAFT"];
  if (filter === "ready") return ["APPROVED"];
  if (filter === "scheduled") return ["SCHEDULED"];
  if (filter === "published") return ["PUBLISHED"];
  return ["FAILED"];
}

function mergeRecords(current: ContentRecord[], incoming: ContentRecord[]): ContentRecord[] {
  const records = new Map(current.map((record) => [record.id, record]));
  for (const record of incoming) records.set(record.id, record);
  return Array.from(records.values());
}

function mergeMediaAssets(current: MediaAssetRecord[], incoming: MediaAssetRecord[]): MediaAssetRecord[] {
  const assets = new Map(current.map((asset) => [asset.id, asset]));
  for (const asset of incoming) assets.set(asset.id, asset);
  return Array.from(assets.values());
}

function calendarPlacementInstant(record: ContentRecord): string | null {
  if (record.status === "PUBLISHED" && record.publishedAt) return record.publishedAt;
  if ((record.status === "SCHEDULED" || record.status === "FAILED") && record.scheduledAt) return record.scheduledAt;
  if ((record.status === "DRAFT" || record.status === "IN_REVIEW" || record.status === "APPROVED") && record.plannedAt) return record.plannedAt;
  return null;
}

function calendarDateKey(record: ContentRecord): string | null {
  const instant = calendarPlacementInstant(record);
  return instant ? bahrainDateKey(instant) : null;
}

function isScheduledInWeek(record: ContentRecord, dateKey: string): boolean {
  if (record.status !== "SCHEDULED" || !record.scheduledAt) return false;
  const weekStart = startOfWeek(dateKey);
  const recordDate = bahrainDateKey(record.scheduledAt);
  return recordDate >= weekStart && recordDate <= addDays(weekStart, 6);
}

function contentTitle(record: ContentRecord, locale: Locale): string {
  const caption = locale === "ar" ? (record.captionAr ?? record.captionEn) : (record.captionEn ?? record.captionAr);
  const title = (caption ?? record.contentPillar ?? "").split(/[.!?؟\n]/)[0]?.trim();
  if (!title) return contentTypeLabel(record, locale);
  const words = title.split(/\s+/).filter(Boolean);
  return words.length > 3 ? `${words.slice(0, 3).join(" ")}...` : title;
}

function contentTypeLabel(record: ContentRecord, locale: Locale): string {
  return contentTypeName(record.contentType, locale);
}

function contentTypeName(contentType: ContentType, locale: Locale): string {
  const labels =
    locale === "ar"
      ? { CAROUSEL: "منشور متعدد", POST: "منشور", REEL: "ريل", STORY: "قصة" }
      : { CAROUSEL: "Carousel", POST: "Post", REEL: "Reel", STORY: "Story" };
  return labels[contentType];
}

function statusLabel(status: ContentStatus, locale: Locale): string {
  const labels: Record<Locale, Record<ContentStatus, string>> = {
    ar: {
      APPROVED: "جاهز",
      DRAFT: "مسودة",
      FAILED: "يحتاج انتباهاً",
      IN_REVIEW: "يحتاج مراجعة",
      PUBLISHED: "منشور",
      SCHEDULED: "مجدول في MARKOS"
    },
    en: {
      APPROVED: "Ready",
      DRAFT: "Draft",
      FAILED: "Needs attention",
      IN_REVIEW: "Needs review",
      PUBLISHED: "Published",
      SCHEDULED: "Scheduled in MARKOS"
    }
  };

  return labels[locale][status];
}

function statusBadgeClass(status: ContentStatus): string {
  if (status === "SCHEDULED") return "bg-[var(--sunlit-aqua-soft)] text-[#157A70]";
  if (status === "APPROVED" || status === "PUBLISHED") return "bg-[#EEF8E9] text-[#44713A]";
  if (status === "FAILED") return "bg-[#FFF0F1] text-[#A43C49]";
  return "bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-ink-soft)]";
}

function statusDotClass(status: ContentStatus): string {
  if (status === "FAILED") return "bg-[#D94C61]";
  if (status === "SCHEDULED") return "bg-[var(--sunlit-aqua)]";
  if (status === "PUBLISHED") return "bg-[#71A867]";
  if (status === "APPROVED") return "bg-[var(--sunlit-yellow)]";
  if (status === "DRAFT") return "bg-[#9D9A96]";
  return "bg-[var(--sunlit-coral)]";
}

function monthStatusGroups(records: ContentRecord[]): Array<{ count: number; status: ContentStatus }> {
  const order: ContentStatus[] = ["DRAFT", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED", "IN_REVIEW"];
  const counts = new Map<ContentStatus, number>();
  for (const record of records) counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
  return order.flatMap((status) => {
    const count = counts.get(status);
    return count ? [{ count, status }] : [];
  });
}

function monthStatusDisplayPriority(status: ContentStatus): number {
  const priorities: Record<ContentStatus, number> = {
    FAILED: 0,
    SCHEDULED: 1,
    APPROVED: 2,
    IN_REVIEW: 3,
    DRAFT: 4,
    PUBLISHED: 5
  };
  return priorities[status];
}

function monthStatusMarkerClass(status: ContentStatus): string {
  if (status === "FAILED") return "bg-[#FFF0F1] text-[#A43C49]";
  if (status === "SCHEDULED") return "bg-[var(--sunlit-aqua-soft)] text-[#157A70]";
  if (status === "PUBLISHED") return "bg-[#EEF8E9] text-[#44713A]";
  if (status === "APPROVED") return "bg-[var(--sunlit-yellow-soft)] text-[#8A6510]";
  if (status === "DRAFT") return "bg-[#ECE9E5] text-[#66615C]";
  return "bg-[#F8ECEF] text-[#875864]";
}

function statusCardClass(status: ContentStatus): string {
  if (status === "FAILED") return "border-[#F0C3C9] bg-[#FFF5F6]";
  if (status === "SCHEDULED") return "border-[rgb(33_191_174_/_28%)] bg-[var(--sunlit-aqua-soft)]";
  if (status === "PUBLISHED") return "border-[#CFE2C9] bg-[#F5FAF2]";
  if (status === "APPROVED") return "border-[#EAD9A4] bg-[var(--sunlit-yellow-soft)]";
  if (status === "DRAFT") return "border-[#D8D4CF] bg-[#F3F1EE]";
  return "border-[#E3D7DA] bg-[#F8F3F4]";
}

function recordMomentLabel(record: ContentRecord, copy: CalendarCopy, locale: Locale): string {
  if (record.status === "PUBLISHED" && record.publishedAt) return `${copy.published} · ${formatCalendarTime(record.publishedAt, locale)}`;
  if (record.scheduledAt)
    return `${record.status === "SCHEDULED" ? copy.scheduled : statusLabel(record.status, locale)} · ${formatCalendarTime(record.scheduledAt, locale)}`;
  if (record.plannedAt) return `${copy.planned} · ${formatCalendarTime(record.plannedAt, locale)}`;
  return copy.unscheduled;
}

function formatItemCount(count: number, locale: Locale): string {
  if (locale === "ar") return count === 1 ? "عنصر واحد" : `${formatCompactCount(count, locale)} عناصر`;
  return `${count} ${count === 1 ? "item" : "items"}`;
}

function formatCompactCount(count: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-BH" : "en-BH", { maximumFractionDigits: 0 }).format(count);
}

function bahrainDateKey(value: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: BAHRAIN_TIME_ZONE,
    year: "numeric"
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatCalendarTime(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: BAHRAIN_TIME_ZONE
  }).format(new Date(value));
}

function formatCalendarDateTime(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: BAHRAIN_TIME_ZONE
  }).format(new Date(value));
}

function plainDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function addDays(dateKey: string, amount: number): string {
  const date = plainDate(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateKey: string, amount: number): string {
  const date = plainDate(`${dateKey.slice(0, 7)}-01`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

function startOfWeek(dateKey: string): string {
  return addDays(dateKey, -plainDate(dateKey).getUTCDay());
}

function calendarMonthGrid(monthStartKey: string): string[] {
  const gridStart = startOfWeek(monthStartKey);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function formatWeekday(dateKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", { timeZone: "UTC", weekday: "short" }).format(plainDate(dateKey));
}

function formatDayHeading(dateKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
    year: "numeric"
  }).format(plainDate(dateKey));
}

function formatCompactDate(dateKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(plainDate(dateKey));
}

function formatMonthLabel(monthStartKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", { month: "long", timeZone: "UTC", year: "numeric" }).format(plainDate(monthStartKey));
}

function formatWeekRange(dateKeys: string[], locale: Locale): string {
  const first = dateKeys[0];
  const last = dateKeys.at(-1);
  if (!first || !last) return "";
  const formatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${formatter.format(plainDate(first))} – ${formatter.format(plainDate(last))}`;
}

function defaultScheduleInput(scheduledAt?: string): string {
  if (scheduledAt) return bahrainInputValue(scheduledAt);
  return `${addDays(bahrainDateKey(new Date()), 1)}T18:00`;
}

function minimumScheduleInput(): string {
  const now = new Date(Date.now() + 5 * 60 * 1000);
  return bahrainInputValue(now.toISOString());
}

function bahrainInputValue(value: string): string {
  const dateKey = bahrainDateKey(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: BAHRAIN_TIME_ZONE
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${dateKey}T${part("hour")}:${part("minute")}`;
}

function bahrainInputToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Choose a valid future date and time.");
  const date = new Date(`${value}:00${BAHRAIN_UTC_OFFSET}`);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new Error("Choose a future date and time.");
  return date.toISOString();
}

function handleFocusDialogKeyDown(event: KeyboardEvent<HTMLElement>, layer: CalendarLayer, backToDay: () => void, closeDrillDown: () => void): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (layer === "record") backToDay();
    else closeDrillDown();
    return;
  }

  trapDialogTab(event);
}

function handleConfirmationKeyDown(event: KeyboardEvent<HTMLElement>, close: () => void): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }

  trapDialogTab(event);
}

function trapDialogTab(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;

  if (!focusable.includes(document.activeElement as HTMLElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const CALENDAR_HISTORY_DEPTH_KEY = "markosCalendarDepth";

function readCalendarUrlState(search: string, todayKey: string): CalendarUrlState {
  const parameters = new URLSearchParams(search);
  const view: CalendarView = parameters.get("view") === "month" ? "month" : "week";
  const filterValue = parameters.get("filter");
  const activeFilter: CalendarFilter =
    filterValue === "draft" || filterValue === "ready" || filterValue === "scheduled" || filterValue === "published" || filterValue === "failed"
      ? filterValue
      : null;
  const contentTypeValue = parameters.get("type");
  const contentTypeFilter: ContentType | null =
    contentTypeValue === "POST" || contentTypeValue === "CAROUSEL" || contentTypeValue === "STORY" || contentTypeValue === "REEL" ? contentTypeValue : null;
  const dayValue = parameters.get("day");
  const selectedDay = dayValue && isCalendarDateKey(dayValue) ? dayValue : null;
  const anchorValue = parameters.get("anchor");
  const anchorDateKey = anchorValue && isCalendarDateKey(anchorValue) ? anchorValue : (selectedDay ?? todayKey);
  const itemValue = parameters.get("item")?.trim() || null;
  const layer: CalendarLayer = selectedDay ? (itemValue ? "record" : "day") : "overview";

  return {
    activeFilter,
    anchorDateKey,
    contentTypeFilter,
    layer,
    selectedDateKey: selectedDay ?? anchorDateKey,
    selectedRecordId: layer === "record" ? itemValue : null,
    view
  };
}

function writeCalendarUrl(state: CalendarUrlState, method: "push" | "replace", depth: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set("view", state.view);
  url.searchParams.set("anchor", state.anchorDateKey);

  if (state.activeFilter) url.searchParams.set("filter", state.activeFilter);
  else url.searchParams.delete("filter");

  if (state.contentTypeFilter !== undefined) {
    if (state.contentTypeFilter) url.searchParams.set("type", state.contentTypeFilter);
    else url.searchParams.delete("type");
  }

  if (state.layer === "day" || state.layer === "record") url.searchParams.set("day", state.selectedDateKey);
  else url.searchParams.delete("day");

  if (state.layer === "record" && state.selectedRecordId) url.searchParams.set("item", state.selectedRecordId);
  else url.searchParams.delete("item");

  const currentHistoryState = window.history.state;
  const preservedHistoryState = currentHistoryState && typeof currentHistoryState === "object" ? (currentHistoryState as Record<string, unknown>) : {};
  const nextHistoryState = { ...preservedHistoryState, [CALENDAR_HISTORY_DEPTH_KEY]: Math.max(0, depth) };
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;

  if (method === "push") window.history.pushState(nextHistoryState, "", nextUrl);
  else window.history.replaceState(nextHistoryState, "", nextUrl);
}

function calendarHistoryDepth(): number {
  const historyState = window.history.state;
  if (!historyState || typeof historyState !== "object") return 0;
  const value = (historyState as Record<string, unknown>)[CALENDAR_HISTORY_DEPTH_KEY];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function isCalendarDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function calendarError(error: unknown, locale: Locale): string {
  const fallback = locale === "ar" ? "تعذر إكمال هذا الإجراء. حاول مرة أخرى." : "MARKOS could not complete that action. Try again.";
  if (!(error instanceof Error)) return fallback;
  if (locale === "ar" && error.message === "Choose a future date and time.") return "اختر تاريخاً ووقتاً في المستقبل.";
  return error.message || fallback;
}
