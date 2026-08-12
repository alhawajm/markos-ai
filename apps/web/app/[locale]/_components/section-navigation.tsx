"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { LockKeyhole, type LucideIcon } from "lucide-react";
import styles from "./section-navigation.module.css";

export type SectionNavigationItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  locked?: boolean;
  status?: string;
  statusTone?: "neutral" | "success" | "warning" | "locked";
};

type SectionNavigationProps = {
  activeId?: string;
  className?: string | undefined;
  heading: string;
  items: readonly SectionNavigationItem[];
  mobileLabel: string;
  onSelect?: (id: string) => void;
};

export function SectionNavigation({ activeId, className, heading, items, mobileLabel, onSelect }: SectionNavigationProps) {
  const [observedId, setObservedId] = useState(activeId ?? items[0]?.id ?? "");
  const navigationSlotRef = useRef<HTMLDivElement>(null);
  const navigationSurfaceRef = useRef<HTMLDivElement>(null);
  const currentId = activeId ?? observedId;

  useEffect(() => {
    if (activeId) setObservedId(activeId);
  }, [activeId]);

  useEffect(() => {
    if (activeId || items.length === 0) return;

    let frame = 0;
    const updateCurrentSection = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        const reachedDocumentEnd = window.scrollY > 0 && window.scrollY + window.innerHeight >= documentHeight - 2;
        const finalItem = items.at(-1);

        if (reachedDocumentEnd && finalItem) {
          setObservedId(finalItem.id);
          return;
        }

        const offset = window.innerWidth <= 860 ? 120 : 48;
        const candidates = items
          .map((item) => document.getElementById(item.id))
          .filter((element): element is HTMLElement => element !== null)
          .filter((element) => element.getBoundingClientRect().bottom > offset);
        const nextSection = candidates.sort(
          (first, second) => Math.abs(first.getBoundingClientRect().top - offset) - Math.abs(second.getBoundingClientRect().top - offset)
        )[0];

        if (nextSection) setObservedId(nextSection.id);
      });
    };

    updateCurrentSection();
    window.addEventListener("scroll", updateCurrentSection, { passive: true });
    window.addEventListener("resize", updateCurrentSection);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateCurrentSection);
      window.removeEventListener("resize", updateCurrentSection);
    };
  }, [activeId, items]);

  useEffect(() => {
    const slot = navigationSlotRef.current;
    const surface = navigationSurfaceRef.current;
    const container = slot?.parentElement;
    if (!slot || !surface || !container) return;

    let frame = 0;
    const updatePinnedPosition = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const slotRect = slot.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const surfaceHeight = surface.getBoundingClientRect().height;
        const configuredTop = Number.parseFloat(getComputedStyle(slot).getPropertyValue("--section-menu-top"));
        const topOffset = Number.isFinite(configuredTop) ? configuredTop : 24;

        slot.style.minHeight = `${surfaceHeight}px`;

        if (slotRect.top > topOffset) {
          surface.style.removeProperty("position");
          surface.style.removeProperty("inset-block-start");
          surface.style.removeProperty("left");
          surface.style.removeProperty("width");
          return;
        }

        surface.style.position = "fixed";
        surface.style.insetBlockStart = `${Math.min(topOffset, containerRect.bottom - surfaceHeight)}px`;
        surface.style.left = `${slotRect.left}px`;
        surface.style.width = `${slotRect.width}px`;
      });
    };

    const resizeObserver = new ResizeObserver(updatePinnedPosition);
    resizeObserver.observe(slot);
    resizeObserver.observe(surface);
    window.addEventListener("scroll", updatePinnedPosition, { passive: true });
    window.addEventListener("resize", updatePinnedPosition);
    updatePinnedPosition();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", updatePinnedPosition);
      window.removeEventListener("resize", updatePinnedPosition);
      slot.style.removeProperty("min-height");
      surface.style.removeProperty("position");
      surface.style.removeProperty("inset-block-start");
      surface.style.removeProperty("left");
      surface.style.removeProperty("width");
    };
  }, []);

  function selectSection(id: string) {
    setObservedId(id);

    if (onSelect) {
      onSelect(id);
      return;
    }

    const target = document.getElementById(id);
    if (!target) return;

    window.history.replaceState(null, "", `#${id}`);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleLinkClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    selectSection(id);
  }

  return (
    <div className={[styles.navigation, className].filter(Boolean).join(" ")} data-section-navigation ref={navigationSlotRef}>
      <div className={styles.navigationSurface} data-section-navigation-surface ref={navigationSurfaceRef}>
        <aside className={styles.desktopMenu}>
          <p className={styles.heading}>{heading}</p>
          <nav aria-label={heading}>
            {items.map((item) => {
              const Icon = item.icon;
              const selected = item.id === currentId;

              return (
                <a
                  aria-current={selected ? "location" : undefined}
                  className={styles.navigationLink}
                  data-active={selected || undefined}
                  href={`#${item.id}`}
                  key={item.id}
                  onClick={(event) => handleLinkClick(event, item.id)}
                >
                  {Icon ? (
                    <span className={styles.icon} aria-hidden="true">
                      <Icon size={17} strokeWidth={1.8} />
                    </span>
                  ) : null}
                  <span className={styles.label}>{item.label}</span>
                  {item.locked ? <LockKeyhole className={styles.lockIcon} aria-hidden="true" size={14} /> : null}
                  {item.status ? (
                    <span className={styles.status} data-tone={item.statusTone ?? "neutral"}>
                      {item.status}
                    </span>
                  ) : null}
                </a>
              );
            })}
          </nav>
        </aside>

        <label className={styles.mobileMenu}>
          <span>{mobileLabel}</span>
          <select aria-label={heading} onChange={(event) => selectSection(event.target.value)} value={currentId}>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {item.status ? ` — ${item.status}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
