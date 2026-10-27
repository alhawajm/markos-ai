import React, { useState } from "react";
import { Alert } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAccount, useAppearance } from "./providers";
import { Button, Card, Field, Loading, Notice, Txt } from "./ui";
import { QueryFailure } from "./content";
import { sessionController } from "./auth/transport";
import { errorMessage } from "./errors";
import { briefStore } from "./campaigns/brief-store";
import { clearStudioDeviceData } from "./studio/device-store";
import { clearBusinessDeviceData } from "./business/device-store";

export function AccountDeletion() {
  const { api, scope, epoch, session } = useAccount();
  const { t } = useAppearance();
  const [opened, setOpened] = useState(false),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [challengeToken, setChallengeToken] = useState(""),
    [emailCode, setEmailCode] = useState("");
  const sendCode = useMutation({
    mutationFn: () => api.requestAccountDeletionCode(),
    onSuccess: (r) => {
      setChallengeToken(r.challengeToken);
      setEmailCode("");
    }
  });
  const preview = useQuery({ queryKey: [scope, "account-deletion"], queryFn: () => api.accountDeletionPreview(), enabled: opened });
  const erase = useMutation({
    mutationFn: async () => {
      if (!deleted) {
        await api.deleteAccount({
          confirmation: "DELETE",
          confirmationToken: preview.data!.confirmationToken,
          ...(preview.data!.passwordRequired ? { password } : { challengeToken, emailCode }),
          ...(code ? { totpCode: code } : {})
        });
        setDeleted(true);
        setPassword("");
        setCode("");
      }
      const workspaces = [...(preview.data?.ownedWorkspaces ?? []), ...(preview.data?.otherWorkspaces ?? [])];
      const prefix = scope.slice(0, scope.lastIndexOf(":"));
      const scopes = new Set([scope, ...workspaces.map((w) => `${prefix}:${w.id}`)]);
      await Promise.all([...scopes].flatMap((key) => [briefStore(key, epoch).clear(), clearStudioDeviceData(key), clearBusinessDeviceData(key, epoch)]));
      await sessionController.logout();
    }
  });
  const confirm = () =>
    Alert.alert(
      t("Permanently delete your account?", "حذف حسابك نهائيًا؟"),
      t(
        "Your account and every workspace you own will be deleted. Other people’s workspaces remain; your membership is removed. This cannot be undone.",
        "سيُحذف حسابك وكل مساحات العمل التي تملكها. تبقى مساحات الآخرين وتُزال عضويتك منها. لا يمكن التراجع."
      ),
      [
        { text: t("Cancel", "إلغاء"), style: "cancel" },
        { text: t("Delete account", "حذف الحساب"), style: "destructive", onPress: () => erase.mutate() }
      ]
    );
  return (
    <Card tone="warning">
      <Txt variant="heading">{t("Delete your account", "حذف حسابك")}</Txt>
      {!opened ? (
        <Button secondary label={t("Review account deletion", "مراجعة حذف الحساب")} onPress={() => setOpened(true)} />
      ) : (
        <>
          {preview.isPending ? (
            <Loading />
          ) : preview.isError ? (
            <QueryFailure error={preview.error} retry={() => void preview.refetch()} />
          ) : (
            <>
              <Txt>{session.user.email}</Txt>
              <Txt>
                {t(
                  "These owned workspaces and their saved business content will be deleted for everyone:",
                  "ستُحذف مساحات العمل التي تملكها ومحتواها المحفوظ لجميع الأعضاء:"
                )}
              </Txt>
              {preview.data.ownedWorkspaces.length ? (
                preview.data.ownedWorkspaces.map((w) => <Txt key={w.id}>• {w.name}</Txt>)
              ) : (
                <Txt muted>{t("No owned workspaces", "لا توجد مساحات مملوكة")}</Txt>
              )}
              {preview.data.otherWorkspaces.length ? (
                <>
                  <Txt>{t("You will leave these workspaces; their content stays with their owners:", "ستغادر هذه المساحات؛ يبقى محتواها لدى أصحابها:")}</Txt>
                  {preview.data.otherWorkspaces.map((w) => (
                    <Txt key={w.id}>• {w.name}</Txt>
                  ))}
                </>
              ) : null}
              <Txt muted>
                {t(
                  "Export anything you want to keep first. Sign-in and scheduled publishing stop immediately. Stored files are removed in the background. Published Instagram posts remain. Limited security and transaction records may be retained.",
                  "صدّر ما تريد الاحتفاظ به أولًا. يتوقف تسجيل الدخول والنشر المجدول فورًا، وتُحذف الملفات في الخلفية. تبقى منشورات إنستغرام المنشورة. قد تُحفظ سجلات أمنية ومعاملات محدودة."
                )}
              </Txt>
              {preview.data.passwordRequired ? (
                <Field
                  label={t("Current password", "كلمة المرور الحالية")}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!erase.isPending && !deleted}
                />
              ) : (
                <>
                  <Button
                    secondary
                    busy={sendCode.isPending}
                    disabled={erase.isPending || deleted}
                    label={t("Email a confirmation code", "إرسال رمز تأكيد إلى البريد")}
                    onPress={() => sendCode.mutate()}
                  />
                  {challengeToken ? (
                    <Txt muted>
                      {t(
                        "Enter the 8-digit code sent to your email. It expires in 10 minutes.",
                        "أدخل الرمز المكوّن من ٨ أرقام المرسل إلى بريدك. تنتهي صلاحيته خلال ١٠ دقائق."
                      )}
                    </Txt>
                  ) : null}
                  <Field
                    label={t("Email confirmation code", "رمز التأكيد بالبريد")}
                    value={emailCode}
                    onChangeText={setEmailCode}
                    keyboardType="number-pad"
                    maxLength={8}
                    editable={!erase.isPending && !deleted}
                  />
                  {sendCode.isError ? <Notice error>{errorMessage(sendCode.error, t)}</Notice> : null}
                </>
              )}
              {preview.data.mfaRequired ? (
                <Field
                  label={t("Authenticator code", "رمز المصادقة")}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!erase.isPending && !deleted}
                />
              ) : null}
              <Field
                label={t("Type DELETE to confirm", "اكتب DELETE للتأكيد")}
                value={confirmation}
                onChangeText={setConfirmation}
                autoCapitalize="characters"
                editable={!erase.isPending && !deleted}
              />
              <Button
                secondary
                busy={erase.isPending}
                disabled={
                  !deleted &&
                  (confirmation !== "DELETE" ||
                    (preview.data.passwordRequired ? !password : !challengeToken || emailCode.length !== 8) ||
                    (preview.data.mfaRequired && code.length !== 6))
                }
                label={deleted ? t("Finish signing out", "إكمال تسجيل الخروج") : t("Delete account and owned workspaces", "حذف الحساب والمساحات المملوكة")}
                onPress={deleted ? () => erase.mutate() : confirm}
              />
              {!deleted ? (
                <Button
                  secondary
                  disabled={erase.isPending}
                  label={t("Refresh workspace list", "تحديث قائمة المساحات")}
                  onPress={() => void preview.refetch()}
                />
              ) : null}
            </>
          )}
          {erase.isError ? (
            <Notice error>
              {deleted
                ? t("Account deleted. Try again to clear this device and sign out.", "حُذف الحساب. حاول مجددًا لمسح بيانات الجهاز وتسجيل الخروج.")
                : errorMessage(erase.error, t)}
            </Notice>
          ) : null}
        </>
      )}
    </Card>
  );
}
