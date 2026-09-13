"use client";

import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, LockKeyhole } from "lucide-react";

type SurfaceTone = "info" | "success" | "warning" | "error" | "loading" | "limit";
type SurfaceAppearance = "default" | "luxury";

const toneClass: Record<SurfaceTone, { border: string; icon: string; text: string }> = {
  error: {
    border: "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)]",
    icon: "bg-[var(--danger-soft)] text-[var(--danger)]",
    text: "text-[var(--danger)]"
  },
  info: {
    border: "border-[color-mix(in_srgb,var(--info)_30%,transparent)] bg-[var(--info-soft)]",
    icon: "bg-[var(--info-soft)] text-[var(--info)]",
    text: "text-[var(--info)]"
  },
  limit: {
    border: "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-soft)]",
    icon: "bg-[var(--warning-soft)] text-[var(--warning)]",
    text: "text-[var(--warning)]"
  },
  loading: {
    border: "border-[color-mix(in_srgb,var(--info)_30%,transparent)] bg-[var(--info-soft)]",
    icon: "bg-[var(--info-soft)] text-[var(--info)]",
    text: "text-[var(--info)]"
  },
  success: {
    border: "border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--success-soft)]",
    icon: "bg-[var(--success-soft)] text-[var(--success)]",
    text: "text-[var(--success)]"
  },
  warning: {
    border: "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-soft)]",
    icon: "bg-[var(--warning-soft)] text-[var(--warning)]",
    text: "text-[var(--warning)]"
  }
};

const defaultIcons: Record<SurfaceTone, ComponentType<{ className?: string; size?: number }>> = {
  error: AlertTriangle,
  info: Info,
  limit: LockKeyhole,
  loading: Loader2,
  success: CheckCircle2,
  warning: AlertTriangle
};

export function SurfaceState({
  action,
  appearance = "default",
  body,
  icon,
  title,
  tone = "info"
}: {
  action?: ReactNode;
  appearance?: SurfaceAppearance;
  body?: string;
  icon?: ComponentType<{ className?: string; size?: number }>;
  title: string;
  tone?: SurfaceTone;
}) {
  const Icon = icon ?? defaultIcons[tone];
  const classes = toneClass[tone];
  const surfaceClass = appearance === "luxury" ? `shadow-[var(--shadow-sm)] ${classes.border}` : classes.border;

  return (
    <div className={`rounded-2xl border p-4 ${surfaceClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center ${classes.text}`}>
            {tone === "loading" ? <Icon className="animate-spin" size={20} /> : <Icon size={20} />}
          </div>
          <div className="min-w-0">
            <p className={`text-base font-semibold ${classes.text}`}>{title}</p>
            {body && body !== title ? <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{body}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
