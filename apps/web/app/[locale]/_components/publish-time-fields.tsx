"use client";

import type { Locale } from "@markos/shared-types";
import { CalendarDays, Clock3 } from "lucide-react";
import { useId } from "react";

const slots = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);

export function PublishTimeFields({
  value,
  onChange,
  locale,
  disabled = false,
  min,
  id
}: {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  disabled?: boolean;
  min?: string;
  id?: string;
}) {
  const fieldId = useId();
  const dateId = id ?? `${fieldId}-date`;
  const timeId = `${fieldId}-time`;
  const [date = "", time = ""] = value.split("T");
  const minDate = min?.slice(0, 10);
  const minTime = min?.slice(11, 16);
  const fieldClass = "sunlit-field min-h-12 w-full min-w-0 rounded-xl px-3 text-base outline-none";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="grid min-w-0 gap-2 text-sm font-semibold text-[var(--sunlit-ink)]">
        <label htmlFor={dateId} className="flex items-center gap-2">
          <CalendarDays aria-hidden="true" size={16} className="text-[var(--sunlit-muted)]" />
          {locale === "ar" ? "تاريخ النشر" : "Publish date"}
        </label>
        <input
          className={fieldClass}
          id={dateId}
          type="date"
          min={minDate}
          disabled={disabled}
          value={date}
          onChange={(event) => onChange(event.target.value ? `${event.target.value}T${time || "18:00"}` : "")}
        />
      </div>
      <div className="grid min-w-0 gap-2 text-sm font-semibold text-[var(--sunlit-ink)]">
        <label htmlFor={timeId} className="flex items-center gap-2">
          <Clock3 aria-hidden="true" size={16} className="text-[var(--sunlit-muted)]" />
          {locale === "ar" ? "وقت النشر" : "Publish time"}
        </label>
        <select
          id={timeId}
          className={fieldClass}
          dir="ltr"
          disabled={disabled || !date}
          value={slots.includes(time) ? time : ""}
          onChange={(event) => onChange(`${date}T${event.target.value}`)}
        >
          <option value="" disabled>
            {locale === "ar" ? "اختر الوقت" : "Choose time"}
          </option>
          {slots.map((slot) => (
            <option key={slot} value={slot} disabled={date === minDate && !!minTime && slot < minTime}>
              {slot}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
