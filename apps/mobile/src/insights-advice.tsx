import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Sparkles } from "lucide-react-native";
import { useAccount, useAppearance } from "./providers";
import { Button, Card, Field, Notice, Txt } from "./ui";
import { errorMessage } from "./errors";
import { shareFile } from "./share-file";

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
export function InsightsAdvice({ days }: { days: number }) {
  const { api, epoch } = useAccount();
  const { t, locale } = useAppearance();
  const [question, setQuestion] = useState("");
  const [month, setMonth] = useState(() => {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Bahrain", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`;
  });
  const advice = useMutation({
    mutationFn: () =>
      api.runAgent({
        agent: "ANALYTICS_CONSULTANT",
        task:
          question.trim() ||
          t("Explain the available results and suggest three practical next actions.", "اشرح النتائج المتاحة واقترح ثلاث خطوات عملية تالية."),
        locale,
        inputs: { analyticsDays: days }
      })
  });
  const report = useMutation({
    mutationFn: async () => {
      const pdf = await api.exportMonthlyAnalyticsPdf({ month, locale });
      await shareFile(new Uint8Array(pdf), `markos-insights-${month}.pdf`, "application/pdf", epoch, t("Share monthly report", "مشاركة التقرير الشهري"));
    }
  });
  const output = advice.data?.output;
  return (
    <>
      <Card tone="tint">
        <Txt variant="heading">{t("Ask MARKOS about your results", "اسأل ماركوس عن نتائجك")}</Txt>
        <Field
          label={t("Your question (optional)", "سؤالك (اختياري)")}
          value={question}
          onChangeText={setQuestion}
          multiline
          maxLength={1000}
          editable={!advice.isPending}
        />
        <Button icon={Sparkles} busy={advice.isPending} label={t("Explain my performance", "اشرح أدائي")} onPress={() => advice.mutate()} />
        {advice.isError ? <Notice error>{errorMessage(advice.error, t)}</Notice> : null}
        {output ? (
          <>
            {typeof output.summary === "string" ? <Txt>{output.summary}</Txt> : null}
            {Array.isArray(output.insights)
              ? output.insights.map((row, index) =>
                  row && typeof row === "object" && "interpretation" in row && typeof row.interpretation === "string" ? (
                    <Txt key={index}>{row.interpretation}</Txt>
                  ) : null
                )
              : null}
            {strings(output.recommendations).map((text, index) => (
              <Txt key={index}>• {text}</Txt>
            ))}
            {strings(output.missingInformation).length ? (
              <>
                <Txt variant="label">{t("Information still needed", "معلومات ما زلنا بحاجة إليها")}</Txt>
                {strings(output.missingInformation).map((text, index) => (
                  <Txt muted key={index}>
                    • {text}
                  </Txt>
                ))}
              </>
            ) : null}
            {strings(output.assumptions).map((text, index) => (
              <Txt muted key={index}>
                {t("Assumption: ", "افتراض: ")}
                {text}
              </Txt>
            ))}
            <Txt variant="meta" muted>
              {t(
                "Advice uses saved business knowledge and available Instagram metrics. Review recommendations before acting.",
                "تستند النصائح إلى معلومات النشاط المحفوظة ومقاييس إنستغرام المتاحة. راجع التوصيات قبل تنفيذها."
              )}
            </Txt>
          </>
        ) : null}
      </Card>
      <Card>
        <Txt variant="heading">{t("Monthly report", "التقرير الشهري")}</Txt>
        <Field label={t("Month (YYYY-MM)", "الشهر (YYYY-MM)")} value={month} onChangeText={setMonth} maxLength={7} autoCapitalize="none" />
        <Button
          secondary
          icon={Download}
          busy={report.isPending}
          disabled={!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)}
          label={t("Download or share PDF", "تنزيل أو مشاركة PDF")}
          onPress={() => report.mutate()}
        />
        {report.isError ? <Notice error>{errorMessage(report.error, t)}</Notice> : null}
      </Card>
    </>
  );
}
