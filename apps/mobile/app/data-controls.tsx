import React, { useState } from "react";
import { Alert } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Download, Trash2 } from "lucide-react-native";
import { useAccount, useAppearance } from "../src/providers";
import { Button, Card, Field, Loading, Notice, Screen, Txt } from "../src/ui";
import { QueryFailure } from "../src/content";
import { errorMessage } from "../src/errors";
import { shareFile } from "../src/share-file";
import { sessionController } from "../src/auth/transport";
import { briefStore } from "../src/campaigns/brief-store";
import { clearStudioDeviceData } from "../src/studio/device-store";
import { clearBusinessDeviceData } from "../src/business/device-store";

export default function DataControls() {
  const { scope } = useAccount();
  return <Controls key={scope} />;
}
function Controls() {
  const { api, scope, epoch, session } = useAccount();
  const { t } = useAppearance();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [erased, setErased] = useState(false);
  const settings = useQuery({ queryKey: [scope, "account-settings"], queryFn: () => api.accountSettings() });
  const owner = settings.data?.workspace.ownerUserId === session.user.id;
  const exportData = useMutation({
    mutationFn: async () => {
      const data = await api.exportWorkspaceData();
      await shareFile(
        new TextEncoder().encode(JSON.stringify(data, null, 2)),
        `markos-workspace-${session.workspace.id}.json`,
        "application/json",
        epoch,
        t("Save workspace export", "حفظ بيانات مساحة العمل")
      );
    }
  });
  const erase = useMutation({
    mutationFn: async () => {
      if (!erased) {
        await api.eraseWorkspaceData();
        setErased(true);
      }
      // Clear private draft caches before ending the identity epoch.
      await Promise.all([briefStore(scope, epoch).clear(), clearStudioDeviceData(scope), clearBusinessDeviceData(scope, epoch)]);
      await sessionController.logout();
      router.replace("/login");
    }
  });
  function confirmErasure() {
    Alert.alert(
      t("Delete this workspace?", "حذف مساحة العمل هذه؟"),
      t(
        "This removes the workspace and its saved business content for every member. Your account is anonymized if you have no other workspaces. This cannot be undone.",
        "سيؤدي ذلك إلى إزالة مساحة العمل ومحتوى النشاط المحفوظ لجميع الأعضاء. تُزال بيانات حسابك الشخصية إذا لم تكن لديك مساحات عمل أخرى. لا يمكن التراجع عن ذلك."
      ),
      [
        { text: t("Cancel", "إلغاء"), style: "cancel" },
        { text: t("Delete workspace", "حذف مساحة العمل"), style: "destructive", onPress: () => erase.mutate() }
      ]
    );
  }
  return (
    <Screen>
      <Txt variant="title">{t("Your workspace data", "بيانات مساحة عملك")}</Txt>
      {settings.isPending ? (
        <Loading />
      ) : settings.isError ? (
        <QueryFailure error={settings.error} retry={() => void settings.refetch()} />
      ) : (
        <>
          {owner || session.roles.includes("WORKSPACE_ADMIN") ? (
            <Card>
              <Txt variant="heading">{t("Export a copy", "تصدير نسخة")}</Txt>
              <Txt muted>
                {t(
                  "Download saved business records, content, activity and team details as JSON. Store this file somewhere private.",
                  "نزّل سجلات النشاط والمحتوى والنشاطات وبيانات الفريق بصيغة JSON. احفظ الملف في مكان خاص."
                )}
              </Txt>
              <Button
                secondary
                icon={Download}
                busy={exportData.isPending}
                disabled={erase.isPending || erased}
                label={t("Export workspace data", "تصدير بيانات مساحة العمل")}
                onPress={() => exportData.mutate()}
              />
              {exportData.isError ? <Notice error>{errorMessage(exportData.error, t)}</Notice> : null}
            </Card>
          ) : (
            <Notice>{t("Ask the workspace owner for a workspace data export.", "اطلب من مالك مساحة العمل نسخة من البيانات.")}</Notice>
          )}
          {owner ? (
            <Card tone="warning">
              <Txt variant="heading">{t("Delete workspace data", "حذف بيانات مساحة العمل")}</Txt>
              <Txt>
                {t(
                  "This affects every member. Export anything you want to keep first. Published Instagram posts are not removed by this action.",
                  "يؤثر هذا الإجراء على جميع الأعضاء. صدّر ما تريد الاحتفاظ به أولًا. لن تُحذف المنشورات المنشورة على إنستغرام بهذا الإجراء."
                )}
              </Txt>
              <Field
                label={t(`Type “${settings.data.workspace.name}” to confirm`, `اكتب «${settings.data.workspace.name}» للتأكيد`)}
                value={confirmation}
                onChangeText={setConfirmation}
                editable={!erase.isPending && !erased}
              />
              <Button
                secondary
                icon={Trash2}
                busy={erase.isPending}
                disabled={exportData.isPending || (!erased && confirmation !== settings.data.workspace.name)}
                label={erased ? t("Finish signing out", "إكمال تسجيل الخروج") : t("Delete workspace", "حذف مساحة العمل")}
                onPress={erased ? () => erase.mutate() : confirmErasure}
              />
              {erase.isError ? (
                <Notice error>
                  {erased
                    ? t(
                        "Workspace deleted. Try again to clear this device and sign out.",
                        "تم حذف مساحة العمل. حاول مجددًا لمسح بيانات هذا الجهاز وتسجيل الخروج."
                      )
                    : errorMessage(erase.error, t)}
                </Notice>
              ) : null}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}
