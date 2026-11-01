"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import type { Locale } from "@markos/shared-types";
import {
  getServerThemePreference,
  getThemePreference,
  listenForThemeChanges,
  setThemePreference,
  subscribeToThemePreference,
  type ThemePreference
} from "../theme";

export function ThemeSync() {
  useEffect(() => listenForThemeChanges(), []);
  return null;
}

function getDarkModeSnapshot() {
  return document.documentElement.dataset.theme === "dark";
}

function getServerDarkModeSnapshot() {
  return false;
}

export function ThemeSelect({ locale, compact = true }: { locale: Locale; compact?: boolean }) {
  const preference = useSyncExternalStore(subscribeToThemePreference, getThemePreference, getServerThemePreference);
  const dark = useSyncExternalStore(subscribeToThemePreference, getDarkModeSnapshot, getServerDarkModeSnapshot);
  const label = locale === "ar" ? "المظهر" : "Appearance";

  return (
    <div className="theme-control" role="group" aria-label={label}>
      <button
        aria-checked={dark}
        aria-label={locale === "ar" ? "الوضع الداكن" : "Dark mode"}
        className="theme-toggle"
        onClick={() => setThemePreference(dark ? "light" : "dark")}
        role="switch"
        type="button"
      >
        <span className="theme-toggle-track" aria-hidden="true">
          <span className="theme-toggle-thumb" />
        </span>
      </button>
      <label className="theme-system-control" title={label}>
        <span className="sr-only">{label}</span>
        <select aria-label={label} onChange={(event) => setThemePreference(event.target.value as ThemePreference)} value={preference}>
          <option value="light">{locale === "ar" ? "فاتح" : "Light"}</option>
          <option value="dark">{locale === "ar" ? "داكن" : "Dark"}</option>
          <option value="system">{locale === "ar" ? "النظام" : "System"}</option>
        </select>
      </label>
      {!compact && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function AppearanceSettings({ locale }: { locale: Locale }) {
  const preference = useSyncExternalStore(subscribeToThemePreference, getThemePreference, getServerThemePreference);
  const groupName = useId();
  const options = [
    { value: "light", label: locale === "ar" ? "فاتح" : "Light" },
    { value: "dark", label: locale === "ar" ? "داكن" : "Dark" },
    { value: "system", label: locale === "ar" ? "النظام" : "System" }
  ] as const;

  return (
    <fieldset>
      <legend className="sr-only">{locale === "ar" ? "نمط الألوان" : "Color theme"}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map(({ value, label }) => (
          <label
            className={`relative flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border p-4 text-[var(--text)] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)] ${preference === value ? "border-[var(--focus)] bg-[var(--primary-soft)]" : "border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--accent-soft)]"}`}
            key={value}
          >
            <input
              checked={preference === value}
              className="h-4 w-4 accent-[var(--focus)]"
              name={groupName}
              onChange={() => setThemePreference(value)}
              type="radio"
              value={value}
            />
            <span className="text-base font-semibold">{label}</span>
          </label>
        ))}
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
        {locale === "ar" ? "يُطبّق اختيارك على هذا المتصفح. يتبع خيار النظام إعدادات جهازك." : "Applies to this browser. System follows your device settings."}
      </p>
    </fieldset>
  );
}
