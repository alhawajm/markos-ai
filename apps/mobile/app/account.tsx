import React, { useState } from "react";
import { useRouter } from "expo-router";
import { useAccount, useAppearance } from "../src/providers";
import { sessionController } from "../src/auth/transport";
import { briefStore } from "../src/campaigns/brief-store";
import { clearStudioDeviceData } from "../src/studio/device-store";
import { clearBusinessDeviceData } from "../src/business/device-store";
import { Button, Card, Notice, Screen, Txt } from "../src/ui";
import { WebButton } from "../src/content";
import { BookOpen, Camera, Database, History, ShieldCheck, UserRound, Users } from "lucide-react-native";

export default function Account() {
  const { session, scope, epoch } = useAccount();
  const { t, theme, locale, setPreferences } = useAppearance();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
      <Txt variant="title">{session.workspace.name}</Txt>
      <Card>
        <Txt variant="heading">{session.user.fullName}</Txt>
        <Txt muted>{session.user.email}</Txt>
      </Card>
      <Button
        secondary
        icon={UserRound}
        label={t("Personal and workspace details", "البيانات الشخصية ومساحة العمل")}
        onPress={() => router.push("/account-details")}
      />
      <Button secondary icon={Users} label={t("Workspaces and team", "مساحات العمل والفريق")} onPress={() => router.push("/team")} />
      <Txt variant="heading">{t("Language", "اللغة")}</Txt>
      <Button
        secondary={locale !== "en"}
        label="English"
        onPress={() => {
          void setPreferences({ locale: "en" });
        }}
      />
      <Button
        secondary={locale !== "ar"}
        label="العربية"
        onPress={() => {
          void setPreferences({ locale: "ar" });
        }}
      />
      <Txt variant="heading">{t("Appearance", "المظهر")}</Txt>
      {(["system", "light", "dark"] as const).map((value) => (
        <Button
          key={value}
          secondary={theme !== value}
          label={value === "system" ? t("Use device setting", "حسب إعداد الجهاز") : value === "light" ? t("Light", "فاتح") : t("Dark", "داكن")}
          onPress={() => {
            void setPreferences({ theme: value });
          }}
        />
      ))}
      <Button secondary label={t("Business profile", "ملف النشاط")} onPress={() => router.push("/business")} />
      <Button secondary icon={BookOpen} label={t("Knowledge and history", "المعلومات والسجل")} onPress={() => router.push("/knowledge")} />
      <Button secondary icon={Camera} label={t("Instagram", "إنستغرام")} onPress={() => router.push("/instagram")} />
      <Button secondary icon={ShieldCheck} label={t("Authenticator and security", "المصادقة والأمان")} onPress={() => router.push("/security")} />
      <Button secondary icon={Database} label={t("Workspace data controls", "التحكم في بيانات مساحة العمل")} onPress={() => router.push("/data-controls")} />
      {session.roles.some((role) => role === "OWNER" || role === "WORKSPACE_ADMIN") ? (
        <Button secondary icon={History} label={t("Workspace activity", "نشاط مساحة العمل")} onPress={() => router.push("/activity")} />
      ) : null}
      <WebButton label={t("More account settings on web", "المزيد من إعدادات الحساب على الموقع")} path="app/settings" />
      {error ? <Notice error>{error}</Notice> : null}
      <Button
        secondary
        busy={busy}
        label={t("Log out", "تسجيل الخروج")}
        onPress={() => {
          void logout();
        }}
      />
      <Txt variant="meta" muted>
        {t("Logging out removes saved campaign references from this device.", "يؤدي تسجيل الخروج إلى إزالة مراجع الحملات المحفوظة من هذا الجهاز.")}
      </Txt>
    </Screen>
  );
}
