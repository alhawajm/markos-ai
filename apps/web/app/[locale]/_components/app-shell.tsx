import type { ReactNode } from "react";
import {
  BarChart3,
  CalendarClock,
  Database,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  Workflow
} from "lucide-react";
import { t } from "@markos/i18n";
import type { Locale } from "@markos/shared-types";
import { ContentPanel } from "./content-panel";
import { OnboardingPanel } from "./onboarding-panel";
import { SchedulePanel } from "./schedule-panel";
import { StrategyPanel } from "./strategy-panel";
import { VaultPanel } from "./vault-panel";

export type SectionSlug =
  | "dashboard"
  | "vault"
  | "strategy"
  | "content"
  | "schedule"
  | "analytics"
  | "ai"
  | "settings";

const navItems: Array<{
  slug: SectionSlug;
  labelKey:
    | "nav.dashboard"
    | "nav.vault"
    | "nav.strategy"
    | "nav.content"
    | "nav.schedule"
    | "nav.analytics"
    | "nav.ai"
    | "nav.settings";
}> = [
  { slug: "dashboard", labelKey: "nav.dashboard" },
  { slug: "vault", labelKey: "nav.vault" },
  { slug: "strategy", labelKey: "nav.strategy" },
  { slug: "content", labelKey: "nav.content" },
  { slug: "schedule", labelKey: "nav.schedule" },
  { slug: "analytics", labelKey: "nav.analytics" },
  { slug: "ai", labelKey: "nav.ai" },
  { slug: "settings", labelKey: "nav.settings" }
];

const sectionContent: Record<
  SectionSlug,
  {
    icon: ReactNode;
    eyebrow: { ar: string; en: string };
    title: { ar: string; en: string };
    subtitle: { ar: string; en: string };
    cards: Array<{
      icon: ReactNode;
      title: { ar: string; en: string };
      body: { ar: string; en: string };
    }>;
  }
> = {
  dashboard: {
    icon: <LayoutDashboard size={22} />,
    eyebrow: { ar: "مرحلة التأسيس", en: "Foundation phase" },
    title: { ar: "نظام التسويق الذكي", en: "AI Marketing Operating System" },
    subtitle: {
      ar: "ابدأ من الأساس: مساحة عمل آمنة، ذاكرة أعمال، وتجربة عربية من الشاشة الأولى.",
      en: "Foundation first: secure workspace, business memory, and Arabic-ready UX from screen one."
    },
    cards: [
      {
        icon: <ShieldCheck size={22} />,
        title: { ar: "عزل مساحات العمل", en: "Workspace Isolation" },
        body: {
          ar: "كل بيانات العميل مرتبطة بمساحة عمل واحدة، مع اختبارات تمنع أي تسرب بين العملاء.",
          en: "Every customer-owned record is workspace-scoped, with tests proving tenant isolation."
        }
      },
      {
        icon: <Database size={22} />,
        title: { ar: "الخزنة المعرفية", en: "Knowledge Vault" },
        body: {
          ar: "الأساس القادم: تخزين إجابات التهيئة وتحويلها إلى ذاكرة قابلة للاسترجاع.",
          en: "Next spine: store onboarding answers and make them retrievable business memory."
        }
      },
      {
        icon: <Sparkles size={22} />,
        title: { ar: "العربية والإنجليزية", en: "Arabic And English" },
        body: {
          ar: "اتجاه RTL ومسارات لغوية منذ أول شاشة، وليس كإضافة لاحقة.",
          en: "RTL direction and localized routing from the first screen, not as a later patch."
        }
      }
    ]
  },
  vault: {
    icon: <Database size={22} />,
    eyebrow: { ar: "M1 القادم", en: "Next M1 spine" },
    title: { ar: "الخزنة المعرفية", en: "Knowledge Vault" },
    subtitle: {
      ar: "ستحفظ إجابات التهيئة، الإرشادات، والأداء كذاكرة دائمة لكل مساحة عمل.",
      en: "Onboarding answers, brand rules, and performance data become durable memory for each workspace."
    },
    cards: [
      {
        icon: <FileText size={22} />,
        title: { ar: "أقسام منظمة", en: "Structured Sections" },
        body: {
          ar: "الشركة، القصة، المنتجات، الجمهور، المنافسون، الهوية، النبرة، والأهداف.",
          en: "Company, story, products, audience, competitors, brand, tone, and objectives."
        }
      },
      {
        icon: <Workflow size={22} />,
        title: { ar: "RAG قبل الوكلاء", en: "RAG Before Agents" },
        body: {
          ar: "كل وكيل يحتاج استرجاع سياق العمل قبل توليد أي استراتيجية أو محتوى.",
          en: "Every agent needs grounded business context before strategy or content generation."
        }
      }
    ]
  },
  strategy: {
    icon: <Target size={22} />,
    eyebrow: { ar: "وكيل الاستراتيجية", en: "Strategist Agent" },
    title: { ar: "الاستراتيجية", en: "Strategy" },
    subtitle: {
      ar: "استراتيجية 30/60/90 يوم، ركائز محتوى، وخطة نمو مبنية على الخزنة.",
      en: "30/60/90-day strategy, content pillars, and growth direction grounded in the Vault."
    },
    cards: [
      {
        icon: <Sparkles size={22} />,
        title: { ar: "توليد موجه", en: "Grounded Generation" },
        body: {
          ar: "لا استراتيجية عامة؛ كل مخرجات الوكيل يجب أن تستند إلى سياق العميل.",
          en: "No generic strategy: every output must cite and use workspace business context."
        }
      }
    ]
  },
  content: {
    icon: <FileText size={22} />,
    eyebrow: { ar: "محرك المحتوى", en: "Content Engine" },
    title: { ar: "المحتوى", en: "Content" },
    subtitle: {
      ar: "تقويم، كابشن، هاشتاقات، كاروسيل، سكربت ريل، ومراجعة قبل الجدولة.",
      en: "Calendar, captions, hashtags, carousel copy, reel scripts, and approval workflow."
    },
    cards: [
      {
        icon: <UploadCloud size={22} />,
        title: { ar: "وسائط وصور AI", en: "Media And AI Images" },
        body: {
          ar: "كل توليد صورة أو رفع ملف يجب أن يحترم حدود الخطة والتخزين.",
          en: "Image generation and uploads must respect plan and storage limits from day one."
        }
      }
    ]
  },
  schedule: {
    icon: <CalendarClock size={22} />,
    eyebrow: { ar: "أعلى تكامل مخاطرة", en: "Highest-Risk Integration" },
    title: { ar: "الجدولة والنشر", en: "Scheduling" },
    subtitle: {
      ar: "نشر إنستغرام يحتاج حالة دفاعية: إنشاء حاوية، انتظار المعالجة، ثم النشر.",
      en: "Instagram publishing needs a defensive state machine: container, poll, publish."
    },
    cards: [
      {
        icon: <ShieldCheck size={22} />,
        title: { ar: "حدود إنستغرام", en: "Instagram Limits" },
        body: {
          ar: "الحد اليومي يجب أن يظهر للمستخدم ولا يتم تجاهله بصمت.",
          en: "The daily account cap must be visible to users and never silently ignored."
        }
      }
    ]
  },
  analytics: {
    icon: <BarChart3 size={22} />,
    eyebrow: { ar: "حلقة التعلم", en: "Learning Loop" },
    title: { ar: "التحليلات", en: "Analytics" },
    subtitle: {
      ar: "المقاييس ليست لوحة أرقام فقط؛ يجب أن تعود للخزنة لتحسين المحتوى القادم.",
      en: "Metrics are not just reporting; they feed the Vault so future content improves."
    },
    cards: [
      {
        icon: <MessageSquareText size={22} />,
        title: { ar: "تفسير AI", en: "AI Interpretation" },
        body: {
          ar: "المستخدم يحتاج معنى واضحاً: ماذا حدث، لماذا، وماذا يفعل بعدها.",
          en: "Users need plain meaning: what happened, why it matters, and what to do next."
        }
      }
    ]
  },
  ai: {
    icon: <MessageSquareText size={22} />,
    eyebrow: { ar: "المستشار الذكي", en: "AI Consultant" },
    title: { ar: "المستشار الذكي", en: "AI Consultant" },
    subtitle: {
      ar: "محادثة وتوصيات مبنية على الخزنة، المحتوى، والتحليلات.",
      en: "Chat and recommendations grounded in Vault data, content history, and analytics."
    },
    cards: [
      {
        icon: <Sparkles size={22} />,
        title: { ar: "مفسر وقابل للتنفيذ", en: "Explainable Actions" },
        body: {
          ar: "كل توصية تحتاج سبباً واضحاً وخطوة عملية.",
          en: "Every recommendation needs a clear reason and a concrete next action."
        }
      }
    ]
  },
  settings: {
    icon: <Settings size={22} />,
    eyebrow: { ar: "إدارة مساحة العمل", en: "Workspace Operations" },
    title: { ar: "الإعدادات", en: "Settings" },
    subtitle: {
      ar: "الحساب، مساحة العمل، إنستغرام، الفوترة، الفريق، والتنبيهات.",
      en: "Account, workspace, Instagram connection, billing, team, and notifications."
    },
    cards: [
      {
        icon: <ShieldCheck size={22} />,
        title: { ar: "الأمان أولاً", en: "Security First" },
        body: {
          ar: "أدوار، صلاحيات، MFA للأدوار الحساسة، وتدقيق للأعمال الإدارية.",
          en: "Roles, permissions, MFA for sensitive roles, and audit logs for admin actions."
        }
      }
    ]
  }
};

export function AppShell({ locale, activeSection }: { locale: Locale; activeSection: SectionSlug }) {
  const content = sectionContent[activeSection];

  return (
    <main className="min-h-screen bg-canvas text-navy">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-border bg-card px-5 py-5 lg:border-b-0 lg:border-e">
          <a className="flex items-center gap-3" href={`/${locale}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-card bg-accent/10 text-accent">
              <Sparkles size={22} strokeWidth={1.7} />
            </div>
            <div>
              <p className="text-sm font-semibold">{t(locale, "app.name")}</p>
              <p className="text-xs text-muted">{t(locale, "status.foundation")}</p>
            </div>
          </a>

          <nav className="mt-8 grid gap-1" aria-label="Primary">
            {navItems.map((item) => {
              const isActive = item.slug === activeSection;
              const href = item.slug === "dashboard" ? `/${locale}` : `/${locale}/${item.slug}`;

              return (
                <a
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "rounded-button bg-midnavy px-3 py-2 text-sm text-white transition"
                      : "rounded-button px-3 py-2 text-sm text-muted transition hover:bg-navy/5 hover:text-navy"
                  }
                  href={href}
                  key={item.slug}
                >
                  {t(locale, item.labelKey)}
                </a>
              );
            })}
          </nav>
        </aside>

        <section className="px-5 py-6 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-accent">
                  {content.icon}
                  <span>{content.eyebrow[locale]}</span>
                </div>
                <h1 className="mt-2 text-3xl font-bold tracking-normal text-navy">{content.title[locale]}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{content.subtitle[locale]}</p>
              </div>
              <div className="flex gap-2">
                <a className="rounded-button border border-border bg-card px-3 py-2 text-sm" href={localizedHref("ar", activeSection)}>
                  العربية
                </a>
                <a className="rounded-button border border-border bg-card px-3 py-2 text-sm" href={localizedHref("en", activeSection)}>
                  English
                </a>
              </div>
            </header>

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {content.cards.map((card) => (
                <FoundationCard body={card.body[locale]} icon={card.icon} key={card.title.en} title={card.title[locale]} />
              ))}
            </div>

            {activeSection === "dashboard" ? <OnboardingPanel locale={locale} /> : null}
            {activeSection === "vault" ? <VaultPanel locale={locale} /> : null}
            {activeSection === "strategy" ? <StrategyPanel locale={locale} /> : null}
            {activeSection === "content" ? <ContentPanel locale={locale} /> : null}
            {activeSection === "schedule" ? <SchedulePanel locale={locale} /> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function localizedHref(locale: Locale, section: SectionSlug): string {
  return section === "dashboard" ? `/${locale}` : `/${locale}/${section}`;
}

function FoundationCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <article className="rounded-card border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-card bg-accent/10 text-accent">{icon}</div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </article>
  );
}
