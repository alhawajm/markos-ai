import React from "react";
import type { OfferingMaintenanceUpdate } from "@markos/shared-types";
import { offeringMaintenanceSchema } from "@markos/validation";
import { Button, Field, Txt } from "../ui";
import { LocalAppError } from "../errors";
import { useAppearance } from "../providers";
import { display, type Values } from "./model";

type Translate = (en: string, ar: string) => string;
export function moneyText(value: unknown, currency: string): string {
  if (typeof value !== "number") return "";
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const amount = BigInt(value)
    .toString()
    .padStart(digits + 1, "0");
  return digits ? `${amount.slice(0, -digits)}.${amount.slice(-digits)}` : amount;
}
export function parseMoney(value: string, currency: string): number | undefined {
  const normalized = value
    .trim()
    .replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) - (c <= "٩" ? 1632 : 1776)))
    .replace("٫", ".");
  if (!normalized) return undefined;
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  if (!new RegExp(digits ? `^\\d+(?:\\.\\d{1,${digits}})?$` : "^\\d+$").test(normalized)) throw new Error("Invalid price");
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole!) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0") || "0");
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid price");
  return Number(minor);
}
export function offeringValues(value: Values): Values {
  const currency = String(value.currency ?? "BHD");
  return {
    ...value,
    _price: value._price ?? moneyText(value.priceMinor, currency),
    _minimum: value._minimum ?? moneyText(value.minPriceMinor, currency),
    _maximum: value._maximum ?? moneyText(value.maxPriceMinor, currency)
  };
}
export function offeringInput(value: Values, t: Translate): OfferingMaintenanceUpdate["offering"] {
  try {
    const v = offeringValues(value),
      currency = String(v.currency).trim().toUpperCase();
    const optional = Object.fromEntries(
      ["nameEn", "nameAr", "category", "description"].filter((key) => display(v[key]).trim()).map((key) => [key, display(v[key]).trim()])
    );
    return offeringMaintenanceSchema.parse({
      expectedVersion: 0,
      offering: {
        ...optional,
        name: display(v.name).trim(),
        kind: v.kind,
        currency,
        priceType: v.priceType,
        status: v.status,
        ...(["FIXED", "FROM"].includes(String(v.priceType)) ? { priceMinor: parseMoney(String(v._price), currency) } : {}),
        ...(v.priceType === "RANGE" ? { minPriceMinor: parseMoney(String(v._minimum), currency), maxPriceMinor: parseMoney(String(v._maximum), currency) } : {})
      }
    }).offering;
  } catch {
    throw new LocalAppError(
      t(
        "Check the name, currency and prices. BHD allows 3 decimal places; the maximum must be at least the minimum.",
        "تحقّق من الاسم والعملة والأسعار. يسمح الدينار بثلاث خانات عشرية؛ يجب ألا يقل الحد الأعلى عن الأدنى."
      )
    );
  }
}
export function OfferingDetails({ value, disabled, onChange }: { value: Values; disabled: boolean; onChange: (value: Values) => void }) {
  const { t } = useAppearance();
  const v = offeringValues(value);
  const change = (key: string, next: string) => onChange({ ...v, [key]: next });
  return (
    <>
      <Field
        label={t("English name (optional)", "الاسم الإنجليزي (اختياري)")}
        value={display(v.nameEn)}
        maxLength={160}
        editable={!disabled}
        onChangeText={(s) => change("nameEn", s)}
      />
      <Field
        label={t("Arabic name (optional)", "الاسم العربي (اختياري)")}
        value={display(v.nameAr)}
        maxLength={160}
        editable={!disabled}
        onChangeText={(s) => change("nameAr", s)}
      />
      <Txt variant="heading">{t("Pricing", "التسعير")}</Txt>
      {(
        [
          ["UNSPECIFIED", "Not specified", "غير محدد"],
          ["FIXED", "Fixed price", "سعر ثابت"],
          ["FROM", "Starting from", "ابتداءً من"],
          ["RANGE", "Price range", "نطاق سعري"],
          ["QUOTE", "On request", "عند الطلب"]
        ] as const
      ).map(([key, en, ar]) => (
        <Button key={key} disabled={disabled} secondary={v.priceType !== key} label={t(en, ar)} onPress={() => change("priceType", key)} />
      ))}
      <Field
        label={t("Currency code (BHD, USD…)", "رمز العملة (BHD، USD…) ")}
        value={display(v.currency)}
        autoCapitalize="characters"
        maxLength={3}
        editable={!disabled}
        onChangeText={(s) => change("currency", s.toUpperCase())}
      />
      {["FIXED", "FROM"].includes(String(v.priceType)) ? (
        <Field
          label={t("Price", "السعر")}
          value={display(v._price)}
          keyboardType="decimal-pad"
          editable={!disabled}
          onChangeText={(s) => change("_price", s)}
        />
      ) : null}
      {v.priceType === "RANGE" ? (
        <>
          <Field
            label={t("Minimum price", "الحد الأدنى للسعر")}
            value={display(v._minimum)}
            keyboardType="decimal-pad"
            editable={!disabled}
            onChangeText={(s) => change("_minimum", s)}
          />
          <Field
            label={t("Maximum price", "الحد الأعلى للسعر")}
            value={display(v._maximum)}
            keyboardType="decimal-pad"
            editable={!disabled}
            onChangeText={(s) => change("_maximum", s)}
          />
        </>
      ) : null}
      <Txt variant="heading">{t("Availability", "التوفر")}</Txt>
      {(
        [
          ["ACTIVE", "Available", "متاح"],
          ["PAUSED", "Paused", "متوقف مؤقتًا"],
          ["ARCHIVED", "Archived", "مؤرشف"]
        ] as const
      ).map(([key, en, ar]) => (
        <Button key={key} disabled={disabled} secondary={v.status !== key} label={t(en, ar)} onPress={() => change("status", key)} />
      ))}
      {v.status !== "ACTIVE" ? (
        <Txt muted>
          {t(
            "Excluded from future AI suggestions. Existing campaigns stay unchanged. You can restore availability here later.",
            "لن يُستخدم في اقتراحات الذكاء الاصطناعي القادمة. تبقى الحملات الحالية كما هي. يمكنك إعادة تفعيله هنا لاحقًا."
          )}
        </Txt>
      ) : null}
    </>
  );
}
