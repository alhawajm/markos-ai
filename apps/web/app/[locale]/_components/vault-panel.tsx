"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Database, RefreshCcw, Save, Search } from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import type {
  AuthSession,
  KnowledgeVaultEntry,
  KnowledgeVaultHistoryEntry,
  Locale,
  VaultCompletenessScore,
  VaultRagChunk,
  VaultSection
} from "@markos/shared-types";

const sessionKey = "markos.session";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const sections: VaultSection[] = ["COMPANY", "STORY", "PRODUCTS", "AUDIENCE", "COMPETITORS", "BRAND", "TONE", "OBJECTIVES"];

export function VaultPanel({ locale }: { locale: Locale }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [vault, setVault] = useState<Record<VaultSection, KnowledgeVaultEntry[]> | null>(null);
  const [score, setScore] = useState<VaultCompletenessScore | null>(null);
  const [activeSection, setActiveSection] = useState<VaultSection>("COMPANY");
  const [entryKey, setEntryKey] = useState("manual-note");
  const [entryValue, setEntryValue] = useState("{\n  \"note\": \"\"\n}");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VaultRagChunk[]>([]);
  const [histories, setHistories] = useState<Record<string, KnowledgeVaultHistoryEntry[]>>({});
  const [openHistoryKey, setOpenHistoryKey] = useState<string | null>(null);
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
    void refreshVault(client, setVault, setScore, setMessage);
  }, [client, session]);

  useEffect(() => {
    setOpenHistoryKey(null);
  }, [activeSection]);

  async function saveEntry() {
    setIsBusy(true);
    setMessage("");

    try {
      const parsed = JSON.parse(entryValue) as unknown;

      if (!isRecord(parsed)) {
        setMessage(copy(locale, "jsonObject"));
        return;
      }

      await client.saveVaultSection(activeSection, {
        entries: [
          {
            key: entryKey,
            value: parsed
          }
        ]
      });
      await refreshVault(client, setVault, setScore, setMessage);
      setMessage(copy(locale, "saved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function search() {
    if (!query.trim()) return;

    setIsBusy(true);
    setMessage("");

    try {
      setResults(
        await client.searchVault({
          query,
          section: activeSection,
          topK: 5
        })
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleHistory(entry: KnowledgeVaultEntry) {
    const historyKey = vaultHistoryKey(entry);

    if (openHistoryKey === historyKey) {
      setOpenHistoryKey(null);
      return;
    }

    setOpenHistoryKey(historyKey);

    if (histories[historyKey] !== undefined) {
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const history = await client.vaultEntryHistory(entry.section, entry.key);
      setHistories((current) => ({
        ...current,
        [historyKey]: history
      }));
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
          <Database size={20} />
          <h2 className="text-base font-semibold text-navy">{copy(locale, "title")}</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">{copy(locale, "signInFirst")}</p>
      </section>
    );
  }

  const entries = vault?.[activeSection] ?? [];

  return (
    <section className="mt-8 grid gap-4 xl:grid-cols-[280px_1fr]">
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
            onClick={() => refreshVault(client, setVault, setScore, setMessage)}
            type="button"
          >
            <RefreshCcw size={16} />
          </button>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{copy(locale, "score")}</span>
            <span>{score?.score ?? 0}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-navy/10">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${score?.score ?? 0}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {score?.entryCount ?? 0} {copy(locale, "entries")}
          </p>
        </div>

        <VaultGaps locale={locale} missingSections={score?.missingSections ?? []} onSelectSection={setActiveSection} />

        <div className="mt-5 grid gap-1">
          {sections.map((section) => {
            const isComplete = score?.completedSections.includes(section) ?? false;
            return (
              <button
                className={
                  activeSection === section
                    ? "flex items-center justify-between rounded-button bg-midnavy px-3 py-2 text-sm text-white"
                    : "flex items-center justify-between rounded-button px-3 py-2 text-sm text-muted hover:bg-navy/5 hover:text-navy"
                }
                key={section}
                onClick={() => setActiveSection(section)}
                type="button"
              >
                <span>{sectionLabel(locale, section)}</span>
                {isComplete ? <CheckCircle2 size={16} /> : <span className="text-xs">{vault?.[section]?.length ?? 0}</span>}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="grid gap-4">
        <div className="rounded-card border border-border bg-card p-5 shadow-card">
          <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-navy">{sectionLabel(locale, activeSection)}</h2>
              <p className="mt-1 text-sm text-muted">{copy(locale, "sectionSubtitle")}</p>
            </div>
            <p className="text-sm text-muted">{message}</p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-navy">{copy(locale, "stored")}</h3>
              <div className="mt-3 grid gap-3">
                {entries.length > 0 ? (
                  entries.map((entry) => {
                    const historyKey = vaultHistoryKey(entry);
                    const isHistoryOpen = openHistoryKey === historyKey;
                    const history = histories[historyKey];

                    return (
                      <article className="rounded-card border border-border p-3" key={entry.id}>
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="min-w-0 truncate text-sm font-semibold text-navy">{entry.key}</h4>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-muted">v{entry.version}</span>
                            <button
                              aria-label={copy(locale, "history")}
                              className={
                                isHistoryOpen
                                  ? "rounded-button bg-accent/10 p-2 text-accent"
                                  : "rounded-button border border-border p-2 text-muted hover:text-navy"
                              }
                              disabled={isBusy}
                              onClick={() => toggleHistory(entry)}
                              type="button"
                            >
                              <Clock3 size={15} />
                            </button>
                          </div>
                        </div>
                        <pre className="mt-2 max-h-56 overflow-auto rounded-input bg-canvas p-3 text-xs leading-5 text-muted">
                          {JSON.stringify(entry.value, null, 2)}
                        </pre>
                        {isHistoryOpen ? <VaultHistoryTimeline history={history} locale={locale} /> : null}
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-card border border-dashed border-border p-4 text-sm text-muted">{copy(locale, "empty")}</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-navy">{copy(locale, "edit")}</h3>
              <label className="mt-3 block">
                <span className="text-xs font-medium text-muted">{copy(locale, "key")}</span>
                <input
                  className="mt-1 w-full rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent"
                  onChange={(event) => setEntryKey(event.target.value)}
                  value={entryKey}
                />
              </label>
              <label className="mt-3 block">
                <span className="text-xs font-medium text-muted">{copy(locale, "value")}</span>
                <textarea
                  className="mt-1 min-h-56 w-full resize-y rounded-input border border-border px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                  onChange={(event) => setEntryValue(event.target.value)}
                  value={entryValue}
                />
              </label>
              <button
                className="mt-3 inline-flex items-center gap-2 rounded-button bg-midnavy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={isBusy || !entryKey.trim()}
                onClick={saveEntry}
                type="button"
              >
                <Save size={16} />
                {copy(locale, "save")}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-card border border-border bg-card p-5 shadow-card">
          <h2 className="text-base font-semibold text-navy">{copy(locale, "search")}</h2>
          <div className="mt-3 flex flex-col gap-2 md:flex-row">
            <input
              className="min-w-0 flex-1 rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy(locale, "searchPlaceholder")}
              value={query}
            />
            <button
              className="inline-flex items-center justify-center gap-2 rounded-button bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isBusy || !query.trim()}
              onClick={search}
              type="button"
            >
              <Search size={16} />
              {copy(locale, "searchButton")}
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            {results.map((result) => (
              <article className="rounded-card border border-border p-3" key={result.id}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-navy">
                    {sectionLabel(locale, result.section)} / {result.key}
                  </h3>
                  <span className="text-xs text-muted">{Math.round(result.score * 100)}%</span>
                </div>
                <pre className="mt-2 max-h-40 overflow-auto rounded-input bg-canvas p-3 text-xs leading-5 text-muted">
                  {JSON.stringify(result.value, null, 2)}
                </pre>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function VaultGaps({
  locale,
  missingSections,
  onSelectSection
}: {
  locale: Locale;
  missingSections: VaultSection[];
  onSelectSection: (section: VaultSection) => void;
}) {
  if (missingSections.length === 0) {
    return (
      <div className="mt-4 rounded-card border border-accent/20 bg-accent/5 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-accent">
          <CheckCircle2 size={16} />
          {copy(locale, "ready")}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-card border border-border bg-canvas p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-navy">
        <AlertCircle size={16} className="text-accent" />
        {copy(locale, "missing")}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {missingSections.map((section) => (
          <button
            className="rounded-full bg-white px-2 py-1 text-xs text-muted hover:text-navy"
            key={section}
            onClick={() => onSelectSection(section)}
            type="button"
          >
            {sectionLabel(locale, section)}
          </button>
        ))}
      </div>
    </div>
  );
}

function VaultHistoryTimeline({
  history,
  locale
}: {
  history: KnowledgeVaultHistoryEntry[] | undefined;
  locale: Locale;
}) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted">
        <Clock3 size={14} />
        {copy(locale, "history")}
      </div>
      <div className="mt-2 grid gap-2">
        {history === undefined ? (
          <p className="rounded-input bg-canvas p-3 text-xs text-muted">{copy(locale, "loadingHistory")}</p>
        ) : null}
        {history?.length === 0 ? (
          <p className="rounded-input bg-canvas p-3 text-xs text-muted">{copy(locale, "emptyHistory")}</p>
        ) : null}
        {history?.map((version) => (
          <div className="rounded-input border border-border bg-white p-3" key={version.id}>
            <div className="flex items-center justify-between gap-3 text-xs text-muted">
              <span>v{version.version}</span>
              <time dateTime={version.createdAt}>{formatDate(version.createdAt, locale)}</time>
            </div>
            <pre className="mt-2 max-h-40 overflow-auto rounded-input bg-canvas p-3 text-xs leading-5 text-muted">
              {JSON.stringify(version.value, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

async function refreshVault(
  client: MarkosApiClient,
  setVault: (vault: Record<VaultSection, KnowledgeVaultEntry[]>) => void,
  setScore: (score: VaultCompletenessScore) => void,
  setMessage: (message: string) => void
) {
  try {
    const [nextVault, nextScore] = await Promise.all([client.vault(), client.vaultScore()]);
    setVault(nextVault);
    setScore(nextScore);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Request failed");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function vaultHistoryKey(entry: Pick<KnowledgeVaultEntry, "key" | "section">): string {
  return `${entry.section}:${entry.key}`;
}

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function sectionLabel(locale: Locale, section: VaultSection): string {
  const labels: Record<VaultSection, Record<Locale, string>> = {
    AUDIENCE: { ar: "الجمهور", en: "Audience" },
    BRAND: { ar: "الهوية", en: "Brand" },
    COMPANY: { ar: "الشركة", en: "Company" },
    COMPETITORS: { ar: "المنافسون", en: "Competitors" },
    OBJECTIVES: { ar: "الأهداف", en: "Objectives" },
    PRODUCTS: { ar: "المنتجات", en: "Products" },
    STORY: { ar: "القصة", en: "Story" },
    TONE: { ar: "النبرة", en: "Tone" }
  };

  return labels[section][locale];
}

function copy(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      edit: "تحرير",
      empty: "لا توجد معرفة محفوظة في هذا القسم بعد.",
      emptyHistory: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0646\u0633\u062e \u0633\u0627\u0628\u0642\u0629.",
      entries: "مدخلات",
      failed: "تعذر تنفيذ الطلب",
      history: "\u0627\u0644\u0633\u062c\u0644",
      jsonObject: "القيمة يجب أن تكون JSON object.",
      key: "المفتاح",
      loadingHistory: "\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0633\u062c\u0644...",
      missing: "أقسام المعرفة الناقصة",
      ready: "الخزنة مكتملة",
      refresh: "تحديث",
      save: "حفظ في الخزنة",
      saved: "تم الحفظ",
      score: "جاهزية الخزنة",
      search: "اختبار الاسترجاع",
      searchButton: "بحث",
      searchPlaceholder: "اسأل عن نشاطك أو جمهورك أو النبرة...",
      sectionSubtitle: "راجع المعرفة المحفوظة أو أضف مدخلا منظما.",
      signInFirst: "سجل الدخول من لوحة التحكم أولا حتى يمكن قراءة خزنة مساحة العمل.",
      stored: "المعرفة المحفوظة",
      title: "الخزنة المعرفية",
      value: "القيمة JSON"
    },
    en: {
      edit: "Edit",
      empty: "No saved knowledge in this section yet.",
      emptyHistory: "No version history yet.",
      entries: "entries",
      failed: "Request failed",
      history: "History",
      jsonObject: "Value must be a JSON object.",
      key: "Key",
      loadingHistory: "Loading history...",
      missing: "Missing knowledge sections",
      ready: "Vault complete",
      refresh: "Refresh",
      save: "Save to Vault",
      saved: "Saved",
      score: "Vault readiness",
      search: "Retrieval Test",
      searchButton: "Search",
      searchPlaceholder: "Ask about the business, audience, tone...",
      sectionSubtitle: "Review saved knowledge or add a structured entry.",
      signInFirst: "Sign in from the dashboard first so the workspace Vault can be loaded.",
      stored: "Saved Knowledge",
      title: "Knowledge Vault",
      value: "Value JSON"
    }
  };

  return dictionary[locale][key] ?? key;
}
