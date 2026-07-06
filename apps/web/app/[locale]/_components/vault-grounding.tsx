"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database } from "lucide-react";
import type { Locale } from "@markos/shared-types";

type VaultGroundingArea = "assistant" | "content" | "strategy";

export interface VaultGroundingState {
  area: VaultGroundingArea;
  blocked: boolean;
  confidence: string;
  sources: string[];
}

interface VaultGroundingInput {
  area: VaultGroundingArea;
  locale: Locale;
}

export function useVaultGroundingState(input: VaultGroundingInput): VaultGroundingState {
  const fallback = useMemo(() => defaultGrounding(input.area, input.locale), [input.area, input.locale]);
  const [state, setState] = useState<VaultGroundingState>(fallback);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scopedValue = params.get(`vault-${input.area}`);
    const globalValue = params.get("vault");
    const storedValue = window.localStorage.getItem(`markos.vault.${input.area}`);

    setState(resolveGroundingOverride(scopedValue ?? globalValue ?? storedValue, fallback));
  }, [fallback, input.area]);

  return state;
}

export function VaultGroundingNotice({
  locale,
  state
}: {
  locale: Locale;
  state: VaultGroundingState;
}) {
  if (state.blocked) {
    return (
      <div className="rounded-xl border border-accent/25 bg-accent/10 px-3 py-2.5 text-xs text-accent">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 shrink-0" size={15} />
          <div className="min-w-0 flex-1">
            <p className="font-extrabold">{groundingCopy(locale, "gapTitle")}</p>
            <p className="mt-1 leading-5">{groundingCopy(locale, `${state.area}GapBody`)}</p>
            <a className="mt-2 inline-flex items-center gap-1.5 font-extrabold text-accent underline-offset-4 hover:underline" href={`/${locale}/vault`}>
              <Database size={13} />
              {groundingCopy(locale, "fixVault")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <CheckCircle2 className="mt-0.5 shrink-0" size={15} />
          <div className="min-w-0">
            <p className="font-extrabold">{groundingCopy(locale, "groundedTitle")}</p>
            <p className="mt-1 leading-5 text-emerald-800/75">{state.sources.join(" · ")}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-1 font-extrabold text-emerald-600">{state.confidence}</span>
      </div>
    </div>
  );
}

export function vaultGapMessage(locale: Locale): string {
  return groundingCopy(locale, "gapInline");
}

function resolveGroundingOverride(value: string | null, fallback: VaultGroundingState): VaultGroundingState {
  if (!value) return fallback;

  const normalized = value.toLowerCase();
  if (["gap", "missing", "blocked", "empty"].includes(normalized)) {
    return {
      ...fallback,
      blocked: true,
      confidence: "0%",
      sources: []
    };
  }

  if (normalized === "thin") {
    return {
      ...fallback,
      confidence: "62%",
      sources: fallback.sources.slice(0, 1)
    };
  }

  return fallback;
}

function defaultGrounding(area: VaultGroundingArea, locale: Locale): VaultGroundingState {
  const sourceMap: Record<Locale, Record<VaultGroundingArea, string[]>> = {
    ar: {
      assistant: ["ملف الشركة", "الجمهور", "أهداف النمو"],
      content: ["نبرة العلامة", "الجمهور", "عروض الموسم"],
      strategy: ["ملف الشركة", "التحليلات", "أهداف العمل"]
    },
    en: {
      assistant: ["Company profile", "Audience", "Growth goals"],
      content: ["Brand voice", "Audience", "Seasonal offers"],
      strategy: ["Company profile", "Analytics", "Business goals"]
    }
  };

  return {
    area,
    blocked: false,
    confidence: "92%",
    sources: sourceMap[locale][area]
  };
}

function groundingCopy(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      assistantGapBody: "يحتاج MARKOS إلى ذاكرة أعمال كافية قبل تقديم توصية موثوقة. أكمل الخزنة ثم أعد تشغيل المساعد.",
      contentGapBody: "لا توجد ذاكرة كافية عن الجمهور أو النبرة لإنشاء محتوى آمن للعلامة. أكمل الخزنة قبل التوليد.",
      fixVault: "تحديث الخزنة",
      gapInline: "تحتاج هذه الخطوة إلى ذاكرة أعمال من الخزنة قبل تشغيل الذكاء.",
      gapTitle: "فجوة في الخزنة",
      groundedTitle: "مبني على الخزنة",
      strategyGapBody: "لا يمكن توليد استراتيجية موثوقة بدون أهداف العمل والجمهور والتحليلات الأساسية في الخزنة."
    },
    en: {
      assistantGapBody: "MARKOS needs enough business memory before it can recommend a reliable next move. Complete the Vault, then run the assistant again.",
      contentGapBody: "Audience or brand voice memory is missing, so MARKOS cannot safely generate brand content yet. Complete the Vault before generating.",
      fixVault: "Update Vault",
      gapInline: "This action needs business memory from the Vault before AI can run.",
      gapTitle: "Vault knowledge gap",
      groundedTitle: "Vault grounded",
      strategyGapBody: "A reliable strategy needs business goals, audience, and baseline analytics in the Vault first."
    }
  };

  return dictionary[locale][key] ?? key;
}
