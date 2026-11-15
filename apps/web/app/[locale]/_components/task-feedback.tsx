"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { Locale } from "@markos/shared-types";
import "./task-feedback.css";

export function MarkosPulse({ size = 22, className = "", color, style }: { size?: number; className?: string; color?: string; style?: CSSProperties }) {
  return (
    <span className={`markos-pulse ${className.replace(/\banimate-spin\b/g, "")}`} style={{ width: size, height: size, color, ...style }} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
export function TaskFeedback({
  label,
  detail,
  locale = "en",
  startedAt,
  progress,
  compact = false
}: {
  label: string;
  detail?: string | undefined;
  locale?: Locale;
  startedAt?: string | undefined;
  progress?: { completedWeeks: number; totalWeeks: number } | undefined;
  compact?: boolean;
}) {
  const [began] = useState(() => (startedAt ? Date.parse(startedAt) : Date.now()));
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - began) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [began]);
  const ar = locale === "ar";
  const value = progress ? Math.min(progress.completedWeeks, progress.totalWeeks) : 0;
  return (
    <div className={`markos-task ${compact ? "markos-task-compact" : ""}`} data-task-state="working">
      <div className="markos-task-line">
        <MarkosPulse />
        <span role="status" aria-live="polite">
          {label}
        </span>
        {elapsed >= 3 && (
          <span className="markos-task-time" aria-hidden="true">
            {elapsed < 60 ? `${elapsed}${ar ? "ث" : "s"}` : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}
          </span>
        )}
      </div>
      {progress && (
        <div
          className="markos-task-progress"
          role="progressbar"
          aria-label={ar ? "تخطيط الحملة" : "Campaign planning"}
          aria-valuemin={0}
          aria-valuemax={progress.totalWeeks}
          aria-valuenow={value}
          aria-valuetext={ar ? `تم حفظ ${value} من ${progress.totalWeeks} أسابيع` : `${value} of ${progress.totalWeeks} weeks saved`}
        >
          <span style={{ width: `${(value / progress.totalWeeks) * 100}%` }} />
        </div>
      )}
      {progress && (
        <p className="markos-task-detail">{ar ? `تم حفظ ${value} من ${progress.totalWeeks} أسابيع` : `${value} of ${progress.totalWeeks} weeks saved`}</p>
      )}
      {!compact && (
        <p className="markos-task-detail">
          {detail ??
            (elapsed >= 15
              ? ar
                ? "ما زلت أعمل على طلبك. يمكنك إبقاء هذه الصفحة مفتوحة أو العودة لاحقًا."
                : "Still working on your request. You can keep this open or return later."
              : ar
                ? "ستظهر النتيجة هنا بمجرد أن تصبح جاهزة."
                : "Your result will appear here when it’s ready.")}
        </p>
      )}
      {!compact && !progress && (
        <div className="markos-task-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  );
}
