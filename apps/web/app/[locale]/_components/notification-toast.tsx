"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { SurfaceState } from "./surface-state";

type NotificationTone = "error" | "info" | "success" | "warning";

export function NotificationToast({
  action,
  body,
  dismissLabel,
  onDismiss,
  title,
  tone = "info"
}: {
  action?: React.ReactNode;
  body: string;
  dismissLabel: string;
  onDismiss: () => void;
  title: string;
  tone?: NotificationTone;
}) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!body || tone === "error" || tone === "warning") return;

    const timer = window.setTimeout(() => dismissRef.current(), 6000);
    return () => window.clearTimeout(timer);
  }, [body, tone]);

  if (!body) return null;

  const urgent = tone === "error" || tone === "warning";

  return (
    <div
      aria-atomic="true"
      aria-live={urgent ? "assertive" : "polite"}
      className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex justify-center sm:top-6"
      data-notification-toast=""
      role={urgent ? "alert" : "status"}
    >
      <div className="pointer-events-auto w-full max-w-xl rounded-2xl shadow-[var(--shadow-md)]" data-notification-tone={tone}>
        <SurfaceState
          action={
            <div className="flex items-center gap-2">
              {action}
              <button
                aria-label={dismissLabel}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition hover:border-[var(--sunlit-line-strong)] hover:text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
                onClick={onDismiss}
                title={dismissLabel}
                type="button"
              >
                <X size={17} />
              </button>
            </div>
          }
          appearance="luxury"
          body={body}
          title={title}
          tone={tone}
        />
      </div>
    </div>
  );
}
