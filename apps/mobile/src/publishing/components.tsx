import React from "react";
import { Pressable, View } from "react-native";
import { useAppearance } from "../providers";
import { Txt } from "../ui";
export function Choices<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const { colors, rtl } = useAppearance();
  return (
    <View style={{ flexDirection: rtl ? "row-reverse" : "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: option.value === value }}
          onPress={() => onChange(option.value)}
          style={{
            minHeight: 48,
            justifyContent: "center",
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: option.value === value ? colors.accent : colors.border,
            backgroundColor: option.value === value ? colors.secondarySoft : colors.surface
          }}
        >
          <Txt variant="label">{option.label}</Txt>
        </Pressable>
      ))}
    </View>
  );
}
