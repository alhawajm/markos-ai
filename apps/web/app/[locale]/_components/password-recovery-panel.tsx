"use client";
import { useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, LockKeyhole, Mail } from "lucide-react";
import { MarkosApiClient, MarkosApiError } from "@markos/api-client";
import type { Locale, PasswordResetChallenge } from "@markos/shared-types";
import { forgotPasswordSchema, resetPasswordSchema } from "@markos/validation";
import { getBrowserApiBaseUrl } from "./api-base-url";
import styles from "./auth-page.module.css";

export function PasswordRecoveryPanel({ locale }: { locale: Locale }) {
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState<PasswordResetChallenge | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    setError("");
    const input = challenge ? { challengeId: challenge.challengeId, code, password, confirmPassword: confirmation } : null;
    if (input ? !resetPasswordSchema.safeParse(input).success : !forgotPasswordSchema.safeParse({ email, locale }).success) {
      setError(
        input
          ? t(
              "Enter your eight-digit code and matching passwords of 15–128 characters.",
              "أدخل الرمز المكوّن من ثمانية أرقام وكلمتي مرور متطابقتين من ١٥ إلى ١٢٨ حرفًا."
            )
          : t("Enter a valid email address.", "أدخل بريدًا إلكترونيًا صحيحًا.")
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const client = new MarkosApiClient({ baseUrl: getBrowserApiBaseUrl() });
      if (input) {
        await client.resetPassword(input);
        setDone(true);
        setCode("");
        setPassword("");
        setConfirmation("");
      } else setChallenge(await client.requestPasswordReset({ email: email.trim(), locale }));
    } catch (e) {
      setError(
        e instanceof MarkosApiError && e.code === "PASSWORD_RESET_INVALID"
          ? t("The code is invalid, expired or used. Request a new code.", "الرمز غير صحيح أو منتهي الصلاحية أو مستخدم. اطلب رمزًا جديدًا.")
          : e instanceof MarkosApiError && e.status === 429
            ? t("Too many attempts. Wait before trying again.", "محاولات كثيرة. انتظر قبل المحاولة مجددًا.")
            : t("Could not complete the request. Check your connection and try again.", "تعذّر إكمال الطلب. تحقّق من اتصالك وحاول مجددًا.")
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className={styles.authHeading}>
        <span aria-hidden="true">
          <KeyRound size={22} />
        </span>
        <h1>
          {done
            ? t("Password updated", "تم تحديث كلمة المرور")
            : challenge
              ? t("Check your email", "تحقّق من بريدك")
              : t("Recover your account", "استعادة حسابك")}
        </h1>
        <p>
          {done
            ? t("Previous sessions are signed out. Log in with your new password.", "تم تسجيل خروج الجلسات السابقة. سجّل الدخول بكلمة المرور الجديدة.")
            : challenge
              ? t(
                  "If this email has a password account, we’ll send an eight-digit code. Check spam too. It expires in 10 minutes.",
                  "إذا كان لهذا البريد حساب بكلمة مرور، سنرسل رمزًا من ثمانية أرقام. تحقّق من البريد غير المرغوب. تنتهي صلاحيته خلال ١٠ دقائق."
                )
              : t("We’ll email a code so you can choose a new password.", "سنرسل رمزًا إلى بريدك لتختار كلمة مرور جديدة.")}
        </p>
      </div>
      {!done ? (
        <form noValidate onSubmit={submit}>
          <fieldset className="contents" disabled={busy}>
            <div className={styles.formStack}>
              {challenge ? (
                <>
                  <strong dir="ltr">{email}</strong>
                  <label htmlFor="recovery-code">{t("Eight-digit code", "الرمز المكوّن من ثمانية أرقام")}</label>
                  <span className={styles.inputWrap}>
                    <KeyRound size={18} aria-hidden="true" />
                    <input
                      id="recovery-code"
                      value={code}
                      onChange={(e) =>
                        setCode(
                          e.target.value
                            .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660))
                            .replace(/\D/g, "")
                            .slice(0, 8)
                        )
                      }
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      dir="ltr"
                    />
                  </span>
                  {[
                    { id: "recovery-password", label: t("New password", "كلمة المرور الجديدة"), value: password, change: setPassword },
                    { id: "recovery-confirm", label: t("Confirm new password", "تأكيد كلمة المرور الجديدة"), value: confirmation, change: setConfirmation }
                  ].map((field) => (
                    <div key={field.id}>
                      <label htmlFor={field.id}>{field.label}</label>
                      <span className={styles.inputWrap}>
                        <LockKeyhole size={18} aria-hidden="true" />
                        <input
                          id={field.id}
                          type={show ? "text" : "password"}
                          autoComplete="new-password"
                          maxLength={128}
                          value={field.value}
                          onChange={(e) => field.change(e.target.value)}
                        />
                        <button
                          className={styles.revealButton}
                          type="button"
                          aria-label={show ? t("Hide password", "إخفاء كلمة المرور") : t("Show password", "إظهار كلمة المرور")}
                          onClick={() => setShow(!show)}
                        >
                          {show ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </span>
                    </div>
                  ))}
                  <small>{t("Use 15–128 characters", "استخدم من ١٥ إلى ١٢٨ حرفًا")}</small>
                </>
              ) : (
                <>
                  <label htmlFor="recovery-email">{t("Email", "البريد الإلكتروني")}</label>
                  <span className={styles.inputWrap}>
                    <Mail size={18} aria-hidden="true" />
                    <input
                      id="recovery-email"
                      type="email"
                      value={email}
                      maxLength={254}
                      autoComplete="email"
                      onChange={(e) => setEmail(e.target.value)}
                      dir="ltr"
                    />
                  </span>
                </>
              )}
              {error ? (
                <p className={styles.notice} data-tone="error" role="alert">
                  {error}
                </p>
              ) : null}
              <button className={styles.primaryButton} disabled={busy} type="submit">
                {busy
                  ? t("Please wait…", "يرجى الانتظار…")
                  : challenge
                    ? t("Update password", "تحديث كلمة المرور")
                    : t("Send recovery code", "إرسال رمز الاستعادة")}
              </button>
              {challenge ? (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    setChallenge(null);
                    setCode("");
                    setPassword("");
                    setConfirmation("");
                    setError("");
                  }}
                >
                  {t("Request a new code or change email", "طلب رمز جديد أو تغيير البريد")}
                </button>
              ) : null}
            </div>
          </fieldset>
        </form>
      ) : null}
      <a className={`${styles.textLink} ${styles.centeredLink}`} href={`/${locale}/login`}>
        {t("Back to login", "العودة لتسجيل الدخول")}
      </a>
    </>
  );
}
