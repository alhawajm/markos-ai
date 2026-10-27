import React, { useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import { ArrowLeft, Bell, Check, ChevronDown, ChevronRight, X, type LucideIcon } from "lucide-react-native";
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
/** Quiet actions stay distinct from the screen's filled primary action. */
export function TextAction({
  label,
  onPress,
  icon: Icon,
  disabled = false,
  destructive = false,
  selected,
  accessibilityLabel
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  destructive?: boolean;
  selected?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useAppearance();
  const color = destructive ? colors.danger : colors.textSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        minWidth: 48,
        paddingVertical: 10,
        paddingHorizontal: selected === undefined ? 4 : 12,
        borderRadius: 12,
        backgroundColor: selected ? colors.secondarySoft : "transparent",
        justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.65 : 1
      })}
    >
      <Row style={{ gap: 8 }}>
        {Icon ? <Icon size={18} strokeWidth={1.7} color={color} /> : null}
        <Txt variant="label" style={{ color, fontSize: 15 }}>
          {label}
        </Txt>
      </Row>
    </Pressable>
  );
}
export function TitleBar({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
      <Txt variant="title" style={{ flex: 1 }}>
        {title}
      </Txt>
      {children}
    </Row>
  );
}
export function ListGroup({ title, children }: PropsWithChildren<{ title?: string }>) {
  const { colors } = useAppearance();
  return (
    <View style={{ gap: 10 }}>
      {title ? (
        <Txt variant="label" muted style={{ paddingHorizontal: 4 }}>
          {title}
        </Txt>
      ) : null}
      <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, overflow: "hidden" }}>{children}</View>
    </View>
  );
}
export function ListRow({
  label,
  detail,
  icon: Icon,
  onPress,
  selected,
  disabled = false,
  destructive = false,
  last = false
}: {
  label: string;
  detail?: string;
  icon?: LucideIcon;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  last?: boolean;
}) {
  const { colors, rtl } = useAppearance();
  const color = destructive ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 58,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.surfaceMuted : "transparent",
        opacity: disabled ? 0.45 : 1
      })}
    >
      <Row style={{ gap: 14 }}>
        {Icon ? <Icon size={21} strokeWidth={1.6} color={destructive ? colors.danger : colors.muted} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Txt style={{ color, fontSize: 16 }}>{label}</Txt>
          {detail ? (
            <Txt variant="meta" muted>
              {detail}
            </Txt>
          ) : null}
        </View>
        {selected === undefined ? (
          <ChevronRight size={18} color={colors.muted} style={{ transform: [{ scaleX: rtl ? -1 : 1 }] }} />
        ) : selected ? (
          <Check size={20} color={colors.accent} />
        ) : (
          <View style={{ width: 20 }} />
        )}
      </Row>
    </Pressable>
  );
}
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled = false
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const { colors } = useAppearance();
  return (
    <Row style={{ gap: 4, padding: 4, borderRadius: 14, backgroundColor: colors.surfaceMuted }}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: value === option.value, disabled }}
          disabled={disabled}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            paddingHorizontal: 8,
            paddingVertical: 8,
            justifyContent: "center",
            borderRadius: 10,
            backgroundColor: value === option.value ? colors.surface : "transparent",
            opacity: disabled ? 0.45 : pressed ? 0.7 : 1
          })}
        >
          <Txt variant="label" style={{ textAlign: "center", fontSize: 14, color: value === option.value ? colors.text : colors.muted }}>
            {option.label}
          </Txt>
        </Pressable>
      ))}
    </Row>
  );
}
/** Children remain mounted while closed so recovered form state is never lost. */
export function Disclosure({ title, summary, children, defaultOpen = false }: PropsWithChildren<{ title: string; summary?: string; defaultOpen?: boolean }>) {
  const { colors } = useAppearance();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ minHeight: 58, justifyContent: "center", paddingVertical: 12 }}
      >
        <Row>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="label" style={{ fontSize: 16 }}>
              {title}
            </Txt>
            {!open && summary ? (
              <Txt variant="meta" muted>
                {summary}
              </Txt>
            ) : null}
          </View>
          <ChevronDown size={20} color={colors.muted} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
        </Row>
      </Pressable>
      <View
        style={{ display: open ? "flex" : "none", gap: 16, paddingBottom: 16 }}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? "auto" : "no-hide-descendants"}
      >
        {children}
      </View>
    </View>
  );
}
export function Sheet({ title, visible, onClose, children }: PropsWithChildren<{ title: string; visible: boolean; onClose: () => void }>) {
  const { colors, t } = useAppearance();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Close panel", "إغلاق اللوحة")}
            onPress={onClose}
            style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)" }}
          />
          <View
            accessibilityViewIsModal
            style={{
              width: "100%",
              maxWidth: 640,
              maxHeight: "85%",
              alignSelf: "center",
              backgroundColor: colors.surface,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 20),
              paddingHorizontal: 20
            }}
          >
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: 8 }} />
            <Row style={{ marginBottom: 12 }}>
              <Txt accessibilityRole="header" variant="heading" style={{ flex: 1 }}>
                {title}
              </Txt>
              <IconButton icon={X} label={t("Close", "إغلاق")} onPress={onClose} />
            </Row>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ gap: 16, paddingBottom: 8 }}>
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="label">{label}</Txt>
      <ListGroup>
        <ListRow last label={options.find((option) => option.value === value)?.label ?? label} disabled={disabled} onPress={() => setOpen(true)} />
      </ListGroup>
      <Sheet title={label} visible={open} onClose={() => setOpen(false)}>
        <ListGroup>
          {options.map((option, index) => (
            <ListRow
              key={option.value}
              label={option.label}
              selected={value === option.value}
              disabled={disabled}
              last={index === options.length - 1}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
        </ListGroup>
      </Sheet>
    </View>
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
        contentContainerStyle={{ width: "100%", maxWidth: 760, alignSelf: "center", padding: 20, paddingBottom: 32, gap: 24 }}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{ padding: 16, paddingBottom: Math.max(16, insets.bottom), borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
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
