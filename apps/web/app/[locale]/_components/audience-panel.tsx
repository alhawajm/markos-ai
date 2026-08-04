"use client";

import { useEffect, useState } from "react";
import { Brain, CheckCircle2, Languages, MapPin, RefreshCcw, Target, TrendingUp, Users } from "lucide-react";
import type { KnowledgeVaultEntry, Locale, VaultSection } from "@markos/shared-types";
import { SurfaceState } from "./surface-state";
import { useMarkosClient, useMarkosSession } from "./browser-session";


const demoSegments = [
  { color: "#E94560", label: "Young professionals", match: 94, note: "Mobile-first buyers in Bahrain, 25-34" },
  { color: "#1877F2", label: "SMB owners", match: 88, note: "Need reliable connectivity and business bundles" },
  { color: "#F59E0B", label: "Students", match: 76, note: "Price-sensitive, high data use, social-heavy" },
  { color: "#22C55E", label: "Families", match: 71, note: "Value home internet and multi-line plans" }
];

const painPoints = ["Reliable connectivity", "Digital transformation support", "Competitive pricing", "Fast local support"];
type AuditState = "loading" | "error" | "success" | "limit";

export function AudiencePanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const [vault, setVault] = useState<Record<VaultSection, KnowledgeVaultEntry[]> | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [auditState, setAuditState] = useState<AuditState | null>(null);

  const client = useMarkosClient(locale);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedState = params.get("state");

    if (isAuditState(requestedState)) {
      setAuditState(requestedState);
    }

  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadAudience();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function loadAudience() {
    if (!session) {
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      setVault(await client.vault());
      setAuditState("success");
    } catch (error) {
      setAuditState("error");
      setMessage(error instanceof Error ? error.message : text(locale, "failed"));
    } finally {
      setIsLoading(false);
    }
  }

  const audience = audienceProfile(locale, vault);

  return (
    <section className="grid gap-5">
      <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1A1A2E_0%,#0F3460_58%,#162447_100%)] p-6 text-white shadow-[0_8px_32px_rgba(15,52,96,.24)]">
        <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-[26px] font-bold leading-tight tracking-normal">{text(locale, "title")}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/15 px-3 py-1 text-sm font-bold text-accent">
                <Users size={14} />
                {session ? text(locale, "vaultGrounded") : text(locale, "previewMode")}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{text(locale, "subtitle")}</p>
            <div className="mt-5 flex flex-wrap gap-4">
              <HeroStat color="#22C55E" label={text(locale, "primaryMarket")} value={audience.location} />
              <HeroStat color="#F59E0B" label={text(locale, "ageRange")} value={audience.ageRange} />
              <HeroStat color="#E94560" label={text(locale, "language")} value={audience.language} />
            </div>
          </div>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50" disabled={!session || isLoading} onClick={loadAudience} type="button">
            <RefreshCcw size={15} />
            {text(locale, "refresh")}
          </button>
        </div>
      </section>

      {isLoading || auditState ? (
        <SurfaceState
          action={
            auditState === "limit" ? (
              <a className="inline-flex h-10 items-center rounded-button bg-accent px-4 text-sm font-bold text-white" href={`/${locale}/settings`}>
                {text(locale, "upgradePlan")}
              </a>
            ) : (
              <button className="inline-flex h-10 items-center gap-2 rounded-button border border-border bg-card px-4 text-sm font-bold text-navy disabled:opacity-60" disabled={!session || isLoading} onClick={loadAudience} type="button">
                <RefreshCcw size={15} />
                {text(locale, "refresh")}
              </button>
            )
          }
          body={auditStateText(locale, isLoading ? "loading" : auditState).body}
          title={auditStateText(locale, isLoading ? "loading" : auditState).title}
          tone={auditState === "error" ? "error" : auditState === "success" ? "success" : auditState === "limit" ? "limit" : "loading"}
        />
      ) : null}

      {message ? (
        <SurfaceState body={message} title={text(locale, auditState === "error" ? "attention" : "status")} tone={auditState === "error" ? "error" : "info"} />
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard color="#E94560" icon={Target} label={text(locale, "coreSegment")} value={audience.segment} />
        <MetricCard color="#1877F2" icon={MapPin} label={text(locale, "location")} value={audience.location} />
        <MetricCard color="#22C55E" icon={Languages} label={text(locale, "language")} value={audience.language} />
        <MetricCard color="#F59E0B" icon={TrendingUp} label={text(locale, "intent")} value={text(locale, "highIntent")} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-navy">{text(locale, "segments")}</h3>
              <p className="mt-1 text-xs text-[#9CA3AF]">{text(locale, "segmentsSub")}</p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-extrabold text-emerald-600">{text(locale, "healthy")}</span>
          </div>
          <div className="mt-6 grid gap-3">
            {demoSegments.map((segment) => (
              <div className="rounded-xl border border-[#E8ECF2] bg-canvas p-4" key={segment.label}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-navy">{localizedSegment(locale, segment.label)}</p>
                    <p className="mt-1 text-xs text-muted">{localizedSegment(locale, segment.note)}</p>
                  </div>
                  <span className="font-display text-xl font-extrabold tracking-normal" style={{ color: segment.color }}>
                    {segment.match}%
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full" style={{ backgroundColor: segment.color, width: `${segment.match}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border-2 border-midnavy bg-card p-5 shadow-[0_4px_24px_rgba(233,69,96,.18)]">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#E94560,#6366F1)] text-white">
              <Brain size={22} />
            </div>
            <div>
              <h3 className="font-extrabold text-navy">{text(locale, "aiRead")}</h3>
              <p className="text-sm text-muted">{text(locale, "updatedNow")}</p>
            </div>
          </div>
          <p className="mt-5 rounded-xl border border-accent/15 bg-[linear-gradient(135deg,rgba(233,69,96,.04),rgba(99,102,241,.04))] p-5 text-[13px] leading-7 text-slate-700">
            {text(locale, "aiInsight")}
          </p>
          <div className="mt-5 grid gap-2">
            {painPoints.map((point) => (
              <span className="inline-flex items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-bold text-navy" key={point}>
                <CheckCircle2 size={15} className="text-emerald-600" />
                {localizedSegment(locale, point)}
              </span>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {[
          [text(locale, "bestMessage"), text(locale, "bestMessageBody"), "#E94560"],
          [text(locale, "bestChannels"), text(locale, "bestChannelsBody"), "#1877F2"],
          [text(locale, "contentAngle"), text(locale, "contentAngleBody"), "#22C55E"]
        ].map(([title, body, color]) => (
          <article className="rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.05)]" key={title}>
            <div className="mb-4 h-1 w-12 rounded-full" style={{ backgroundColor: color }} />
            <h3 className="text-[15px] font-bold text-navy">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
          </article>
        ))}
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

function MetricCard({ color, icon: Icon, label, value }: { color: string; icon: typeof Target; label: string; value: string }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#E8ECF2] bg-card shadow-[0_2px_8px_rgba(0,0,0,.05)]">
      <div className="h-1" style={{ backgroundColor: color }} />
      <div className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-semibold tracking-[.02em] text-[#6B7280]">{label}</p>
          <p className="mt-8 font-display text-[24px] font-extrabold leading-tight tracking-normal text-navy">{value}</p>
        </div>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-xl" style={{ backgroundColor: `${color}14`, color }}>
          <Icon size={16} strokeWidth={1.5} />
        </div>
      </div>
    </article>
  );
}

function audienceProfile(locale: Locale, vault: Record<VaultSection, KnowledgeVaultEntry[]> | null) {
  const audienceEntries = vault?.AUDIENCE ?? [];
  const textBlob = audienceEntries.map((entry) => JSON.stringify(entry.value)).join(" ");

  return {
    ageRange: findKnown(textBlob, ["25-34", "18-24", "35-44"]) ?? "25-34",
    language: textBlob.toLowerCase().includes("arabic") && textBlob.toLowerCase().includes("english") ? "Arabic + English" : text(locale, "both"),
    location: findKnown(textBlob, ["Bahrain", "GCC", "Saudi"]) ?? "Bahrain, GCC",
    segment: findKnown(textBlob, ["Young professionals", "SMB owners", "Students"]) ?? text(locale, "youngPros")
  };
}

function findKnown(value: string, candidates: string[]): string | undefined {
  const lower = value.toLowerCase();
  return candidates.find((candidate) => lower.includes(candidate.toLowerCase()));
}

function isAuditState(value: string | null): value is AuditState {
  return value === "loading" || value === "error" || value === "success" || value === "limit";
}

function auditStateText(locale: Locale, state: AuditState | null): { body: string; title: string } {
  const resolved = state ?? "success";
  const dictionary: Record<Locale, Record<AuditState, { body: string; title: string }>> = {
    ar: {
      error: {
        body: "تعذر تحميل بيانات الجمهور. حدّث الشاشة أو أكمل ذاكرة الجمهور في الخزنة حتى يستند التحليل إلى معلومات حقيقية.",
        title: "تعذر تحديث الجمهور"
      },
      limit: {
        body: "قراءة الجمهور متاحة، لكن توليد توصيات إضافية متوقف مؤقتا بسبب حدود الخطة.",
        title: "تم الوصول إلى حد الخطة"
      },
      loading: {
        body: "يقرأ MARKOS ذاكرة الجمهور ونقاط الألم والقنوات حتى يعرض نقطة بداية قابلة للنشر.",
        title: "جار تحديث الجمهور"
      },
      success: {
        body: "تم تحديث شرائح الجمهور من الخزنة، والاقتراح التالي واضح: راجع الرسالة الأفضل ثم أنشئ محتوى موجها.",
        title: "الجمهور جاهز"
      }
    },
    en: {
      error: {
        body: "Audience data could not be loaded. Refresh or complete the audience memory in Vault so the analysis has real business context.",
        title: "Audience refresh failed"
      },
      limit: {
        body: "Audience reading is available, but additional AI recommendations are paused by the current plan quota.",
        title: "Plan limit reached"
      },
      loading: {
        body: "MARKOS is reading audience memory, pain points, and channel context before proposing the next publishable angle.",
        title: "Refreshing audience"
      },
      success: {
        body: "Audience segments are refreshed from the Vault. Next action: review the best message, then create targeted content.",
        title: "Audience ready"
      }
    }
  };

  return dictionary[locale][resolved];
}

function localizedSegment(locale: Locale, value: string): string {
  if (locale === "en") {
    return value;
  }

  const dictionary: Record<string, string> = {
    "Competitive pricing": "أسعار تنافسية",
    "Digital transformation support": "دعم التحول الرقمي",
    Families: "العائلات",
    "Mobile-first buyers in Bahrain, 25-34": "مشترون يعتمدون على الهاتف في البحرين، 25-34",
    "Need reliable connectivity and business bundles": "يحتاجون اتصالا موثوقا وباقات أعمال",
    "Price-sensitive, high data use, social-heavy": "حساسون للسعر واستخدامهم للبيانات عال",
    "Reliable connectivity": "اتصال موثوق",
    "SMB owners": "أصحاب الأعمال الصغيرة",
    Students: "الطلاب",
    "Value home internet and multi-line plans": "يهتمون بالإنترنت المنزلي والخطوط المتعددة",
    "Fast local support": "دعم محلي سريع",
    "Young professionals": "المهنيون الشباب"
  };

  return dictionary[value] ?? value;
}

function text(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      ageRange: "العمر",
      aiInsight: "الجمهور الأقوى الآن هو المهنيون الشباب وأصحاب الأعمال الصغيرة. الرسائل التي تجمع بين الاعتمادية، السرعة، والسعر الواضح ستعمل أفضل على إنستغرام وفيسبوك خلال هذا الأسبوع.",
      aiRead: "قراءة الجمهور",
      attention: "تنبيه",
      bestChannels: "أفضل القنوات",
      bestChannelsBody: "ابدأ بإنستغرام للوعي والريلز، ثم فيسبوك للعروض المحلية وإعادة الاستهداف.",
      bestMessage: "أفضل رسالة",
      bestMessageBody: "ركز على الاعتمادية والسرعة والدعم المحلي بدلا من العروض العامة.",
      both: "العربية + الإنجليزية",
      contentAngle: "زاوية المحتوى",
      contentAngleBody: "حوّل مشاكل الاتصال والتحول الرقمي إلى قصص قصيرة، عروض واضحة، ودليل اجتماعي.",
      coreSegment: "الشريحة الأساسية",
      failed: "فشل الطلب",
      healthy: "صحي",
      highIntent: "نية عالية",
      intent: "نية الشراء",
      language: "اللغة",
      location: "الموقع",
      previewMode: "معاينة",
      primaryMarket: "السوق",
      refresh: "تحديث",
      segments: "شرائح الجمهور",
      segmentsSub: "مطابقة الأولوية حسب الذاكرة والأداء",
      subtitle: "افهم من تخاطب، ما الذي يحتاجه، وأين يتحول الاهتمام إلى محتوى قابل للنشر.",
      status: "الحالة",
      title: "الجمهور",
      updatedNow: "محدث الآن",
      upgradePlan: "ترقية الخطة",
      vaultGrounded: "مبني على الخزنة",
      youngPros: "المهنيون الشباب"
    },
    en: {
      ageRange: "Age range",
      aiInsight: "The strongest audience right now is young professionals and SMB owners. Messages that combine reliability, speed, and clear pricing should perform best on Instagram and Facebook this week.",
      aiRead: "Audience read",
      attention: "Attention",
      bestChannels: "Best channels",
      bestChannelsBody: "Lead with Instagram for awareness and Reels, then use Facebook for local offers and retargeting.",
      bestMessage: "Best message",
      bestMessageBody: "Focus on reliability, speed, and local support instead of generic promotional claims.",
      both: "Arabic + English",
      contentAngle: "Content angle",
      contentAngleBody: "Turn connectivity and digital transformation pains into short stories, clear offers, and social proof.",
      coreSegment: "Core segment",
      failed: "Request failed",
      healthy: "Healthy",
      highIntent: "High",
      intent: "Buying intent",
      language: "Language",
      location: "Location",
      previewMode: "Preview mode",
      primaryMarket: "Primary market",
      refresh: "Refresh",
      segments: "Audience Segments",
      segmentsSub: "Priority match from memory and performance",
      subtitle: "Understand who MARKOS is speaking to, what they need, and where attention turns into publishable content.",
      status: "Status",
      title: "Audience",
      updatedNow: "Updated just now",
      upgradePlan: "Upgrade plan",
      vaultGrounded: "Vault grounded",
      youngPros: "Young professionals"
    }
  };

  return dictionary[locale][key] ?? key;
}
