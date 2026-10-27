import React, { useState } from "react";
import { Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useAppearance } from "../providers";
import { Button, Card, Txt } from "../ui";
import { bahrainDate } from "../campaigns/brief-model";

export function PlannedTime({ value, disabled, change }: { value?: string; disabled: boolean; change: (value: string | undefined) => void }) {
  const { t, locale, mode } = useAppearance();
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const current = value ? new Date(value) : new Date();
  return (
    <Card>
      <Txt variant="label">{t("Planned publication time", "موعد النشر المخطط")}</Txt>
      <Txt>
        {value ? current.toLocaleString(locale, { timeZone: "Asia/Bahrain", dateStyle: "medium", timeStyle: "short" }) : t("Not planned yet", "لم يُحدد بعد")}
      </Txt>
      <Button secondary disabled={disabled} label={t("Choose planning date", "اختيار التاريخ المخطط")} onPress={() => setPicker("date")} />
      <Button secondary disabled={disabled || !value} label={t("Choose planning time", "اختيار الوقت المخطط")} onPress={() => setPicker("time")} />
      {value ? (
        <Button
          secondary
          disabled={disabled}
          label={t("Clear planned time", "مسح الموعد المخطط")}
          onPress={() => {
            change(undefined);
            setPicker(null);
          }}
        />
      ) : null}
      {picker && !disabled ? (
        <>
          <DateTimePicker
            value={current}
            mode={picker}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            timeZoneName="Asia/Bahrain"
            themeVariant={mode}
            is24Hour
            onChange={(event, selected) => {
              if (Platform.OS === "android") setPicker(null);
              if (event.type !== "set" || !selected) return;
              const day = bahrainDate(picker === "date" ? selected : current);
              const time = new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Bahrain",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
                numberingSystem: "latn"
              }).format(picker === "time" ? selected : current);
              change(new Date(`${day}T${time}:00+03:00`).toISOString());
            }}
          />
          {Platform.OS === "ios" ? <Button secondary label={t("Done", "تم")} onPress={() => setPicker(null)} /> : null}
        </>
      ) : null}
      <Txt variant="meta" muted>
        {t(
          "Bahrain time. This is a planning note, not a publishing schedule. Save your changes, then approve and schedule separately.",
          "بتوقيت البحرين. هذا موعد للتخطيط وليس جدول نشر. احفظ التعديلات ثم اعتمد المحتوى وجدوله بشكل منفصل."
        )}
      </Txt>
    </Card>
  );
}
