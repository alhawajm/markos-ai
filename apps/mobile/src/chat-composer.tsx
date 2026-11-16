import React, { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Send, RotateCcw } from "lucide-react-native";
import { useAppearance } from "./providers";
import { InkPulse } from "./motion";

const minimumHeight = 44,
  maximumHeight = 136;
/** One bounded input surface; the conversation keeps the rest of the screen. */
export function ChatComposer({
  value,
  onChange,
  onSend,
  editable = true,
  disabled = false,
  busy = false,
  retry = false,
  inputRef
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  editable?: boolean;
  disabled?: boolean;
  busy?: boolean;
  retry?: boolean;
  inputRef?: React.Ref<TextInput>;
}) {
  const { colors, t, locale } = useAppearance(),
    rtl = locale === "ar";
  const [height, setHeight] = useState(minimumHeight),
    [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!value) setHeight(minimumHeight);
  }, [value]);
  const blocked = disabled || busy;
  const Icon = retry ? RotateCcw : Send;
  return (
    <View
      style={{
        flexDirection: rtl ? "row-reverse" : "row",
        alignItems: "flex-end",
        gap: 4,
        padding: 4,
        borderWidth: 1,
        borderColor: focused ? colors.focus : colors.borderStrong,
        borderRadius: 26,
        backgroundColor: colors.surface
      }}
    >
      <TextInput
        ref={inputRef}
        accessibilityLabel={t("Message MARKOS", "راسل ماركوس")}
        value={value}
        onChangeText={onChange}
        editable={editable && !busy}
        multiline
        maxLength={4000}
        scrollEnabled={height >= maximumHeight}
        placeholder={t("Message MARKOS…", "راسل ماركوس…")}
        placeholderTextColor={colors.muted}
        selectionColor={colors.primary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onContentSizeChange={(event) => {
          const next = event.nativeEvent.contentSize.height;
          if (Number.isFinite(next)) setHeight(Math.min(maximumHeight, Math.max(minimumHeight, Math.ceil(next))));
        }}
        style={{
          flex: 1,
          minWidth: 0,
          height,
          minHeight: minimumHeight,
          maxHeight: maximumHeight,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: 0,
          color: colors.text,
          fontSize: 16,
          lineHeight: 24,
          includeFontPadding: false,
          fontFamily: rtl || /[\u0600-\u06ff]/.test(value) ? "IBMPlexSansArabic_400Regular" : "IBMPlexSans_400Regular",
          textAlign: rtl ? "right" : "left",
          writingDirection: rtl ? "rtl" : "auto",
          textAlignVertical: "top"
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={retry ? t("Retry saved message", "إعادة إرسال الرسالة المحفوظة") : t("Send", "إرسال")}
        accessibilityState={{ disabled: blocked, busy }}
        disabled={blocked}
        onPress={() => {
          if (!blocked) onSend();
        }}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: blocked && !busy ? colors.surfaceMuted : pressed ? colors.buttonActive : colors.primary
        })}
      >
        {busy ? <InkPulse size={20} color={colors.onPrimary} /> : <Icon size={20} strokeWidth={1.8} color={blocked ? colors.muted : colors.onPrimary} />}
      </Pressable>
    </View>
  );
}
