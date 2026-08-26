import type { Transition, Variants } from "motion/react";

export type CalendarMotionIntent = "calendar-to-day" | "calendar-to-record" | "day-switch" | "day-to-record" | "record-switch" | "record-to-day";

const ENTER_EASE = [0.22, 1, 0.36, 1] as const;
const EXIT_EASE = [0.4, 0, 0.2, 1] as const;

export const calendarLayoutTransition: Transition = {
  layout: { duration: 0.18, ease: ENTER_EASE },
  opacity: { duration: 0.12, ease: ENTER_EASE }
};

export const calendarBackdropVariants: Variants = {
  enter: { opacity: 1, transition: { duration: 0.12, ease: ENTER_EASE } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: EXIT_EASE } },
  initial: { opacity: 0 }
};

export const calendarFocusVariants: Variants = {
  enter: {
    opacity: 1,
    scale: 1,
    transition: {
      opacity: { duration: 0.14, ease: ENTER_EASE },
      scale: { duration: 0.18, ease: ENTER_EASE }
    }
  },
  exit: {
    opacity: 0,
    pointerEvents: "none",
    scale: 0.992,
    transition: { duration: 0.11, ease: EXIT_EASE }
  },
  initial: { opacity: 0.7, scale: 0.988 }
};

export const calendarDayVariants: Variants = {
  enter: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.16, ease: ENTER_EASE } },
  exit: { opacity: 0, pointerEvents: "none", scale: 0.995, y: -4, transition: { duration: 0.09, ease: EXIT_EASE } },
  initial: { opacity: 0, scale: 0.995, y: 7 }
};

export const calendarRecordFocusVariants: Variants = {
  enter: { opacity: 1, transition: { duration: 0.12, ease: ENTER_EASE } },
  exit: { opacity: 0, pointerEvents: "none", transition: { duration: 0.08, ease: EXIT_EASE } },
  initial: { opacity: 0 }
};

export function calendarRecordDetailVariants(isRtl: boolean): Variants {
  const inlineOffset = isRtl ? -20 : 20;

  return {
    enter: { opacity: 1, scale: 1, x: 0, transition: { duration: 0.15, ease: ENTER_EASE } },
    exit: { opacity: 0, pointerEvents: "none", scale: 0.997, x: -inlineOffset * 0.35, transition: { duration: 0.08, ease: EXIT_EASE } },
    initial: { opacity: 0, scale: 0.995, x: inlineOffset }
  };
}

export function calendarDayLayoutId(dateKey: string) {
  return `calendar-day-${dateKey}`;
}

export function calendarDayContextLayoutId(dateKey: string) {
  return `calendar-day-context-${dateKey}`;
}

export function calendarRecordLayoutId(recordId: string) {
  return `calendar-record-${recordId}`;
}
