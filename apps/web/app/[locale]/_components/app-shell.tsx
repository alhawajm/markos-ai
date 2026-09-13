"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalDialog } from "./use-modal-dialog";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  Brain,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Home,
  Languages,
  Palette,
  Settings,
  Target,
  X,
  type LucideIcon
} from "lucide-react";
import type { Locale, NotificationRecord } from "@markos/shared-types";
import { CampaignBuilderPanel, DailyBriefingPanel, FinalAnalyticsPanel, FinalDashboard, FinalVaultPanel, OpportunitiesPanel } from "./final-command-panels";
import { CampaignPanel } from "./campaign-panel";
import { CalendarPanel } from "./calendar-panel";
import { ContentStudioPanel } from "./content-studio-panel";
import { initializeBrowserSession, useMarkosClient, useMarkosSession, watchBrowserSession } from "./browser-session";
import { MarkosAiIcon } from "./markos-ai-icon";

export type SectionSlug =
  | "analytics"
  | "briefing"
  | "calendar"
  | "campaign-builder"
  | "campaigns"
  | "content-studio"
  | "dashboard"
  | "knowledge"
  | "opportunities"
  | "settings";

type NavItem = {
  icon: LucideIcon;
  slug: SectionSlug;
};

const primaryNavItems: NavItem[] = [
  { icon: Home, slug: "dashboard" },
  { icon: Target, slug: "campaigns" },
  { icon: Palette, slug: "content-studio" },
  { icon: CalendarDays, slug: "calendar" },
  { icon: BarChart3, slug: "analytics" },
  { icon: Brain, slug: "knowledge" }
];
const settingsNavItem: NavItem = { icon: Settings, slug: "settings" };
const SIDEBAR_COLLAPSED_KEY = "markos.sidebar.collapsed";
const LOCALE_PREFERENCE_KEY = "markos.locale";

export function AppShell({ activeSection, locale }: { activeSection: SectionSlug; locale: Locale }) {
  const client = useMarkosClient(locale);
  const session = useMarkosSession();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPreferenceReady, setSidebarPreferenceReady] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const mobileNavRef = useRef<HTMLElement>(null);
  const checkSession = useCallback(() => {
    setSessionCheckFailed(false);
    void initializeBrowserSession(locale)
      .then(() => setSessionChecked(true))
      .catch(() => setSessionCheckFailed(true));
  }, [locale]);

  useEffect(() => {
    checkSession();
    return watchBrowserSession(locale);
  }, [checkSession, locale]);

  useEffect(() => {
    if (activeSection === "settings") return;
    window.sessionStorage.setItem("markos.settings.returnTo", localizedHref(locale, activeSection));
  }, [activeSection, locale]);

  useEffect(() => {
    mobileNavRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
  }, [activeSection, locale, sessionChecked]);

  useEffect(() => {
    let preferenceReadyFrame = 0;
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
    } catch {
      // A local display preference is optional when browser storage is unavailable.
    } finally {
      preferenceReadyFrame = window.requestAnimationFrame(() => setSidebarPreferenceReady(true));
    }

    return () => window.cancelAnimationFrame(preferenceReadyFrame);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !session) return;
    let cancelled = false;
    const load = () => {
      void client
        .notifications()
        .then((items) => {
          if (!cancelled) setNotifications(items);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client, session, sessionChecked]);

  async function markNotificationRead(notification: NotificationRecord) {
    if (notification.readAt) return;
    try {
      const updated = await client.markNotificationRead(notification.id);
      setNotifications((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      // The durable record remains available for a later retry.
    }
  }

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Keep the in-memory choice even when browser storage is unavailable.
      }
      return next;
    });
  }, []);

  const switchLocale = useCallback(() => {
    const nextLocale: Locale = locale === "ar" ? "en" : "ar";
    try {
      window.localStorage.setItem(LOCALE_PREFERENCE_KEY, nextLocale);
    } catch {
      // The route still changes when browser storage is unavailable.
    }

    const target = new URL(window.location.href);
    const pathSegments = target.pathname.split("/");
    pathSegments[1] = nextLocale;
    target.pathname = pathSegments.join("/");
    window.location.assign(`${target.pathname}${target.search}${target.hash}`);
  }, [locale]);

  if (!sessionChecked) {
    return (
      <main className="sunlit-theme sunlit-app grid min-h-screen place-items-center px-6">
        <section className="sunlit-panel max-w-md rounded-[2rem] p-9 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]">
            <MarkosAiIcon size={28} />
          </span>
          <h1 className="mt-7 text-3xl font-bold text-[var(--sunlit-ink)]">
            {sessionCheckFailed ? (locale === "ar" ? "تعذر فتح MARKOS" : "Could not open MARKOS") : locale === "ar" ? "جارٍ فتح MARKOS" : "Opening MARKOS"}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[var(--sunlit-muted)]">
            {sessionCheckFailed
              ? locale === "ar"
                ? "تعذر تجديد جلستك مؤقتاً. تحقق من اتصالك ثم حاول مرة أخرى."
                : "Your session could not be renewed temporarily. Check your connection and try again."
              : locale === "ar"
                ? "نتحقق من جلسة مساحة العمل قبل تحميل مركز القيادة."
                : "Checking your workspace session before loading the command center."}
          </p>
          {sessionCheckFailed ? (
            <button className="sunlit-primary mt-6 rounded-xl px-6 py-3 font-bold" onClick={checkSession} type="button">
              {locale === "ar" ? "حاول مرة أخرى" : "Try again"}
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  const SidebarToggleIcon = sidebarCollapsed ? (locale === "ar" ? ChevronLeft : ChevronRight) : locale === "ar" ? ChevronRight : ChevronLeft;

  return (
    <main className="sunlit-theme sunlit-app min-h-screen min-w-0 overflow-x-clip lg:h-screen lg:overflow-hidden" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div
        className={`grid min-h-screen lg:h-screen ${sidebarCollapsed ? "lg:grid-cols-[6rem_minmax(0,1fr)]" : "lg:grid-cols-[15.25rem_minmax(0,1fr)]"} ${
          sidebarPreferenceReady ? "lg:transition-[grid-template-columns] lg:duration-200 lg:ease-out motion-reduce:transition-none" : ""
        }`}
        data-sidebar-collapsed={sidebarCollapsed}
      >
        <aside
          className={`relative hidden min-w-0 border-e border-[var(--sunlit-line)] bg-[var(--surface)] py-5 backdrop-blur-xl lg:sticky lg:top-0 lg:z-40 lg:flex lg:h-screen lg:self-start lg:flex-col lg:overflow-visible ${sidebarCollapsed ? "px-4" : "px-6"}`}
          data-app-sidebar
        >
          <Link
            className={`grid min-h-[44px] min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center rounded-xl text-[var(--sunlit-ink)] ${
              sidebarCollapsed ? "mx-auto w-[2.75rem] gap-0" : "w-full gap-2"
            }`}
            href={`/${locale}/app`}
          >
            <span className="grid h-[40px] w-[40px] shrink-0 place-items-center justify-self-center rounded-xl bg-[var(--primary)] text-[var(--on-primary)] shadow-[0_10px_24px_rgb(32_33_43_/_16%)]">
              <MarkosAiIcon size={21} />
            </span>
            <span
              className={`min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-150 motion-reduce:transition-none ${
                sidebarCollapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100"
              }`}
            >
              <span className="block text-lg font-bold tracking-tight">MARKOS AI</span>
            </span>
          </Link>

          <button
            aria-controls="markos-primary-navigation"
            aria-expanded={!sidebarCollapsed}
            aria-label={
              sidebarCollapsed ? (locale === "ar" ? "توسيع الشريط الجانبي" : "Expand sidebar") : locale === "ar" ? "طي الشريط الجانبي" : "Collapse sidebar"
            }
            className="group absolute -end-[22px] top-[52px] z-50 grid h-[44px] w-[44px] place-items-center rounded-full outline-none"
            onClick={toggleSidebar}
            type="button"
          >
            <span className="grid h-[28px] w-[28px] place-items-center rounded-full border border-[var(--sunlit-line-strong)] bg-[var(--surface)] text-[var(--sunlit-muted)] shadow-[0_8px_20px_rgb(32_33_43_/_10%)] transition group-hover:border-[var(--sunlit-coral)] group-hover:text-[var(--link)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--focus)]">
              <SidebarToggleIcon aria-hidden="true" size={14} strokeWidth={2.4} />
            </span>
          </button>

          <nav
            aria-label={locale === "ar" ? "التنقل الرئيسي" : "Primary"}
            className={`mt-8 grid min-h-0 min-w-0 flex-1 content-start gap-1.5 overflow-x-hidden overflow-y-auto overscroll-contain ${sidebarCollapsed ? "justify-items-center" : "pe-1"}`}
            id="markos-primary-navigation"
          >
            {primaryNavItems.map((item) => (
              <SidebarNavLink activeSection={activeSection} collapsed={sidebarCollapsed} item={item} key={item.slug} locale={locale} />
            ))}
          </nav>

          <div className={`mt-auto grid gap-2 border-t border-[var(--sunlit-line)] pt-4 ${sidebarCollapsed ? "justify-items-center" : ""}`}>
            <SidebarNotificationsButton
              collapsed={sidebarCollapsed}
              count={notifications.filter((notification) => !notification.readAt).length}
              locale={locale}
              onClick={() => setNotificationsOpen(true)}
            />
            <SidebarLanguageToggle collapsed={sidebarCollapsed} locale={locale} onSwitch={switchLocale} />
            <SidebarNavLink activeSection={activeSection} collapsed={sidebarCollapsed} item={settingsNavItem} locale={locale} />
          </div>
        </aside>

        <section className="sunlit-card-scroll min-w-0 lg:h-screen lg:overflow-y-auto lg:overscroll-contain" data-app-content-scroll>
          <header className="sticky top-0 z-30 border-b border-[var(--sunlit-line)] bg-[var(--surface)] px-5 py-3 backdrop-blur-xl sm:px-7 lg:hidden">
            <div className="mx-auto flex max-w-[1500px] items-center gap-3">
              <Link
                aria-label="MARKOS AI"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--primary)] text-[var(--on-primary)]"
                href={`/${locale}/app`}
              >
                <MarkosAiIcon size={19} />
              </Link>
              <span className="text-lg font-semibold tracking-tight text-[var(--sunlit-ink)]">MARKOS AI</span>
            </div>
          </header>

          <nav
            className="flex gap-2 overflow-x-auto border-b border-[var(--sunlit-line)] bg-[var(--surface)] px-4 py-3 lg:hidden"
            aria-label={locale === "ar" ? "التنقل الرئيسي للجوال" : "Mobile primary"}
            ref={mobileNavRef}
          >
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const active = item.slug === activeSection;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[var(--sunlit-paper-deep)] px-3 py-2 text-sm font-semibold text-[var(--sunlit-ink)]"
                      : "flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--sunlit-muted)]"
                  }
                  href={localizedHref(locale, item.slug)}
                  key={item.slug}
                >
                  <Icon size={16} />
                  {sectionLabel(locale, item.slug)}
                </Link>
              );
            })}
            <button
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--sunlit-muted)]"
              onClick={switchLocale}
              type="button"
            >
              <Languages aria-hidden="true" size={16} />
              {locale === "ar" ? "العربية" : "English"}
            </button>
            <button
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--sunlit-muted)]"
              onClick={() => setNotificationsOpen(true)}
              type="button"
            >
              <Bell aria-hidden="true" size={16} />
              {locale === "ar" ? "التنبيهات" : "Notifications"}
              {notifications.some((notification) => !notification.readAt) ? (
                <span className="grid min-w-5 place-items-center rounded-full bg-[var(--primary)] px-1 text-xs text-[var(--on-primary)]">
                  {notifications.filter((notification) => !notification.readAt).length}
                </span>
              ) : null}
            </button>
            <MobileNavLink activeSection={activeSection} item={settingsNavItem} locale={locale} />
          </nav>

          <div className="mx-auto w-full max-w-[1500px] min-w-0 px-4 py-5 sm:px-6 lg:py-6 xl:px-8">
            {activeSection === "dashboard" ? <FinalDashboard locale={locale} /> : null}
            {activeSection === "briefing" ? <DailyBriefingPanel locale={locale} /> : null}
            {activeSection === "campaigns" ? <CampaignPanel locale={locale} /> : null}
            {activeSection === "opportunities" ? <OpportunitiesPanel locale={locale} /> : null}
            {activeSection === "campaign-builder" ? <CampaignBuilderPanel locale={locale} /> : null}
            {activeSection === "content-studio" ? <ContentStudioPanel key={session?.workspace.id} locale={locale} /> : null}
            {activeSection === "calendar" ? <CalendarPanel locale={locale} /> : null}
            {activeSection === "analytics" ? <FinalAnalyticsPanel locale={locale} /> : null}
            {activeSection === "knowledge" ? <FinalVaultPanel locale={locale} /> : null}
          </div>
        </section>
      </div>
      {notificationsOpen ? (
        <NotificationDrawer
          locale={locale}
          notifications={notifications}
          onClose={() => setNotificationsOpen(false)}
          onRead={(notification) => void markNotificationRead(notification)}
        />
      ) : null}
    </main>
  );
}

function SidebarNotificationsButton({ collapsed, count, locale, onClick }: { collapsed: boolean; count: number; locale: Locale; onClick: () => void }) {
  return (
    <button
      aria-label={locale === "ar" ? `التنبيهات غير المقروءة: ${count}` : `Notifications, ${count} unread`}
      className={`group relative grid min-h-12 min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center rounded-xl border border-transparent text-[15px] font-medium text-[var(--sunlit-ink-soft)] transition hover:border-[var(--sunlit-line)] hover:bg-[var(--sunlit-paper)] ${
        collapsed ? "w-[2.75rem] gap-0" : "w-full gap-2"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="relative grid h-9 w-9 place-items-center justify-self-center rounded-lg text-[var(--sunlit-muted)]">
        <Bell size={20} />
        {count > 0 ? <span className="absolute end-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-[var(--primary)]" /> : null}
      </span>
      <span
        className={`min-w-0 overflow-hidden whitespace-nowrap text-start transition-[max-width,opacity] ${collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100"}`}
      >
        {locale === "ar" ? "التنبيهات" : "Notifications"}
        {count > 0 ? <span className="ms-2 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs text-[var(--sunlit-pink)]">{count}</span> : null}
      </span>
    </button>
  );
}

function NotificationDrawer({
  locale,
  notifications,
  onClose,
  onRead
}: {
  locale: Locale;
  notifications: NotificationRecord[];
  onClose: () => void;
  onRead: (notification: NotificationRecord) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { dialogRef, onCancel, onKeyDown } = useModalDialog({ onClose, initialFocusRef: headingRef });

  return (
    <dialog
      aria-labelledby="workspace-notifications-title"
      className="sunlit-modal-shell z-[100] flex justify-end bg-[rgb(32_33_43_/_35%)]"
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      ref={dialogRef}
    >
      <button
        aria-label={locale === "ar" ? "إغلاق التنبيهات" : "Close notifications"}
        className="absolute inset-0"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-label={locale === "ar" ? "التنبيهات" : "Notifications"}
        className="sunlit-card-scroll relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-[var(--surface)] p-6 shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-[var(--sunlit-line)] pb-5">
          <div>
            <h2 className="text-3xl font-bold text-[var(--sunlit-ink)] outline-none" id="workspace-notifications-title" ref={headingRef} tabIndex={-1}>
              {locale === "ar" ? "التنبيهات" : "Notifications"}
            </h2>
          </div>
          <button
            aria-label={locale === "ar" ? "إغلاق" : "Close"}
            className="sunlit-secondary grid h-11 w-11 place-items-center rounded-full"
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </header>
        <div className="mt-5 grid gap-3">
          {notifications.length === 0 ? (
            <p className="rounded-2xl bg-[var(--sunlit-paper)] p-5 text-sm font-semibold leading-6 text-[var(--sunlit-muted)]">
              {locale === "ar" ? "لا توجد تنبيهات بعد." : "No notifications yet."}
            </p>
          ) : (
            notifications.map((notification) => (
              <article
                className={`rounded-2xl border p-4 ${notification.readAt ? "border-[var(--sunlit-line)] bg-[var(--surface)]" : "border-[var(--danger)] bg-[var(--danger-soft)]"}`}
                key={notification.id}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface)] text-[var(--sunlit-pink)]">
                    <Bell size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-[var(--sunlit-ink)]">{locale === "ar" ? "تعذر نشر المحتوى" : "Publishing needs attention"}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--sunlit-ink-soft)]">
                      {typeof notification.payload.message === "string"
                        ? notification.payload.message
                        : locale === "ar"
                          ? "راجع المحتوى وحاول مرة أخرى."
                          : "Review the content and try again."}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-[var(--sunlit-muted)]">
                      {new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", { dateStyle: "medium", timeStyle: "short" }).format(
                        new Date(notification.createdAt)
                      )}
                    </p>
                  </div>
                </div>
                {!notification.readAt ? (
                  <button
                    className="sunlit-secondary mt-3 inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-extrabold"
                    onClick={() => onRead(notification)}
                    type="button"
                  >
                    <Check size={15} /> {locale === "ar" ? "وضع كمقروء" : "Mark as read"}
                  </button>
                ) : null}
              </article>
            ))
          )}
        </div>
      </aside>
    </dialog>
  );
}

function SidebarLanguageToggle({ collapsed, locale, onSwitch }: { collapsed: boolean; locale: Locale; onSwitch: () => void }) {
  const activeLanguage = locale === "ar" ? "العربية" : "English";
  const switchLabel = locale === "ar" ? "تغيير اللغة. اللغة الحالية: العربية" : "Change language. Current language: English";

  return (
    <button
      aria-label={switchLabel}
      className={`group relative grid min-h-12 min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center rounded-xl border border-transparent text-[15px] font-medium text-[var(--sunlit-ink-soft)] outline-none transition hover:border-[var(--sunlit-line)] hover:bg-[var(--sunlit-paper)] hover:text-[var(--sunlit-ink)] ${
        collapsed ? "w-[2.75rem] gap-0" : "w-full gap-2"
      }`}
      onClick={onSwitch}
      type="button"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center justify-self-center rounded-lg text-[var(--sunlit-muted)] transition group-hover:text-[var(--sunlit-ink)]">
        <Languages aria-hidden="true" size={20} strokeWidth={1.95} />
      </span>
      <span
        className={`min-w-0 overflow-hidden whitespace-nowrap text-start transition-[max-width,opacity] duration-150 motion-reduce:transition-none ${
          collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100"
        }`}
      >
        {activeLanguage}
      </span>
      {collapsed ? <SidebarTooltip label={locale === "ar" ? `اللغة · ${activeLanguage}` : `Language · ${activeLanguage}`} locale={locale} /> : null}
    </button>
  );
}

function MobileNavLink({ activeSection, item, locale }: { activeSection: SectionSlug; item: NavItem; locale: Locale }) {
  const Icon = item.icon;
  const active = item.slug === activeSection;

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[var(--sunlit-paper-deep)] px-3 py-2 text-sm font-semibold text-[var(--sunlit-ink)]"
          : "flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--sunlit-muted)]"
      }
      href={localizedHref(locale, item.slug)}
    >
      <Icon size={16} />
      {sectionLabel(locale, item.slug)}
    </Link>
  );
}

function SidebarNavLink({ activeSection, collapsed, item, locale }: { activeSection: SectionSlug; collapsed: boolean; item: NavItem; locale: Locale }) {
  const Icon = item.icon;
  const active = item.slug === activeSection;
  const label = sectionLabel(locale, item.slug);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`group relative grid min-h-12 min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center rounded-xl border text-[15px] outline-none transition ${
        collapsed ? "w-[2.75rem] gap-0" : "w-full gap-2"
      } ${
        active
          ? "sunlit-sidebar-link-active border-[color-mix(in_srgb,var(--primary)_26%,transparent)] bg-[var(--sunlit-paper-deep)] font-semibold text-[var(--sunlit-ink)]"
          : "border-transparent font-medium text-[var(--sunlit-ink-soft)] hover:border-[var(--sunlit-line)] hover:bg-[var(--sunlit-paper)] hover:text-[var(--sunlit-ink)]"
      }`}
      href={localizedHref(locale, item.slug)}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center justify-self-center rounded-lg transition ${
          active ? "text-[var(--link)]" : "text-[var(--sunlit-muted)] group-hover:text-[var(--sunlit-ink)]"
        }`}
      >
        <Icon aria-hidden="true" size={20} strokeWidth={active ? 2.35 : 1.95} />
      </span>
      <span
        className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-150 motion-reduce:transition-none ${
          collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100"
        }`}
      >
        {label}
      </span>
      {collapsed ? <SidebarTooltip label={label} locale={locale} section={item.slug} /> : null}
    </Link>
  );
}

function SidebarTooltip({ label, locale, section }: { label: string; locale: Locale; section?: SectionSlug }) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipHovered = useRef(false);
  const [position, setPosition] = useState<{ top: number; inline: number } | null>(null);

  useEffect(() => {
    const control = markerRef.current?.parentElement;
    if (!control) return;
    function show() {
      clearTimeout(hideTimer.current);
      const rect = control!.getBoundingClientRect();
      const sidebar = control!.closest("[data-app-sidebar]")?.getBoundingClientRect() ?? rect;
      setPosition({ top: rect.top + rect.height / 2, inline: locale === "ar" ? window.innerWidth - sidebar.left + 12 : sidebar.right + 12 });
    }
    function hide() {
      clearTimeout(hideTimer.current);
      tooltipHovered.current = false;
      setPosition(null);
    }
    function leaveControl() {
      if (document.activeElement === control) return;
      hideTimer.current = setTimeout(() => {
        if (!tooltipHovered.current && document.activeElement !== control) hide();
      }, 180);
    }
    function dismiss(event: KeyboardEvent) {
      if (event.key === "Escape") hide();
    }
    control.addEventListener("mouseenter", show);
    control.addEventListener("mouseleave", leaveControl);
    control.addEventListener("focus", show);
    control.addEventListener("blur", hide);
    window.addEventListener("keydown", dismiss);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      control.removeEventListener("mouseenter", show);
      control.removeEventListener("mouseleave", leaveControl);
      control.removeEventListener("focus", show);
      control.removeEventListener("blur", hide);
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      clearTimeout(hideTimer.current);
    };
  }, [locale]);

  return (
    <>
      <span className="hidden" ref={markerRef} />
      {position &&
        createPortal(
          <span
            aria-hidden="true"
            className="fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--text)] px-3 py-2 text-xs font-semibold text-[var(--background)] shadow-lg"
            onMouseEnter={() => {
              tooltipHovered.current = true;
              clearTimeout(hideTimer.current);
            }}
            onMouseLeave={() => {
              tooltipHovered.current = false;
              if (document.activeElement !== markerRef.current?.parentElement) setPosition(null);
            }}
            data-sidebar-tooltip={section}
            dir={locale === "ar" ? "rtl" : "ltr"}
            style={{ top: position.top, ...(locale === "ar" ? { right: position.inline } : { left: position.inline }) }}
          >
            {label}
          </span>,
          document.body
        )}
    </>
  );
}

function sectionLabel(locale: Locale, section: SectionSlug): string {
  const labels: Record<Locale, Record<SectionSlug, string>> = {
    ar: {
      analytics: "التحليلات",
      briefing: "الموجز اليومي",
      calendar: "التقويم",
      "campaign-builder": "منشئ الحملات",
      campaigns: "الحملات",
      "content-studio": "إنشاء المحتوى",
      dashboard: "نظرة عامة",
      knowledge: "ملف النشاط",
      opportunities: "الفرص",
      settings: "الإعدادات"
    },
    en: {
      analytics: "Insights",
      briefing: "Daily briefing",
      calendar: "Calendar",
      "campaign-builder": "Campaign builder",
      campaigns: "Campaigns",
      "content-studio": "Create",
      dashboard: "Overview",
      knowledge: "Business profile",
      opportunities: "Opportunities",
      settings: "Settings"
    }
  };

  return labels[locale][section];
}

function localizedHref(locale: Locale, section: SectionSlug): string {
  return section === "dashboard" ? `/${locale}/app` : `/${locale}/app/${section}`;
}
