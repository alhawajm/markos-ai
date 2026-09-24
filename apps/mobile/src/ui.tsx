import React, { type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewProps
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Bell, ChevronDown, X, type LucideIcon } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAppearance, useSession } from "./providers";

export function Txt({
  variant = "body",
  muted = false,
  style,
  children,
  ...props
}: TextProps & { variant?: "body" | "title" | "heading" | "label" | "meta"; muted?: boolean }) {
  const { colors, rtl } = useAppearance();
  const bold = ["title", "heading", "label"].includes(variant);
  const arabic = rtl || (typeof children === "string" && /[\u0600-\u06ff]/.test(children));
  const size = { body: 16, title: 28, heading: 20, label: 14, meta: 13 }[variant];
  return (
    <Text
      {...props}
      style={[
        {
          color: muted ? colors.muted : colors.text,
          fontFamily: `${arabic ? "IBMPlexSansArabic" : "IBMPlexSans"}_${bold ? "600SemiBold" : "400Regular"}`,
          fontSize: size,
          lineHeight: size + (arabic ? 12 : 8),
          textAlign: rtl ? "right" : "left",
          writingDirection: rtl ? "rtl" : "auto",
          flexShrink: 1
        },
        style
      ]}
    >
      {children}
    </Text>
  );
}
export function Row({ style, ...props }: ViewProps) {
  const { rtl } = useAppearance();
  return <View {...props} style={[{ flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 12 }, style]} />;
}
export function Card({ children, tone, style, ...props }: ViewProps & { tone?: "tint" | "warning" }) {
  const { colors } = useAppearance();
  return (
    <View
      {...props}
      style={[
        {
          borderWidth: tone ? 0 : 1,
          borderColor: colors.border,
          backgroundColor: tone === "tint" ? colors.secondarySoft : tone === "warning" ? colors.warningSoft : colors.surface,
          padding: 16,
          borderRadius: 16,
          gap: 12
        },
        style
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  label,
  onPress,
  secondary,
  busy,
  disabled,
  icon: Icon,
  accessibilityLabel
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  busy?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  accessibilityLabel?: string;
}) {
  const { colors } = useAppearance();
  const color = secondary ? colors.text : colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: secondary ? 1 : 0,
        borderColor: colors.borderStrong,
        backgroundColor: secondary ? colors.surface : colors.primary,
        opacity: disabled || busy ? 0.55 : pressed ? 0.8 : 1,
        justifyContent: "center"
      })}
    >
      <Row style={{ justifyContent: "center", gap: 8 }}>
        {busy ? <ActivityIndicator color={color} /> : Icon ? <Icon size={20} strokeWidth={1.5} color={color} /> : null}
        <Txt variant="label" style={{ fontSize: 16, color, textAlign: "center" }}>
          {label}
        </Txt>
      </Row>
    </Pressable>
  );
}
export function IconButton({ label, icon: Icon, onPress, disabled }: { label: string; icon: LucideIcon; onPress: () => void; disabled?: boolean }) {
  const { colors } = useAppearance();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
        backgroundColor: pressed ? colors.surfaceMuted : "transparent",
        opacity: disabled ? 0.4 : 1
      })}
    >
      <Icon color={colors.text} size={24} strokeWidth={1.5} />
    </Pressable>
  );
}
export function Field({ label, hint, style, ...props }: TextInputProps & { label: string; hint?: string }) {
  const { colors, rtl } = useAppearance();
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="label">{label}</Txt>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.primary}
        style={[
          {
            minHeight: 52,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderRadius: 12,
            padding: 14,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: 16,
            fontFamily: rtl ? "IBMPlexSansArabic_400Regular" : "IBMPlexSans_400Regular",
            textAlign: rtl ? "right" : "left",
            writingDirection: rtl ? "rtl" : "auto",
            textAlignVertical: props.multiline ? "top" : "center",
            lineHeight: 26
          },
          style
        ]}
      />
      {hint ? (
        <Txt variant="meta" muted>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}
export function Notice({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  const { colors } = useAppearance();
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={{ backgroundColor: error ? colors.dangerSoft : colors.secondarySoft, borderRadius: 16, padding: 16 }}
    >
      <Txt style={{ color: error ? colors.danger : colors.textSoft }}>{children}</Txt>
    </View>
  );
}
export function Loading() {
  const { colors, t } = useAppearance();
  return (
    <View style={{ padding: 32, gap: 12, alignItems: "center" }}>
      <ActivityIndicator color={colors.accent} />
      <Txt muted>{t("Loading…", "جارٍ التحميل…")}</Txt>
    </View>
  );
}
export function Screen({
  children,
  footer,
  refreshControl
}: PropsWithChildren<{ footer?: React.ReactNode; refreshControl?: React.ComponentProps<typeof ScrollView>["refreshControl"] }>) {
  const { colors } = useAppearance();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + 64}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={refreshControl}
        contentContainerStyle={{ width: "100%", maxWidth: 760, alignSelf: "center", padding: 20, paddingBottom: 32, gap: 20 }}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{ padding: 20, paddingBottom: Math.max(20, insets.bottom), borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <View style={{ width: "100%", maxWidth: 720, alignSelf: "center", gap: 8 }}>{footer}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
export function WorkspaceHeader() {
  const { session, api, scope } = useSession();
  const unread = useQuery({ queryKey: [scope, "notification-count"], queryFn: () => api!.notificationFeed(), enabled: !!api, refetchInterval: 30000 });
  const { colors, t } = useAppearance();
  const router = useRouter();
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ backgroundColor: colors.background }}>
      <Row style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Workspace and settings", "مساحة العمل والإعدادات")}
          onPress={() => router.push("/account")}
          style={{ flex: 1 }}
        >
          <Row>
            <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondarySoft }}>
              <Txt variant="label">{session?.workspace.name.slice(0, 1).toUpperCase() ?? "M"}</Txt>
            </View>
            <Txt variant="label" numberOfLines={1} style={{ flex: 1, fontSize: 16 }}>
              {session?.workspace.name ?? "MARKOS"}
            </Txt>
            <ChevronDown size={20} color={colors.muted} strokeWidth={1.5} />
          </Row>
        </Pressable>
        <View>
          <IconButton
            label={t("Notifications", "الإشعارات") + (unread.data?.unreadCount ? ` (${unread.data.unreadCount})` : "")}
            icon={Bell}
            onPress={() => router.push("/notifications")}
          />
          {unread.data?.unreadCount ? (
            <View
              pointerEvents="none"
              style={{ position: "absolute", top: 0, right: 0, minWidth: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: colors.secondarySoft }}
            >
              <Txt variant="meta" style={{ textAlign: "center" }}>
                {unread.data.unreadCount > 99 ? "99+" : unread.data.unreadCount}
              </Txt>
            </View>
          ) : null}
        </View>
      </Row>
    </SafeAreaView>
  );
}
export function TaskHeader({ title, close = false }: { title: string; close?: boolean }) {
  const { colors, t, rtl } = useAppearance();
  const router = useRouter();
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ backgroundColor: colors.background }}>
      <Row style={{ paddingHorizontal: 12, minHeight: 64 }}>
        <View style={{ transform: [{ scaleX: rtl ? -1 : 1 }] }}>
          <IconButton label={t("Back", "رجوع")} icon={ArrowLeft} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/campaigns"))} />
        </View>
        <Txt variant="label" numberOfLines={1} style={{ flex: 1, fontSize: 16 }}>
          {title}
        </Txt>
        {close ? <IconButton label={t("Close; keep brief", "إغلاق وحفظ الملخص")} icon={X} onPress={() => router.replace("/(tabs)/campaigns")} /> : null}
      </Row>
    </SafeAreaView>
  );
}
