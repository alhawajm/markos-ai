import React, { useEffect, useState } from "react";
import { Stack, useRootNavigationState, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AccessibilityInfo, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { sessionController } from "../src/auth/transport";
import { QueryFailure } from "../src/content";
import { NativeOnboarding, VerifyEmail } from "../src/business/onboarding";
import { Providers, useAppearance, useSession } from "../src/providers";
import { Button, Loading, Screen, TaskHeader, Txt } from "../src/ui";

function Navigation() {
  const { colors, mode, ready, t, rtl } = useAppearance();
  const { status, api, session, scope } = useSession();
  const router = useRouter();
  const navigation = useRootNavigationState();
  const [instagramDestination, setInstagramDestination] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => listener.remove();
  }, []);
  const onboarding = useQuery({
    queryKey: [scope, "onboarding"],
    queryFn: () => api!.onboarding(),
    refetchOnWindowFocus: false,
    enabled: status === "signedIn" && !!session?.user.isVerified
  });
  useEffect(() => {
    if (!instagramDestination) return;
    if (status !== "signedIn" || instagramDestination !== scope) {
      setInstagramDestination(null);
    } else if (onboarding.data?.status === "COMPLETE" && navigation?.key) {
      // The signed-in Stack must mount before leaving the onboarding gate.
      setInstagramDestination(null);
      router.replace("/instagram");
    }
  }, [instagramDestination, status, scope, onboarding.data?.status, navigation?.key, router]);
  if (!ready || status === "loading")
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center" }}>
        <Loading />
      </View>
    );
  if (status === "signedIn" && !session?.user.isVerified)
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 48 }}>
        <VerifyEmail />
      </View>
    );
  if (status === "signedIn" && onboarding.data && onboarding.data.status !== "COMPLETE")
    return <NativeOnboarding key={scope} initial={onboarding.data} onConnectInstagram={() => setInstagramDestination(scope)} />;
  if (status === "signedIn" && (onboarding.isPending || onboarding.isError))
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 48 }}>
        <Screen>
          <Txt variant="title">{t("Let’s set up your business", "لنُعِدّ نشاطك التجاري")}</Txt>
          {session?.user.isVerified && onboarding.isPending ? (
            <Loading />
          ) : onboarding.isError ? (
            <QueryFailure
              error={onboarding.error}
              retry={() => {
                void onboarding.refetch();
              }}
            />
          ) : null}
          <Button
            label={t("I’ve completed setup", "أكملت الإعداد")}
            onPress={() => {
              void sessionController
                .renew()
                .then(() => onboarding.refetch())
                .catch(() => {});
            }}
          />
          <Button
            secondary
            label={t("Log out", "تسجيل الخروج")}
            onPress={() => {
              void sessionController.logout();
            }}
          />
        </Screen>
      </View>
    );
  return (
    <View style={{ flex: 1, direction: "ltr" }}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          animation: reduceMotion ? "none" : rtl ? "slide_from_left" : "slide_from_right",
          header: () => <TaskHeader title="MARKOS" />
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={status !== "signedIn"}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="signup" options={{ headerShown: false }} />
          <Stack.Screen name="recover" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={status === "signedIn"}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="campaign/new" options={{ header: () => <TaskHeader title={t("New campaign", "حملة جديدة")} close /> }} />
          <Stack.Screen name="campaign/generation" options={{ header: () => <TaskHeader title={t("Campaign progress", "تقدّم الحملة")} close /> }} />
          <Stack.Screen name="campaign/[id]" options={{ header: () => <TaskHeader title={t("Campaign review", "مراجعة الحملة")} /> }} />
          <Stack.Screen name="content/[id]" options={{ header: () => <TaskHeader title={t("Content draft", "مسودة المحتوى")} /> }} />
          <Stack.Screen name="content/schedule" options={{ header: () => <TaskHeader title={t("Schedule content", "جدولة المحتوى")} /> }} />
          <Stack.Screen name="account" options={{ header: () => <TaskHeader title={t("Workspace and settings", "مساحة العمل والإعدادات")} /> }} />
          <Stack.Screen name="account-details" options={{ header: () => <TaskHeader title={t("Your details", "بياناتك")} /> }} />
          <Stack.Screen name="team" options={{ header: () => <TaskHeader title={t("Workspaces and team", "مساحات العمل والفريق")} /> }} />
          <Stack.Screen name="data-controls" options={{ header: () => <TaskHeader title={t("Your data", "بياناتك")} /> }} />
          <Stack.Screen name="knowledge" options={{ header: () => <TaskHeader title={t("Saved knowledge", "المعلومات المحفوظة")} /> }} />
          <Stack.Screen name="activity" options={{ header: () => <TaskHeader title={t("Workspace activity", "نشاط مساحة العمل")} /> }} />
          <Stack.Screen name="instagram" options={{ header: () => <TaskHeader title={t("Instagram", "إنستغرام")} /> }} />
          <Stack.Screen name="security" options={{ header: () => <TaskHeader title={t("Account security", "أمان الحساب")} /> }} />
          <Stack.Screen name="business" options={{ header: () => <TaskHeader title={t("Business profile", "ملف النشاط")} /> }} />
          <Stack.Screen name="notifications" options={{ header: () => <TaskHeader title={t("Notifications", "الإشعارات")} /> }} />
          <Stack.Screen name="publishing" options={{ header: () => <TaskHeader title={t("Publishing activity", "نشاط النشر")} /> }} />
          <Stack.Screen name="content/publication" options={{ header: () => <TaskHeader title={t("Publishing details", "تفاصيل النشر")} /> }} />
        </Stack.Protected>
      </Stack>
    </View>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Providers>
        <Navigation />
      </Providers>
    </SafeAreaProvider>
  );
}
