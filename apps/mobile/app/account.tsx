import React, { useState } from "react";
import { useRouter } from "expo-router";
import { useAccount, useAppearance } from "../src/providers";
import { sessionController } from "../src/auth/transport";
import { briefStore } from "../src/campaigns/brief-store";
import { clearStudioDeviceData } from "../src/studio/device-store";
import { clearBusinessDeviceData } from "../src/business/device-store";
import { Card, Disclosure, ListGroup, ListRow, Notice, Screen, Sheet, TextAction, TitleBar, Txt } from "../src/ui";
import { WebButton } from "../src/content";
import {
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Camera,
  Database,
  Globe2,
  History,
  LogOut,
  Monitor,
  ShieldCheck,
  UserRound,
  Users,
  CircleHelp
} from "lucide-react-native";
import { AppUpdateCard } from "../src/app-updates";

export default function Account() {
  const { session, scope, epoch } = useAccount();
  const { t, theme, locale, setPreferences } = useAppearance();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"language" | "appearance" | null>(null);
  const appearanceLabel = theme === "system" ? t("Device setting", "إعداد الجهاز") : theme === "light" ? t("Light", "فاتح") : t("Dark", "داكن");
  async function preferences(next: Parameters<typeof setPreferences>[0]) {
    setError("");
    try {
      await setPreferences(next);
      setPanel(null);
    } catch {
      setError(t("Could not save this preference. Try again.", "تعذّر حفظ هذا التفضيل. حاول مجددًا."));
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const store = briefStore(scope, epoch);
      await Promise.all([sessionController.logout(), store.clear(), clearStudioDeviceData(scope), clearBusinessDeviceData(scope, epoch)]);
      router.replace("/login");
    } catch {
      setError(t("Couldn’t clear the saved sign-in. Try logging out again.", "تعذّر مسح تسجيل الدخول المحفوظ. حاول تسجيل الخروج مجددًا."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <TitleBar title={t("Settings", "الإعدادات")} />
      <Card>
        <Txt variant="heading">{session.user.fullName}</Txt>
        <Txt muted>{session.user.email}</Txt>
        <Txt variant="meta" muted>
          {session.workspace.name}
        </Txt>
      </Card>
      <ListGroup title={t("Workspace", "مساحة العمل")}>
        <ListRow icon={BriefcaseBusiness} label={t("Business profile", "ملف النشاط")} onPress={() => router.push("/business")} />
        <ListRow icon={Camera} label={t("Instagram", "إنستغرام")} onPress={() => router.push("/instagram")} />
        <ListRow icon={Users} label={t("Workspaces and team", "مساحات العمل والفريق")} onPress={() => router.push("/team")} />
        <ListRow icon={BookOpen} last label={t("Knowledge and history", "المعلومات والسجل")} onPress={() => router.push("/knowledge")} />
      </ListGroup>
      <ListGroup title={t("Preferences", "التفضيلات")}>
        <ListRow icon={Globe2} label={t("Language", "اللغة")} detail={locale === "ar" ? "العربية" : "English"} onPress={() => setPanel("language")} />
        <ListRow icon={Monitor} label={t("Appearance", "المظهر")} detail={appearanceLabel} onPress={() => setPanel("appearance")} />
        <ListRow
          icon={Bell}
          last
          label={t("Notifications and report emails", "الإشعارات وبريد التقارير")}
          onPress={() => router.push("/notification-settings")}
        />
      </ListGroup>
      <ListGroup title={t("Account", "الحساب")}>
        <ListRow
          icon={UserRound}
          label={t("Personal and workspace details", "البيانات الشخصية ومساحة العمل")}
          onPress={() => router.push("/account-details")}
        />
        <ListRow icon={ShieldCheck} label={t("Authenticator and security", "المصادقة والأمان")} onPress={() => router.push("/security")} />
        <ListRow icon={Database} label={t("Workspace data controls", "التحكم في بيانات مساحة العمل")} onPress={() => router.push("/data-controls")} />
        <ListRow icon={CircleHelp} last label={t("Help and legal", "المساعدة والمعلومات القانونية")} onPress={() => router.push("/support")} />
      </ListGroup>
      <Disclosure title={t("App and advanced settings", "التطبيق والإعدادات المتقدمة")}>
        <AppUpdateCard />
        {session.roles.some((role) => role === "OWNER" || role === "WORKSPACE_ADMIN") ? (
          <ListRow icon={History} last label={t("Workspace activity", "نشاط مساحة العمل")} onPress={() => router.push("/activity")} />
        ) : null}
        {session.roles.some((r) => ["SUPER_ADMIN", "PRODUCT_ADMIN", "SUPPORT_ADMIN", "FINANCE_ADMIN", "READONLY_ADMIN"].includes(r)) ? (
          <ListRow last label={t("Platform administration", "إدارة المنصة")} onPress={() => router.push("/administration")} />
        ) : null}
        <WebButton label={t("More account settings on web", "المزيد من إعدادات الحساب على الموقع")} path="app/settings" />
      </Disclosure>
      {error ? <Notice error>{error}</Notice> : null}
      <TextAction
        icon={LogOut}
        disabled={busy}
        label={t("Log out", "تسجيل الخروج")}
        onPress={() => {
          void logout();
        }}
      />
      <Txt variant="meta" muted>
        {t("Logging out removes saved campaign references from this device.", "يؤدي تسجيل الخروج إلى إزالة مراجع الحملات المحفوظة من هذا الجهاز.")}
      </Txt>
      <Sheet title={t("Language", "اللغة")} visible={panel === "language"} onClose={() => setPanel(null)}>
        <ListGroup>
          <ListRow label="English" selected={locale === "en"} onPress={() => void preferences({ locale: "en" })} />
          <ListRow label="العربية" selected={locale === "ar"} last onPress={() => void preferences({ locale: "ar" })} />
        </ListGroup>
        {error ? <Notice error>{error}</Notice> : null}
      </Sheet>
      <Sheet title={t("Appearance", "المظهر")} visible={panel === "appearance"} onClose={() => setPanel(null)}>
        <ListGroup>
          {(["system", "light", "dark"] as const).map((value, index) => (
            <ListRow
              key={value}
              label={value === "system" ? t("Use device setting", "حسب إعداد الجهاز") : value === "light" ? t("Light", "فاتح") : t("Dark", "داكن")}
              selected={theme === value}
              last={index === 2}
              onPress={() => void preferences({ theme: value })}
            />
          ))}
        </ListGroup>
        {error ? <Notice error>{error}</Notice> : null}
      </Sheet>
    </Screen>
  );
}
