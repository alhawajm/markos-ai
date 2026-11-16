import React from "react";
import { contentJourney, type ContentRecord, type MediaAssetRecord } from "@markos/shared-types";
import { useAppearance } from "../providers";
import { Card, TextAction, Txt } from "../ui";
import { draftReadiness } from "./workflow";

export function Readiness({
  item,
  assets,
  busy,
  open,
  publishing = false
}: {
  item: ContentRecord;
  assets?: MediaAssetRecord[];
  busy: boolean;
  open: (section: "assistant" | "caption" | "media" | "review") => void;
  publishing?: boolean;
}) {
  const { t, locale } = useAppearance();
  const issue = draftReadiness(item, assets);
  const journey = contentJourney(item, locale, issue, { working: busy, publishing });
  const caption = issue === "caption" || issue === "caption-invalid";
  return (
    <Card tone={issue ? "tint" : undefined}>
      {journey.context ? (
        <Txt variant="meta" muted>
          {journey.context}
        </Txt>
      ) : null}
      <Txt variant="label">{journey.title}</Txt>
      <Txt>{journey.detail}</Txt>
      {caption && ["DRAFT", "IN_REVIEW"].includes(item.status) ? (
        <TextAction disabled={busy} label={t("Write caption myself", "كتابة النص بنفسي")} onPress={() => open("caption")} />
      ) : null}
    </Card>
  );
}
