import React from "react";
import { Image, Pressable, View, type ImageSourcePropType } from "react-native";
import { postFonts, postRatios, postStyles, recommendPostTemplates, type PostFont, type PostRatio, type PostStyle } from "@markos/shared-types";
import { useAppearance } from "../providers";
import { PostText, usePostFlowTheme } from "./theme";
import { postRatiosByValue } from "./model";

export const styleColors: Record<PostStyle, [string, string]> = {
  editorial: ["#30372F", "#77AFC0"],
  soft: ["#FC705D", "#F5F8E3"],
  hybrid: ["#DBE8E5", "#0C2428"]
};
const styleAssets: Record<PostStyle, ImageSourcePropType> = {
  editorial: require("../../assets/post-style-editorial.jpg"),
  soft: require("../../assets/post-style-soft.jpg"),
  hybrid: require("../../assets/post-style-hybrid.jpg")
};

function Choice<T extends string>({
  value,
  label,
  current,
  onSelect,
  kind,
  children
}: {
  value: T;
  label: string;
  current: T | undefined;
  onSelect: (v: T) => void;
  kind: "ratio" | "swatch";
  children: React.ReactNode;
}) {
  const theme = usePostFlowTheme();
  const selected = value === current;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={() => onSelect(value)}
      style={{
        backgroundColor: theme.canvas,
        borderWidth: 1,
        borderColor: selected && kind === "ratio" ? theme.selection : theme.nav,
        borderRadius: 11,
        padding: 6,
        gap: 4,
        minHeight: 80,
        flex: 1,
        minWidth: 0
      }}
    >
      <View style={{ borderRadius: 8, overflow: "hidden", minHeight: 58, justifyContent: "center", alignItems: "center" }}>
        {children}
        {kind === "swatch" ? (
          <View
            style={{
              position: "absolute",
              right: 5,
              top: 5,
              width: 15,
              height: 15,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: "#FFFFFF",
              backgroundColor: selected ? "#0D1D21" : "#FFFFFF"
            }}
          />
        ) : null}
      </View>
      <PostText variant="meta" style={{ textAlign: "center", fontSize: 12, lineHeight: 17 }}>
        {label}
      </PostText>
    </Pressable>
  );
}

export function StyleChoices({ value, onSelect }: { value: PostStyle | undefined; onSelect: (v: PostStyle) => void }) {
  const { rtl, t } = useAppearance();
  const names = { editorial: t("Editorial", "تحريري"), soft: t("Soft edit", "ناعم"), hybrid: t("Hybrid", "هجين") };
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: rtl ? "row-reverse" : "row", gap: 6 }}>
      {postStyles.map((style) => (
        <Choice key={style} value={style} label={names[style]} current={value} onSelect={onSelect} kind="swatch">
          <Image source={styleAssets[style]} resizeMode="cover" style={{ width: "100%", aspectRatio: 0.85 }} />
        </Choice>
      ))}
    </View>
  );
}

export function FontChoices({ value, onSelect }: { value: PostFont | undefined; onSelect: (v: PostFont) => void }) {
  const { rtl, t } = useAppearance();
  const names = { regular: t("Regular", "عادي"), bold: t("Bold", "عريض"), compact: t("Compact", "مضغوط") };
  const theme = usePostFlowTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: rtl ? "row-reverse" : "row", gap: 6 }}>
      {postFonts.map((font) => (
        <Choice key={font} value={font} label={names[font]} current={value} onSelect={onSelect} kind="swatch">
          <View style={{ width: "100%", minHeight: 68, backgroundColor: theme.selection, alignItems: "center", justifyContent: "center" }}>
            <PostText
              style={{
                color: "white",
                fontFamily: font === "bold" ? "IBMPlexSansArabic_600SemiBold" : "IBMPlexSansArabic_400Regular",
                fontSize: font === "compact" ? 20 : 24
              }}
            >
              مرحباً
            </PostText>
          </View>
        </Choice>
      ))}
    </View>
  );
}

export function RatioChoices({ value, onSelect }: { value: PostRatio | undefined; onSelect: (v: PostRatio) => void }) {
  const { rtl, t } = useAppearance();
  const theme = usePostFlowTheme();
  const names = { "1:1": t("Square", "مربّع"), "4:5": t("Portrait", "عمودي"), "3:4": t("Tall", "طولي") };
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: rtl ? "row-reverse" : "row", gap: 6 }}>
      {postRatios.map((ratio) => (
        <Choice key={ratio} value={ratio} label={names[ratio]} current={value} onSelect={onSelect} kind="ratio">
          <View style={{ width: 23, aspectRatio: postRatiosByValue[ratio], borderWidth: 1, borderColor: theme.selection, borderRadius: 3 }} />
          <PostText variant="meta">{ratio}</PostText>
        </Choice>
      ))}
    </View>
  );
}

export function TemplateChoices({ brief, onSelect }: { brief: string; onSelect: (id: string, style: PostStyle) => void }) {
  const { t, rtl } = useAppearance();
  const theme = usePostFlowTheme();
  return (
    <View style={{ flexDirection: rtl ? "row-reverse" : "row", gap: 6 }}>
      {recommendPostTemplates(brief).map((template) => (
        <Pressable
          key={template.id}
          accessibilityRole="button"
          onPress={() => onSelect(template.id, template.style)}
          style={{ flex: 1, gap: 7, padding: 7, borderRadius: 10, backgroundColor: theme.canvas }}
        >
          <View
            style={{
              height: 62,
              borderRadius: 6,
              overflow: "hidden",
              justifyContent: "flex-end",
              gap: 5,
              padding: 6,
              backgroundColor: styleColors[template.style][0]
            }}
          >
            <View style={{ height: 4, width: "72%", backgroundColor: "#FFFFFF", borderRadius: 4 }} />
            <View style={{ height: 3, width: "48%", backgroundColor: "#FFFFFFAA", borderRadius: 4 }} />
          </View>
          <PostText variant="meta" style={{ lineHeight: 17 }}>
            {t(template.en, template.ar)}
          </PostText>
        </Pressable>
      ))}
    </View>
  );
}
