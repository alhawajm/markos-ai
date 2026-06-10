"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, RefreshCcw, RotateCcw } from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import type { AuthSession, ContentRecord, Locale } from "@markos/shared-types";

const sessionKey = "markos.session";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function SchedulePanel({ locale }: { locale: Locale }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [items, setItems] = useState<ContentRecord[]>([]);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const client = useMemo(() => {
    const options = {
      baseUrl: apiBaseUrl
    } satisfies { baseUrl: string; accessToken?: string; workspaceId?: string };

    return new MarkosApiClient(
      session
        ? {
            ...options,
            accessToken: session.tokens.accessToken,
            workspaceId: session.workspace.id
          }
        : options
    );
  }, [session]);

  useEffect(() => {
    const stored = window.localStorage.getItem(sessionKey);
    if (stored) {
      setSession(JSON.parse(stored) as AuthSession);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void refreshSchedule(client, setItems, setMessage);
  }, [client, session]);

  if (!session) {
    return (
      <section className="mt-8 rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 text-accent">
          <CalendarClock size={20} />
          <h2 className="text-base font-semibold text-navy">{copy(locale, "title")}</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">{copy(locale, "signInFirst")}</p>
      </section>
    );
  }

  const approved = items.filter((item) => item.status === "APPROVED");
  const scheduled = items
    .filter((item) => item.status === "SCHEDULED")
    .sort((left, right) => (left.scheduledAt ?? "").localeCompare(right.scheduledAt ?? ""));

  function updateItem(updated: ContentRecord) {
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function schedule(item: ContentRecord, localDateTime: string) {
    if (!localDateTime) {
      setMessage(copy(locale, "timeRequired"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const scheduledAt = new Date(localDateTime).toISOString();
      updateItem(await client.scheduleContent(item.id, scheduledAt));
      setMessage(copy(locale, "scheduled"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function unschedule(item: ContentRecord) {
    setIsBusy(true);
    setMessage("");

    try {
      updateItem(await client.unscheduleContent(item.id));
      setMessage(copy(locale, "unscheduled"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="mt-8 grid gap-4 xl:grid-cols-[320px_1fr]">
      <aside className="rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-navy">{copy(locale, "title")}</h2>
            <p className="mt-1 text-sm text-muted">{session.workspace.name}</p>
          </div>
          <button
            aria-label={copy(locale, "refresh")}
            className="rounded-button border border-border p-2 text-muted hover:text-navy"
            disabled={isBusy}
            onClick={() => refreshSchedule(client, setItems, setMessage)}
            type="button"
          >
            <RefreshCcw size={16} />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Metric label={copy(locale, "approved")} value={approved.length} />
          <Metric label={copy(locale, "scheduledCount")} value={scheduled.length} />
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">{copy(locale, "note")}</p>
        <p className="mt-3 min-h-5 text-sm text-muted">{message}</p>
      </aside>

      <div className="grid gap-4">
        <ScheduleGroup
          empty={copy(locale, "approvedEmpty")}
          isBusy={isBusy}
          items={approved}
          locale={locale}
          onSchedule={schedule}
          title={copy(locale, "ready")}
        />
        <ScheduledGroup
          empty={copy(locale, "scheduledEmpty")}
          isBusy={isBusy}
          items={scheduled}
          locale={locale}
          onUnschedule={unschedule}
          title={copy(locale, "scheduled")}
        />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border p-3">
      <p className="text-2xl font-semibold text-navy">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

function ScheduleGroup({
  empty,
  isBusy,
  items,
  locale,
  onSchedule,
  title
}: {
  empty: string;
  isBusy: boolean;
  items: ContentRecord[];
  locale: Locale;
  onSchedule: (item: ContentRecord, localDateTime: string) => Promise<void>;
  title: string;
}) {
  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-card">
      <h2 className="text-base font-semibold text-navy">{title}</h2>
      <div className="mt-4 grid gap-3">
        {items.length > 0 ? (
          items.map((item) => <ScheduleReadyItem isBusy={isBusy} item={item} key={item.id} locale={locale} onSchedule={onSchedule} />)
        ) : (
          <div className="rounded-card border border-dashed border-border p-4 text-sm text-muted">{empty}</div>
        )}
      </div>
    </section>
  );
}

function ScheduleReadyItem({
  isBusy,
  item,
  locale,
  onSchedule
}: {
  isBusy: boolean;
  item: ContentRecord;
  locale: Locale;
  onSchedule: (item: ContentRecord, localDateTime: string) => Promise<void>;
}) {
  const [scheduledAt, setScheduledAt] = useState(defaultLocalDateTime());

  return (
    <article className="rounded-card border border-border p-4">
      <ContentSummary item={item} locale={locale} />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className="rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          min={defaultLocalDateTime()}
          onChange={(event) => setScheduledAt(event.target.value)}
          type="datetime-local"
          value={scheduledAt}
        />
        <button
          className="inline-flex items-center justify-center gap-2 rounded-button bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={isBusy}
          onClick={() => onSchedule(item, scheduledAt)}
          type="button"
        >
          <CalendarClock size={16} />
          {copy(locale, "schedule")}
        </button>
      </div>
    </article>
  );
}

function ScheduledGroup({
  empty,
  isBusy,
  items,
  locale,
  onUnschedule,
  title
}: {
  empty: string;
  isBusy: boolean;
  items: ContentRecord[];
  locale: Locale;
  onUnschedule: (item: ContentRecord) => Promise<void>;
  title: string;
}) {
  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-card">
      <h2 className="text-base font-semibold text-navy">{title}</h2>
      <div className="mt-4 grid gap-3">
        {items.length > 0 ? (
          items.map((item) => (
            <article className="rounded-card border border-border p-4" key={item.id}>
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <ContentSummary item={item} locale={locale} />
                <div className="flex flex-col gap-2 sm:items-end">
                  <span className="text-sm font-medium text-navy">
                    {item.scheduledAt ? new Date(item.scheduledAt).toLocaleString(locale) : ""}
                  </span>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-button border border-border px-3 py-2 text-sm text-muted disabled:opacity-50"
                    disabled={isBusy}
                    onClick={() => onUnschedule(item)}
                    type="button"
                  >
                    <RotateCcw size={16} />
                    {copy(locale, "unschedule")}
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-card border border-dashed border-border p-4 text-sm text-muted">{empty}</div>
        )}
      </div>
    </section>
  );
}

function ContentSummary({ item, locale }: { item: ContentRecord; locale: Locale }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-button bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">{item.contentType}</span>
        <span className="rounded-button border border-border px-2 py-1 text-xs text-muted">{item.status}</span>
        {item.contentPillar ? <span className="text-xs text-muted">{item.contentPillar}</span> : null}
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-navy">{item.captionEn ?? item.captionAr ?? copy(locale, "untitled")}</p>
    </div>
  );
}

async function refreshSchedule(
  client: MarkosApiClient,
  setItems: (items: ContentRecord[]) => void,
  setMessage: (message: string) => void
) {
  try {
    setItems(await client.contentItems());
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Request failed");
  }
}

function defaultLocalDateTime(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function copy(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      approved: "Approved",
      approvedEmpty: "No approved content is ready to schedule.",
      failed: "Request failed",
      note: "Scheduling stores an internal publish time only. Instagram publishing will be added in a later milestone.",
      ready: "Ready to schedule",
      refresh: "Refresh",
      schedule: "Schedule",
      scheduled: "Scheduled",
      scheduledCount: "Scheduled",
      scheduledEmpty: "No content is scheduled yet.",
      signInFirst: "Sign in from the dashboard first, then approve content before scheduling it.",
      timeRequired: "Choose a schedule time first.",
      title: "Schedule",
      unschedule: "Unschedule",
      unscheduled: "Returned to approved",
      untitled: "Untitled content"
    },
    en: {
      approved: "Approved",
      approvedEmpty: "No approved content is ready to schedule.",
      failed: "Request failed",
      note: "Scheduling stores an internal publish time only. Instagram publishing will be added in a later milestone.",
      ready: "Ready to schedule",
      refresh: "Refresh",
      schedule: "Schedule",
      scheduled: "Scheduled",
      scheduledCount: "Scheduled",
      scheduledEmpty: "No content is scheduled yet.",
      signInFirst: "Sign in from the dashboard first, then approve content before scheduling it.",
      timeRequired: "Choose a schedule time first.",
      title: "Schedule",
      unschedule: "Unschedule",
      unscheduled: "Returned to approved",
      untitled: "Untitled content"
    }
  };

  return dictionary[locale][key] ?? key;
}
