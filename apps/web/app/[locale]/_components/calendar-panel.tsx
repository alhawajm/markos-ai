"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
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
import type { ContentRecord, ContentStatus, Locale, MediaAssetRecord } from "@markos/shared-types";
import { useMarkosClient, useMarkosSession } from "./browser-session";

const BAHRAIN_TIME_ZONE = "Asia/Bahrain";
const BAHRAIN_UTC_OFFSET = "+03:00";

type CalendarView = "month" | "week";

interface CalendarCopy {
  addContent: string;
  allTimes: string;
  automaticNote: string;
  cancel: string;
  cancelConfirm: string;
  cancelSchedule: string;
  calendarEyebrow: string;
  calendarSubtitle: string;
  calendarTitle: string;
  close: string;
  contentLibrary: string;
  details: string;
  emptyDay: string;
  failed: string;
  loading: string;
  month: string;
  nextUp: string;
  noContent: string;
  noNextAction: string;
  openEditor: string;
  published: string;
  ready: string;
  refresh: string;
  reschedule: string;
  saveNewTime: string;
  schedule: string;
  schedulePost: string;
  scheduled: string;
  scheduledThisWeek: string;
  selectContent: string;
  selectedDay: string;
  subtitle: string;
  today: string;
  unscheduled: string;
  unscheduledEmpty: string;
  viewInsights: string;
  week: string;
}

export function CalendarPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const copy = calendarCopy(locale);
  const todayKey = bahrainDateKey(new Date());
  const [view, setView] = useState<CalendarView>("week");
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
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    setMessage("");

    try {
      const [nextRecords, nextAssets] = await Promise.all([client.contentItems(), client.mediaAssets()]);
      setRecords(nextRecords);
      setMediaAssets(nextAssets);
      setSelectedRecordId((current) =>
        current && nextRecords.some((record) => record.id === current) ? current : (nextCalendarAction(nextRecords)?.id ?? nextRecords[0]?.id ?? null)
      );
    } catch (error) {
      setMessage(calendarError(error, locale));
    } finally {
      setLoading(false);
    }
  }, [client, locale, session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null;

  useEffect(() => {
    setScheduleValue(defaultScheduleInput(selectedRecord?.scheduledAt));
    setShowCancelConfirmation(false);
  }, [selectedRecord?.id, selectedRecord?.scheduledAt]);

  const mediaById = useMemo(() => new Map(mediaAssets.map((asset) => [asset.id, asset])), [mediaAssets]);
  const weekStartKey = startOfWeek(anchorDateKey);
  const weekDateKeys = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStartKey, index)), [weekStartKey]);
  const monthStartKey = `${anchorDateKey.slice(0, 7)}-01`;
  const monthDateKeys = useMemo(() => calendarMonthGrid(monthStartKey), [monthStartKey]);
  const recordsByDate = useMemo(() => groupCalendarRecords(records), [records]);
  const selectedDayRecords = recordsByDate.get(selectedDateKey) ?? [];
  const unscheduledRecords = useMemo(
    () =>
      records
        .filter((record) => !record.scheduledAt && !record.publishedAt && ["APPROVED", "DRAFT", "IN_REVIEW"].includes(record.status))
        .sort((left, right) => contentPriority(left) - contentPriority(right) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [records]
  );
  const nextAction = useMemo(() => nextCalendarAction(records), [records]);
  const scheduledThisWeek = weekDateKeys.reduce(
    (total, dateKey) => total + (recordsByDate.get(dateKey) ?? []).filter((record) => record.status === "SCHEDULED").length,
    0
  );
  const readyCount = records.filter((record) => record.status === "APPROVED").length;
  const failedCount = records.filter((record) => record.status === "FAILED").length;

  function chooseRecord(record: ContentRecord) {
    setSelectedRecordId(record.id);
    const recordDate = calendarDateKey(record);
    if (recordDate) {
      setSelectedDateKey(recordDate);
      setAnchorDateKey(recordDate);
    }
  }

  function upsertRecord(record: ContentRecord) {
    setRecords((current) => {
      const index = current.findIndex((item) => item.id === record.id);
      if (index === -1) return [record, ...current];
      const next = [...current];
      next[index] = record;
      return next;
    });
    setSelectedRecordId(record.id);
  }

  async function saveSchedule() {
    if (!selectedRecord || !["APPROVED", "FAILED", "SCHEDULED"].includes(selectedRecord.status)) return;

    setSaving(true);
    setMessage("");

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
      }
      setMessage(
        locale === "ar"
          ? `تم حفظ الموعد في MARKOS: ${formatCalendarDateTime(updated.scheduledAt ?? scheduledAt, locale)}.`
          : `Saved in MARKOS for ${formatCalendarDateTime(updated.scheduledAt ?? scheduledAt, locale)}.`
      );
    } catch (error) {
      setMessage(calendarError(error, locale));
    } finally {
      setSaving(false);
    }
  }

  async function cancelSchedule() {
    if (!selectedRecord || selectedRecord.status !== "SCHEDULED") return;

    setCancelling(true);
    setMessage("");

    try {
      const updated = await client.unscheduleContent(selectedRecord.id);
      upsertRecord(updated);
      setShowCancelConfirmation(false);
      setMessage(locale === "ar" ? "أُلغي الموعد وعاد المحتوى إلى قائمة الجاهز." : "Schedule cancelled. The content is back in the Ready queue.");
    } catch (error) {
      setMessage(calendarError(error, locale));
    } finally {
      setCancelling(false);
    }
  }

  function navigate(direction: -1 | 1) {
    const next = view === "week" ? addDays(anchorDateKey, direction * 7) : addMonths(anchorDateKey, direction);
    setAnchorDateKey(next);
    setSelectedDateKey(next);
  }

  function resetToToday() {
    const currentToday = bahrainDateKey(new Date());
    setAnchorDateKey(currentToday);
    setSelectedDateKey(currentToday);
  }

  return (
    <section className="space-y-6 xl:space-y-7">
      <section className="sunlit-panel overflow-hidden rounded-[1.75rem] p-5 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,.52fr)] xl:items-end">
          <div className="max-w-4xl">
            <p className="sunlit-eyebrow">{copy.calendarEyebrow}</p>
            <h1 className="mt-3 font-display text-3xl font-black tracking-[-.04em] text-[var(--sunlit-ink)] sm:text-4xl">{copy.calendarTitle}</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--sunlit-muted)]">{copy.calendarSubtitle}</p>
          </div>
          <div className="flex flex-wrap gap-3 xl:justify-end">
            <button
              className="sunlit-secondary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-extrabold"
              onClick={() => void refresh()}
              type="button"
            >
              <RefreshCw className={loading ? "animate-spin" : ""} size={17} /> {copy.refresh}
            </button>
            <Link
              className="sunlit-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold"
              href={`/${locale}/app/content-studio`}
            >
              <Plus size={18} /> {copy.addContent}
            </Link>
          </div>
        </div>
      </section>

      {message ? (
        <div aria-live="polite" className="sunlit-panel-soft rounded-2xl px-5 py-4 text-sm font-bold leading-6 text-[var(--sunlit-ink-soft)]">
          {message}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <CalendarMetric icon={CalendarDays} label={copy.scheduledThisWeek} tone="aqua" value={scheduledThisWeek} />
        <CalendarMetric icon={CheckCircle2} label={copy.ready} tone="yellow" value={readyCount} />
        <CalendarMetric icon={AlertCircle} label={copy.failed} tone="coral" value={failedCount} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,.65fr)] xl:items-start">
        <div className="min-w-0 space-y-5">
          {nextAction ? (
            <article className="sunlit-panel-soft rounded-[1.5rem] p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="sunlit-eyebrow">{copy.nextUp}</p>
                  <p className="mt-2 truncate text-lg font-black text-[var(--sunlit-ink)]">{contentTitle(nextAction, locale)}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--sunlit-muted)]">
                    {statusLabel(nextAction.status, locale)}
                    {calendarInstant(nextAction) ? ` · ${formatCalendarDateTime(calendarInstant(nextAction) ?? "", locale)}` : ""}
                  </p>
                </div>
                <button
                  className="sunlit-secondary inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold"
                  onClick={() => chooseRecord(nextAction)}
                  type="button"
                >
                  <Eye size={17} /> {copy.details}
                </button>
              </div>
            </article>
          ) : (
            <article className="sunlit-panel-soft rounded-[1.5rem] p-6 text-sm font-bold text-[var(--sunlit-muted)]">{copy.noNextAction}</article>
          )}

          <section className="sunlit-panel rounded-[1.75rem] p-4 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="sunlit-eyebrow">{copy.contentLibrary}</p>
                <h2 className="mt-2 text-xl font-black text-[var(--sunlit-ink)]">
                  {view === "week" ? formatWeekRange(weekDateKeys, locale) : formatMonthLabel(monthStartKey, locale)}
                </h2>
              </div>
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
                    onClick={() => setView("week")}
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
                    onClick={() => setView("month")}
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
                    onChooseDate={() => setSelectedDateKey(dateKey)}
                    onChooseRecord={chooseRecord}
                    records={recordsByDate.get(dateKey) ?? []}
                    selectedDateKey={selectedDateKey}
                    selectedRecordId={selectedRecordId}
                    todayKey={todayKey}
                  />
                ))}
              </div>
            ) : (
              <MonthOverview
                anchorMonthKey={monthStartKey}
                dateKeys={monthDateKeys}
                locale={locale}
                onChooseDate={(dateKey) => {
                  setSelectedDateKey(dateKey);
                  const firstRecord = recordsByDate.get(dateKey)?.[0];
                  if (firstRecord) setSelectedRecordId(firstRecord.id);
                }}
                recordsByDate={recordsByDate}
                selectedDateKey={selectedDateKey}
                todayKey={todayKey}
              />
            )}

            <div className="mt-5 rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--sunlit-muted)]">{copy.selectedDay}</p>
                  <p className="mt-1 font-black text-[var(--sunlit-ink)]">{formatDayHeading(selectedDateKey, locale)}</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[var(--sunlit-ink-soft)]">{selectedDayRecords.length}</span>
              </div>
              {selectedDayRecords.length > 0 ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {selectedDayRecords.map((record) => (
                    <CalendarRecordButton
                      key={record.id}
                      locale={locale}
                      onClick={() => chooseRecord(record)}
                      record={record}
                      selected={selectedRecordId === record.id}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm font-semibold text-[var(--sunlit-muted)]">{copy.emptyDay}</p>
              )}
            </div>
          </section>

          <section className="sunlit-panel rounded-[1.75rem] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="sunlit-eyebrow">{copy.unscheduled}</p>
                <h2 className="mt-2 text-xl font-black text-[var(--sunlit-ink)]">{copy.subtitle}</h2>
              </div>
              <span className="rounded-full bg-[var(--sunlit-paper-deep)] px-3 py-1 text-sm font-extrabold text-[var(--sunlit-ink-soft)]">
                {unscheduledRecords.length}
              </span>
            </div>
            {unscheduledRecords.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {unscheduledRecords.map((record) => (
                  <CalendarRecordButton
                    key={record.id}
                    locale={locale}
                    onClick={() => chooseRecord(record)}
                    record={record}
                    selected={selectedRecordId === record.id}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-[var(--sunlit-line-strong)] bg-[var(--sunlit-paper)] p-6 text-center text-sm font-bold text-[var(--sunlit-muted)]">
                {copy.unscheduledEmpty}
              </div>
            )}
          </section>
        </div>

        <aside className="sunlit-panel min-w-0 rounded-[1.75rem] p-5 sm:p-6 xl:sticky xl:top-28">
          {selectedRecord ? (
            <CalendarDetails
              copy={copy}
              locale={locale}
              media={selectedRecord.mediaIds.map((id) => mediaById.get(id)).find((asset): asset is MediaAssetRecord => asset !== undefined) ?? null}
              onCancelRequest={() => setShowCancelConfirmation(true)}
              onSaveSchedule={() => void saveSchedule()}
              record={selectedRecord}
              saving={saving}
              scheduleValue={scheduleValue}
              setScheduleValue={setScheduleValue}
            />
          ) : (
            <div className="grid min-h-80 place-items-center text-center">
              <div className="max-w-xs">
                <CalendarDays className="mx-auto text-[var(--sunlit-aqua)]" size={38} />
                <p className="mt-4 font-black text-[var(--sunlit-ink)]">{copy.selectContent}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--sunlit-muted)]">{copy.noContent}</p>
              </div>
            </div>
          )}
        </aside>
      </section>

      <p className="rounded-2xl border border-[var(--sunlit-line)] bg-white/70 px-5 py-4 text-sm font-semibold leading-6 text-[var(--sunlit-muted)]">
        <Clock3 className="me-2 inline text-[var(--sunlit-aqua-dark)]" size={16} />
        {copy.allTimes} {copy.automaticNote}
      </p>

      {showCancelConfirmation && selectedRecord?.status === "SCHEDULED" ? (
        <div
          aria-labelledby="calendar-cancel-title"
          aria-modal="true"
          className="fixed inset-0 z-[80] grid place-items-center bg-[rgb(32_33_43_/_52%)] p-5 backdrop-blur-sm"
          role="dialog"
        >
          <section className="sunlit-panel w-full max-w-md rounded-[1.75rem] p-6 shadow-2xl sm:p-7">
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
                onClick={() => setShowCancelConfirmation(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--sunlit-muted)]">{contentTitle(selectedRecord, locale)}</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="sunlit-secondary min-h-11 rounded-xl px-5 text-sm font-extrabold"
                onClick={() => setShowCancelConfirmation(false)}
                type="button"
              >
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
    </section>
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

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="sunlit-eyebrow">{copy.details}</p>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${statusBadgeClass(record.status)}`}>{statusLabel(record.status, locale)}</span>
      </div>

      {media ? (
        <div className="mt-5 aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)]">
          {/* Workspace media can be an API proxy URL or a short-lived provider URL, so it intentionally bypasses Next image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={media.filename} className="h-full w-full object-cover" src={media.publicUrl} />
        </div>
      ) : (
        <div className="mt-5 grid aspect-[4/3] place-items-center rounded-2xl border border-dashed border-[var(--sunlit-line-strong)] bg-[var(--sunlit-paper)] text-[var(--sunlit-muted)]">
          <div className="text-center">
            <ImageIcon className="mx-auto" size={28} />
            <p className="mt-2 text-xs font-bold">{locale === "ar" ? "لا توجد وسائط مرفقة" : "No media attached"}</p>
          </div>
        </div>
      )}

      <h2 className="mt-5 text-xl font-black leading-7 text-[var(--sunlit-ink)]">{contentTitle(record, locale)}</h2>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[var(--sunlit-muted)]">
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

      <div className="mt-5 grid gap-3">
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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E49AAA] bg-white px-4 text-sm font-extrabold text-[#A43C49]"
            onClick={onCancelRequest}
            type="button"
          >
            <X size={16} /> {copy.cancelSchedule}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CalendarDayColumn({
  dateKey,
  locale,
  onChooseDate,
  onChooseRecord,
  records,
  selectedDateKey,
  selectedRecordId,
  todayKey
}: {
  dateKey: string;
  locale: Locale;
  onChooseDate: () => void;
  onChooseRecord: (record: ContentRecord) => void;
  records: ContentRecord[];
  selectedDateKey: string;
  selectedRecordId: string | null;
  todayKey: string;
}) {
  const isSelected = dateKey === selectedDateKey;
  const isToday = dateKey === todayKey;

  return (
    <article
      className={
        isSelected
          ? "min-w-0 rounded-2xl border border-[rgb(33_191_174_/_35%)] bg-[var(--sunlit-aqua-soft)] p-3"
          : "min-w-0 rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-3"
      }
    >
      <button className="flex w-full items-center justify-between gap-2 text-start md:block" onClick={onChooseDate} type="button">
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
          records.map((record) => (
            <CalendarRecordButton
              compact
              key={record.id}
              locale={locale}
              onClick={() => onChooseRecord(record)}
              record={record}
              selected={selectedRecordId === record.id}
            />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--sunlit-line)] bg-white/70 px-2 py-3 text-center text-[10px] font-bold text-[var(--sunlit-muted)]">
            —
          </p>
        )}
      </div>
    </article>
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
  onChooseDate: (dateKey: string) => void;
  recordsByDate: Map<string, ContentRecord[]>;
  selectedDateKey: string;
  todayKey: string;
}) {
  const weekdayKeys = Array.from({ length: 7 }, (_, index) => addDays("2026-08-16", index));

  return (
    <div className="mt-6">
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
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

          return (
            <button
              aria-label={`${formatDayHeading(dateKey, locale)} · ${dayRecords.length}`}
              className={
                selected
                  ? "min-h-16 rounded-xl border border-[rgb(33_191_174_/_40%)] bg-[var(--sunlit-aqua-soft)] p-2 text-start sm:min-h-20"
                  : "min-h-16 rounded-xl border border-[var(--sunlit-line)] bg-white p-2 text-start hover:border-[var(--sunlit-line-strong)] sm:min-h-20"
              }
              key={dateKey}
              onClick={() => onChooseDate(dateKey)}
              type="button"
            >
              <span
                className={
                  today
                    ? "grid h-6 w-6 place-items-center rounded-full bg-[var(--sunlit-coral)] text-[11px] font-black text-white"
                    : currentMonth
                      ? "text-xs font-black text-[var(--sunlit-ink)]"
                      : "text-xs font-bold text-[var(--sunlit-muted)] opacity-45"
                }
              >
                {Number(dateKey.slice(-2))}
              </span>
              {dayRecords.length > 0 ? (
                <span className="mt-2 flex flex-wrap gap-1">
                  {dayRecords.slice(0, 4).map((record) => (
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${statusDotClass(record.status)}`} key={record.id} />
                  ))}
                  {dayRecords.length > 4 ? <span className="text-[9px] font-black text-[var(--sunlit-muted)]">+{dayRecords.length - 4}</span> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarRecordButton({
  compact = false,
  locale,
  onClick,
  record,
  selected
}: {
  compact?: boolean;
  locale: Locale;
  onClick: () => void;
  record: ContentRecord;
  selected: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={
        selected
          ? "min-w-0 rounded-xl border border-[rgb(33_191_174_/_35%)] bg-white px-3 py-2.5 text-start shadow-sm"
          : "min-w-0 rounded-xl border border-[var(--sunlit-line)] bg-white/85 px-3 py-2.5 text-start transition hover:border-[var(--sunlit-line-strong)]"
      }
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(record.status)}`} />
        <span className={`min-w-0 flex-1 truncate font-extrabold text-[var(--sunlit-ink)] ${compact ? "text-[11px]" : "text-sm"}`}>
          {contentTitle(record, locale)}
        </span>
      </span>
      <span className={`mt-1.5 flex items-center justify-between gap-2 font-bold text-[var(--sunlit-muted)] ${compact ? "text-[9px]" : "text-xs"}`}>
        <span className="truncate">{statusLabel(record.status, locale)}</span>
        {calendarInstant(record) ? <span className="shrink-0">{formatCalendarTime(calendarInstant(record) ?? "", locale)}</span> : null}
      </span>
    </button>
  );
}

function CalendarMetric({ icon: Icon, label, tone, value }: { icon: typeof CalendarDays; label: string; tone: "aqua" | "coral" | "yellow"; value: number }) {
  const styles = {
    aqua: "bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]",
    coral: "bg-[#FFF0F1] text-[#A43C49]",
    yellow: "bg-[var(--sunlit-yellow-soft)] text-[#8A6510]"
  }[tone];

  return (
    <article className="sunlit-panel flex items-center gap-4 rounded-2xl p-5">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${styles}`}>
        <Icon size={20} />
      </span>
      <div>
        <p className="text-2xl font-black text-[var(--sunlit-ink)]">{value}</p>
        <p className="text-xs font-bold text-[var(--sunlit-muted)]">{label}</p>
      </div>
    </article>
  );
}

function calendarCopy(locale: Locale): CalendarCopy {
  if (locale === "ar") {
    return {
      addContent: "إنشاء محتوى",
      allTimes: "جميع المواعيد بتوقيت البحرين.",
      automaticNote: "يعرض التقويم حالات MARKOS المحفوظة؛ النشر التلقائي على إنستغرام يعتمد على جاهزية العامل والموفر.",
      cancel: "رجوع",
      cancelConfirm: "هل تريد إلغاء موعد هذا المحتوى؟",
      cancelSchedule: "إلغاء الموعد",
      calendarEyebrow: "تقويم المحتوى",
      calendarSubtitle: "راجع ما سيُنشر قريباً، عالج ما يحتاج انتباهاً، وانقل المحتوى الجاهز إلى موعد واضح دون فقدان خطوة الموافقة.",
      calendarTitle: "خطّط للأسبوع واعرف الخطوة التالية.",
      close: "إغلاق",
      contentLibrary: "جدول مساحة العمل",
      details: "التفاصيل",
      emptyDay: "لا يوجد محتوى محفوظ في هذا اليوم.",
      failed: "يحتاج انتباهاً",
      loading: "جارٍ تحميل تقويم مساحة العمل...",
      month: "الشهر",
      nextUp: "التالي",
      noContent: "اختر محتوى من التقويم أو من قائمة غير المجدول.",
      noNextAction: "لا توجد خطوة محتوى عاجلة. يمكنك إنشاء مسودة جديدة عندما تكون جاهزاً.",
      openEditor: "فتح في إنشاء المحتوى",
      published: "منشور",
      ready: "جاهز للجدولة",
      refresh: "تحديث",
      reschedule: "اختيار موعد جديد",
      saveNewTime: "حفظ الموعد الجديد",
      schedule: "جدولة المحتوى",
      schedulePost: "اختيار موعد النشر",
      scheduled: "مجدول في MARKOS",
      scheduledThisWeek: "مجدول هذا الأسبوع",
      selectContent: "اختر محتوى",
      selectedDay: "اليوم المحدد",
      subtitle: "المحتوى الذي ما زال يحتاج موعداً",
      today: "اليوم",
      unscheduled: "غير مجدول",
      unscheduledEmpty: "لا توجد مسودات أو منشورات جاهزة تنتظر موعداً.",
      viewInsights: "عرض الإحصاءات",
      week: "الأسبوع"
    };
  }

  return {
    addContent: "Create content",
    allTimes: "All times are shown in Bahrain time.",
    automaticNote: "The calendar reflects saved MARKOS states; automatic Instagram publishing still depends on worker and provider readiness.",
    cancel: "Go back",
    cancelConfirm: "Cancel this content schedule?",
    cancelSchedule: "Cancel schedule",
    calendarEyebrow: "Content calendar",
    calendarSubtitle: "See what is coming, resolve what needs attention, and give ready content a clear time without skipping approval.",
    calendarTitle: "Plan the week. Know what happens next.",
    close: "Close",
    contentLibrary: "Workspace schedule",
    details: "Details",
    emptyDay: "There is no saved content on this day.",
    failed: "Needs attention",
    loading: "Loading the workspace calendar...",
    month: "Month",
    nextUp: "Next up",
    noContent: "Choose an item from the calendar or the unscheduled queue.",
    noNextAction: "There is no urgent content action. Create a new draft whenever you are ready.",
    openEditor: "Open in Create",
    published: "Published",
    ready: "Ready to schedule",
    refresh: "Refresh",
    reschedule: "Choose a new time",
    saveNewTime: "Save new time",
    schedule: "Schedule content",
    schedulePost: "Choose publishing time",
    scheduled: "Scheduled in MARKOS",
    scheduledThisWeek: "Scheduled this week",
    selectContent: "Select content",
    selectedDay: "Selected day",
    subtitle: "Content that still needs a time",
    today: "Today",
    unscheduled: "Unscheduled",
    unscheduledEmpty: "No drafts or ready posts are waiting for a time.",
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
      items.sort((left, right) => Date.parse(calendarInstant(left) ?? left.updatedAt) - Date.parse(calendarInstant(right) ?? right.updatedAt))
    );
  }

  return grouped;
}

function nextCalendarAction(records: ContentRecord[]): ContentRecord | undefined {
  const failed = records.filter((record) => record.status === "FAILED").sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  if (failed) return failed;

  const now = Date.now();
  const nextScheduled = records
    .filter((record) => record.status === "SCHEDULED" && record.scheduledAt && Date.parse(record.scheduledAt) >= now)
    .sort((left, right) => Date.parse(left.scheduledAt ?? left.updatedAt) - Date.parse(right.scheduledAt ?? right.updatedAt))[0];
  if (nextScheduled) return nextScheduled;

  return records
    .filter((record) => ["APPROVED", "DRAFT", "IN_REVIEW"].includes(record.status))
    .sort((left, right) => contentPriority(left) - contentPriority(right) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}

function contentPriority(record: ContentRecord): number {
  if (record.status === "APPROVED") return 0;
  if (record.status === "IN_REVIEW") return 1;
  if (record.status === "DRAFT") return 2;
  return 3;
}

function calendarInstant(record: ContentRecord): string | undefined {
  return record.publishedAt ?? record.scheduledAt;
}

function calendarDateKey(record: ContentRecord): string | undefined {
  const value = calendarInstant(record);
  return value ? bahrainDateKey(value) : undefined;
}

function contentTitle(record: ContentRecord, locale: Locale): string {
  const caption = locale === "ar" ? (record.captionAr ?? record.captionEn) : (record.captionEn ?? record.captionAr);
  const title = (caption ?? record.contentPillar ?? "").split(/[.!?؟\n]/)[0]?.trim();
  if (!title) return contentTypeLabel(record, locale);
  return title.length > 72 ? `${title.slice(0, 69)}...` : title;
}

function contentTypeLabel(record: ContentRecord, locale: Locale): string {
  const labels =
    locale === "ar"
      ? { CAROUSEL: "منشور متعدد", POST: "منشور", REEL: "ريل", STORY: "قصة" }
      : { CAROUSEL: "Carousel", POST: "Post", REEL: "Reel", STORY: "Story" };
  return labels[record.contentType];
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
  return "bg-[var(--sunlit-coral)]";
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

function calendarError(error: unknown, locale: Locale): string {
  const fallback = locale === "ar" ? "تعذر إكمال هذا الإجراء. حاول مرة أخرى." : "MARKOS could not complete that action. Try again.";
  if (!(error instanceof Error)) return fallback;
  if (locale === "ar" && error.message === "Choose a future date and time.") return "اختر تاريخاً ووقتاً في المستقبل.";
  return error.message || fallback;
}
