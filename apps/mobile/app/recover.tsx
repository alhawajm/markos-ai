import React, { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { forgotPasswordSchema, resetPasswordSchema } from "@markos/validation";
import type { PasswordResetChallenge } from "@markos/shared-types";
import { useAppearance } from "../src/providers";
import { passwordRecovery, sessionController } from "../src/auth/transport";
import { AuthScreen, PasswordField } from "../src/auth/forms";
import { Button, Field, Notice, Txt } from "../src/ui";
import { errorMessage } from "../src/errors";
export default function Recover() {
  const { t, locale } = useAppearance();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState<PasswordResetChallenge | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    setError("");
    if (!challenge && !forgotPasswordSchema.safeParse({ email, locale }).success) {
      setError(t("Enter a valid email address.", "أدخل بريدًا إلكترونيًا صحيحًا."));
      return;
    }
    const input = challenge ? { challengeId: challenge.challengeId, code, password, confirmPassword: confirmation } : null;
    if (input && !resetPasswordSchema.safeParse(input).success) {
      setError(
        t(
          "Enter the eight-digit code and matching passwords of 15–128 characters.",
          "أدخل الرمز المكوّن من ثمانية أرقام وكلمتي مرور متطابقتين من ١٥ إلى ١٢٨ حرفًا."
        )
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      if (input) {
        await passwordRecovery.reset(input);
        setPassword("");
        setConfirmation("");
        setCode("");
        setChallenge(null);
        setDone(true);
        await sessionController.logout();
      } else {
        setChallenge(await passwordRecovery.request({ email: email.trim(), locale }));
        setCode("");
      }
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <AuthScreen
      title={
        done ? t("Password updated", "تم تحديث كلمة المرور") : challenge ? t("Check your email", "تحقّق من بريدك") : t("Recover your account", "استعادة حسابك")
      }
      description={
        done
          ? t(
              "Your previous sessions are signed out. Log in with your new password; authenticator protection stays enabled.",
              "تم تسجيل خروج الجلسات السابقة. سجّل الدخول بكلمة المرور الجديدة؛ تبقى حماية المصادقة مفعّلة."
            )
          : challenge
            ? t(
                "If this email has a password account, we’ll send an eight-digit code. Check spam too. The code expires in 10 minutes.",
                "إذا كان لهذا البريد حساب بكلمة مرور، سنرسل رمزًا من ثمانية أرقام. تحقّق من البريد غير المرغوب أيضًا. تنتهي صلاحية الرمز خلال ١٠ دقائق."
              )
            : t("We’ll email a code so you can choose a new password.", "سنرسل رمزًا إلى بريدك لتتمكن من اختيار كلمة مرور جديدة.")
      }
    >
      {!done ? (
        <>
          {challenge ? (
            <>
              <Txt>{email}</Txt>
              <Field
                label={t("Eight-digit code", "الرمز المكوّن من ثمانية أرقام")}
                value={code}
                onChangeText={(text) =>
                  setCode(
                    text
                      .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660))
                      .replace(/\D/g, "")
                      .slice(0, 8)
                  )
                }
                keyboardType="number-pad"
                maxLength={8}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                editable={!busy}
                style={{ writingDirection: "ltr", textAlign: "left" }}
              />
              <PasswordField
                label={t("New password", "كلمة المرور الجديدة")}
                value={password}
                onChange={setPassword}
                disabled={busy}
                hint={t("15–128 characters", "من ١٥ إلى ١٢٨ حرفًا")}
              />
              <PasswordField label={t("Confirm new password", "تأكيد كلمة المرور الجديدة")} value={confirmation} onChange={setConfirmation} disabled={busy} />
            </>
          ) : (
            <Field
              label={t("Email", "البريد الإلكتروني")}
              value={email}
              onChangeText={setEmail}
              maxLength={254}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!busy}
              style={{ writingDirection: "ltr", textAlign: "left" }}
            />
          )}
          {error ? <Notice error>{error}</Notice> : null}
          <Button
            busy={busy}
            label={challenge ? t("Update password", "تحديث كلمة المرور") : t("Send recovery code", "إرسال رمز الاستعادة")}
            onPress={() => void submit()}
          />
          {challenge ? (
            <Button
              secondary
              disabled={busy}
              label={t("Request a new code or change email", "طلب رمز جديد أو تغيير البريد")}
              onPress={() => {
                setChallenge(null);
                setCode("");
                setPassword("");
                setConfirmation("");
                setError("");
              }}
            />
          ) : null}
        </>
      ) : null}
      <Button secondary disabled={busy} label={t("Back to login", "العودة لتسجيل الدخول")} onPress={() => router.replace("/login")} />
    </AuthScreen>
  );
}
