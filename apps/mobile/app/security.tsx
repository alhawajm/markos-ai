import React, { useRef, useState } from "react";
import { Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react-native";
import type { MfaTotpSetup } from "@markos/shared-types";
import { useAccount, useAppearance } from "../src/providers";
import { sessionController } from "../src/auth/transport";
import { authenticatorCode, mfaActive } from "../src/instagram/model";
import { errorMessage } from "../src/errors";
import { Button, Card, Field, Loading, Notice, Screen, Txt } from "../src/ui";
import { QueryFailure } from "../src/content";

export default function Security() {
  const { api, scope, session, queryClient } = useAccount();
  const { t } = useAppearance();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const status = useQuery({ queryKey: [scope, "mfa"], queryFn: () => api.mfaStatus() });
  const [setup, setSetup] = useState<MfaTotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const lock = useRef(false);
  async function run(start: boolean) {
    if (lock.current) return;
    if (!start && !/^\d{6}$/.test(code)) {
      setError(t("Enter the six-digit authenticator code.", "أدخل رمز المصادقة المكوّن من ستة أرقام."));
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (start) {
        setSetup(await api.setupMfaTotp());
        setCode("");
      } else {
        if (!status.data?.enabled) {
          await api.enableMfaTotp({ code });
          setSetup(null);
          queryClient.setQueryData([scope, "mfa"], { enabled: true });
        }
        await sessionController.verifyMfa(code);
        setCode("");
        setDone(true);
      }
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Txt variant="title">{t("Protect your account", "احمِ حسابك")}</Txt>
      <Txt muted>{t("Use an authenticator app to approve sensitive account actions.", "استخدم تطبيق المصادقة لتأكيد إجراءات الحساب الحساسة.")}</Txt>
      {status.isPending ? (
        <Loading />
      ) : status.isError ? (
        <QueryFailure error={status.error} retry={() => void status.refetch()} />
      ) : done ? (
        <>
          <Card tone="tint">
            <Txt variant="heading">{t("Authenticator confirmed", "تم تأكيد المصادقة")}</Txt>
            <Txt>
              {t(
                "You can continue with Instagram. We’ll ask again when the confirmation expires.",
                "يمكنك المتابعة مع إنستغرام. سنطلب التأكيد مجددًا عند انتهاء صلاحيته."
              )}
            </Txt>
          </Card>
          <Button
            label={from === "instagram" ? t("Back to Instagram", "العودة إلى إنستغرام") : t("Back to settings", "العودة إلى الإعدادات")}
            onPress={() => router.replace(from === "instagram" ? "/instagram" : "/account")}
          />
        </>
      ) : (
        <>
          {status.data.enabled ? (
            <Card tone="tint">
              <Txt variant="heading">{t("Two-step protection is on", "الحماية بخطوتين مفعّلة")}</Txt>
              <Txt>
                {mfaActive(session)
                  ? t("Your current security confirmation is active.", "تأكيد الأمان الحالي نشط.")
                  : t("Enter a fresh code to confirm a sensitive action.", "أدخل رمزًا جديدًا لتأكيد إجراء حساس.")}
              </Txt>
            </Card>
          ) : !setup ? (
            <Button icon={ShieldCheck} busy={busy} label={t("Set up authenticator", "إعداد تطبيق المصادقة")} onPress={() => void run(true)} />
          ) : (
            <Card>
              <Txt variant="heading">{t("Add MARKOS to your authenticator", "أضف ماركوس إلى تطبيق المصادقة")}</Txt>
              <Txt>
                {t(
                  "Open your authenticator, or choose “Enter a setup key” and use this key with time-based codes.",
                  "افتح تطبيق المصادقة، أو اختر إدخال مفتاح إعداد واستخدم هذا المفتاح مع الرموز المستندة إلى الوقت."
                )}
              </Txt>
              <Txt selectable style={{ writingDirection: "ltr", textAlign: "left", letterSpacing: 1 }}>
                {setup.secret}
              </Txt>
              <Button
                secondary
                label={t("Open authenticator app", "فتح تطبيق المصادقة")}
                onPress={() =>
                  void Linking.openURL(setup.otpauthUri).catch(() =>
                    setError(t("Open your authenticator manually and enter the setup key above.", "افتح تطبيق المصادقة يدويًا وأدخل مفتاح الإعداد أعلاه."))
                  )
                }
              />
              <Txt variant="meta" muted>
                {t("Keep this key private. Enabling protection requires a valid code.", "احتفظ بالمفتاح سرًا. يتطلب تفعيل الحماية رمزًا صحيحًا.")}
              </Txt>
            </Card>
          )}
          {status.data.enabled || setup ? (
            <>
              <Field
                label={t("Authenticator code", "رمز المصادقة")}
                value={code}
                onChangeText={(value) => setCode(authenticatorCode(value))}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                editable={!busy}
                style={{ textAlign: "left", writingDirection: "ltr" }}
              />
              <Button
                busy={busy}
                label={status.data.enabled ? t("Confirm code", "تأكيد الرمز") : t("Enable protection", "تفعيل الحماية")}
                onPress={() => void run(false)}
              />
            </>
          ) : null}
          <Txt variant="meta" muted>
            {t(
              "Keep access to your authenticator. Password recovery does not turn off two-step protection.",
              "احتفظ بإمكانية الوصول إلى تطبيق المصادقة. استعادة كلمة المرور لا تلغي الحماية بخطوتين."
            )}
          </Txt>
        </>
      )}
      {error ? <Notice error>{error}</Notice> : null}
    </Screen>
  );
}
