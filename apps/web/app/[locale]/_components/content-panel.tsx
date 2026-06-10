"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, RefreshCcw, RotateCcw, Save, Send, Sparkles } from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import type { AuthSession, ContentRecord, ContentType, Locale } from "@markos/shared-types";

const sessionKey = "markos.session";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const contentTypes: ContentType[] = ["POST", "CAROUSEL", "STORY", "REEL"];

export function ContentPanel({ locale }: { locale: Locale }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [items, setItems] = useState<ContentRecord[]>([]);
  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState<ContentType>("POST");
  const [count, setCount] = useState(3);
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
    void refreshContent(client, setItems, setMessage);
  }, [client, session]);

  async function generate() {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      setMessage(copy(locale, "topicRequired"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const created = await client.generateContent({
        topic: trimmedTopic,
        contentType,
        count
      });
      setItems((current) => [...created, ...current.filter((item) => !created.some((draft) => draft.id === item.id))]);
      setMessage(copy(locale, "generated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  if (!session) {
    return (
      <section className="mt-8 rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 text-accent">
          <FileText size={20} />
          <h2 className="text-base font-semibold text-navy">{copy(locale, "title")}</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">{copy(locale, "signInFirst")}</p>
      </section>
    );
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
            onClick={() => refreshContent(client, setItems, setMessage)}
            type="button"
          >
            <RefreshCcw size={16} />
          </button>
        </div>

        <label className="mt-5 block">
          <span className="text-xs font-medium text-muted">{copy(locale, "topic")}</span>
          <textarea
            className="mt-1 min-h-24 w-full resize-y rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            onChange={(event) => setTopic(event.target.value)}
            placeholder={copy(locale, "topicPlaceholder")}
            value={topic}
          />
        </label>

        <label className="mt-3 block">
          <span className="text-xs font-medium text-muted">{copy(locale, "type")}</span>
          <select
            className="mt-1 w-full rounded-input border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
            onChange={(event) => setContentType(event.target.value as ContentType)}
            value={contentType}
          >
            {contentTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="text-xs font-medium text-muted">{copy(locale, "count")}</span>
          <input
            className="mt-1 w-full rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            max={5}
            min={1}
            onChange={(event) => setCount(Number(event.target.value))}
            type="number"
            value={count}
          />
        </label>

        <button
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-button bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={isBusy}
          onClick={generate}
          type="button"
        >
          <Sparkles size={16} />
          {copy(locale, "generate")}
        </button>
        <p className="mt-3 min-h-5 text-sm text-muted">{message}</p>
      </aside>

      <div className="grid gap-4">
        {items.length > 0 ? (
          items.map((item) => (
            <ContentDraftCard
              client={client}
              item={item}
              key={item.id}
              locale={locale}
              onChange={(updated) => setItems((current) => current.map((draft) => (draft.id === updated.id ? updated : draft)))}
              setMessage={setMessage}
            />
          ))
        ) : (
          <div className="rounded-card border border-dashed border-border bg-card p-6 text-sm text-muted">
            {copy(locale, "empty")}
          </div>
        )}
      </div>
    </section>
  );
}

function ContentDraftCard({
  client,
  item,
  locale,
  onChange,
  setMessage
}: {
  client: MarkosApiClient;
  item: ContentRecord;
  locale: Locale;
  onChange: (item: ContentRecord) => void;
  setMessage: (message: string) => void;
}) {
  const [captionEn, setCaptionEn] = useState(item.captionEn ?? "");
  const [captionAr, setCaptionAr] = useState(item.captionAr ?? "");
  const [hashtags, setHashtags] = useState(item.hashtags.join(", "));
  const [callToAction, setCallToAction] = useState(item.callToAction ?? "");
  const [contentPillar, setContentPillar] = useState(item.contentPillar ?? "");
  const [isBusy, setIsBusy] = useState(false);
  const canEdit = item.status === "DRAFT" || item.status === "IN_REVIEW";

  useEffect(() => {
    setCaptionEn(item.captionEn ?? "");
    setCaptionAr(item.captionAr ?? "");
    setHashtags(item.hashtags.join(", "));
    setCallToAction(item.callToAction ?? "");
    setContentPillar(item.contentPillar ?? "");
  }, [item]);

  async function save() {
    setIsBusy(true);
    setMessage("");

    try {
      const updated = await client.updateContent(item.id, {
        captionEn: captionEn.trim() || null,
        captionAr: captionAr.trim() || null,
        hashtags: parseHashtags(hashtags),
        callToAction: callToAction.trim() || null,
        contentPillar: contentPillar.trim() || null
      });
      onChange(updated);
      setMessage(copy(locale, "saved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function move(status: "APPROVED" | "DRAFT" | "IN_REVIEW") {
    setIsBusy(true);
    setMessage("");

    try {
      const updated = await client.updateContentStatus(item.id, status);
      onChange(updated);
      setMessage(copy(locale, "statusUpdated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <article className="rounded-card border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-button bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">{item.contentType}</span>
          <span className="rounded-button border border-border px-2 py-1 text-xs text-muted">{item.status}</span>
          {contentPillar ? <span className="text-xs text-muted">{contentPillar}</span> : null}
        </div>
        <span className="text-xs text-muted">{new Date(item.createdAt).toLocaleDateString(locale)}</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-normal text-muted">{copy(locale, "captionEn")}</span>
          <textarea
            className="mt-1 min-h-32 w-full resize-y rounded-input border border-border px-3 py-2 text-sm leading-6 outline-none focus:border-accent disabled:bg-canvas"
            disabled={!canEdit || isBusy}
            onChange={(event) => setCaptionEn(event.target.value)}
            value={captionEn}
          />
        </label>
        <label className="block" dir="rtl">
          <span className="text-xs font-semibold uppercase tracking-normal text-muted">{copy(locale, "captionAr")}</span>
          <textarea
            className="mt-1 min-h-32 w-full resize-y rounded-input border border-border px-3 py-2 text-sm leading-6 outline-none focus:border-accent disabled:bg-canvas"
            disabled={!canEdit || isBusy}
            onChange={(event) => setCaptionAr(event.target.value)}
            value={captionAr}
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-muted">{copy(locale, "hashtags")}</span>
          <input
            className="mt-1 w-full rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent disabled:bg-canvas"
            disabled={!canEdit || isBusy}
            onChange={(event) => setHashtags(event.target.value)}
            value={hashtags}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted">{copy(locale, "pillar")}</span>
          <input
            className="mt-1 w-full rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent disabled:bg-canvas"
            disabled={!canEdit || isBusy}
            onChange={(event) => setContentPillar(event.target.value)}
            value={contentPillar}
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-medium text-muted">{copy(locale, "cta")}</span>
        <input
          className="mt-1 w-full rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent disabled:bg-canvas"
          disabled={!canEdit || isBusy}
          onChange={(event) => setCallToAction(event.target.value)}
          value={callToAction}
        />
      </label>

      {item.carousel || item.reelScript ? (
        <pre className="mt-4 max-h-72 overflow-auto rounded-input bg-canvas p-3 text-xs leading-5 text-muted">
          {JSON.stringify(item.carousel ?? item.reelScript, null, 2)}
        </pre>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="inline-flex items-center gap-2 rounded-button border border-border px-3 py-2 text-sm text-navy disabled:opacity-50"
          disabled={!canEdit || isBusy}
          onClick={save}
          type="button"
        >
          <Save size={16} />
          {copy(locale, "save")}
        </button>
        {item.status === "DRAFT" ? (
          <button
            className="inline-flex items-center gap-2 rounded-button bg-midnavy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={isBusy}
            onClick={() => move("IN_REVIEW")}
            type="button"
          >
            <Send size={16} />
            {copy(locale, "submit")}
          </button>
        ) : null}
        {item.status === "IN_REVIEW" ? (
          <button
            className="inline-flex items-center gap-2 rounded-button bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={isBusy}
            onClick={() => move("APPROVED")}
            type="button"
          >
            <CheckCircle2 size={16} />
            {copy(locale, "approve")}
          </button>
        ) : null}
        {item.status === "IN_REVIEW" || item.status === "APPROVED" ? (
          <button
            className="inline-flex items-center gap-2 rounded-button border border-border px-3 py-2 text-sm text-muted disabled:opacity-50"
            disabled={isBusy}
            onClick={() => move("DRAFT")}
            type="button"
          >
            <RotateCcw size={16} />
            {copy(locale, "rework")}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function parseHashtags(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

async function refreshContent(
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

function copy(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      captionAr: "Arabic caption",
      captionEn: "English caption",
      count: "Number of drafts",
      cta: "Call to action",
      empty: "No content drafts yet. Generate drafts after adding Vault context.",
      failed: "Request failed",
      generate: "Generate drafts",
      generated: "Content drafts generated",
      hashtags: "Hashtags",
      pillar: "Content pillar",
      approve: "Approve",
      refresh: "Refresh",
      rework: "Return to draft",
      save: "Save edits",
      saved: "Content saved",
      signInFirst: "Sign in from the dashboard first, then complete at least one Vault section before generating content.",
      statusUpdated: "Status updated",
      submit: "Submit for review",
      title: "Content",
      topic: "Topic",
      topicPlaceholder: "Example: wholesale coffee leads for cafes in Bahrain",
      topicRequired: "Add a topic first.",
      type: "Content type"
    },
    en: {
      captionAr: "Arabic Caption",
      captionEn: "English Caption",
      count: "Number of drafts",
      cta: "Call to action",
      empty: "No content drafts yet. Generate drafts after adding Vault context.",
      failed: "Request failed",
      generate: "Generate drafts",
      generated: "Content drafts generated",
      hashtags: "Hashtags",
      pillar: "Content pillar",
      approve: "Approve",
      refresh: "Refresh",
      rework: "Return to draft",
      save: "Save edits",
      saved: "Content saved",
      signInFirst: "Sign in from the dashboard first, then complete at least one Vault section before generating content.",
      statusUpdated: "Status updated",
      submit: "Submit for review",
      title: "Content",
      topic: "Topic",
      topicPlaceholder: "Example: wholesale coffee leads for cafes in Bahrain",
      topicRequired: "Add a topic first.",
      type: "Content type"
    }
  };

  return dictionary[locale][key] ?? key;
}
