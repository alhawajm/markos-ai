import React, { useEffect, useRef } from "react";
import { Alert, AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { useRouter, useRootNavigationState } from "expo-router";
import type { MarkosApiClient } from "@markos/api-client";
import { useSession, useAppearance } from "./providers";
import { sessionController } from "./auth/transport";
import { LocalAppError } from "./errors";
import { serviceKey } from "./config";

export const pushDeviceKey = `markos.push.${serviceKey}`;
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const session = sessionController.getSnapshot().session;
    const matches = !!session && notification.request.content.data?.userId === session.user.id;
    return { shouldShowBanner: matches, shouldShowList: matches, shouldPlaySound: false, shouldSetBadge: false };
  }
});
export async function enablePhoneNotifications(api: MarkosApiClient, userId: string, epoch: number, locale: "ar" | "en", prompt: boolean) {
  const ar = locale === "ar";
  if (!Device.isDevice || !["ios", "android"].includes(Platform.OS)) {
    if (prompt) throw new LocalAppError(ar ? "فعّل الإشعارات على هاتف حقيقي." : "Enable notifications on a physical phone.");
    return;
  }
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("publishing", { name: ar ? "النشر" : "Publishing", importance: Notifications.AndroidImportance.DEFAULT });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && prompt) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    const saved = await SecureStore.getItemAsync(pushDeviceKey);
    if (saved) {
      const device = JSON.parse(saved) as { id: string; userId: string };
      if (device.userId === userId) {
        sessionController.assertEpoch(epoch);
        await api.revokePushDevice(device.id);
        sessionController.assertEpoch(epoch);
        await SecureStore.deleteItemAsync(pushDeviceKey);
      }
    }
    if (prompt)
      throw new LocalAppError(
        ar ? "اسمح بإشعارات ماركوس من إعدادات الهاتف ثم حاول مجددًا." : "Allow MARKOS notifications in your phone settings, then try again."
      );
    return;
  }
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new LocalAppError(ar ? "إعداد الإشعارات غير مكتمل في هذا الإصدار." : "Notification setup is missing in this app build.");
  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    if (Platform.OS === "android" && error instanceof Error && /Firebase|FCM|google-services/i.test(error.message)) {
      throw new LocalAppError(
        ar
          ? "إشعارات الهاتف غير مهيأة لهذا الإصدار من أندرويد بعد. تظل الإشعارات داخل التطبيق متاحة."
          : "Phone alerts are not configured for this Android build yet. In-app notifications are still available."
      );
    }
    throw new LocalAppError(
      ar
        ? "تعذّر تفعيل إشعارات الهاتف. تحقّق من اتصالك وثبّت أحدث إصدار ثم حاول مجددًا."
        : "Phone notifications could not be enabled. Check your connection, install the latest app build, and try again."
    );
  }
  sessionController.assertEpoch(epoch);
  const device = await api.registerPushDevice({ token, platform: Platform.OS as "android" | "ios", locale });
  sessionController.assertEpoch(epoch);
  await SecureStore.setItemAsync(pushDeviceKey, JSON.stringify({ id: device.id, userId }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export function PushNotificationMonitor() {
  const { api, session, scope, epoch, queryClient } = useSession();
  const { t, locale } = useAppearance();
  const router = useRouter();
  const navigation = useRootNavigationState();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!api || !session?.user.isVerified) return;
    let active = true;
    const refresh = async () => {
      const saved = await SecureStore.getItemAsync(pushDeviceKey);
      if (!active || !saved || JSON.parse(saved).userId !== session.user.id) return;
      await enablePhoneNotifications(api, session.user.id, epoch, locale, false);
    };
    void refresh().catch(() => {});
    const state = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh().catch(() => {});
    });
    const token = Notifications.addPushTokenListener(() => {
      void refresh().catch(() => {});
    });
    return () => {
      active = false;
      state.remove();
      token.remove();
    };
  }, [api, session?.user.id, session?.user.isVerified, epoch, locale]);
  useEffect(() => {
    if (!api || !session || !navigation?.key) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response || handled.current === response.notification.request.identifier) return;
      const data = response.notification.request.content.data;
      if (!data || data.userId !== session.user.id) return;
      handled.current = response.notification.request.identifier;
      if (data.workspaceId !== session.workspace.id) {
        Alert.alert(
          t("Another workspace", "مساحة عمل أخرى"),
          t("Switch to that workspace to view this notification.", "انتقل إلى مساحة العمل المعنية لعرض الإشعار."),
          [
            { text: t("Workspaces", "مساحات العمل"), onPress: () => router.push("/team") },
            { text: t("Cancel", "إلغاء"), style: "cancel" }
          ]
        );
      } else {
        void queryClient.invalidateQueries({ queryKey: [scope, "notification-feed"] });
        router.push("/notifications");
      }
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };
    void Notifications.getLastNotificationResponseAsync()
      .then(open)
      .catch(() => {});
    const listener = Notifications.addNotificationResponseReceivedListener(open);
    return () => listener.remove();
  }, [api, session?.user.id, session?.workspace.id, scope, queryClient, router, t, navigation?.key]);
  return null;
}
