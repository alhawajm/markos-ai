"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CircleUserRound,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Instagram,
  KeyRound,
  LockKeyhole,
  Mail,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import type { Locale } from "@markos/shared-types";
import { SectionNavigation, type SectionNavigationItem } from "./section-navigation";
import styles from "./settings-preview.module.css";

type SettingsSectionId = "account" | "business-profile" | "connections" | "security" | "plan-billing" | "team-data";

const sectionIds: readonly SettingsSectionId[] = ["account", "business-profile", "connections", "security", "plan-billing", "team-data"];

const sectionIcons: Record<SettingsSectionId, LucideIcon> = {
  account: UserRound,
  "business-profile": Building2,
  connections: Instagram,
  security: ShieldCheck,
  "plan-billing": CreditCard,
  "team-data": UsersRound
};

const copyByLocale = {
  en: {
    brand: "MARKOS AI",
    back: "Back to workspace",
    language: "العربية",
    workspace: "Zaina Studio",
    owner: "Owner",
    eyebrow: "Workspace settings",
    title: "Settings",
    menuHeading: "Settings sections",
    mobileMenu: "Section",
    sections: {
      account: {
        title: "Account",
        summary: "Personal details, language, and notifications",
        status: "Up to date"
      },
      "business-profile": {
        title: "Business profile",
        summary: "The business information MARKOS works from",
        status: "Ready"
      },
      connections: {
        title: "Connections",
        summary: "Instagram access and connection health",
        status: "MFA required"
      },
      security: {
        title: "Security",
        summary: "Password, MFA, recovery, and active sessions",
        status: "MFA off"
      },
      "plan-billing": {
        title: "Plan & billing",
        summary: "Subscription, payment details, and invoices",
        status: "Starter"
      },
      "team-data": {
        title: "Team & data",
        summary: "Members, exports, and workspace controls",
        status: "1 member"
      }
    },
    account: {
      details: "Personal details",
      verified: "Email verified",
      fullName: "Full name",
      email: "Email",
      save: "Save changes",
      saved: "Changes saved",
      preferences: "Preferences",
      language: "Workspace language",
      english: "English",
      arabic: "العربية",
      publishing: "Publishing updates",
      publishingBody: "Important scheduling and publishing activity",
      weekly: "Weekly insights",
      weeklyBody: "A short summary when new insights are ready"
    },
    profile: {
      ready: "Profile ready",
      location: "Bahrain",
      category: "Fashion & retail",
      updated: "Updated recently",
      groups: [
        { title: "Business basics", value: "Name, location, and offers" },
        { title: "Audience", value: "Customers and market context" },
        { title: "Brand & voice", value: "Visual direction and tone" },
        { title: "Goals", value: "Current marketing priorities" }
      ],
      action: "Open business profile",
      note: "The full Business Profile will open as its own workspace page."
    },
    connections: {
      locked: "Locked",
      instagram: "Instagram",
      body: "Secure the account before giving MARKOS access to an Instagram professional account.",
      requirements: "Before you connect",
      email: "Email verified",
      mfa: "Set up two-step verification",
      action: "Secure my account",
      after: "Connection controls appear here after the security requirement is complete."
    },
    security: {
      attention: "Action needed",
      mfa: "Two-step verification",
      mfaBody: "Required before connecting Instagram or changing sensitive workspace settings.",
      notEnabled: "Not enabled",
      setup: "Set up MFA",
      closeSteps: "Close setup steps",
      setupTitle: "What you’ll need",
      setupSteps: ["An authenticator app on your phone", "A six-digit code to confirm setup", "A safe place for your recovery codes"],
      setupNote: "The secure QR code appears only after you continue into the protected setup flow.",
      password: "Password",
      passwordValue: "Set",
      changePassword: "Change password",
      sessions: "Active sessions",
      thisDevice: "This device",
      manageSessions: "Manage sessions",
      recovery: "Recovery codes",
      recoveryUnavailable: "Available after MFA is enabled"
    },
    billing: {
      current: "Current plan",
      plan: "Starter",
      monthly: "Monthly",
      price: "BD 18",
      vat: "+ 10% VAT",
      compare: "Compare plans",
      payment: "Payment method",
      paymentValue: "Not added",
      manage: "Manage billing",
      invoices: "Invoices",
      invoicesEmpty: "No invoices yet",
      invoiceBody: "Paid invoices and VAT details will appear here."
    },
    team: {
      members: "Team",
      memberCount: "1 of 1 seat used",
      ownerName: "Mariam Ali",
      ownerEmail: "mariam@zainastudio.com",
      invite: "Invite teammate",
      seatLimit: "The Starter plan includes one seat.",
      data: "Your data",
      dataBody: "Request a workspace export or review advanced data controls.",
      export: "Prepare export",
      exportReady: "Your export request is ready to be prepared.",
      advanced: "Advanced data controls",
      delete: "Delete workspace",
      deleteRequirement: "MFA verification is required before deletion."
    },
    footer: "© 2026 Ra'edat Software L.L.C.",
    terms: "Terms of Service",
    privacy: "Privacy Policy"
  },
  ar: {
    brand: "MARKOS AI",
    back: "العودة إلى مساحة العمل",
    language: "English",
    workspace: "استوديو زينة",
    owner: "المالكة",
    eyebrow: "إعدادات مساحة العمل",
    title: "الإعدادات",
    menuHeading: "أقسام الإعدادات",
    mobileMenu: "القسم",
    sections: {
      account: {
        title: "الحساب",
        summary: "البيانات الشخصية واللغة والإشعارات",
        status: "محدّث"
      },
      "business-profile": {
        title: "ملف العمل",
        summary: "معلومات العمل التي يعتمد عليها MARKOS",
        status: "جاهز"
      },
      connections: {
        title: "الاتصالات",
        summary: "الوصول إلى Instagram وحالة الاتصال",
        status: "يتطلب التحقق بخطوتين"
      },
      security: {
        title: "الأمان",
        summary: "كلمة المرور والتحقق والاسترداد والجلسات",
        status: "التحقق متوقف"
      },
      "plan-billing": {
        title: "الباقة والفوترة",
        summary: "الاشتراك والدفع والفواتير",
        status: "الأساسية"
      },
      "team-data": {
        title: "الفريق والبيانات",
        summary: "الأعضاء والتصدير وضوابط مساحة العمل",
        status: "عضو واحد"
      }
    },
    account: {
      details: "البيانات الشخصية",
      verified: "البريد الإلكتروني موثّق",
      fullName: "الاسم الكامل",
      email: "البريد الإلكتروني",
      save: "حفظ التغييرات",
      saved: "تم حفظ التغييرات",
      preferences: "التفضيلات",
      language: "لغة مساحة العمل",
      english: "English",
      arabic: "العربية",
      publishing: "تحديثات النشر",
      publishingBody: "تنبيهات الجدولة والنشر المهمة",
      weekly: "الرؤى الأسبوعية",
      weeklyBody: "ملخص قصير عند توفر رؤى جديدة"
    },
    profile: {
      ready: "الملف جاهز",
      location: "البحرين",
      category: "الأزياء والتجزئة",
      updated: "تم تحديثه مؤخراً",
      groups: [
        { title: "أساسيات العمل", value: "الاسم والموقع والعروض" },
        { title: "الجمهور", value: "العملاء وسياق السوق" },
        { title: "العلامة والصوت", value: "الاتجاه البصري ونبرة التواصل" },
        { title: "الأهداف", value: "الأولويات التسويقية الحالية" }
      ],
      action: "فتح ملف العمل",
      note: "سيفتح ملف العمل الكامل في صفحة مستقلة داخل مساحة العمل."
    },
    connections: {
      locked: "مقفل",
      instagram: "Instagram",
      body: "أمّن الحساب قبل منح MARKOS صلاحية الوصول إلى حساب Instagram احترافي.",
      requirements: "قبل الاتصال",
      email: "البريد الإلكتروني موثّق",
      mfa: "إعداد التحقق بخطوتين",
      action: "تأمين حسابي",
      after: "ستظهر ضوابط الاتصال هنا بعد استكمال متطلبات الأمان."
    },
    security: {
      attention: "إجراء مطلوب",
      mfa: "التحقق بخطوتين",
      mfaBody: "مطلوب قبل ربط Instagram أو تغيير إعدادات مساحة العمل الحساسة.",
      notEnabled: "غير مفعّل",
      setup: "إعداد التحقق",
      closeSteps: "إغلاق خطوات الإعداد",
      setupTitle: "ما ستحتاج إليه",
      setupSteps: ["تطبيق مصادقة على هاتفك", "رمز من ستة أرقام لتأكيد الإعداد", "مكان آمن لحفظ رموز الاسترداد"],
      setupNote: "يظهر رمز QR الآمن فقط بعد المتابعة إلى مسار الإعداد المحمي.",
      password: "كلمة المرور",
      passwordValue: "مضبوطة",
      changePassword: "تغيير كلمة المرور",
      sessions: "الجلسات النشطة",
      thisDevice: "هذا الجهاز",
      manageSessions: "إدارة الجلسات",
      recovery: "رموز الاسترداد",
      recoveryUnavailable: "تتوفر بعد تفعيل التحقق بخطوتين"
    },
    billing: {
      current: "الباقة الحالية",
      plan: "الأساسية",
      monthly: "شهرياً",
      price: "18 د.ب",
      vat: "+ ضريبة القيمة المضافة 10%",
      compare: "مقارنة الباقات",
      payment: "طريقة الدفع",
      paymentValue: "لم تُضف بعد",
      manage: "إدارة الفوترة",
      invoices: "الفواتير",
      invoicesEmpty: "لا توجد فواتير بعد",
      invoiceBody: "ستظهر الفواتير المدفوعة وتفاصيل الضريبة هنا."
    },
    team: {
      members: "الفريق",
      memberCount: "مقعد واحد مستخدم من أصل واحد",
      ownerName: "مريم علي",
      ownerEmail: "mariam@zainastudio.com",
      invite: "دعوة عضو",
      seatLimit: "تشمل الباقة الأساسية مقعداً واحداً.",
      data: "بياناتك",
      dataBody: "اطلب تصدير مساحة العمل أو راجع ضوابط البيانات المتقدمة.",
      export: "تجهيز التصدير",
      exportReady: "طلب التصدير جاهز للتجهيز.",
      advanced: "ضوابط البيانات المتقدمة",
      delete: "حذف مساحة العمل",
      deleteRequirement: "يلزم التحقق بخطوتين قبل الحذف."
    },
    footer: "© 2026 شركة رائدات للبرمجيات ذ.م.م.",
    terms: "شروط الخدمة",
    privacy: "سياسة الخصوصية"
  }
} as const;

export function SettingsPreview({ locale }: { locale: Locale }) {
  const copy = copyByLocale[locale];
  const isArabic = locale === "ar";
  const otherLocale = isArabic ? "en" : "ar";
  const [selectedSection, setSelectedSection] = useState<SettingsSectionId>("account");
  const [fullName, setFullName] = useState<string>(copy.team.ownerName);
  const [accountSaved, setAccountSaved] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<Locale>(locale);
  const [publishingUpdates, setPublishingUpdates] = useState(true);
  const [weeklyInsights, setWeeklyInsights] = useState(true);
  const [profileNoteVisible, setProfileNoteVisible] = useState(false);
  const [mfaStepsVisible, setMfaStepsVisible] = useState(false);
  const [exportNoticeVisible, setExportNoticeVisible] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!isSettingsSectionId(hash)) return;

    setSelectedSection(hash);
  }, []);

  const navigationItems: SectionNavigationItem[] = sectionIds.map((id) => ({
    id,
    icon: sectionIcons[id],
    label: copy.sections[id].title,
    locked: id === "connections",
    status: copy.sections[id].status,
    statusTone: id === "connections" ? "locked" : id === "security" ? "warning" : id === "account" || id === "business-profile" ? "success" : "neutral"
  }));

  function selectSection(id: string) {
    if (!isSettingsSectionId(id)) return;

    setSelectedSection(id);
    window.history.replaceState(null, "", `#${id}`);
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountSaved(true);
  }

  return (
    <main className={styles.settingsPage} data-settings-preview dir={isArabic ? "rtl" : "ltr"} lang={locale}>
      <header className={styles.header}>
        <a className={styles.brand} href={`/${locale}/design-preview`} aria-label={copy.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <Sparkles size={21} />
          </span>
          <strong>{copy.brand}</strong>
        </a>

        <div className={styles.headerWorkspace}>
          <span className={styles.workspaceIcon} aria-hidden="true">
            <Building2 size={17} />
          </span>
          <span>
            <strong>{copy.workspace}</strong>
            <small>{copy.owner}</small>
          </span>
        </div>

        <nav className={styles.headerActions} aria-label={copy.menuHeading}>
          <a className={styles.backLink} href={`/${locale}/design-preview`}>
            <ArrowLeft className={styles.directionalIcon} aria-hidden="true" size={17} />
            {copy.back}
          </a>
          <a className={styles.languageLink} href={`/${otherLocale}/design-preview/settings`}>
            <Globe2 aria-hidden="true" size={17} />
            {copy.language}
          </a>
          <span className={styles.avatar} aria-label={copy.team.ownerName}>
            MA
          </span>
        </nav>
      </header>

      <div className={styles.pageShell}>
        <section className={styles.pageHeading}>
          <div>
            <p>{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
          </div>
          <div className={styles.headingMeta}>
            <span>{copy.workspace}</span>
            <i aria-hidden="true">·</i>
            <span>{copy.owner}</span>
          </div>
        </section>

        <div className={styles.settingsLayout}>
          <SectionNavigation
            activeId={selectedSection}
            className={styles.sectionNavigation}
            heading={copy.menuHeading}
            items={navigationItems}
            mobileLabel={copy.mobileMenu}
            onSelect={selectSection}
          />

          <div className={styles.sections}>
            <SettingsContentSection
              active={selectedSection === "account"}
              icon={sectionIcons.account}
              id="account"
              status={copy.sections.account.status}
              statusTone="success"
              summary={copy.sections.account.summary}
              title={copy.sections.account.title}
            >
              <div className={styles.twoColumnGrid}>
                <form className={styles.settingCard} onSubmit={saveAccount}>
                  <div className={styles.cardHeading}>
                    <div>
                      <h3>{copy.account.details}</h3>
                    </div>
                    <span className={styles.successBadge}>
                      <CheckCircle2 aria-hidden="true" size={14} />
                      {copy.account.verified}
                    </span>
                  </div>
                  <label className={styles.field} htmlFor="settings-full-name">
                    <span>{copy.account.fullName}</span>
                    <input
                      id="settings-full-name"
                      onChange={(event) => {
                        setFullName(event.target.value);
                        setAccountSaved(false);
                      }}
                      value={fullName}
                    />
                  </label>
                  <label className={styles.field} htmlFor="settings-email">
                    <span>{copy.account.email}</span>
                    <span className={styles.inputWithIcon}>
                      <Mail aria-hidden="true" size={18} />
                      <input id="settings-email" readOnly value="mariam@zainastudio.com" />
                    </span>
                  </label>
                  <div className={styles.formActions}>
                    <button className={styles.primaryButton} type="submit">
                      {copy.account.save}
                    </button>
                    {accountSaved ? (
                      <span className={styles.savedNotice} role="status">
                        <Check aria-hidden="true" size={15} />
                        {copy.account.saved}
                      </span>
                    ) : null}
                  </div>
                </form>

                <div className={styles.settingCard}>
                  <div className={styles.cardHeading}>
                    <h3>{copy.account.preferences}</h3>
                  </div>
                  <div className={styles.preferenceGroup}>
                    <p>{copy.account.language}</p>
                    <div className={styles.segmentedControl}>
                      <button
                        aria-pressed={preferredLanguage === "en"}
                        data-active={preferredLanguage === "en" || undefined}
                        onClick={() => setPreferredLanguage("en")}
                        type="button"
                      >
                        {copy.account.english}
                      </button>
                      <button
                        aria-pressed={preferredLanguage === "ar"}
                        data-active={preferredLanguage === "ar" || undefined}
                        onClick={() => setPreferredLanguage("ar")}
                        type="button"
                      >
                        {copy.account.arabic}
                      </button>
                    </div>
                  </div>
                  <ToggleRow
                    body={copy.account.publishingBody}
                    checked={publishingUpdates}
                    label={copy.account.publishing}
                    onChange={() => setPublishingUpdates((current) => !current)}
                  />
                  <ToggleRow
                    body={copy.account.weeklyBody}
                    checked={weeklyInsights}
                    label={copy.account.weekly}
                    onChange={() => setWeeklyInsights((current) => !current)}
                  />
                </div>
              </div>
            </SettingsContentSection>

            <SettingsContentSection
              active={selectedSection === "business-profile"}
              icon={sectionIcons["business-profile"]}
              id="business-profile"
              status={copy.sections["business-profile"].status}
              statusTone="success"
              summary={copy.sections["business-profile"].summary}
              title={copy.sections["business-profile"].title}
            >
              <div className={styles.profileSummary}>
                <div className={styles.businessIdentity}>
                  <span className={styles.businessMark} aria-hidden="true">
                    Z
                  </span>
                  <div>
                    <span className={styles.successBadge}>
                      <CheckCircle2 aria-hidden="true" size={14} />
                      {copy.profile.ready}
                    </span>
                    <h3>{copy.workspace}</h3>
                    <p>
                      {copy.profile.category} · {copy.profile.location}
                    </p>
                  </div>
                </div>
                <span className={styles.updatedLabel}>{copy.profile.updated}</span>
              </div>
              <div className={styles.profileGrid}>
                {copy.profile.groups.map((group) => (
                  <div className={styles.profileGroup} key={group.title}>
                    <CheckCircle2 aria-hidden="true" size={18} />
                    <span>
                      <strong>{group.title}</strong>
                      <small>{group.value}</small>
                    </span>
                  </div>
                ))}
              </div>
              <div className={styles.sectionActions}>
                <button className={styles.secondaryButton} onClick={() => setProfileNoteVisible((current) => !current)} type="button">
                  {copy.profile.action}
                  <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={17} />
                </button>
                {profileNoteVisible ? (
                  <p className={styles.actionNote} role="status">
                    {copy.profile.note}
                  </p>
                ) : null}
              </div>
            </SettingsContentSection>

            <SettingsContentSection
              active={selectedSection === "connections"}
              icon={sectionIcons.connections}
              id="connections"
              locked
              status={copy.sections.connections.status}
              statusTone="locked"
              summary={copy.sections.connections.summary}
              title={copy.sections.connections.title}
            >
              <div className={styles.lockedConnection}>
                <div className={styles.connectionHeading}>
                  <span className={styles.instagramMark} aria-hidden="true">
                    <Instagram size={27} />
                  </span>
                  <div>
                    <span className={styles.lockBadge}>
                      <LockKeyhole aria-hidden="true" size={14} />
                      {copy.connections.locked}
                    </span>
                    <h3>{copy.connections.instagram}</h3>
                    <p>{copy.connections.body}</p>
                  </div>
                </div>

                <div className={styles.requirementsCard}>
                  <p>{copy.connections.requirements}</p>
                  <div className={styles.requirement} data-complete="true">
                    <span aria-hidden="true">
                      <Check size={15} />
                    </span>
                    {copy.connections.email}
                  </div>
                  <div className={styles.requirement} data-complete="false">
                    <span aria-hidden="true">
                      <LockKeyhole size={14} />
                    </span>
                    {copy.connections.mfa}
                  </div>
                </div>

                <button className={styles.primaryButton} onClick={() => selectSection("security")} type="button">
                  {copy.connections.action}
                  <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={17} />
                </button>
              </div>
              <p className={styles.lockedAfterword}>
                <LockKeyhole aria-hidden="true" size={15} />
                {copy.connections.after}
              </p>
            </SettingsContentSection>

            <SettingsContentSection
              active={selectedSection === "security"}
              icon={sectionIcons.security}
              id="security"
              status={copy.sections.security.status}
              statusTone="warning"
              summary={copy.sections.security.summary}
              title={copy.sections.security.title}
            >
              <div className={styles.securityLead}>
                <span className={styles.securityIcon} aria-hidden="true">
                  <KeyRound size={24} />
                </span>
                <div>
                  <span className={styles.warningBadge}>{copy.security.attention}</span>
                  <h3>{copy.security.mfa}</h3>
                  <p>{copy.security.mfaBody}</p>
                </div>
                <span className={styles.securityStatus}>{copy.security.notEnabled}</span>
                <button className={styles.primaryButton} onClick={() => setMfaStepsVisible((current) => !current)} type="button">
                  {mfaStepsVisible ? copy.security.closeSteps : copy.security.setup}
                </button>
              </div>

              {mfaStepsVisible ? (
                <div className={styles.mfaSteps} role="region">
                  <h3>{copy.security.setupTitle}</h3>
                  <ol>
                    {copy.security.setupSteps.map((step, index) => (
                      <li key={step}>
                        <span aria-hidden="true">{index + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  <p>{copy.security.setupNote}</p>
                </div>
              ) : null}

              <div className={styles.securityGrid}>
                <CompactSetting action={copy.security.changePassword} icon={KeyRound} label={copy.security.password} value={copy.security.passwordValue} />
                <CompactSetting action={copy.security.manageSessions} icon={CircleUserRound} label={copy.security.sessions} value={copy.security.thisDevice} />
                <CompactSetting icon={FileText} label={copy.security.recovery} locked value={copy.security.recoveryUnavailable} />
              </div>
            </SettingsContentSection>

            <SettingsContentSection
              active={selectedSection === "plan-billing"}
              icon={sectionIcons["plan-billing"]}
              id="plan-billing"
              status={copy.sections["plan-billing"].status}
              summary={copy.sections["plan-billing"].summary}
              title={copy.sections["plan-billing"].title}
            >
              <div className={styles.billingGrid}>
                <div className={styles.planCard}>
                  <div>
                    <p>{copy.billing.current}</p>
                    <h3>{copy.billing.plan}</h3>
                    <span>{copy.billing.monthly}</span>
                  </div>
                  <div className={styles.planPrice}>
                    <strong>{copy.billing.price}</strong>
                    <span>{copy.billing.vat}</span>
                  </div>
                  <a className={styles.secondaryButton} href={`/${locale}/plans`}>
                    {copy.billing.compare}
                    <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={17} />
                  </a>
                </div>
                <div className={styles.billingDetails}>
                  <CompactSetting action={copy.billing.manage} icon={CreditCard} label={copy.billing.payment} value={copy.billing.paymentValue} />
                  <div className={styles.invoiceEmpty}>
                    <ReceiptText aria-hidden="true" size={23} />
                    <div>
                      <strong>{copy.billing.invoicesEmpty}</strong>
                      <p>{copy.billing.invoiceBody}</p>
                    </div>
                  </div>
                </div>
              </div>
            </SettingsContentSection>

            <SettingsContentSection
              active={selectedSection === "team-data"}
              icon={sectionIcons["team-data"]}
              id="team-data"
              status={copy.sections["team-data"].status}
              summary={copy.sections["team-data"].summary}
              title={copy.sections["team-data"].title}
            >
              <div className={styles.twoColumnGrid}>
                <div className={styles.settingCard}>
                  <div className={styles.cardHeading}>
                    <div>
                      <h3>{copy.team.members}</h3>
                      <p>{copy.team.memberCount}</p>
                    </div>
                  </div>
                  <div className={styles.memberRow}>
                    <span className={styles.memberAvatar} aria-hidden="true">
                      MA
                    </span>
                    <span>
                      <strong>{copy.team.ownerName}</strong>
                      <small>{copy.team.ownerEmail}</small>
                    </span>
                    <span className={styles.ownerBadge}>{copy.owner}</span>
                  </div>
                  <button className={styles.disabledButton} disabled type="button">
                    <LockKeyhole aria-hidden="true" size={15} />
                    {copy.team.invite}
                  </button>
                  <p className={styles.cardNote}>{copy.team.seatLimit}</p>
                </div>

                <div className={styles.settingCard}>
                  <div className={styles.cardHeading}>
                    <div>
                      <h3>{copy.team.data}</h3>
                      <p>{copy.team.dataBody}</p>
                    </div>
                  </div>
                  <button className={styles.secondaryButton} onClick={() => setExportNoticeVisible(true)} type="button">
                    <Download aria-hidden="true" size={17} />
                    {copy.team.export}
                  </button>
                  {exportNoticeVisible ? (
                    <p className={styles.actionNote} role="status">
                      {copy.team.exportReady}
                    </p>
                  ) : null}
                  <details className={styles.advancedControls}>
                    <summary>{copy.team.advanced}</summary>
                    <div>
                      <button className={styles.dangerButton} disabled type="button">
                        {copy.team.delete}
                      </button>
                      <p>
                        <LockKeyhole aria-hidden="true" size={14} />
                        {copy.team.deleteRequirement}
                      </p>
                    </div>
                  </details>
                </div>
              </div>
            </SettingsContentSection>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <span>{copy.footer}</span>
        <span>
          <a href={`/${locale}/design-preview/terms`}>{copy.terms}</a>
          <i aria-hidden="true">·</i>
          <a href={`/${locale}/design-preview/privacy`}>{copy.privacy}</a>
        </span>
      </footer>
    </main>
  );
}

function SettingsContentSection({
  active,
  children,
  icon: Icon,
  id,
  locked = false,
  status,
  statusTone = "neutral",
  summary,
  title
}: {
  active: boolean;
  children: ReactNode;
  icon: LucideIcon;
  id: SettingsSectionId;
  locked?: boolean;
  status: string;
  statusTone?: "neutral" | "success" | "warning" | "locked";
  summary: string;
  title: string;
}) {
  if (!active) return null;

  return (
    <section className={styles.settingsSection} data-locked={locked || undefined} id={id}>
      <header className={styles.sectionPanelHeader}>
        <span className={styles.sectionIcon} aria-hidden="true">
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <span className={styles.sectionTitle}>
          <h2 id={`${id}-heading`}>{title}</h2>
          <small>{summary}</small>
        </span>
        <span className={styles.sectionStatus} data-tone={statusTone}>
          {locked ? <LockKeyhole aria-hidden="true" size={13} /> : null}
          {status}
        </span>
      </header>
      <div aria-labelledby={`${id}-heading`} className={styles.sectionContent} id={`${id}-content`} role="region">
        {children}
      </div>
    </section>
  );
}

function ToggleRow({ body, checked, label, onChange }: { body: string; checked: boolean; label: string; onChange: () => void }) {
  return (
    <div className={styles.toggleRow}>
      <span>
        <strong>{label}</strong>
        <small>{body}</small>
      </span>
      <button
        aria-checked={checked}
        aria-label={label}
        className={styles.switch}
        data-checked={checked || undefined}
        onClick={onChange}
        role="switch"
        type="button"
      >
        <span />
      </button>
    </div>
  );
}

function CompactSetting({
  action,
  icon: Icon,
  label,
  locked = false,
  value
}: {
  action?: string;
  icon: LucideIcon;
  label: string;
  locked?: boolean;
  value: string;
}) {
  return (
    <div className={styles.compactSetting} data-locked={locked || undefined}>
      <span className={styles.compactIcon} aria-hidden="true">
        {locked ? <LockKeyhole size={18} /> : <Icon size={19} />}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{value}</small>
      </span>
      {action ? (
        <button type="button">
          {action}
          <ExternalLink aria-hidden="true" size={14} />
        </button>
      ) : null}
    </div>
  );
}

function isSettingsSectionId(value: string): value is SettingsSectionId {
  return sectionIds.some((sectionId) => sectionId === value);
}
