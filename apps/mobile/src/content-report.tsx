import React, { useRef, useState } from "react";
import type { ContentReportReason, ContentReportSource } from "@markos/shared-types";
import { useAccount, useAppearance } from "./providers";
import { Button, Field, Notice, SelectField, Sheet, Txt } from "./ui";
import { newRequestId } from "./request-id";
import { errorMessage } from "./errors";
import { sessionController } from "./auth/transport";

export function ContentReportSheet({
  visible,
  onClose,
  source,
  sourceId
}: {
  visible: boolean;
  onClose: () => void;
  source: ContentReportSource;
  sourceId?: string;
}) {
  const { scope } = useAccount();
  return (
    <Sheet title={useAppearance().t("Report AI content", "الإبلاغ عن محتوى الذكاء الاصطناعي")} visible={visible} onClose={onClose}>
      {visible ? <ReportForm key={`${scope}:${source}:${sourceId ?? "general"}`} source={source} {...(sourceId ? { sourceId } : {})} /> : null}
    </Sheet>
  );
}
function ReportForm({ source, sourceId }: { source: ContentReportSource; sourceId?: string }) {
  const { api, epoch } = useAccount();
  const { t } = useAppearance();
  const [reason, setReason] = useState<ContentReportReason>("OFFENSIVE");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const requestId = useRef(newRequestId());
  const working = useRef(false);
  const mounted = useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function changed() {
    requestId.current = newRequestId();
    setError("");
  }
  if (receipt)
    return (
      <Notice>
        {t("Report received. Our team will review it. Reference: ", "تم استلام البلاغ وسيراجعه فريقنا. المرجع: ")}
        {receipt}
      </Notice>
    );
  return (
    <>
      <Txt muted>
        {t(
          "Tell us what is wrong. We send your explanation and a short excerpt or media reference to MARKOS moderators. Your draft stays unchanged. Do not include passwords or private account details.",
          "أخبرنا بالمشكلة. نرسل توضيحك ومقتطفًا قصيرًا أو مرجع الوسائط إلى مشرفي ماركوس. تبقى مسودتك كما هي. لا تدرج كلمات المرور أو بيانات الحساب الخاصة."
        )}
      </Txt>
      <SelectField
        label={t("Reason", "السبب")}
        value={reason}
        disabled={busy}
        options={[
          { value: "OFFENSIVE", label: t("Offensive or inappropriate", "مسيء أو غير لائق") },
          { value: "HARMFUL", label: t("Harmful or unsafe", "ضار أو غير آمن") },
          { value: "COPYRIGHT", label: t("Copyright or ownership", "حقوق النشر أو الملكية") },
          { value: "INACCURATE", label: t("Incorrect or misleading", "غير صحيح أو مضلل") },
          { value: "OTHER", label: t("Something else", "سبب آخر") }
        ]}
        onChange={(value) => {
          changed();
          setReason(value);
        }}
      />
      <Field
        label={t("What happened?", "ماذا حدث؟")}
        value={note}
        multiline
        maxLength={1500}
        editable={!busy}
        onChangeText={(value) => {
          changed();
          setNote(value);
        }}
      />
      {error ? <Notice error>{error}</Notice> : null}
      <Button
        label={t("Send report", "إرسال البلاغ")}
        busy={busy}
        disabled={source === "GENERAL_AI" && note.trim().length < 10}
        onPress={() => {
          if (working.current) return;
          working.current = true;
          setBusy(true);
          setError("");
          void api
            .reportContent({ requestId: requestId.current, source, ...(sourceId ? { sourceId } : {}), reason, note: note.trim() })
            .then((saved) => {
              sessionController.assertEpoch(epoch);
              if (mounted.current) setReceipt(saved.id);
            })
            .catch((e: unknown) => {
              if (mounted.current) setError(errorMessage(e, t));
            })
            .finally(() => {
              working.current = false;
              if (mounted.current) setBusy(false);
            });
        }}
      />
    </>
  );
}
