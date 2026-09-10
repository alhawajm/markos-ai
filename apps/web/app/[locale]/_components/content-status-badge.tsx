import type { ComponentPropsWithoutRef } from "react";
import type { ContentStatus, Locale } from "@markos/shared-types";
import { contentStatusBadgeClass, contentStatusLabel } from "./content-status";

type ContentStatusBadgeProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  status: ContentStatus;
  locale: Locale;
};

export function ContentStatusBadge({ status, locale, className = "", ...props }: ContentStatusBadgeProps) {
  return (
    <span
      {...props}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[13px] font-semibold leading-5 ${contentStatusBadgeClass(status)} ${className}`}
      data-content-status={status}
    >
      {contentStatusLabel(status, locale)}
    </span>
  );
}
