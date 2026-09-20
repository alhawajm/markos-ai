"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Remount for a new range/metric, but never reset the reader's position on refresh. */
export function LatestTrendViewport({ children, rtl }: { children: ReactNode; rtl: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (node) node.scrollLeft = rtl ? -node.scrollWidth : node.scrollWidth;
  }, [rtl]);
  return (
    <div ref={viewport} data-trend-viewport="" className="mt-6 overflow-x-auto rounded-2xl bg-[var(--sunlit-paper)] px-4 pb-4 pt-6">
      {children}
    </div>
  );
}
