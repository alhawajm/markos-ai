import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";
import { markosMonogram } from "@markos/ui-tokens";

export const MarkosAiIcon = forwardRef<SVGSVGElement, LucideProps>(function MarkosAiIcon({ strokeWidth = 2.15, ...props }, ref) {
  const { size = 24, ...rest } = props;
  return (
    <svg
      {...rest}
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={Number(strokeWidth) * 1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-markos-mark=""
    >
      <path d={markosMonogram.points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ")} />
    </svg>
  );
});
