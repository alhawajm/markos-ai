import React, { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, Text, View } from "react-native";
import { markosMonogram } from "@markos/ui-tokens";
import { useAppearance } from "./providers";

function useMotionAllowed() {
  const [reduced, setReduced] = useState(true),
    [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (live) setReduced(v);
      })
      .catch(() => {});
    const preference = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    const state = AppState.addEventListener("change", (v) => setActive(v === "active"));
    return () => {
      live = false;
      preference.remove();
      state.remove();
    };
  }, []);
  return !reduced && active;
}
export function MarkosMark({ size = 28, color }: { size?: number; color?: string; strokeWidth?: number }) {
  const { colors } = useAppearance();
  const points = markosMonogram.points;
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      {points.slice(1).map(([x, y], i) => {
        const [a, b] = points[i]!;
        const dx = ((x - a) * size) / 40,
          dy = ((y - b) * size) / 40,
          len = Math.hypot(dx, dy),
          thickness = size * 0.075;
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              width: len,
              height: thickness,
              borderRadius: thickness / 2,
              backgroundColor: color ?? colors.accentText,
              left: ((x + a) * size) / 80 - len / 2,
              top: ((y + b) * size) / 80 - thickness / 2,
              transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }]
            }}
          />
        );
      })}
    </View>
  );
}
export function InkPulse({ size = 22, color }: { size?: number; color?: string }) {
  const { colors } = useAppearance();
  const allowed = useMotionAllowed();
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!allowed) {
      phase.setValue(0.5);
      return;
    }
    const loop = Animated.loop(Animated.timing(phase, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    phase.setValue(0);
    loop.start();
    return () => {
      loop.stop();
      phase.stopAnimation();
    };
  }, [allowed, phase]);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 }}
    >
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            height: size * (i === 1 ? 0.95 : 0.65),
            borderRadius: 3,
            backgroundColor: color ?? colors.accentText,
            opacity: allowed ? phase.interpolate({ inputRange: [0, 0.2 + i * 0.1, 0.5 + i * 0.1, 1], outputRange: [0.4, 1, 0.5, 0.4] }) : 0.7,
            transform: [{ scaleY: allowed ? phase.interpolate({ inputRange: [0, 0.2 + i * 0.1, 0.5 + i * 0.1, 1], outputRange: [0.55, 1, 0.6, 0.55] }) : 1 }]
          }}
        />
      ))}
    </View>
  );
}
export function Enter({ children }: PropsWithChildren) {
  const allowed = useMotionAllowed();
  const opacity = useRef(new Animated.Value(1)).current;
  const entered = useRef(false);
  useEffect(() => {
    if (!allowed) {
      opacity.setValue(1);
      return;
    }
    if (entered.current) return;
    entered.current = true;
    opacity.setValue(0);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 230, useNativeDriver: true, isInteraction: false });
    animation.start();
    return () => animation.stop();
  }, [allowed, opacity]);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }}>{children}</Animated.View>
  );
}
export function TaskFeedback({
  label,
  detail,
  startedAt,
  progress,
  compact = false
}: {
  label: string;
  detail?: string | undefined;
  startedAt?: string | undefined;
  progress?: { completedWeeks: number; totalWeeks: number } | undefined;
  compact?: boolean;
}) {
  const { colors, rtl, t } = useAppearance();
  const [began] = useState(() => (startedAt ? Date.parse(startedAt) : Date.now())),
    [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - began) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [began]);
  const font = rtl ? "IBMPlexSansArabic_400Regular" : "IBMPlexSans_400Regular";
  const meta = { fontFamily: font, color: colors.textSoft, fontSize: 14, lineHeight: 23 };
  return (
    <View
      style={{
        padding: compact ? 0 : 18,
        gap: 10,
        borderRadius: 18,
        borderWidth: compact ? 0 : 1,
        borderColor: colors.border,
        backgroundColor: compact ? undefined : colors.surface
      }}
    >
      <View style={{ flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
        <InkPulse />
        <Text accessibilityLiveRegion="polite" style={{ ...meta, color: colors.text, flex: 1 }}>
          {label}
        </Text>
        {elapsed >= 3 ? (
          <Text accessible={false} style={meta}>
            {elapsed < 60 ? `${elapsed}${t("s", "ث")}` : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}
          </Text>
        ) : null}
      </View>
      {progress ? (
        <>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t("Campaign planning", "تخطيط الحملة")}
            accessibilityValue={{ min: 0, max: progress.totalWeeks, now: progress.completedWeeks }}
            style={{ height: 5, borderRadius: 5, overflow: "hidden", backgroundColor: colors.border }}
          >
            <View
              style={{
                height: 5,
                width: `${Math.min(100, (progress.completedWeeks / progress.totalWeeks) * 100)}%`,
                backgroundColor: colors.accentText,
                borderRadius: 5,
                alignSelf: rtl ? "flex-end" : "flex-start"
              }}
            />
          </View>
          <Text style={meta}>
            {t(`${progress.completedWeeks} of ${progress.totalWeeks} weeks saved`, `تم حفظ ${progress.completedWeeks} من ${progress.totalWeeks} أسابيع`)}
          </Text>
        </>
      ) : null}
      {!compact ? (
        <Text style={meta}>
          {detail ??
            (elapsed >= 15
              ? t("Still working on your request. You can return later.", "ما زلت أعمل على طلبك. يمكنك العودة لاحقًا.")
              : t("Your result will appear here when it’s ready.", "ستظهر النتيجة هنا بمجرد أن تصبح جاهزة."))}
        </Text>
      ) : null}
    </View>
  );
}
