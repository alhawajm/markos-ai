import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "MARKOS",
  slug: "markos",
  owner: "mo4180",
  version: "0.2.0",
  scheme: "markos",
  updates: { url: "https://u.expo.dev/35017b4c-b19f-41ff-a16d-d5dee210f016" },
  runtimeVersion: { policy: "appVersion" },
  orientation: "default",
  userInterfaceStyle: "automatic",
  ios: { supportsTablet: true, bundleIdentifier: "com.markos.mobile" },
  android: { package: "com.markos.mobile", allowBackup: false, softwareKeyboardLayoutMode: "resize" },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    "expo-video",
    ["expo-localization", { supportsRTL: true, supportedLocales: ["en", "ar"] }],
    "expo-status-bar",
    "expo-splash-screen",
    "@react-native-community/datetimepicker"
  ],
  experiments: { typedRoutes: true },
  extra: { appStage: "prototype", eas: { projectId: "35017b4c-b19f-41ff-a16d-d5dee210f016" } }
};

export default config;
