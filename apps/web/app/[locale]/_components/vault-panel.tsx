"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Brain, CheckCircle2, Clock3, Database, RefreshCcw, Save, Search, ShieldCheck } from "lucide-react";
import type {
  KnowledgeVaultEntry,
  KnowledgeVaultHistoryEntry,
  Locale,
  VaultCompletenessScore,
  VaultRagChunk,
  VaultSection
} from "@markos/shared-types";
import { useMarkosClient, useMarkosSession } from "./browser-session";

const sections: VaultSection[] = ["COMPANY", "STORY", "PRODUCTS", "AUDIENCE", "COMPETITORS", "BRAND", "TONE", "OBJECTIVES"];

export function VaultPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const [vault, setVault] = useState<Record<VaultSection, KnowledgeVaultEntry[]>>(() => demoVault());
  const [score, setScore] = useState<VaultCompletenessScore>(() => demoScore());
  const [activeSection, setActiveSection] = useState<VaultSection>("COMPANY");
  const [entryKey, setEntryKey] = useState("manual-note");
  const [entryValue, setEntryValue] = useState("{\n  \"note\": \"\"\n}");
  const [query, setQuery] = useState("What audience should we prioritize?");
  const [results, setResults] = useState<VaultRagChunk[]>([]);
  const [histories, setHistories] = useState<Record<string, KnowledgeVaultHistoryEntry[]>>({});
  const [openHistoryKey, setOpenHistoryKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const client = useMarkosClient(locale);

  useEffect(() => {
    if (!session) {
      return;
    }

    void refreshVault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    setOpenHistoryKey(null);
  }, [activeSection]);

  async function refreshVault() {
    if (!session) {
      setVault(demoVault());
      setScore(demoScore());
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const [nextVault, nextScore] = await Promise.all([client.vault(), client.vaultScore()]);
      setVault(nextVault);
      setScore(nextScore);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function saveEntry() {
    setIsBusy(true);
    setMessage("");

    try {
      const parsed = JSON.parse(entryValue) as unknown;

      if (!isRecord(parsed)) {
        setMessage(text(locale, "jsonObject"));
        return;
      }

      if (!session) {
        const nextEntry = demoEntry(activeSection, entryKey, parsed, 2);
        setVault((current) => ({
          ...current,
          [activeSection]: [nextEntry, ...(current[activeSection] ?? []).filter((entry) => entry.key !== entryKey)]
        }));
        setMessage(text(locale, "previewSaved"));
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
      await refreshVault();
      setMessage(text(locale, "saved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function search() {
    if (!query.trim()) {
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      if (!session) {
        setResults(localSearch(vault, query, activeSection));
        return;
      }

      setResults(await client.searchVault({ query, section: activeSection, topK: 5 }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "failed"));
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

    if (!session) {
      setHistories((current) => ({
        ...current,
        [historyKey]: demoHistory(entry)
      }));
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
      setMessage(error instanceof Error ? error.message : text(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  const entries = vault[activeSection] ?? [];

  return (
    <section className="grid gap-5">
      <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1A1A2E_0%,#0F3460_58%,#162447_100%)] p-6 text-white shadow-[0_8px_32px_rgba(15,52,96,.24)]">
        <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-[26px] font-bold leading-tight tracking-normal">{text(locale, "title")}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/15 px-3 py-1 text-sm font-bold text-emerald-300">
                <ShieldCheck size={14} />
                {score.score}% {text(locale, "ready")}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{text(locale, "subtitle")}</p>
            <div className="mt-5 flex flex-wrap gap-4">
              <HeroStat color="#22C55E" label={text(locale, "entries")} value={String(score.entryCount)} />
              <HeroStat color="#F59E0B" label={text(locale, "complete")} value={String(score.completedSections.length)} />
              <HeroStat color="#E94560" label={text(locale, "gaps")} value={String(score.missingSections.length)} />
            </div>
          </div>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50" disabled={isBusy} onClick={refreshVault} type="button">
            <RefreshCcw size={15} />
            {text(locale, "refresh")}
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => {
          const complete = score.completedSections.includes(section);
          const count = vault[section]?.length ?? 0;

          return (
            <button
              className={activeSection === section ? "rounded-2xl border-2 border-midnavy bg-card p-4 text-start shadow-[0_4px_24px_rgba(233,69,96,.12)]" : "rounded-2xl border border-[#E8ECF2] bg-card p-4 text-start shadow-[0_2px_8px_rgba(0,0,0,.05)] transition hover:-translate-y-0.5"}
              key={section}
              onClick={() => setActiveSection(section)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Database size={18} />
                </div>
                <span className={complete ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-extrabold text-emerald-600" : "rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-extrabold text-amber-700"}>
                  {complete ? text(locale, "complete") : text(locale, "gap")}
                </span>
              </div>
              <h3 className="mt-4 font-extrabold text-navy">{sectionLabel(locale, section)}</h3>
              <p className="mt-1 text-xs text-muted">
                {count} {text(locale, "entries")}
              </p>
            </button>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-navy">{sectionLabel(locale, activeSection)}</h3>
              <p className="mt-1 text-xs text-[#9CA3AF]">{text(locale, "sectionSubtitle")}</p>
            </div>
            <span className="rounded-full bg-navy/5 px-3 py-1 text-xs font-extrabold text-muted">
              {session ? text(locale, "liveVault") : text(locale, "previewVault")}
            </span>
          </div>

          <div className="mt-5 grid gap-3">
            {entries.length > 0 ? (
              entries.map((entry) => {
                const historyKey = vaultHistoryKey(entry);
                const isHistoryOpen = openHistoryKey === historyKey;

                return (
                  <div className="rounded-xl border border-[#E8ECF2] bg-canvas p-4" key={entry.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="font-extrabold text-navy">{entry.key}</h4>
                        <p className="mt-1 text-xs text-muted">
                          v{entry.version} - {new Date(entry.updatedAt).toLocaleDateString(locale)}
                        </p>
                      </div>
                      <button className={isHistoryOpen ? "rounded-xl bg-accent/10 p-2 text-accent" : "rounded-xl border border-[#E8ECF2] bg-white p-2 text-muted"} disabled={isBusy} onClick={() => toggleHistory(entry)} type="button">
                        <Clock3 size={15} />
                      </button>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">{summarizeValue(entry.value)}</p>
                    {isHistoryOpen ? <HistoryList history={histories[historyKey]} locale={locale} /> : null}
                  </div>
                );
              })
            ) : (
              <EmptyState locale={locale} section={activeSection} />
            )}
          </div>
        </article>

        <aside className="grid gap-4">
          <article className="rounded-2xl border-2 border-midnavy bg-card p-5 shadow-[0_4px_24px_rgba(233,69,96,.18)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#E94560,#6366F1)] text-white">
                <Brain size={22} />
              </div>
              <div>
                <h3 className="font-extrabold text-navy">{text(locale, "memoryInsight")}</h3>
                <p className="text-sm text-muted">{text(locale, "memoryInsightSub")}</p>
              </div>
            </div>
            <p className="mt-5 rounded-xl border border-accent/15 bg-[linear-gradient(135deg,rgba(233,69,96,.04),rgba(99,102,241,.04))] p-4 text-sm leading-6 text-muted">
              {memoryInsight(locale, score)}
            </p>
          </article>

          <article className="rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
            <h3 className="font-extrabold text-navy">{text(locale, "edit")}</h3>
            <label className="mt-4 block">
              <span className="text-xs font-bold uppercase tracking-[.08em] text-muted">{text(locale, "key")}</span>
              <input className="mt-2 h-10 w-full rounded-xl border border-[#E8ECF2] bg-canvas px-3 text-sm outline-none focus:border-accent" onChange={(event) => setEntryKey(event.target.value)} value={entryKey} />
            </label>
            <label className="mt-4 block">
              <span className="text-xs font-bold uppercase tracking-[.08em] text-muted">{text(locale, "value")}</span>
              <textarea className="mt-2 min-h-40 w-full resize-y rounded-xl border border-[#E8ECF2] bg-canvas px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-accent" onChange={(event) => setEntryValue(event.target.value)} value={entryValue} />
            </label>
            <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-midnavy px-4 text-sm font-extrabold text-white disabled:opacity-50" disabled={isBusy || !entryKey.trim()} onClick={saveEntry} type="button">
              <Save size={15} />
              {text(locale, "save")}
            </button>
            <p className="mt-3 min-h-5 text-sm leading-6 text-muted">{message}</p>
          </article>
        </aside>
      </section>

      <section className="rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-navy">{text(locale, "search")}</h3>
            <p className="mt-1 text-xs text-[#9CA3AF]">{text(locale, "searchSub")}</p>
          </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-extrabold text-white disabled:opacity-50" disabled={isBusy || !query.trim()} onClick={search} type="button">
            <Search size={15} />
            {text(locale, "searchButton")}
          </button>
        </div>
        <input className="mt-4 h-11 w-full rounded-xl border border-[#E8ECF2] bg-canvas px-4 text-sm outline-none focus:border-accent" onChange={(event) => setQuery(event.target.value)} value={query} />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {results.map((result) => (
            <div className="rounded-xl border border-[#E8ECF2] bg-canvas p-4" key={result.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-extrabold text-navy">
                  {sectionLabel(locale, result.section)} / {result.key}
                </p>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-extrabold text-emerald-600">{Math.round(result.score * 100)}%</span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{summarizeValue(result.value)}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function HeroStat({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full shadow-[0_0_7px_currentColor]" style={{ backgroundColor: color, color }} />
      <span className="text-[13px] text-white/50">{label}:</span>
      <span className="text-[13px] font-bold text-white">{value}</span>
    </div>
  );
}

function EmptyState({ locale, section }: { locale: Locale; section: VaultSection }) {
  return (
    <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-canvas p-5">
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className="mt-1 text-accent" />
        <div>
          <p className="font-extrabold text-navy">{text(locale, "empty")}</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {text(locale, "emptyBody")} {sectionLabel(locale, section)}.
          </p>
        </div>
      </div>
    </div>
  );
}

function HistoryList({ history, locale }: { history: KnowledgeVaultHistoryEntry[] | undefined; locale: Locale }) {
  return (
    <div className="mt-4 border-t border-[#E8ECF2] pt-3">
      <p className="text-xs font-extrabold uppercase tracking-[.12em] text-muted">{text(locale, "history")}</p>
      <div className="mt-2 grid gap-2">
        {history === undefined ? <p className="text-sm text-muted">{text(locale, "loadingHistory")}</p> : null}
        {history?.length === 0 ? <p className="text-sm text-muted">{text(locale, "emptyHistory")}</p> : null}
        {history?.map((item) => (
          <div className="rounded-xl bg-white p-3" key={item.id}>
            <p className="text-xs font-bold text-muted">
              v{item.version} - {new Date(item.createdAt).toLocaleDateString(locale)}
            </p>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{summarizeValue(item.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function demoVault(): Record<VaultSection, KnowledgeVaultEntry[]> {
  const now = "2026-06-15T09:00:00.000Z";
  return {
    AUDIENCE: [demoEntry("AUDIENCE", "target-audience", { ageRange: "25-34", location: "Bahrain, GCC", languages: ["Arabic", "English"], painPoints: ["Reliable connectivity", "Competitive pricing"] }, 1, now)],
    BRAND: [demoEntry("BRAND", "brand-rules", { colors: ["#E94560", "#0F3460"], typography: "Inter + Space Grotesk" }, 1, now)],
    COMPANY: [demoEntry("COMPANY", "company-profile", { name: "Zain Arabia", industry: "Telecom", market: "Bahrain" }, 1, now)],
    COMPETITORS: [demoEntry("COMPETITORS", "competitors", { names: ["STC Bahrain", "Batelco"] }, 1, now)],
    OBJECTIVES: [demoEntry("OBJECTIVES", "marketing-goals", { goals: ["Increase brand awareness", "Build community", "Generate leads"] }, 1, now)],
    PRODUCTS: [demoEntry("PRODUCTS", "core-offers", { offers: ["5G speed", "Ramadan offer", "Student plan"] }, 1, now)],
    STORY: [demoEntry("STORY", "origin", { mission: "Reliable digital services for Bahrain" }, 1, now)],
    TONE: [demoEntry("TONE", "voice", { tone: "Professional, friendly, clear" }, 1, now)]
  };
}

function demoEntry(section: VaultSection, key: string, value: Record<string, unknown>, version = 1, date = new Date().toISOString()): KnowledgeVaultEntry {
  return {
    createdAt: date,
    id: `demo-${section}-${key}`,
    key,
    section,
    updatedAt: date,
    value,
    version,
    workspaceId: "demo-workspace"
  };
}

function demoScore(): VaultCompletenessScore {
  return {
    completedSections: sections,
    entryCount: sections.length,
    missingSections: [],
    requiredSections: sections,
    score: 100
  };
}

function demoHistory(entry: KnowledgeVaultEntry): KnowledgeVaultHistoryEntry[] {
  return [
    {
      createdAt: "2026-06-14T09:00:00.000Z",
      id: `${entry.id}-history-1`,
      key: entry.key,
      knowledgeVaultId: entry.id,
      section: entry.section,
      value: entry.value,
      version: Math.max(1, entry.version - 1),
      workspaceId: entry.workspaceId
    }
  ];
}

function localSearch(vault: Record<VaultSection, KnowledgeVaultEntry[]>, query: string, activeSection: VaultSection): VaultRagChunk[] {
  const lower = query.toLowerCase();
  return (vault[activeSection] ?? [])
    .filter((entry) => JSON.stringify(entry.value).toLowerCase().includes(lower) || entry.key.toLowerCase().includes(lower))
    .map((entry) => ({
      id: entry.id,
      key: entry.key,
      score: 0.92,
      section: entry.section,
      value: entry.value,
      version: entry.version
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function vaultHistoryKey(entry: Pick<KnowledgeVaultEntry, "key" | "section">): string {
  return `${entry.section}:${entry.key}`;
}

function summarizeValue(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(([key, item]) => `${key}: ${Array.isArray(item) ? item.join(", ") : typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)}`)
    .join(" / ");
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

function memoryInsight(locale: Locale, score: VaultCompletenessScore): string {
  if (score.missingSections.length === 0) {
    return text(locale, "completeInsight");
  }

  return `${text(locale, "gapInsight")} ${score.missingSections.map((section) => sectionLabel(locale, section)).join(", ")}`;
}

function text(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      complete: "مكتمل",
      completeInsight: "الخزنة مكتملة بما يكفي لتوليد استراتيجية ومحتوى وتحليلات مبنية على سياق العميل.",
      edit: "إضافة معرفة",
      empty: "لا توجد معرفة محفوظة",
      emptyBody: "أضف مدخلا منظما لهذا القسم:",
      emptyHistory: "لا توجد نسخ سابقة.",
      entries: "مدخلات",
      failed: "فشل الطلب",
      gap: "ناقص",
      gapInsight: "أكمل الأقسام التالية قبل توسيع توليد المحتوى:",
      gaps: "الفجوات",
      history: "السجل",
      jsonObject: "القيمة يجب أن تكون JSON object.",
      key: "المفتاح",
      liveVault: "خزنة حية",
      loadingHistory: "تحميل السجل...",
      memoryInsight: "ذاكرة الأعمال",
      memoryInsightSub: "جاهزية السياق",
      previewSaved: "تم حفظ مدخل المعاينة.",
      previewVault: "خزنة معاينة",
      ready: "جاهزية",
      refresh: "تحديث",
      save: "حفظ في الخزنة",
      saved: "تم الحفظ",
      search: "اختبار الاسترجاع",
      searchButton: "بحث",
      searchSub: "اختبر ما سيراه RAG قبل تشغيل الوكلاء",
      sectionSubtitle: "راجع المعرفة المحفوظة أو أضف مدخلا منظما.",
      subtitle: "كل إجابة من التهيئة، قاعدة علامة، ونتيجة أداء تصبح ذاكرة أعمال قابلة للاسترجاع.",
      title: "Knowledge Vault",
      value: "القيمة JSON"
    },
    en: {
      complete: "Complete",
      completeInsight: "The Vault is complete enough to ground strategy, content, scheduling, and analytics in customer context.",
      edit: "Add Knowledge",
      empty: "No saved knowledge",
      emptyBody: "Add a structured entry for",
      emptyHistory: "No version history yet.",
      entries: "entries",
      failed: "Request failed",
      gap: "Gap",
      gapInsight: "Complete these sections before expanding content generation:",
      gaps: "Gaps",
      history: "History",
      jsonObject: "Value must be a JSON object.",
      key: "Key",
      liveVault: "Live Vault",
      loadingHistory: "Loading history...",
      memoryInsight: "Business Memory",
      memoryInsightSub: "Context readiness",
      previewSaved: "Preview entry saved.",
      previewVault: "Preview Vault",
      ready: "ready",
      refresh: "Refresh",
      save: "Save to Vault",
      saved: "Saved",
      search: "Retrieval Test",
      searchButton: "Search",
      searchSub: "Test what RAG sees before agents run",
      sectionSubtitle: "Review saved knowledge or add a structured entry.",
      subtitle: "Every onboarding answer, brand rule, and performance result becomes retrievable business memory.",
      title: "Knowledge Vault",
      value: "Value JSON"
    }
  };

  return dictionary[locale][key] ?? key;
}
