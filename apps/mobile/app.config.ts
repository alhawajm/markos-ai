import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "MARKOS",
  slug: "markos",
  owner: "mo4180",
  version: "0.3.0",
  icon: "./assets/icon.png",
  scheme: "markos",
  updates: { url: "https://u.expo.dev/35017b4c-b19f-41ff-a16d-d5dee210f016" },
  runtimeVersion: { policy: "appVersion" },
  orientation: "default",
  userInterfaceStyle: "automatic",
  ios: { supportsTablet: true, bundleIdentifier: "com.markos.mobile", config: { usesNonExemptEncryption: false } },
  android: {
    package: "com.markos.mobile",
    allowBackup: false,
    softwareKeyboardLayoutMode: "resize",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#d88fa3" }
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    "expo-video",
    ["expo-localization", { supportsRTL: true, supportedLocales: ["en", "ar"] }],
    "expo-status-bar",
    ["expo-splash-screen", { image: "./assets/splash.png", imageWidth: 160, backgroundColor: "#f7fafa", dark: { backgroundColor: "#171a23" } }],
    "@react-native-community/datetimepicker"
  ],
  experiments: { typedRoutes: true },
  extra: { appStage: "private-beta", eas: { projectId: "35017b4c-b19f-41ff-a16d-d5dee210f016" } }
};

export default config;
