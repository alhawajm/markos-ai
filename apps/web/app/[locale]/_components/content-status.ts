import type { ContentStatus, Locale } from "@markos/shared-types";

type ContentStatusPresentation = {
  label: Record<Locale, string>;
  tone: "draft" | "review" | "ready" | "scheduled" | "published" | "failed";
  badgeClassName: string;
  dotClassName: string;
};

export const contentStatusPresentation = {
  DRAFT: {
    label: { en: "Draft", ar: "مسودة" },
    tone: "draft",
    badgeClassName: "border-[var(--status-draft-border)] bg-[var(--status-draft-bg)] text-[var(--status-draft)]",
    dotClassName: "bg-[var(--status-draft)]"
  },
  IN_REVIEW: {
    label: { en: "In review", ar: "قيد المراجعة" },
    tone: "review",
    badgeClassName: "border-[var(--status-review-border)] bg-[var(--status-review-bg)] text-[var(--status-review)]",
    dotClassName: "bg-[var(--status-review)]"
  },
  APPROVED: {
    label: { en: "Ready", ar: "جاهز" },
    tone: "ready",
    badgeClassName: "border-[var(--status-ready-border)] bg-[var(--status-ready-bg)] text-[var(--status-ready)]",
    dotClassName: "bg-[var(--status-ready)]"
  },
  SCHEDULED: {
    label: { en: "Scheduled", ar: "مجدول" },
    tone: "scheduled",
    badgeClassName: "border-[var(--status-scheduled-border)] bg-[var(--status-scheduled-bg)] text-[var(--status-scheduled)]",
    dotClassName: "bg-[var(--status-scheduled)]"
  },
  PUBLISHED: {
    label: { en: "Published", ar: "منشور" },
    tone: "published",
    badgeClassName: "border-[var(--status-published-border)] bg-[var(--status-published-bg)] text-[var(--status-published)]",
    dotClassName: "bg-[var(--status-published)]"
  },
  FAILED: {
    label: { en: "Failed", ar: "تعذّر النشر" },
    tone: "failed",
    badgeClassName: "border-[var(--status-failed-border)] bg-[var(--status-failed-bg)] text-[var(--status-failed)]",
    dotClassName: "bg-[var(--status-failed)]"
  }
} satisfies Record<ContentStatus, ContentStatusPresentation>;

export function contentStatusLabel(status: ContentStatus, locale: Locale): string {
  return contentStatusPresentation[status].label[locale];
}

export function contentStatusBadgeClass(status: ContentStatus): string {
  return contentStatusPresentation[status].badgeClassName;
}

export function contentStatusDotClass(status: ContentStatus): string {
  return contentStatusPresentation[status].dotClassName;
}
