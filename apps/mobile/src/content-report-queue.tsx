import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Linking } from "react-native";
import { canReadContentReports, canReviewContentReports, type ContentReportRecord } from "@markos/shared-types";
import { useAccount, useAppearance } from "./providers";
import { Button, Card, Field, Loading, Notice, Sheet, Txt } from "./ui";
import { QueryFailure } from "./content";
import { errorMessage } from "./errors";
import { sessionController } from "./auth/transport";

export function ContentReportQueue() {
  const { session, scope } = useAccount();
  return canReadContentReports(session.roles) ? <Queue key={scope} /> : null;
}
function Queue() {
  const { api, scope, epoch, session } = useAccount();
  const { t } = useAppearance();
  const reports = useQuery({ queryKey: [scope, "content-reports"], queryFn: () => api.contentReports() });
  const [selected, setSelected] = useState<ContentReportRecord | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function review(status: "RESOLVED" | "DISMISSED") {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.reviewContentReport(selected.id, { status, note: note.trim() });
      sessionController.assertEpoch(epoch);
      setSelected(null);
      await reports.refetch();
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Txt variant="heading">{t("Content reports", "بلاغات المحتوى")}</Txt>
      {reports.isPending ? (
        <Loading />
      ) : reports.isError ? (
        <QueryFailure error={reports.error} retry={() => void reports.refetch()} />
      ) : reports.data.length ? (
        reports.data.map((row) => (
          <Card key={row.id}>
            <Txt variant="label">
              {row.reason} · {row.source}
            </Txt>
            <Txt variant="meta" muted>
              {row.createdAt} · {row.workspaceId}
            </Txt>
            <Txt selectable>{row.excerpt || row.note}</Txt>
            {row.excerpt && row.note ? <Txt selectable>{row.note}</Txt> : null}
            {row.mediaAssetIds.length ? <ReportMedia id={row.id} /> : null}
            {canReviewContentReports(session.roles) ? (
              <Button
                secondary
                label={t("Review report", "مراجعة البلاغ")}
                onPress={() => {
                  setSelected(row);
                  setNote("");
                  setError("");
                }}
              />
            ) : null}
          </Card>
        ))
      ) : (
        <Txt muted>{t("No open content reports.", "لا توجد بلاغات محتوى مفتوحة.")}</Txt>
      )}
      <Button secondary label={t("Refresh reports", "تحديث البلاغات")} onPress={() => void reports.refetch()} />
      <Sheet
        title={t("Review report", "مراجعة البلاغ")}
        visible={!!selected}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
      >
        <Txt>
          {t(
            "Investigate the content and record the action taken before resolving. Dismiss reports that do not require action.",
            "تحقق من المحتوى وسجّل الإجراء المتخذ قبل إغلاق البلاغ. استبعد البلاغات التي لا تتطلب إجراءً."
          )}
        </Txt>
        <Field
          label={t("Investigation and action taken", "نتيجة التحقيق والإجراء المتخذ")}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={1500}
          editable={!busy}
        />
        {error ? <Notice error>{error}</Notice> : null}
        <Button
          label={t("Resolve report", "إغلاق البلاغ بعد المعالجة")}
          busy={busy}
          disabled={note.trim().length < 3}
          onPress={() => void review("RESOLVED")}
        />
        <Button secondary label={t("Dismiss report", "استبعاد البلاغ")} disabled={busy || note.trim().length < 3} onPress={() => void review("DISMISSED")} />
      </Sheet>
    </>
  );
}
function ReportMedia({ id }: { id: string }) {
  const { api, scope } = useAccount();
  const { t } = useAppearance();
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const media = useQuery({ queryKey: [scope, "report-media", id], queryFn: () => api.contentReportMedia(id), enabled: open, gcTime: 0, staleTime: 0 });
  return (
    <>
      <Button
        secondary
        label={t("View reported media", "عرض الوسائط المبلغ عنها")}
        onPress={() => {
          setOpen(true);
          void media.refetch();
        }}
      />
      {open && media.isFetching ? <Loading /> : null}
      {open && media.isError ? <QueryFailure error={media.error} retry={() => void media.refetch()} /> : null}
      {open && media.data?.length === 0 ? <Txt muted>{t("This media was removed.", "تم حذف هذه الوسائط.")}</Txt> : null}
      {open
        ? media.data?.map((asset) => (
            <Button
              key={asset.id}
              secondary
              label={asset.filename}
              onPress={() =>
                void Linking.openURL(asset.url).catch(() => setError(t("Could not open media. Refresh and try again.", "تعذر فتح الوسائط. حدّث وحاول مجددًا.")))
              }
            />
          ))
        : null}
      {error ? <Notice error>{error}</Notice> : null}
    </>
  );
}
