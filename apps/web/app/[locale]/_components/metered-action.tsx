"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Lock, Sparkles } from "lucide-react";
import type { Locale } from "@markos/shared-types";

type UsageTone = "ok" | "warning" | "blocked";

export interface MeteredUsageState {
  blocked: boolean;
  label: string;
  percent: number;
  remaining: number;
  tone: UsageTone;
  total: number;
  used: number;
}

interface MeteredActionInput {
  fallbackTotal: number;
  fallbackUsed: number;
  label: string;
  metric: string;
}

export function useMeteredActionState(input: MeteredActionInput): MeteredUsageState {
  const fallback = useMemo(() => normalizeUsage(input.fallbackUsed, input.fallbackTotal, input.label), [input.fallbackTotal, input.fallbackUsed, input.label]);
  const [state, setState] = useState<MeteredUsageState>(fallback);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scopedValue = params.get(`quota-${input.metric.toLowerCase()}`);
    const globalValue = params.get("quota");
    const storedValue = window.localStorage.getItem(`markos.quota.${input.metric}`);
    const resolved = resolveUsageOverride(scopedValue ?? globalValue ?? storedValue, fallback, input.label);
    setState(resolved);
  }, [fallback, input.label, input.metric]);

  return state;
}

export function MeteredActionNotice({ locale, usage }: { locale: Locale; usage: MeteredUsageState }) {
  if (usage.tone === "ok") {
    return (
      <div className="rounded-xl border border-[#E8ECF2] bg-canvas px-3 py-2 text-xs text-muted">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 font-semibold text-navy">
            <Sparkles size={13} className="text-accent" />
            {usage.label}
          </span>
          <span className="font-bold text-muted">{usage.used.toLocaleString()} / {usage.total.toLocaleString()}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(usage.percent, 100)}%` }} />
        </div>
      </div>
    );
  }

  const blocked = usage.tone === "blocked";
  const Icon = blocked ? Lock : AlertTriangle;

  return (
    <div className={blocked ? "rounded-xl border border-accent/25 bg-accent/10 px-3 py-2.5 text-xs text-accent" : "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800"}>
      <div className="flex items-start gap-2">
        <Icon size={15} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{blocked ? usageText(locale, "blockedTitle") : usageText(locale, "warningTitle")}</p>
          <p className="mt-1 leading-5">
            {(blocked ? usageText(locale, "blockedBody") : usageText(locale, "warningBody"))
              .replace("{label}", usage.label)
              .replace("{remaining}", usage.remaining.toLocaleString(locale))}
          </p>
        </div>
      </div>
    </div>
  );
}

export function quotaBlockedMessage(locale: Locale): string {
  return usageText(locale, "blockedInline");
}

export function quotaErrorMessage(locale: Locale, error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  if (!/quota|limit|exhausted|plan inactive|billing status/i.test(message)) return null;
  return quotaBlockedMessage(locale);
}

function resolveUsageOverride(value: string | null, fallback: MeteredUsageState, label: string): MeteredUsageState {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (normalized === "warning") return normalizeUsage(82, 100, label);
  if (normalized === "blocked" || normalized === "limit") return normalizeUsage(100, 100, label);

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return normalizeUsage(Math.max(0, Math.min(100, Math.round(numeric))), 100, label);
  }

  return fallback;
}

function normalizeUsage(used: number, total: number, label: string): MeteredUsageState {
  const safeTotal = Math.max(1, total);
  const safeUsed = Math.max(0, used);
  const percent = Math.round((safeUsed / safeTotal) * 100);
  const tone: UsageTone = percent >= 100 ? "blocked" : percent >= 80 ? "warning" : "ok";

  return {
    blocked: tone === "blocked",
    label,
    percent,
    remaining: Math.max(0, safeTotal - safeUsed),
    tone,
    total: safeTotal,
    used: safeUsed
  };
}

function usageText(locale: Locale, key: string): string {
  const dictionary = {
    ar: {
      blockedBody: "تم الوصول إلى حد {label}. قم بالترقية أو انتظر دورة الخطة قبل تشغيل هذا الإجراء.",
      blockedInline: "تم الوصول إلى حد الخطة لهذا الإجراء. قم بالترقية أو انتظر دورة الخطة.",
      blockedTitle: "تم الوصول إلى حد الخطة",
      warningBody: "تبقى {remaining} فقط من {label}. يمكنك المتابعة الآن، لكن قد تحتاج إلى الترقية قريباً.",
      warningTitle: "اقتربت من حد الخطة"
    },
    en: {
      blockedBody: "{label} has reached the plan limit. Upgrade or wait for the next plan cycle before running this action.",
      blockedInline: "This action has reached the plan limit. Upgrade or wait for the next plan cycle.",
      blockedTitle: "Plan limit reached",
      warningBody: "Only {remaining} {label} remain. You can continue now, but an upgrade may be needed soon.",
      warningTitle: "Approaching plan limit"
    }
  } as const;

  return dictionary[locale][key as keyof (typeof dictionary)["en"]] ?? key;
}
