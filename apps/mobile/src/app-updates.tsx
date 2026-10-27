import React, { useEffect, useState } from "react";
import { AppState, Alert } from "react-native";
import * as Updates from "expo-updates";
import { useAppearance } from "./providers";
import { Button, Card, Notice, Txt } from "./ui";

let pendingCheck: Promise<boolean> | null = null;
let lastCheck = 0;

/** Download on launch/foreground, but never restart an editor automatically. */
export async function checkAppUpdate(manual = false): Promise<boolean> {
  if (!Updates.isEnabled) return false;
  if (pendingCheck) return pendingCheck;
  if (!manual && Date.now() - lastCheck < 5 * 60_000) return false;
  lastCheck = Date.now();
  pendingCheck = (async () => {
    const available = await Updates.checkForUpdateAsync();
    if (!available.isAvailable && !available.isRollBackToEmbedded) return false;
    const downloaded = await Updates.fetchUpdateAsync();
    return downloaded.isNew || downloaded.isRollBackToEmbedded;
  })();
  try {
    return await pendingCheck;
  } finally {
    pendingCheck = null;
  }
}

export function AppUpdateMonitor() {
  useEffect(() => {
    void checkAppUpdate().catch(() => {});
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkAppUpdate().catch(() => {});
    });
    return () => listener.remove();
  }, []);
  return null;
}

export function AppUpdateCard() {
  const { t, locale } = useAppearance();
  const update = Updates.useUpdates();
  const [checking, setChecking] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const busy = checking || update.isChecking || update.isDownloading;
  const ready = downloaded || update.isUpdatePending;
  async function check() {
    setChecking(true);
    setError("");
    setChecked(false);
    try {
      setDownloaded(await checkAppUpdate(true));
      setChecked(true);
    } catch {
      setError(t("Could not download the app update. Check your connection and try again.", "تعذّر تنزيل تحديث التطبيق. تحقّق من الاتصال وحاول مجددًا."));
    } finally {
      setChecking(false);
    }
  }
  return (
    <Card>
      <Txt variant="heading">{t("App updates", "تحديثات التطبيق")}</Txt>
      <Txt variant="meta" muted>
        MARKOS {Updates.runtimeVersion ?? "development"} · {t("Create update · 24 Sep", "تحديث الإنشاء · ٢٤ سبتمبر")}
      </Txt>
      {Updates.createdAt ? (
        <Txt variant="meta" muted>
          {t("Running update", "التحديث الحالي")}: {Updates.createdAt.toLocaleString(locale)} · {Updates.updateId?.slice(-8)}
        </Txt>
      ) : null}
      {Updates.isEmergencyLaunch ? (
        <Notice error>{t("The last update could not start. Check for a newer update below.", "تعذّر تشغيل التحديث السابق. تحقّق من تحديث أحدث أدناه.")}</Notice>
      ) : null}
      {ready ? (
        <>
          <Txt>{t("An update is downloaded and ready. Restart MARKOS to apply it.", "تم تنزيل تحديث وأصبح جاهزًا. أعد تشغيل ماركوس لتطبيقه.")}</Txt>
          <Button
            label={t("Restart to apply update", "إعادة التشغيل لتطبيق التحديث")}
            disabled={busy}
            onPress={() =>
              Alert.alert(
                t("Restart MARKOS?", "إعادة تشغيل ماركوس؟"),
                t(
                  "Finish and save any open edits before restarting. Your saved drafts remain in your workspace.",
                  "أكمل واحفظ التعديلات المفتوحة قبل إعادة التشغيل. تبقى مسوداتك المحفوظة في مساحة العمل."
                ),
                [
                  { text: t("Later", "لاحقًا"), style: "cancel" },
                  {
                    text: t("Restart", "إعادة التشغيل"),
                    onPress: () => {
                      void Updates.reloadAsync().catch(() =>
                        setError(t("Could not restart. Close MARKOS completely and reopen it.", "تعذّرت إعادة التشغيل. أغلق ماركوس بالكامل وافتحه مجددًا."))
                      );
                    }
                  }
                ]
              )
            }
          />
        </>
      ) : null}
      {checked && !ready ? <Txt>{t("You’re running the latest available update for this version.", "تستخدم أحدث تحديث متاح لهذا الإصدار.")}</Txt> : null}
      {update.isDownloading ? <Txt>{t("Downloading update…", "جارٍ تنزيل التحديث…")}</Txt> : null}
      {error ? <Notice error>{error}</Notice> : null}
      {Updates.isEnabled ? (
        <Button secondary busy={busy} label={t("Check for updates", "التحقّق من التحديثات")} onPress={() => void check()} />
      ) : (
        <Txt muted>{t("Updates are available in the installed MARKOS app.", "التحديثات متاحة في تطبيق ماركوس المثبّت.")}</Txt>
      )}
    </Card>
  );
}
