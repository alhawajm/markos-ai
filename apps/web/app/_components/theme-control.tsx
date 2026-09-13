"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
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

export function ThemeSelect({ locale, compact = true }: { locale: Locale; compact?: boolean }) {
  const preference = useSyncExternalStore(subscribeToThemePreference, getThemePreference, getServerThemePreference);
  const Icon = preference === "dark" ? Moon : preference === "light" ? Sun : Monitor;
  const label = locale === "ar" ? "المظهر" : "Appearance";

  return (
    <label
      className={`relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--sunlit-line)] bg-[var(--surface)] text-[var(--text-soft)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)] ${compact ? "w-11" : "w-11 sm:w-auto sm:px-3"}`}
      title={label}
    >
      <Icon aria-hidden="true" className="shrink-0" size={18} />
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className={
          compact
            ? "absolute inset-0 h-full w-full cursor-pointer opacity-0"
            : "absolute inset-0 h-full w-full cursor-pointer rounded-sm bg-transparent text-sm font-semibold opacity-0 outline-none sm:static sm:h-auto sm:w-auto sm:min-w-0 sm:py-2 sm:opacity-100"
        }
        onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
        value={preference}
      >
        <option value="light">{locale === "ar" ? "فاتح" : "Light"}</option>
        <option value="dark">{locale === "ar" ? "داكن" : "Dark"}</option>
        <option value="system">{locale === "ar" ? "النظام" : "System"}</option>
      </select>
    </label>
  );
}

export function AppearanceSettings({ locale }: { locale: Locale }) {
  const preference = useSyncExternalStore(subscribeToThemePreference, getThemePreference, getServerThemePreference);
  const groupName = useId();
  const options = [
    { value: "light", label: locale === "ar" ? "فاتح" : "Light", Icon: Sun },
    { value: "dark", label: locale === "ar" ? "داكن" : "Dark", Icon: Moon },
    { value: "system", label: locale === "ar" ? "النظام" : "System", Icon: Monitor }
  ] as const;

  return (
    <fieldset>
      <legend className="sr-only">{locale === "ar" ? "نمط الألوان" : "Color theme"}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map(({ value, label, Icon }) => (
          <label
            className={`relative flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border p-4 text-[var(--text)] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)] ${preference === value ? "border-[var(--focus)] bg-[var(--primary-soft)]" : "border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]"}`}
            key={value}
          >
            <input checked={preference === value} className="sr-only" name={groupName} onChange={() => setThemePreference(value)} type="radio" value={value} />
            <Icon aria-hidden="true" className="shrink-0" size={24} />
            <span className="text-base font-semibold">{label}</span>
            {preference === value && <Check aria-hidden="true" className="ms-auto shrink-0 text-[var(--text)]" size={20} />}
          </label>
        ))}
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
        {locale === "ar" ? "يُطبّق اختيارك على هذا المتصفح. يتبع خيار النظام إعدادات جهازك." : "Applies to this browser. System follows your device settings."}
      </p>
    </fieldset>
  );
}
