"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, RefreshCcw, Sparkles } from "lucide-react";
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
          items.map((item) => <ContentDraftCard item={item} key={item.id} locale={locale} />)
        ) : (
          <div className="rounded-card border border-dashed border-border bg-card p-6 text-sm text-muted">
            {copy(locale, "empty")}
          </div>
        )}
      </div>
    </section>
  );
}

function ContentDraftCard({ item, locale }: { item: ContentRecord; locale: Locale }) {
  return (
    <article className="rounded-card border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-button bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">{item.contentType}</span>
          <span className="rounded-button border border-border px-2 py-1 text-xs text-muted">{item.status}</span>
          {item.contentPillar ? <span className="text-xs text-muted">{item.contentPillar}</span> : null}
        </div>
        <span className="text-xs text-muted">{new Date(item.createdAt).toLocaleDateString(locale)}</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {item.captionEn ? (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-normal text-muted">{copy(locale, "captionEn")}</h3>
            <p className="mt-1 text-sm leading-6 text-navy">{item.captionEn}</p>
          </div>
        ) : null}
        {item.captionAr ? (
          <div dir="rtl">
            <h3 className="text-xs font-semibold uppercase tracking-normal text-muted">{copy(locale, "captionAr")}</h3>
            <p className="mt-1 text-sm leading-6 text-navy">{item.captionAr}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {item.hashtags.map((tag) => (
          <span className="rounded-button border border-border px-2 py-1 text-xs text-muted" key={tag}>
            {tag}
          </span>
        ))}
      </div>

      {item.callToAction ? <p className="mt-4 text-sm font-medium text-navy">{item.callToAction}</p> : null}

      {item.carousel || item.reelScript ? (
        <pre className="mt-4 max-h-72 overflow-auto rounded-input bg-canvas p-3 text-xs leading-5 text-muted">
          {JSON.stringify(item.carousel ?? item.reelScript, null, 2)}
        </pre>
      ) : null}
    </article>
  );
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
      empty: "No content drafts yet. Generate drafts after adding Vault context.",
      failed: "Request failed",
      generate: "Generate drafts",
      generated: "Content drafts generated",
      refresh: "Refresh",
      signInFirst: "Sign in from the dashboard first, then complete at least one Vault section before generating content.",
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
      empty: "No content drafts yet. Generate drafts after adding Vault context.",
      failed: "Request failed",
      generate: "Generate drafts",
      generated: "Content drafts generated",
      refresh: "Refresh",
      signInFirst: "Sign in from the dashboard first, then complete at least one Vault section before generating content.",
      title: "Content",
      topic: "Topic",
      topicPlaceholder: "Example: wholesale coffee leads for cafes in Bahrain",
      topicRequired: "Add a topic first.",
      type: "Content type"
    }
  };

  return dictionary[locale][key] ?? key;
}
