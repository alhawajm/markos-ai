"use client";

import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, LockKeyhole, Sparkles } from "lucide-react";

type SurfaceTone = "info" | "success" | "warning" | "error" | "loading" | "limit";

const toneClass: Record<SurfaceTone, { border: string; icon: string; text: string }> = {
  error: {
    border: "border-rose-200 bg-rose-50/70",
    icon: "bg-rose-100 text-rose-600",
    text: "text-rose-700"
  },
  info: {
    border: "border-blue-100 bg-blue-50/60",
    icon: "bg-blue-100 text-blue-600",
    text: "text-blue-800"
  },
  limit: {
    border: "border-amber-200 bg-amber-50/70",
    icon: "bg-amber-100 text-amber-600",
    text: "text-amber-800"
  },
  loading: {
    border: "border-blue-100 bg-blue-50/60",
    icon: "bg-blue-100 text-blue-600",
    text: "text-blue-800"
  },
  success: {
    border: "border-emerald-200 bg-emerald-50/70",
    icon: "bg-emerald-100 text-emerald-600",
    text: "text-emerald-800"
  },
  warning: {
    border: "border-accent/20 bg-[#FFF7FA]",
    icon: "bg-accent/10 text-accent",
    text: "text-accent"
  }
};

const defaultIcons: Record<SurfaceTone, ComponentType<{ className?: string; size?: number }>> = {
  error: AlertTriangle,
  info: Sparkles,
  limit: LockKeyhole,
  loading: Loader2,
  success: CheckCircle2,
  warning: AlertTriangle
};

export function SurfaceState({
  action,
  body,
  icon,
  title,
  tone = "info"
}: {
  action?: ReactNode;
  body: string;
  icon?: ComponentType<{ className?: string; size?: number }>;
  title: string;
  tone?: SurfaceTone;
}) {
  const Icon = icon ?? defaultIcons[tone];
  const classes = toneClass[tone];

  return (
    <div className={`rounded-[20px] border p-4 shadow-card ${classes.border}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${classes.icon}`}>
            {tone === "loading" ? <Icon className="animate-spin" size={18} /> : <Icon size={18} />}
          </div>
          <div>
            <p className={`text-sm font-extrabold ${classes.text}`}>{title}</p>
            <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
