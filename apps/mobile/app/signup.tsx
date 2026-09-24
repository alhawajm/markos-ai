import React, { useRef, useState } from "react";
import { Linking, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { accountPolicyVersion, nativeRegisterSchema } from "@markos/validation";
import { useAppearance } from "../src/providers";
import { sessionController } from "../src/auth/transport";
import { AuthScreen, PasswordField } from "../src/auth/forms";
import { Button, Field, Notice, Txt } from "../src/ui";
import { config } from "../src/config";
import { errorMessage } from "../src/errors";
export default function Signup() {
  const { t, locale, colors } = useAppearance();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    setError("");
    const input = {
      fullName,
      email,
      password,
      locale,
      acceptedTerms: consent,
      policyVersion: accountPolicyVersion,
      ...(workspaceName.trim() ? { workspaceName: workspaceName.trim() } : {})
    };
    const parsed = nativeRegisterSchema.safeParse(input);
    if (!parsed.success || confirmation !== password) {
      setError(
        !consent
          ? t("Accept the terms and privacy policy to continue.", "وافق على الشروط وسياسة الخصوصية للمتابعة.")
          : confirmation !== password
            ? t("Your passwords do not match.", "كلمتا المرور غير متطابقتين.")
            : t("Enter your name, a valid email, and a password of 15–128 characters.", "أدخل اسمك وبريدًا صحيحًا وكلمة مرور من ١٥ إلى ١٢٨ حرفًا.")
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await sessionController.register(parsed.data);
      setPassword("");
      setConfirmation("");
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function open(path: string) {
    void Linking.openURL(`${config.webUrl}/${locale}/${path}`).catch(() =>
      setError(t("Could not open the document. Try again.", "تعذّر فتح المستند. حاول مجددًا."))
    );
  }
  return (
    <AuthScreen
      title={t("Create your account", "إنشاء حسابك")}
      description={t("One MARKOS account for your business, on every device.", "حساب ماركوس واحد لنشاطك على جميع أجهزتك.")}
    >
      <Field
        label={t("Full name", "الاسم الكامل")}
        value={fullName}
        onChangeText={setFullName}
        maxLength={120}
        autoComplete="name"
        textContentType="name"
        editable={!busy}
      />
      <Field
        label={t("Email", "البريد الإلكتروني")}
        value={email}
        onChangeText={setEmail}
        maxLength={254}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        editable={!busy}
        style={{ writingDirection: "ltr", textAlign: "left" }}
      />
      <Field
        label={t("Business name (optional)", "اسم النشاط (اختياري)")}
        value={workspaceName}
        onChangeText={setWorkspaceName}
        maxLength={120}
        editable={!busy}
      />
      <PasswordField
        label={t("Password", "كلمة المرور")}
        value={password}
        onChange={setPassword}
        disabled={busy}
        hint={t("Use 15–128 characters. A long, unique passphrase works well.", "استخدم من ١٥ إلى ١٢٨ حرفًا. عبارة طويلة وفريدة خيار مناسب.")}
      />
      <PasswordField label={t("Confirm password", "تأكيد كلمة المرور")} value={confirmation} onChange={setConfirmation} disabled={busy} />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent, disabled: busy }}
        disabled={busy}
        onPress={() => setConsent(!consent)}
        style={{
          minHeight: 52,
          padding: 14,
          borderWidth: 1,
          borderColor: consent ? colors.primary : colors.border,
          borderRadius: 12,
          backgroundColor: consent ? colors.secondarySoft : colors.surface
        }}
      >
        <Txt>
          {consent ? "✓ " : "○ "}
          {t("I agree to the Terms of Service and Privacy Policy.", "أوافق على شروط الخدمة وسياسة الخصوصية.")}
        </Txt>
      </Pressable>
      <Button secondary label={t("Terms of Service", "شروط الخدمة")} onPress={() => open("terms")} />
      <Button secondary label={t("Privacy Policy", "سياسة الخصوصية")} onPress={() => open("privacy")} />
      {error ? <Notice error>{error}</Notice> : null}
      <Button busy={busy} label={t("Create account", "إنشاء الحساب")} onPress={() => void submit()} />
      <Button secondary disabled={busy} label={t("Already have an account? Log in", "لديك حساب؟ سجّل الدخول")} onPress={() => router.replace("/login")} />
    </AuthScreen>
  );
}
