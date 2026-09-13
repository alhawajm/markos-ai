export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "markos.theme";
const THEME_CHANGE_EVENT = "markos:theme-change";
const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

function normalizePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

// Runs in the document head before the page paints. Keep this independent of hydration.
export const themeInitializationScript = `(() => {
  var preference = "system";
  try {
    var saved = localStorage.getItem("${THEME_STORAGE_KEY}");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch (_) {}
  var dark = preference === "dark" || (preference === "system" && window.matchMedia("${DARK_MODE_QUERY}").matches);
  var root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = root.dataset.theme;
})();`;

function applyPreference(target: Window, preference: ThemePreference) {
  const root = target.document.documentElement;
  const dark = preference === "dark" || (preference === "system" && target.matchMedia(DARK_MODE_QUERY).matches);
  root.dataset.themePreference = preference;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = root.dataset.theme;
  target.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function getThemePreference(): ThemePreference {
  return typeof document === "undefined" ? "system" : normalizePreference(document.documentElement.dataset.themePreference);
}

export function getServerThemePreference(): ThemePreference {
  return "system";
}

export function subscribeToThemePreference(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

export function setThemePreference(preference: ThemePreference, target: Window = window) {
  try {
    if (preference === "system") target.localStorage.removeItem(THEME_STORAGE_KEY);
    else target.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private browsing or blocked storage must not prevent changing this page's appearance.
  }
  applyPreference(target, preference);
}

export function listenForThemeChanges(target: Window = window): () => void {
  const media = target.matchMedia(DARK_MODE_QUERY);
  const root = target.document.documentElement;
  let initialPreference = normalizePreference(root.dataset.themePreference);
  if (root.dataset.themePreference === undefined) {
    try {
      initialPreference = normalizePreference(target.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      // System appearance remains available when browser storage is blocked.
    }
  }
  applyPreference(target, initialPreference);

  const onSystemChange = () => applyPreference(target, normalizePreference(root.dataset.themePreference));
  const onStorageChange = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      applyPreference(target, normalizePreference(event.newValue));
    }
  };

  media.addEventListener("change", onSystemChange);
  target.addEventListener("storage", onStorageChange);
  return () => {
    media.removeEventListener("change", onSystemChange);
    target.removeEventListener("storage", onStorageChange);
  };
}
