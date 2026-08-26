export type CalendarMotionIntent = "calendar-to-day" | "calendar-to-record" | "day-switch" | "day-to-record" | "record-switch" | "record-to-day";

export type CalendarMotionExitTarget = "calendar" | "day";

export interface CalendarMotionOrigin {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface CalendarMotionElements {
  backdrop: HTMLElement | null;
  detailOrigin?: CalendarMotionOrigin | null;
  intent: CalendarMotionIntent;
  isRtl: boolean;
  origin?: CalendarMotionOrigin | null;
  surface: HTMLElement;
}

interface CalendarMotionExitElements {
  backdrop: HTMLElement | null;
  isRtl: boolean;
  origin?: CalendarMotionOrigin | null;
  surface: HTMLElement;
  target: CalendarMotionExitTarget;
}

const ENTER_EASING = "cubic-bezier(.22, 1, .36, 1)";
const EXIT_EASING = "cubic-bezier(.4, 0, .2, 1)";

export function readCalendarMotionOrigin(element: HTMLElement | null | undefined): CalendarMotionOrigin | null {
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return { height: rect.height, left: rect.left, top: rect.top, width: rect.width };
}

export function prefersReducedCalendarMotion() {
  return typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function cancelCalendarAnimations(animations: Animation[]) {
  for (const animation of animations) animation.cancel();
}

export async function finishCalendarAnimations(animations: Animation[]) {
  await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
}

export function playCalendarEntrance({ backdrop, detailOrigin, intent, isRtl, origin, surface }: CalendarMotionElements): Animation[] {
  if (prefersReducedCalendarMotion() || typeof surface.animate !== "function") return [];

  const animations: Animation[] = [];

  if (intent === "calendar-to-day" || intent === "calendar-to-record") {
    if (backdrop) {
      animations.push(
        backdrop.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 180,
          easing: "ease-out",
          fill: "both"
        })
      );
    }

    const source = originTransform(surface, origin, { maxScale: 0.92, maxX: 190, maxY: 130, minScale: 0.84 });
    animations.push(
      surface.animate(
        [
          { filter: "blur(1px)", opacity: 0.28, transform: source.transform, transformOrigin: source.transformOrigin },
          { filter: "blur(0px)", opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", transformOrigin: source.transformOrigin }
        ],
        { duration: 270, easing: ENTER_EASING, fill: "both" }
      )
    );
  }

  const dayView = surface.querySelector<HTMLElement>('[data-calendar-motion-part="day-view"]');
  const dayContext = surface.querySelector<HTMLElement>('[data-calendar-motion-part="day-context"]');
  const recordDetail = surface.querySelector<HTMLElement>('[data-calendar-motion-part="record-detail"]');

  if (intent === "calendar-to-record" || intent === "day-to-record") {
    if (dayContext) {
      animations.push(
        dayContext.animate(
          [
            { opacity: 0.52, transform: `translate3d(${isRtl ? -42 : 42}px, 0, 0)` },
            { opacity: 1, transform: "translate3d(0, 0, 0)" }
          ],
          { delay: intent === "calendar-to-record" ? 55 : 0, duration: 215, easing: ENTER_EASING, fill: "both" }
        )
      );
    }

    if (recordDetail) {
      const source = originTransform(recordDetail, detailOrigin ?? origin, { maxScale: 0.96, maxX: 130, maxY: 96, minScale: 0.9 });
      animations.push(
        recordDetail.animate(
          [
            { filter: "blur(.6px)", opacity: 0.16, transform: source.transform, transformOrigin: source.transformOrigin },
            { filter: "blur(0px)", opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", transformOrigin: source.transformOrigin }
          ],
          { delay: intent === "calendar-to-record" ? 70 : 20, duration: 245, easing: ENTER_EASING, fill: "both" }
        )
      );
    }
  } else if (intent === "record-switch" && recordDetail) {
    const source = originTransform(recordDetail, detailOrigin, { maxScale: 0.985, maxX: 28, maxY: 30, minScale: 0.97 });
    animations.push(
      recordDetail.animate(
        [
          { opacity: 0.3, transform: source.transform, transformOrigin: source.transformOrigin },
          { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", transformOrigin: source.transformOrigin }
        ],
        { duration: 175, easing: ENTER_EASING, fill: "both" }
      )
    );
  } else if (intent === "record-to-day" && dayView) {
    animations.push(
      dayView.animate(
        [
          { opacity: 0.58, transform: `translate3d(${isRtl ? 26 : -26}px, 0, 0) scale(.985)` },
          { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" }
        ],
        { duration: 205, easing: ENTER_EASING, fill: "both" }
      )
    );
  } else if (intent === "day-switch" && dayView) {
    animations.push(
      dayView.animate(
        [
          { opacity: 0.62, transform: "translate3d(0, 10px, 0)" },
          { opacity: 1, transform: "translate3d(0, 0, 0)" }
        ],
        {
          duration: 165,
          easing: ENTER_EASING,
          fill: "both"
        }
      )
    );
  }

  return animations;
}

export function playCalendarExit({ backdrop, isRtl, origin, surface, target }: CalendarMotionExitElements): Animation[] {
  if (prefersReducedCalendarMotion() || typeof surface.animate !== "function") return [];

  const animations: Animation[] = [];

  if (target === "calendar") {
    const destination = originTransform(surface, origin, { maxScale: 0.92, maxX: 190, maxY: 130, minScale: 0.84 });
    animations.push(
      surface.animate(
        [
          { filter: "blur(0px)", opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", transformOrigin: destination.transformOrigin },
          { filter: "blur(1px)", opacity: 0.24, transform: destination.transform, transformOrigin: destination.transformOrigin }
        ],
        { duration: 205, easing: EXIT_EASING, fill: "both" }
      )
    );
    if (backdrop) {
      animations.push(backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: "ease-in", fill: "both" }));
    }
    return animations;
  }

  const dayContext = surface.querySelector<HTMLElement>('[data-calendar-motion-part="day-context"]');
  const recordDetail = surface.querySelector<HTMLElement>('[data-calendar-motion-part="record-detail"]');
  if (recordDetail) {
    animations.push(
      recordDetail.animate(
        [
          { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
          { opacity: 0, transform: `translate3d(${isRtl ? -34 : 34}px, 0, 0) scale(.985)` }
        ],
        { duration: 145, easing: EXIT_EASING, fill: "both" }
      )
    );
  }
  if (dayContext) {
    animations.push(
      dayContext.animate(
        [
          { opacity: 1, transform: "translate3d(0, 0, 0)" },
          { opacity: 0.68, transform: `translate3d(${isRtl ? -30 : 30}px, 0, 0)` }
        ],
        { duration: 155, easing: EXIT_EASING, fill: "both" }
      )
    );
  }

  return animations;
}

function originTransform(
  target: HTMLElement,
  origin: CalendarMotionOrigin | null | undefined,
  limits: { maxScale: number; maxX: number; maxY: number; minScale: number }
) {
  if (!origin) {
    return { transform: "translate3d(0, 14px, 0) scale(.97)", transformOrigin: "50% 50%" };
  }

  const targetRect = target.getBoundingClientRect();
  const originCenterX = origin.left + origin.width / 2;
  const originCenterY = origin.top + origin.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const translateX = clamp(originCenterX - targetCenterX, -limits.maxX, limits.maxX);
  const translateY = clamp(originCenterY - targetCenterY, -limits.maxY, limits.maxY);
  const areaScale = Math.sqrt((origin.width * origin.height) / Math.max(1, targetRect.width * targetRect.height));
  const scale = clamp(areaScale, limits.minScale, limits.maxScale);
  const transformOriginX = clamp(originCenterX - targetRect.left, 0, targetRect.width);
  const transformOriginY = clamp(originCenterY - targetRect.top, 0, targetRect.height);

  return {
    transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
    transformOrigin: `${transformOriginX}px ${transformOriginY}px`
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
