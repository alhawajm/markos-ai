import React, { useCallback, useRef, useState } from "react";
import { Alert, Linking } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Camera, RefreshCw, ShieldCheck, Unplug } from "lucide-react-native";
import type { InstagramDisconnectResult } from "@markos/shared-types";
import { useAccount, useAppearance } from "../src/providers";
import { Button, Card, Loading, Notice, Screen, Txt } from "../src/ui";
import { QueryFailure } from "../src/content";
import { config } from "../src/config";
import { errorMessage } from "../src/errors";
import { authorizationUrl, canManageInstagram, canScheduleContent, mfaActive, readinessMessage } from "../src/instagram/model";

export default function InstagramSettings() {
  const { api, scope, session, queryClient } = useAccount();
  const { t, locale } = useAppearance();
  const router = useRouter();
  const connection = useQuery({ queryKey: [scope, "instagram"], queryFn: () => api.instagramConnection(), refetchOnWindowFocus: "always" });
  const mfa = useQuery({ queryKey: [scope, "mfa"], queryFn: () => api.mfaStatus(), refetchOnWindowFocus: "always" });
  const publishingAccess = canScheduleContent(session.roles);
  const readiness = useQuery({
    queryKey: [scope, "publishing-readiness"],
    queryFn: () => api.publishingLiveReadiness(),
    refetchOnWindowFocus: "always",
    enabled: publishingAccess
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  const [revocation, setRevocation] = useState<InstagramDisconnectResult["providerRevocation"] | null>(null);
  const lock = useRef(false);
  const manage = canManageInstagram(session.roles);
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [scope, "instagram"] });
    void queryClient.invalidateQueries({ queryKey: [scope, "mfa"] });
    void queryClient.invalidateQueries({ queryKey: [scope, "publishing-readiness"] });
  }, [queryClient, scope]);
  // A return link only opens this screen. Connection state always comes from the authenticated API.
  useFocusEffect(refresh);
  async function run(action: "connect" | "refresh" | "disconnect") {
    if (lock.current) return;
    if (!mfa.data?.enabled || (action !== "connect" && !mfaActive(session))) {
      router.push({ pathname: "/security", params: { from: "instagram" } });
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (action === "connect") {
        const start = await api.instagramOAuthStart({ locale, returnTo: `/${locale}/mobile/instagram` });
        await Linking.openURL(authorizationUrl(start, config.apiUrl));
        setOpened(true);
        setRevocation(null);
      } else if (action === "refresh") {
        await api.refreshInstagramToken();
        refresh();
      } else {
        const result = await api.disconnectInstagram();
        setRevocation(result.providerRevocation);
        setOpened(false);
        refresh();
      }
    } catch (e) {
      setError(errorMessage(e, t));
      refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function connect() {
    if (!connection.data?.connected) {
      void run("connect");
      return;
    }
    Alert.alert(
      t("Reconnect Instagram?", "إعادة ربط إنستغرام؟"),
      t(
        "Choose the correct account during consent. Scheduled posts will use the account connected to this workspace.",
        "اختر الحساب الصحيح أثناء الموافقة. ستستخدم المنشورات المجدولة الحساب المرتبط بمساحة العمل."
      ),
      [
        { text: t("Cancel", "إلغاء"), style: "cancel" },
        { text: t("Continue", "متابعة"), onPress: () => void run("connect") }
      ]
    );
  }
  const linked = connection.data;
  return (
    <Screen>
      <Txt variant="title">{t("Your Instagram", "حسابك على إنستغرام")}</Txt>
      <Txt muted>
        {t("Connect a professional account to prepare your approved content for publishing.", "اربط حسابًا احترافيًا لتجهيز المحتوى المعتمد للنشر.")}
      </Txt>
      {connection.isPending ? (
        <Loading />
      ) : connection.isError ? (
        <QueryFailure error={connection.error} retry={() => void connection.refetch()} />
      ) : (
        <>
          <Card tone={linked?.connected && linked.status === "CONNECTED" ? "tint" : "warning"}>
            <Txt variant="heading">
              {linked?.connected
                ? linked.username
                  ? `@${linked.username}`
                  : t("Instagram connected", "إنستغرام متصل")
                : t("No account connected", "لا يوجد حساب مرتبط")}
            </Txt>
            <Txt>
              {linked?.connected
                ? linked.status === "CONNECTED"
                  ? t("This is the account used by this workspace.", "هذا هو الحساب الذي تستخدمه مساحة العمل.")
                  : t("Your connection needs attention. Reconnect to restore publishing access.", "يحتاج الاتصال إلى معالجة. أعد الربط لاستعادة صلاحية النشر.")
                : t("You can keep drafting while Instagram is disconnected.", "يمكنك متابعة إعداد المسودات أثناء عدم اتصال إنستغرام.")}
            </Txt>
            {linked?.tokenExpiresAt ? (
              <Txt variant="meta" muted>
                {t("Permission expires: ", "ينتهي الإذن: ") + new Date(linked.tokenExpiresAt).toLocaleDateString(locale)}
              </Txt>
            ) : null}
          </Card>
          {manage ? (
            <>
              {mfa.isPending ? (
                <Loading />
              ) : mfa.isError ? (
                <QueryFailure error={mfa.error} retry={() => void mfa.refetch()} />
              ) : !mfa.data.enabled ? (
                <Card>
                  <ShieldCheck size={24} />
                  <Txt>{t("Set up an authenticator before connecting Instagram.", "أعِدّ تطبيق المصادقة قبل ربط إنستغرام.")}</Txt>
                  <Button label={t("Secure my account", "تأمين حسابي")} onPress={() => router.push({ pathname: "/security", params: { from: "instagram" } })} />
                </Card>
              ) : (
                <>
                  <Button
                    icon={Camera}
                    busy={busy}
                    label={linked?.connected ? t("Reconnect Instagram", "إعادة ربط إنستغرام") : t("Connect Instagram", "ربط إنستغرام")}
                    onPress={connect}
                  />
                  {linked?.connected ? (
                    <Button secondary icon={RefreshCw} disabled={busy} label={t("Renew connection", "تجديد الاتصال")} onPress={() => void run("refresh")} />
                  ) : null}
                </>
              )}
              {linked?.connected ? (
                <Button
                  secondary
                  icon={Unplug}
                  disabled={busy || !mfa.data || mfa.isError}
                  label={t("Disconnect Instagram", "فصل إنستغرام")}
                  onPress={() =>
                    Alert.alert(
                      t("Disconnect this account?", "فصل هذا الحساب؟"),
                      t(
                        "Scheduled posts cannot publish while disconnected. Your content stays in MARKOS.",
                        "لن تتمكن المنشورات المجدولة من النشر أثناء الفصل. سيبقى المحتوى في ماركوس."
                      ),
                      [
                        { text: t("Keep connected", "إبقاء الاتصال"), style: "cancel" },
                        { text: t("Disconnect", "فصل"), style: "destructive", onPress: () => void run("disconnect") }
                      ]
                    )
                  }
                />
              ) : null}
            </>
          ) : (
            <Notice>{t("Ask a workspace administrator to manage this connection.", "اطلب من مسؤول مساحة العمل إدارة هذا الاتصال.")}</Notice>
          )}
        </>
      )}
      {opened ? (
        <Notice>
          {t(
            "After finishing in Instagram, return here and check the account shown above. Cancelling consent keeps the previous connection.",
            "بعد الانتهاء في إنستغرام، عد إلى هنا وتحقّق من الحساب المعروض أعلاه. إلغاء الموافقة يُبقي الاتصال السابق."
          )}
        </Notice>
      ) : null}
      {revocation && ["ACTION_REQUIRED", "UNCONFIRMED"].includes(revocation.status) ? (
        <Card tone="warning">
          <Txt>
            {t(
              "Disconnected from MARKOS. Remove MARKOS from Instagram’s connected apps to remove the provider’s permission too.",
              "تم الفصل من ماركوس. أزل ماركوس من التطبيقات المرتبطة بإنستغرام لإزالة إذن المزوّد أيضًا."
            )}
          </Txt>
        </Card>
      ) : null}
      {publishingAccess ? (
        <Card>
          <Txt variant="heading">{t("Publishing readiness", "الاستعداد للنشر")}</Txt>
          {readiness.isPending ? (
            <Loading />
          ) : readiness.isError ? (
            <QueryFailure error={readiness.error} retry={() => void readiness.refetch()} />
          ) : readiness.data.ready ? (
            <Txt>
              {t(
                "The connection and publishing service are ready. Each post’s media and caption are checked before scheduling and publishing.",
                "الاتصال وخدمة النشر جاهزان. تُفحص وسائط كل منشور ونصه قبل الجدولة والنشر."
              )}
            </Txt>
          ) : (
            [...new Set(readiness.data.reasons.map((reason) => readinessMessage(reason, t)))].map((message) => <Txt key={message}>{message}</Txt>)
          )}
          <Button
            secondary
            icon={RefreshCw}
            label={t("Check status", "التحقّق من الحالة")}
            disabled={connection.isFetching || readiness.isFetching}
            onPress={refresh}
          />
        </Card>
      ) : null}
      {error ? <Notice error>{error}</Notice> : null}
    </Screen>
  );
}
