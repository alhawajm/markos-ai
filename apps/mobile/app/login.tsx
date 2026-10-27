import React, { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Sparkles, Eye, EyeOff } from "lucide-react-native";
import { useAppearance, useSession } from "../src/providers";
import { sessionController } from "../src/auth/transport";
import { errorMessage } from "../src/errors";
import { Button, Field, IconButton, Notice, Row, Screen, Txt } from "../src/ui";

export default function Login() {
  const router = useRouter();
  const { colors, locale, setPreferences, t } = useAppearance();
  const { status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfa, setMfa] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await sessionController.login({ email: email.trim(), password, ...(code ? { totpCode: code } : {}) });
      setPassword("");
    } catch (problem) {
      if (typeof problem === "object" && problem && "code" in problem && ["MFA_REQUIRED", "MFA_INVALID"].includes(String(problem.code))) setMfa(true);
      setError(errorMessage(problem, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen>
        <Row style={{ justifyContent: "space-between", marginBottom: 20 }}>
          <Row>
            <View style={{ padding: 12, backgroundColor: colors.secondary, borderRadius: 16 }}>
              <Sparkles size={24} strokeWidth={1.5} color={colors.onSecondary} />
            </View>
            <Txt variant="heading">MARKOS</Txt>
          </Row>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void setPreferences({ locale: locale === "en" ? "ar" : "en" });
            }}
            style={{ minHeight: 48, justifyContent: "center", padding: 8 }}
          >
            <Txt variant="label">{locale === "en" ? "العربية" : "English"}</Txt>
          </Pressable>
        </Row>
        <Txt variant="title">{t("Welcome back", "أهلًا بعودتك")}</Txt>
        <Txt muted>{t("Your business. Your ideas. Wherever you are.", "نشاطك وأفكارك معك أينما كنت.")}</Txt>
        {status === "offline" ? (
          <>
            <Notice error>{t("You’re offline. Your saved sign-in is still on this device.", "أنت غير متصل. تسجيل دخولك محفوظ على هذا الجهاز.")}</Notice>
            <Button
              label={t("Try connection again", "إعادة الاتصال")}
              onPress={() => {
                void sessionController.restore();
              }}
            />
            <Button
              secondary
              label={t("Use another account", "استخدام حساب آخر")}
              onPress={() => {
                void sessionController.logout();
              }}
            />
          </>
        ) : (
          <>
            <Field
              label={t("Email", "البريد الإلكتروني")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              style={{ writingDirection: "ltr", textAlign: "left" }}
            />
            <Field
              label={t("Password", "كلمة المرور")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!visible}
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={() => {
                void signIn();
              }}
            />
            <Row style={{ justifyContent: "space-between", marginTop: -12 }}>
              <IconButton
                label={visible ? t("Hide password", "إخفاء كلمة المرور") : t("Show password", "إظهار كلمة المرور")}
                icon={visible ? EyeOff : Eye}
                onPress={() => setVisible(!visible)}
              />
              <Pressable onPress={() => router.push("/recover")} accessibilityRole="link" style={{ minHeight: 48, justifyContent: "center" }}>
                <Txt variant="label">{t("Forgot password?", "نسيت كلمة المرور؟")}</Txt>
              </Pressable>
            </Row>
            {mfa ? (
              <Field
                label={t("Authenticator code", "رمز تطبيق المصادقة")}
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
                maxLength={6}
                autoComplete="one-time-code"
              />
            ) : null}
            {error ? <Notice error>{error}</Notice> : null}
            <Button
              label={t("Log in", "تسجيل الدخول")}
              busy={busy}
              disabled={!email.trim() || !password}
              onPress={() => {
                void signIn();
              }}
            />
            <Button secondary disabled={busy} label={t("Create an account", "إنشاء حساب")} onPress={() => router.push("/signup")} />
          </>
        )}
      </Screen>
    </SafeAreaView>
  );
}
