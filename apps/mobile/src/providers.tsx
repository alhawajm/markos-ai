import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { AppState, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { useFonts } from "expo-font";
import { IBMPlexSans_400Regular } from "@expo-google-fonts/ibm-plex-sans/400Regular";
import { IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans/600SemiBold";
import { IBMPlexSansArabic_400Regular } from "@expo-google-fonts/ibm-plex-sans-arabic/400Regular";
import { IBMPlexSansArabic_600SemiBold } from "@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { MarkosApiClient } from "@markos/api-client";
import { nativeColors } from "@markos/ui-tokens/native";
import { config, serviceKey } from "./config";
import { sessionController, createScopedFetch } from "./auth/transport";

type Preferences = { locale: "en" | "ar"; theme: "system" | "light" | "dark" };
const defaults: Preferences = { locale: getLocales()[0]?.languageCode === "ar" ? "ar" : "en", theme: "system" };
function useAppearanceValue() {
  const system = useColorScheme();
  const [preferences, setPreferences] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({ IBMPlexSans_400Regular, IBMPlexSans_600SemiBold, IBMPlexSansArabic_400Regular, IBMPlexSansArabic_600SemiBold });
  useEffect(() => {
    void AsyncStorage.getItem("markos.appearance")
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<Preferences>;
        setPreferences({ locale: saved.locale === "ar" ? "ar" : "en", theme: saved.theme === "dark" || saved.theme === "light" ? saved.theme : "system" });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  const mode = preferences.theme === "system" ? (system === "dark" ? "dark" : "light") : preferences.theme;
  return {
    ...preferences,
    mode,
    colors: nativeColors[mode],
    rtl: preferences.locale === "ar",
    ready: ready && (fontsLoaded || !!fontError),
    t: (en: string, ar: string) => (preferences.locale === "ar" ? ar : en),
    setPreferences: async (next: Partial<Preferences>) => {
      const merged = { ...preferences, ...next };
      await AsyncStorage.setItem("markos.appearance", JSON.stringify(merged));
      setPreferences(merged);
    }
  };
}
const AppearanceContext = createContext<ReturnType<typeof useAppearanceValue> | null>(null);
export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("Missing appearance provider");
  return value;
}

function useSessionValue() {
  const state = useSyncExternalStore(sessionController.subscribe, sessionController.getSnapshot);
  const epoch = sessionController.getEpoch();
  const scope = state.session ? `${serviceKey}:${state.session.user.id}:${state.session.workspace.id}` : null;
  // The client and cache live for one identity epoch. A token rotation keeps this scope.
  const queryClient = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: 300_000 }, mutations: { retry: false } } }),
    [epoch]
  );
  const api = useMemo(
    () =>
      state.session
        ? new MarkosApiClient({
            baseUrl: config.apiUrl,
            accessToken: state.session.tokens.accessToken,
            workspaceId: state.session.workspace.id,
            fetch: createScopedFetch(epoch),
            renewAccessToken: async () => {
              sessionController.assertEpoch(epoch);
              return sessionController.renew();
            },
            onSessionExpired: () => {
              if (sessionController.getEpoch() === epoch) void sessionController.expire().catch(() => {});
            }
          })
        : null,
    [scope, epoch, state.session?.tokens.accessToken]
  );
  useEffect(
    () => () => {
      void queryClient.cancelQueries();
      queryClient.clear();
    },
    [queryClient]
  );
  useEffect(() => {
    void sessionController.restore();
    const listener = AppState.addEventListener("change", (next) => focusManager.setFocused(next === "active"));
    return () => listener.remove();
  }, []);
  return { ...state, scope, api, queryClient, epoch };
}
const SessionContext = createContext<ReturnType<typeof useSessionValue> | null>(null);
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Missing session provider");
  return value;
}
export function useAccount() {
  const value = useSession();
  if (!value.api || !value.session || !value.scope) throw new Error("A signed-in account is required");
  return { ...value, api: value.api, session: value.session, scope: value.scope };
}
export function Providers({ children }: PropsWithChildren) {
  const appearance = useAppearanceValue();
  const session = useSessionValue();
  return (
    <AppearanceContext.Provider value={appearance}>
      <SessionContext.Provider value={session}>
        <QueryClientProvider client={session.queryClient}>{children}</QueryClientProvider>
      </SessionContext.Provider>
    </AppearanceContext.Provider>
  );
}
