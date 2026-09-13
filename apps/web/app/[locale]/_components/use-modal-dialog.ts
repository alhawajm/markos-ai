"use client";

import { useEffect, useRef, type KeyboardEvent, type RefObject, type SyntheticEvent } from "react";

type ModalDialogOptions = {
  onClose: () => void;
  closeDisabled?: boolean | undefined;
  initialFocusRef?: RefObject<HTMLElement | null> | undefined;
  restoreFocusRef?: RefObject<HTMLElement | null> | undefined;
};

type ScrollLock = { count: number; overflow: string; scrollbarGutter: string };
const scrollLocks = new Map<HTMLElement, ScrollLock>();

function acquireScrollLock(element: HTMLElement): () => void {
  const existing = scrollLocks.get(element);
  if (existing) {
    existing.count += 1;
  } else {
    scrollLocks.set(element, { count: 1, overflow: element.style.overflow, scrollbarGutter: element.style.scrollbarGutter });
    const style = getComputedStyle(element);
    const scrollbarWidth =
      element === document.documentElement
        ? window.innerWidth - element.clientWidth
        : element.offsetWidth - element.clientWidth - Number.parseFloat(style.borderLeftWidth || "0") - Number.parseFloat(style.borderRightWidth || "0");
    if (scrollbarWidth > 0) element.style.scrollbarGutter = "stable";
    element.style.overflow = "hidden";
  }

  return () => {
    const lock = scrollLocks.get(element);
    if (!lock || --lock.count > 0) return;
    element.style.overflow = lock.overflow;
    element.style.scrollbarGutter = lock.scrollbarGutter;
    scrollLocks.delete(element);
  };
}

/** Mount with the dialog and unmount when dismissed; native modal behavior owns focus containment and background inertness. */
export function useModalDialog(options: ModalDialogOptions) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    dialog.showModal();
    const scrollTargets = new Set<HTMLElement>([
      document.documentElement,
      document.body,
      ...document.querySelectorAll<HTMLElement>("[data-app-content-scroll]")
    ]);
    const releaseLocks = [...scrollTargets].map(acquireScrollLock);
    optionsRef.current.initialFocusRef?.current?.focus({ preventScroll: true });

    return () => {
      dialog.close();
      releaseLocks.forEach((release) => release());
      const returnTarget = optionsRef.current.restoreFocusRef?.current ?? opener;
      if (returnTarget?.isConnected && returnTarget.getClientRects().length > 0) returnTarget.focus({ preventScroll: true });
    };
  }, []);

  function onCancel(event: SyntheticEvent<HTMLDialogElement>): void {
    event.preventDefault();
    event.stopPropagation();
    if (!optionsRef.current.closeDisabled) optionsRef.current.onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    // Keep an underlying page's Escape handler from also navigating; retain the native cancel default.
    if (event.key === "Escape") {
      event.stopPropagation();
      return;
    }
    if (event.key !== "Tab" || event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest("dialog") !== event.currentTarget) return;

    // Native dialogs can send Tab to browser chrome at either boundary; keep the working cycle inside this modal.
    const controls = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]')
    ].filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        !element.closest('[inert], [aria-hidden="true"]') &&
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== "hidden"
    );
    const first = controls[0];
    const last = controls.at(-1);
    const active = document.activeElement as HTMLElement | null;
    const outsideControls = !active || !controls.includes(active);
    if (!first || !last || outsideControls || (event.shiftKey ? active === first : active === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus({ preventScroll: false });
      if (!first) event.currentTarget.focus({ preventScroll: true });
    }
  }

  return { dialogRef, onCancel, onKeyDown };
}
