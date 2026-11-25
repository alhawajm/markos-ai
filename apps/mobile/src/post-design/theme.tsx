import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, type TextProps } from "react-native";
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { useMotionAllowed } from "../motion";
import { useAppearance } from "../providers";
import { Txt } from "../ui";
import { postFlowLight, usePostFlowTheme } from "./palette";
export { postFlowLight, usePostFlowTheme } from "./palette";

export function PostText({ style, children, variant, ...props }: React.ComponentProps<typeof Txt> & TextProps) {
  const palette = usePostFlowTheme();
  const { rtl } = useAppearance();
  const arabic = rtl || (typeof children === "string" && /[\u0600-\u06ff]/.test(children));
  return (
    <Txt
      variant={variant ?? "body"}
      {...props}
      style={[
        { color: props.muted ? palette.muted : palette.ink },
        !arabic && { fontFamily: variant === "title" || variant === "heading" || variant === "label" ? "Roboto_500Medium" : "Roboto_400Regular" },
        style
      ]}
    >
      {children}
    </Txt>
  );
}

export function WelcomeGlow() {
  const { mode } = useAppearance();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 390 760">
        <Defs>
          <RadialGradient id="chat-welcome-aqua" cx="14%" cy="100%" rx="86%" ry="55%">
            <Stop offset="0" stopColor={postFlowLight.cyan} stopOpacity={mode === "light" ? 0.3 : 0.13} />
            <Stop offset="1" stopColor={postFlowLight.cyan} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="chat-welcome-sun" cx="100%" cy="100%" rx="77%" ry="53%">
            <Stop offset="0" stopColor={postFlowLight.yellow} stopOpacity={mode === "light" ? 0.2 : 0.08} />
            <Stop offset="1" stopColor={postFlowLight.yellow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="390" height="760" fill="url(#chat-welcome-sun)" />
        <Rect width="390" height="760" fill="url(#chat-welcome-aqua)" />
      </Svg>
    </View>
  );
}

export function PostMascot() {
  const allowed = useMotionAllowed();
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!allowed) {
      phase.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(phase, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [allowed, phase]);
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: "100%",
        maxWidth: 342,
        aspectRatio: 342 / 219,
        transform: [{ translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [0, -9] }) }]
      }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 342 219">
        <Defs>
          <RadialGradient id="mascot-halo-left" cx="36%" cy="44%" rx="36%" ry="54%">
            <Stop offset="0" stopColor="#C7F5F5" stopOpacity={0.6} />
            <Stop offset="1" stopColor="#C7F5F5" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="mascot-halo-sun" cx="59%" cy="36%" rx="36%" ry="54%">
            <Stop offset="0" stopColor="#FFFBDF" stopOpacity={0.6} />
            <Stop offset="1" stopColor="#FFFBDF" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="mascot-halo-low" cx="56%" cy="66%" rx="36%" ry="50%">
            <Stop offset="0" stopColor="#C4F9FF" stopOpacity={0.6} />
            <Stop offset="1" stopColor="#C4F9FF" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="mascot-body" x1="16%" x2="85%" y1="95%" y2="3%">
            <Stop offset="0" stopColor="#21CBF4" />
            <Stop offset="1" stopColor="#FFF5B0" />
          </LinearGradient>
        </Defs>
        <Rect width="342" height="219" fill="url(#mascot-halo-left)" />
        <Rect width="342" height="219" fill="url(#mascot-halo-sun)" />
        <Rect width="342" height="219" fill="url(#mascot-halo-low)" />
        <Path
          fill="url(#mascot-body)"
          transform="translate(93 39)"
          d="M77.108 10.937 C69.51 2.749 57.442 -0.93 45.672 2.445 C29.199 7.168 19.55 23.917 24.119 39.854 C24.311 40.521 24.525 41.177 24.76 41.82 C24.068 41.97 23.377 42.142 22.687 42.34 C6.214 47.064 -3.436 63.812 1.134 79.749 C4.4 91.136 14.041 99.026 25.289 100.88 C23.402 106.401 23.12 112.482 24.831 118.449 C29.401 134.385 46.46 143.476 62.932 138.752 C69.1 136.984 74.311 133.529 78.177 129.064 C85.776 137.252 97.844 140.931 109.614 137.556 C126.087 132.833 135.737 116.084 131.167 100.147 C130.976 99.479 130.76 98.824 130.526 98.18 C131.217 98.03 131.909 97.859 132.6 97.661 C149.073 92.937 158.722 76.188 154.152 60.252 C150.887 48.864 141.244 40.973 129.995 39.119 C131.882 33.599 132.166 27.519 130.455 21.552 C125.886 5.616 108.827 -3.475 92.354 1.249 C86.187 3.017 80.975 6.471 77.108 10.937 Z"
        />
      </Svg>
      <Animated.View
        style={{
          position: "absolute",
          flexDirection: "row",
          justifyContent: "space-between",
          top: "43.4%",
          left: "45.5%",
          width: "10%",
          height: "10%",
          transform: [{ scaleY: phase.interpolate({ inputRange: [0, 0.84, 0.93, 1], outputRange: [1, 1, 0.18, 1] }) }]
        }}
      >
        <View style={{ width: "26.5%", height: "100%", borderRadius: 100, backgroundColor: "#428691" }} />
        <View style={{ width: "26.5%", height: "100%", borderRadius: 100, backgroundColor: "#428691" }} />
      </Animated.View>
    </Animated.View>
  );
}
