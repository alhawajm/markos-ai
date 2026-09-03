import type { Transition, Variants } from "motion/react";

export type CalendarMotionIntent = "calendar-to-day" | "calendar-to-record" | "day-switch" | "day-to-record" | "record-switch" | "record-to-day";

const ENTER_EASE = [0.22, 1, 0.36, 1] as const;
const EXIT_EASE = [0.4, 0, 0.2, 1] as const;

export const calendarLayoutTransition: Transition = {
  opacity: { duration: 0.12, ease: ENTER_EASE },
  transform: { duration: 0.14, ease: ENTER_EASE }
};

export const calendarBackdropVariants: Variants = {
  enter: { opacity: 1, transition: { duration: 0.12, ease: ENTER_EASE } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: EXIT_EASE } },
  initial: { opacity: 0 }
};

export const calendarFocusVariants: Variants = {
  enter: {
    opacity: 1,
    y: 0,
    transition: {
      opacity: { duration: 0.14, ease: ENTER_EASE },
      y: { duration: 0.14, ease: ENTER_EASE }
    }
  },
  exit: {
    opacity: 0,
    pointerEvents: "none",
    y: 4,
    transition: { duration: 0.11, ease: EXIT_EASE }
  },
  initial: { opacity: 0, y: 6 }
};

export const calendarDayVariants: Variants = {
  enter: { opacity: 1, y: 0, transition: { duration: 0.14, ease: ENTER_EASE } },
  exit: { opacity: 0, pointerEvents: "none", y: -3, transition: { duration: 0.08, ease: EXIT_EASE } },
  initial: { opacity: 0, y: 5 }
};

export const calendarRecordFocusVariants: Variants = {
  enter: { opacity: 1, transition: { duration: 0.12, ease: ENTER_EASE } },
  exit: { opacity: 0, pointerEvents: "none", transition: { duration: 0.08, ease: EXIT_EASE } },
  initial: { opacity: 0 }
};

export function calendarRecordDetailVariants(isRtl: boolean): Variants {
  const inlineOffset = isRtl ? -20 : 20;

  return {
    enter: { opacity: 1, x: 0, transition: { duration: 0.14, ease: ENTER_EASE } },
    exit: { opacity: 0, pointerEvents: "none", x: -inlineOffset * 0.25, transition: { duration: 0.08, ease: EXIT_EASE } },
    initial: { opacity: 0, x: inlineOffset * 0.5 }
  };
}
