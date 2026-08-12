"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CircleCheck,
  Compass,
  Globe2,
  Instagram,
  Lightbulb,
  Lock,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Wand2
} from "lucide-react";
import type { Locale } from "@markos/shared-types";
import styles from "./marketing-landing.module.css";

type WorkspaceKey = "plan" | "create" | "publish" | "insights";
type FooterLinkKey = "capabilities" | "how" | "insights" | "plans" | "faq" | "contact" | "terms" | "privacy";

const workspaceIcons: Record<WorkspaceKey, LucideIcon> = {
  plan: Compass,
  create: Wand2,
  publish: Send,
  insights: BarChart3
};

const capabilityIcons: Record<WorkspaceKey, LucideIcon> = {
  plan: Target,
  create: Wand2,
  publish: CalendarDays,
  insights: BarChart3
};

const copyByLocale = {
  en: {
    brand: "MARKOS AI",
    nav: {
      capabilities: "What it does",
      how: "How it works",
      insights: "Insights",
      plans: "Plans"
    },
    actions: {
      getStarted: "Start free",
      login: "Log in",
      seeHow: "See how it works",
      viewPlans: "View plans"
    },
    hero: {
      headlineLead: "Get the help you need with",
      headlineAccent: "Instagram marketing.",
      body: "MARKOS can step in for one task or stay involved across planning, content, publishing, and insights.",
      assurances: ["Arabic and English", "Built for Bahrain businesses", "You approve what goes live"]
    },
    workspace: {
      label: "MARKOS workspace",
      tourLabel: "Explore the workflow",
      tabListLabel: "Explore MARKOS capabilities",
      footer: "Use MARKOS for the whole workflow or only the task in front of you.",
      tabs: [
        {
          key: "plan",
          label: "Plan",
          title: "Turn a goal into a workable plan.",
          items: [
            { label: "Set the goal", value: "Choose the business priority." },
            { label: "Build the direction", value: "MARKOS organises the next four weeks." },
            { label: "Review the plan", value: "Adjust priorities before content begins." }
          ]
        },
        {
          key: "create",
          label: "Create",
          title: "Move from direction to approved content.",
          items: [
            { label: "Explore ideas", value: "Start with options tied to the plan." },
            { label: "Prepare drafts", value: "Review captions and visual directions." },
            { label: "Approve the work", value: "Edit or approve each post." }
          ]
        },
        {
          key: "publish",
          label: "Publish",
          title: "Keep approved content moving.",
          items: [
            { label: "Ready", value: "Only approved work enters the schedule." },
            { label: "Scheduled", value: "See what is going out and when." },
            { label: "Live", value: "Keep track of published content." }
          ]
        },
        {
          key: "insights",
          label: "Insights",
          title: "Understand what changed.",
          items: [
            { label: "Collect", value: "Bring Instagram performance into one view." },
            { label: "Explain", value: "Turn the data into a clear takeaway." },
            { label: "Adjust", value: "Apply the insight to the next plan." }
          ]
        }
      ]
    },
    capabilities: {
      title: "What MARKOS can handle",
      items: [
        { key: "plan", title: "Planning", body: "Build a focused plan around your goals, offers, and audience." },
        { key: "create", title: "Content", body: "Prepare ideas, captions, visual directions, and campaigns." },
        { key: "publish", title: "Publishing", body: "Review, approve, and schedule content for Instagram." },
        { key: "insights", title: "Insights", body: "See what is working and what MARKOS recommends next." }
      ]
    },
    how: {
      title: "How MARKOS works",
      steps: [
        { title: "Add your business", body: "Share your goals, audience, offers, and brand voice." },
        { title: "Review the plan", body: "MARKOS turns that context into priorities and a workable schedule." },
        { title: "Approve the work", body: "Edit content, set guardrails, and decide what is ready." },
        { title: "Use the insights", body: "See what changed and carry it into the next plan." }
      ]
    },
    example: {
      label: "Illustrative example",
      title: "A month with a Bahrain café.",
      workspaceLabel: "Sample workspace",
      businessName: "Harbour Coffee",
      goalLabel: "Business goal",
      goal: "Bring more people in during weekday afternoons.",
      planLabel: "Content plan",
      content: [
        { title: "Founder story", format: "Reel" },
        { title: "The afternoon ritual", format: "Carousel" },
        { title: "Midweek offer", format: "Story" }
      ],
      insightsLabel: "Insights",
      exampleData: "Example data",
      chartTitle: "Weekly reach",
      chartDescription: "Reach rises from week one to week two, dips slightly in week three, and reaches its highest point in week four.",
      weeks: ["Week 1", "Week 2", "Week 3", "Week 4"],
      comparisonTitle: "What reached more people",
      comparison: [
        { label: "Founder stories", size: 88, accessible: "highest in this illustrative comparison" },
        { label: "Afternoon ritual", size: 68, accessible: "second in this illustrative comparison" },
        { label: "Offer posts", size: 48, accessible: "third in this illustrative comparison" }
      ],
      insightTitle: "What MARKOS noticed",
      insightBody: "Founder-led content reached more people than offer-led posts in this example.",
      nextLabel: "Next step",
      nextBody: "Keep one founder story in next week’s plan and test a shorter opening."
    },
    trust: {
      title: "You decide what goes live.",
      body: "Set what MARKOS can do, what needs approval, and what should never change.",
      items: [
        { title: "Review before publishing", body: "Preview the work and decide what is ready." },
        { title: "Edit business knowledge", body: "Update your offers, goals, and brand details at any time." },
        { title: "Manage connections", body: "See which account is connected and when it last synchronised." },
        { title: "Pause and take over", body: "Step into any task whenever you need to." }
      ]
    },
    closing: {
      title: "Start with the help you need.",
      body: "Change how much MARKOS handles whenever you want."
    },
    footer: {
      descriptor: "Instagram marketing support for Bahrain businesses.",
      poweredBy: "Powered by Ra'edat Software",
      groups: [
        {
          title: "Product",
          links: [
            { key: "capabilities", label: "What it does" },
            { key: "how", label: "How it works" },
            { key: "insights", label: "Insights" },
            { key: "plans", label: "Plans" }
          ]
        },
        {
          title: "Help",
          links: [
            { key: "faq", label: "FAQs" },
            { key: "contact", label: "Contact" }
          ]
        },
        {
          title: "Legal",
          links: [
            { key: "terms", label: "Terms of Service" },
            { key: "privacy", label: "Privacy Policy" }
          ]
        }
      ],
      copyright: "© 2026 Ra'edat Software L.L.C."
    }
  },
  ar: {
    brand: "MARKOS AI",
    nav: {
      capabilities: "ما الذي يقدمه",
      how: "كيف يعمل",
      insights: "الرؤى",
      plans: "الباقات"
    },
    actions: {
      getStarted: "ابدأ مجانًا",
      login: "تسجيل الدخول",
      seeHow: "اكتشف كيف يعمل",
      viewPlans: "عرض الباقات"
    },
    hero: {
      headlineLead: "احصل على الدعم الذي تحتاجه",
      headlineAccent: "لتسويق عملك على إنستغرام.",
      body: "يمكن لـ MARKOS مساعدتك في مهمة واحدة أو متابعة التخطيط والمحتوى والنشر والرؤى معك.",
      assurances: ["العربية والإنجليزية", "مصمم لأعمال البحرين", "أنت تعتمد ما يتم نشره"]
    },
    workspace: {
      label: "مساحة عمل MARKOS",
      tourLabel: "استكشف سير العمل",
      tabListLabel: "استكشف إمكانات MARKOS",
      footer: "استعن بـ MARKOS في سير العمل كاملًا أو في المهمة التي أمامك فقط.",
      tabs: [
        {
          key: "plan",
          label: "خطّط",
          title: "حوّل الهدف إلى خطة قابلة للتنفيذ.",
          items: [
            { label: "حدد الهدف", value: "اختر أولوية العمل." },
            { label: "ابنِ الاتجاه", value: "ينظم MARKOS الأسابيع الأربعة القادمة." },
            { label: "راجع الخطة", value: "عدّل الأولويات قبل بدء إعداد المحتوى." }
          ]
        },
        {
          key: "create",
          label: "أنشئ",
          title: "حوّل الاتجاه إلى محتوى معتمد.",
          items: [
            { label: "استكشف الأفكار", value: "ابدأ بخيارات مرتبطة بالخطة." },
            { label: "جهّز المسودات", value: "راجع النصوص والتوجيهات المرئية." },
            { label: "اعتمد العمل", value: "عدّل كل منشور أو اعتمده." }
          ]
        },
        {
          key: "publish",
          label: "انشر",
          title: "حافظ على استمرارية المحتوى المعتمد.",
          items: [
            { label: "جاهز", value: "لا يدخل الجدول إلا العمل المعتمد." },
            { label: "مجدول", value: "اعرف ما سيتم نشره وموعده." },
            { label: "منشور", value: "تابع المحتوى الذي نُشر." }
          ]
        },
        {
          key: "insights",
          label: "الرؤى",
          title: "افهم ما الذي تغير.",
          items: [
            { label: "اجمع", value: "شاهد أداء إنستغرام في مكان واحد." },
            { label: "افهم", value: "حوّل البيانات إلى خلاصة واضحة." },
            { label: "عدّل", value: "استخدم الرؤية في الخطة التالية." }
          ]
        }
      ]
    },
    capabilities: {
      title: "ما الذي يمكن لـ MARKOS تولّيه",
      items: [
        { key: "plan", title: "التخطيط", body: "ابنِ خطة مركزة حول أهدافك وعروضك وجمهورك." },
        { key: "create", title: "المحتوى", body: "جهّز الأفكار والنصوص والتوجيهات المرئية والحملات." },
        { key: "publish", title: "النشر", body: "راجع المحتوى واعتمده وجدوله على إنستغرام." },
        { key: "insights", title: "الرؤى", body: "اعرف ما الذي ينجح وما الذي يوصي به MARKOS لاحقًا." }
      ]
    },
    how: {
      title: "كيف يعمل MARKOS",
      steps: [
        { title: "أضف معلومات عملك", body: "شارك أهدافك وجمهورك وعروضك وصوت علامتك." },
        { title: "راجع الخطة", body: "يحوّل MARKOS هذه المعلومات إلى أولويات وجدول قابل للتنفيذ." },
        { title: "اعتمد العمل", body: "عدّل المحتوى وحدد الضوابط وقرر ما أصبح جاهزًا." },
        { title: "استفد من الرؤى", body: "اعرف ما الذي تغير واستخدمه في الخطة التالية." }
      ]
    },
    example: {
      label: "مثال توضيحي",
      title: "شهر مع مقهى بحريني.",
      workspaceLabel: "مساحة عمل افتراضية",
      businessName: "Harbour Coffee",
      goalLabel: "هدف العمل",
      goal: "زيادة الزيارات خلال فترة ما بعد الظهر في أيام الأسبوع.",
      planLabel: "خطة المحتوى",
      content: [
        { title: "قصة المؤسس", format: "ريل" },
        { title: "طقوس ما بعد الظهر", format: "منشور متسلسل" },
        { title: "عرض منتصف الأسبوع", format: "ستوري" }
      ],
      insightsLabel: "الرؤى",
      exampleData: "بيانات توضيحية",
      chartTitle: "الوصول الأسبوعي",
      chartDescription: "يرتفع الوصول من الأسبوع الأول إلى الثاني، وينخفض قليلًا في الثالث، ثم يبلغ أعلى مستوى في الأسبوع الرابع.",
      weeks: ["الأسبوع 1", "الأسبوع 2", "الأسبوع 3", "الأسبوع 4"],
      comparisonTitle: "المحتوى الذي وصل إلى عدد أكبر",
      comparison: [
        { label: "قصص المؤسس", size: 88, accessible: "الأعلى في هذه المقارنة التوضيحية" },
        { label: "طقوس ما بعد الظهر", size: 68, accessible: "الثاني في هذه المقارنة التوضيحية" },
        { label: "منشورات العروض", size: 48, accessible: "الثالث في هذه المقارنة التوضيحية" }
      ],
      insightTitle: "ما الذي لاحظه MARKOS",
      insightBody: "وصل المحتوى الذي يقوده المؤسس إلى عدد أكبر من منشورات العروض في هذا المثال.",
      nextLabel: "الخطوة التالية",
      nextBody: "احتفظ بقصة واحدة للمؤسس في خطة الأسبوع القادم واختبر افتتاحية أقصر."
    },
    trust: {
      title: "أنت تقرر ما يتم نشره.",
      body: "حدد ما يمكن لـ MARKOS تنفيذه، وما يحتاج إلى اعتمادك، وما يجب ألا يتغير.",
      items: [
        { title: "راجع قبل النشر", body: "عاين العمل وحدد ما أصبح جاهزًا." },
        { title: "عدّل معلومات العمل", body: "حدّث عروضك وأهدافك وتفاصيل علامتك في أي وقت." },
        { title: "أدِر الاتصالات", body: "اعرف الحساب المتصل وموعد آخر مزامنة." },
        { title: "أوقف العمل وتولّه", body: "تدخل في أي مهمة متى احتجت إلى ذلك." }
      ]
    },
    closing: {
      title: "ابدأ بالدعم الذي تحتاجه.",
      body: "غيّر مقدار ما يتولاه MARKOS متى شئت."
    },
    footer: {
      descriptor: "دعم لتسويق أعمال البحرين على إنستغرام.",
      poweredBy: "من تطوير Ra'edat Software",
      groups: [
        {
          title: "المنتج",
          links: [
            { key: "capabilities", label: "ما الذي يقدمه" },
            { key: "how", label: "كيف يعمل" },
            { key: "insights", label: "الرؤى" },
            { key: "plans", label: "الباقات" }
          ]
        },
        {
          title: "المساعدة",
          links: [
            { key: "faq", label: "الأسئلة الشائعة" },
            { key: "contact", label: "تواصل معنا" }
          ]
        },
        {
          title: "القانونية",
          links: [
            { key: "terms", label: "شروط الخدمة" },
            { key: "privacy", label: "سياسة الخصوصية" }
          ]
        }
      ],
      copyright: "© 2026 Ra'edat Software L.L.C."
    }
  }
} as const;

export function MarketingLanding({ locale }: { locale: Locale }) {
  const copy = copyByLocale[locale];
  const isArabic = locale === "ar";
  const localeHref = isArabic ? "/en" : "/ar";
  const localeLabel = isArabic ? "English" : "العربية";
  const signupHref = `/${locale}/signup`;
  const loginHref = `/${locale}/login`;
  const plansHref = `/${locale}/plans`;
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceKey>("plan");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeTab = copy.workspace.tabs.find((tab) => tab.key === activeWorkspace) ?? copy.workspace.tabs[0];
  const ActiveWorkspaceIcon = workspaceIcons[activeTab.key];
  const footerHrefs: Record<FooterLinkKey, string> = {
    capabilities: "#capabilities",
    how: "#how",
    insights: "#example",
    plans: plansHref,
    faq: `/${locale}/faq`,
    contact: `/${locale}/contact`,
    terms: `/${locale}/terms`,
    privacy: `/${locale}/privacy`
  };

  function activateWorkspaceTab(index: number) {
    const nextTab = copy.workspace.tabs[index];
    if (!nextTab) return;

    setActiveWorkspace(nextTab.key);
    tabRefs.current[index]?.focus();
  }

  function handleWorkspaceKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    const lastIndex = copy.workspace.tabs.length - 1;

    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;
    if (event.key === "ArrowRight") nextIndex = (index + (isArabic ? -1 : 1) + copy.workspace.tabs.length) % copy.workspace.tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index + (isArabic ? 1 : -1) + copy.workspace.tabs.length) % copy.workspace.tabs.length;

    if (nextIndex === null) return;
    event.preventDefault();
    activateWorkspaceTab(nextIndex);
  }

  return (
    <main className={`sunlit-theme ${styles.marketingPage}`} data-marketing-page="sunlit-social-studio" dir={isArabic ? "rtl" : "ltr"} lang={locale}>
      <a className={styles.skipLink} href="#marketing-content">
        {isArabic ? "انتقل إلى المحتوى" : "Skip to content"}
      </a>

      <div className={styles.siteShell} id="marketing-content">
        <header className={`${styles.container} ${styles.header}`}>
          <a className={styles.brand} href={`/${locale}`} aria-label={copy.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <Sparkles size={21} strokeWidth={2.4} />
            </span>
            <strong>{copy.brand}</strong>
          </a>

          <nav className={styles.desktopNav} aria-label={isArabic ? "التنقل في الصفحة" : "Landing page navigation"}>
            <a href="#capabilities">{copy.nav.capabilities}</a>
            <a href="#how">{copy.nav.how}</a>
            <a href="#example">{copy.nav.insights}</a>
            <a href={plansHref}>{copy.nav.plans}</a>
          </nav>

          <div className={styles.headerActions}>
            <a className={styles.languageLink} href={localeHref}>
              <Globe2 aria-hidden="true" size={18} />
              <span>{localeLabel}</span>
            </a>
            <a className={styles.loginLink} href={loginHref}>
              {copy.actions.login}
            </a>
            <a className={`${styles.button} ${styles.buttonDark} ${styles.headerCta}`} href={signupHref}>
              {copy.actions.getStarted}
            </a>
          </div>
        </header>

        <section className={`${styles.container} ${styles.hero}`}>
          <div className={styles.heroGlowCoral} aria-hidden="true" />
          <div className={styles.heroGlowAqua} aria-hidden="true" />

          <div className={styles.heroCopy}>
            <span className={styles.heroIcon} aria-hidden="true">
              <Instagram size={22} />
            </span>
            <h1>
              {copy.hero.headlineLead} <span>{copy.hero.headlineAccent}</span>
            </h1>
            <p className={styles.heroBody}>{copy.hero.body}</p>
            <div className={styles.heroActions}>
              <a className={`${styles.button} ${styles.buttonPrimary}`} href={signupHref}>
                {copy.actions.getStarted}
                <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={19} />
              </a>
              <a className={`${styles.button} ${styles.buttonSecondary}`} href="#how">
                {copy.actions.seeHow}
              </a>
            </div>
            <ul className={styles.assuranceList} aria-label={isArabic ? "مزايا أساسية" : "Key assurances"}>
              {copy.hero.assurances.map((assurance) => (
                <li key={assurance}>
                  <CircleCheck aria-hidden="true" size={18} />
                  {assurance}
                </li>
              ))}
            </ul>
          </div>

          <figure className={styles.workspace} aria-label={copy.workspace.tourLabel}>
            <figcaption className={styles.workspaceHeader}>
              <span className={styles.workspaceBrand}>
                <span aria-hidden="true">
                  <Sparkles size={17} />
                </span>
                {copy.workspace.label}
              </span>
              <span className={styles.workspaceTour}>{copy.workspace.tourLabel}</span>
            </figcaption>

            <div className={styles.workspaceTabs} role="tablist" aria-label={copy.workspace.tabListLabel}>
              {copy.workspace.tabs.map((tab, index) => {
                const Icon = workspaceIcons[tab.key];
                const selected = tab.key === activeWorkspace;
                const tabId = `workspace-${tab.key}-tab`;
                const panelId = `workspace-${tab.key}-panel`;

                return (
                  <button
                    aria-controls={panelId}
                    aria-selected={selected}
                    className={styles.workspaceTab}
                    data-active={selected ? "true" : "false"}
                    id={tabId}
                    key={tab.key}
                    onClick={() => setActiveWorkspace(tab.key)}
                    onKeyDown={(event) => handleWorkspaceKeyDown(event, index)}
                    ref={(node) => {
                      tabRefs.current[index] = node;
                    }}
                    role="tab"
                    tabIndex={selected ? 0 : -1}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={18} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div
              aria-labelledby={`workspace-${activeTab.key}-tab`}
              className={styles.workspacePanel}
              id={`workspace-${activeTab.key}-panel`}
              key={activeTab.key}
              role="tabpanel"
              tabIndex={0}
            >
              <div className={styles.workspacePanelHeading}>
                <span aria-hidden="true">
                  <ActiveWorkspaceIcon size={27} />
                </span>
                <h2>{activeTab.title}</h2>
              </div>
              <ol className={styles.workspaceItems}>
                {activeTab.items.map((item, index) => (
                  <li key={item.label}>
                    <span className={styles.workspaceItemNumber}>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.value}</span>
                    </div>
                    <Check aria-hidden="true" size={18} />
                  </li>
                ))}
              </ol>
              <p className={styles.workspaceFooter}>
                <Sparkles aria-hidden="true" size={17} />
                {copy.workspace.footer}
              </p>
            </div>
          </figure>
        </section>

        <section className={`${styles.container} ${styles.capabilitiesSection}`} id="capabilities">
          <div className={styles.sectionHeading}>
            <h2>{copy.capabilities.title}</h2>
          </div>
          <div className={styles.capabilityGrid}>
            {copy.capabilities.items.map((item, index) => {
              const Icon = capabilityIcons[item.key];
              return (
                <article className={styles.capabilityCard} data-position={index} key={item.key}>
                  <span className={styles.capabilityIcon} aria-hidden="true">
                    <Icon size={23} />
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.howSection} id="how">
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <h2>{copy.how.title}</h2>
            </div>
            <ol className={styles.steps}>
              {copy.how.steps.map((step, index) => (
                <li key={step.title}>
                  <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={`${styles.container} ${styles.exampleSection}`} id="example">
          <div className={styles.exampleHeading}>
            <span>{copy.example.label}</span>
            <h2>{copy.example.title}</h2>
          </div>

          <article className={styles.exampleBoard}>
            <div className={styles.exampleBrief}>
              <header>
                <span>{copy.example.workspaceLabel}</span>
                <strong>{copy.example.businessName}</strong>
              </header>
              <div className={styles.goalCard}>
                <span className={styles.exampleIcon} aria-hidden="true">
                  <Target size={21} />
                </span>
                <div>
                  <small>{copy.example.goalLabel}</small>
                  <p>{copy.example.goal}</p>
                </div>
              </div>
              <div className={styles.contentPlan}>
                <h3>{copy.example.planLabel}</h3>
                <ul>
                  {copy.example.content.map((item, index) => (
                    <li key={item.title}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{item.title}</strong>
                      <small>{item.format}</small>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={styles.exampleInsights}>
              <header className={styles.insightsHeader}>
                <span>
                  <BarChart3 aria-hidden="true" size={21} />
                  {copy.example.insightsLabel}
                </span>
                <strong>{copy.example.exampleData}</strong>
              </header>

              <div className={styles.chartCard}>
                <h3>{copy.example.chartTitle}</h3>
                <svg
                  aria-labelledby={`example-chart-title-${locale} example-chart-description-${locale}`}
                  className={styles.lineChart}
                  role="img"
                  viewBox="0 0 520 190"
                >
                  <title id={`example-chart-title-${locale}`}>{copy.example.chartTitle}</title>
                  <desc id={`example-chart-description-${locale}`}>{copy.example.chartDescription}</desc>
                  <line x1="18" x2="502" y1="156" y2="156" />
                  <line x1="18" x2="502" y1="104" y2="104" />
                  <line x1="18" x2="502" y1="52" y2="52" />
                  <path d="M26 142 C95 134 118 90 178 92 C236 94 272 118 326 101 C388 80 420 46 494 35" />
                  <circle cx="26" cy="142" r="6" />
                  <circle cx="178" cy="92" r="6" />
                  <circle cx="326" cy="101" r="6" />
                  <circle cx="494" cy="35" r="6" />
                </svg>
                <div className={styles.chartLabels} aria-hidden="true">
                  {copy.example.weeks.map((week) => (
                    <span key={week}>{week}</span>
                  ))}
                </div>
              </div>

              <div className={styles.comparisonCard}>
                <h3>{copy.example.comparisonTitle}</h3>
                <ul>
                  {copy.example.comparison.map((item) => (
                    <li aria-label={`${item.label}: ${item.accessible}`} key={item.label}>
                      <span>{item.label}</span>
                      <div aria-hidden="true">
                        <i style={{ "--bar-size": `${item.size}%` } as CSSProperties} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.insightCard}>
                <span className={styles.exampleIcon} aria-hidden="true">
                  <Lightbulb size={21} />
                </span>
                <div>
                  <small>{copy.example.insightTitle}</small>
                  <p>{copy.example.insightBody}</p>
                  <strong>{copy.example.nextLabel}</strong>
                  <span>{copy.example.nextBody}</span>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className={styles.trustSection} id="control">
          <div className={styles.container}>
            <div className={styles.trustHeading}>
              <h2>{copy.trust.title}</h2>
              <p>{copy.trust.body}</p>
            </div>
            <div className={styles.trustGrid}>
              {copy.trust.items.map((item, index) => {
                const icons = [ShieldCheck, Lightbulb, Lock, Check] as const;
                const Icon = icons[index] ?? Check;
                return (
                  <article key={item.title}>
                    <Icon aria-hidden="true" size={23} />
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className={`${styles.container} ${styles.closingSection}`}>
          <div>
            <h2>{copy.closing.title}</h2>
            <p>{copy.closing.body}</p>
          </div>
          <div className={styles.closingActions}>
            <a className={`${styles.button} ${styles.buttonLight}`} href={signupHref}>
              {copy.actions.getStarted}
              <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={19} />
            </a>
            <a className={`${styles.button} ${styles.buttonGhostLight}`} href={plansHref}>
              {copy.actions.viewPlans}
            </a>
          </div>
        </section>

        <footer className={styles.footer} id="footer">
          <div className={`${styles.container} ${styles.footerMain}`}>
            <div className={styles.footerBrand}>
              <a className={styles.brand} href={`/${locale}`} aria-label={copy.brand}>
                <span className={styles.brandMark} aria-hidden="true">
                  <Sparkles size={21} strokeWidth={2.4} />
                </span>
                <strong>{copy.brand}</strong>
              </a>
              <p>{copy.footer.descriptor}</p>
              <span>{copy.footer.poweredBy}</span>
            </div>

            {copy.footer.groups.map((group) => (
              <nav aria-label={group.title} className={styles.footerGroup} key={group.title}>
                <h2>{group.title}</h2>
                {group.links.map((link) => (
                  <a href={footerHrefs[link.key]} key={link.key}>
                    {link.label}
                  </a>
                ))}
              </nav>
            ))}
          </div>

          <div className={`${styles.container} ${styles.footerBottom}`}>
            <span>{copy.footer.copyright}</span>
            <a className={styles.footerLanguage} href={localeHref}>
              <Globe2 aria-hidden="true" size={17} />
              {localeLabel}
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
