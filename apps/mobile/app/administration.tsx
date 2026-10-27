import React, { useState } from "react";
import { Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAccount, useAppearance } from "../src/providers";
import { Button, Card, Field, Loading, Notice, Screen, Txt } from "../src/ui";
import { QueryFailure } from "../src/content";
import { errorMessage } from "../src/errors";

export default function Administration() {
  const { session } = useAccount();
  const { t } = useAppearance();
  const allowed = session.roles.some((role) => ["SUPER_ADMIN", "PRODUCT_ADMIN", "SUPPORT_ADMIN", "FINANCE_ADMIN", "READONLY_ADMIN"].includes(role));
  return allowed ? (
    <Operations />
  ) : (
    <Screen>
      <Notice error>{t("Platform administrator access is required.", "يلزم وصول مسؤول المنصة.")}</Notice>
    </Screen>
  );
}
function Operations() {
  const { api, scope, session, queryClient } = useAccount();
  const { t } = useAppearance();
  const manage = session.roles.some((r) => r === "SUPER_ADMIN" || r === "PRODUCT_ADMIN");
  const status = useQuery({ queryKey: [scope, "delivery-operations"], queryFn: () => api.deliveryOperations() });
  const models = useQuery({ queryKey: [scope, "admin-models"], queryFn: () => api.adminModelConfiguration() });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const retry = useMutation({
    mutationFn: (input: { kind: "REPORT" | "PUSH" | "ERASURE"; id: string }) => api.retryDelivery(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [scope, "delivery-operations"] })
  });
  const save = useMutation({
    mutationFn: (key: "LLM_PRIMARY_MODEL" | "LLM_LONGFORM_MODEL" | "IMAGE_MODEL_PRIMARY" | "IMAGE_MODEL_FALLBACK") =>
      api.updateAdminModelSetting(key, { value: edits[key]!.trim() }),
    onSuccess: (value) => {
      queryClient.setQueryData([scope, "admin-models"], value);
      setEdits({});
    }
  });
  return (
    <Screen>
      <Txt variant="title">{t("Platform operations", "عمليات المنصة")}</Txt>
      <Txt muted>
        {t(
          "These controls affect MARKOS across workspaces. Changes are recorded in the audit history.",
          "تؤثر هذه الأدوات على ماركوس عبر المساحات. تُسجَّل التغييرات في سجل التدقيق."
        )}
      </Txt>
      <Txt variant="heading">{t("Delivery and data cleanup", "الإرسال وتنظيف البيانات")}</Txt>
      {status.isPending ? (
        <Loading />
      ) : status.isError ? (
        <QueryFailure error={status.error} retry={() => void status.refetch()} />
      ) : !status.data.failures.length ? (
        <Notice>{t("No failed delivery or deletion jobs.", "لا توجد مهام إرسال أو حذف فاشلة.")}</Notice>
      ) : (
        status.data.failures.map((job) => (
          <Card key={job.id}>
            <Txt variant="label">
              {job.kind === "REPORT"
                ? t("Report email", "بريد التقرير")
                : job.kind === "PUSH"
                  ? t("Phone alert", "إشعار الهاتف")
                  : t("Account cleanup", "تنظيف بيانات الحساب")}
            </Txt>
            <Txt muted>{job.failureCode}</Txt>
            <Txt variant="meta">{job.workspaceId}</Txt>
            {job.status === "UNKNOWN" ? (
              <Txt>
                {t("Result unconfirmed. Investigate before retrying to avoid duplicates.", "النتيجة غير مؤكدة. تحقّق قبل إعادة المحاولة لتجنب التكرار.")}
              </Txt>
            ) : manage ? (
              <Button
                secondary
                busy={retry.isPending}
                label={t("Retry confirmed failure", "إعادة محاولة الفشل المؤكد")}
                onPress={() =>
                  Alert.alert(
                    t("Retry this job?", "إعادة محاولة هذه المهمة؟"),
                    t("The worker will recheck access and preferences before delivery.", "ستُراجع الصلاحيات والتفضيلات قبل الإرسال."),
                    [
                      { text: t("Cancel", "إلغاء"), style: "cancel" },
                      { text: t("Retry", "إعادة المحاولة"), onPress: () => retry.mutate({ kind: job.kind, id: job.id }) }
                    ]
                  )
                }
              />
            ) : null}
          </Card>
        ))
      )}
      <Button secondary label={t("Refresh operations", "تحديث العمليات")} onPress={() => void status.refetch()} />
      <Txt variant="heading">{t("AI model configuration", "إعدادات نماذج الذكاء الاصطناعي")}</Txt>
      {models.isPending ? (
        <Loading />
      ) : models.isError ? (
        <QueryFailure error={models.error} retry={() => void models.refetch()} />
      ) : (
        models.data.models.map((model) => (
          <Card key={model.key}>
            <Field
              label={model.key}
              value={edits[model.key] ?? model.value ?? ""}
              editable={manage && !save.isPending}
              autoCapitalize="none"
              onChangeText={(value) => setEdits((previous) => ({ ...previous, [model.key]: value }))}
            />
            {manage ? (
              <Button
                secondary
                label={t("Save model for all workspaces", "حفظ النموذج لجميع المساحات")}
                disabled={!edits[model.key]?.trim() || edits[model.key] === model.value}
                busy={save.isPending}
                onPress={() =>
                  Alert.alert(
                    t("Change this model?", "تغيير هذا النموذج؟"),
                    t(
                      "New requests across MARKOS will use this provider model. Check that provider access is ready.",
                      "ستستخدم طلبات ماركوس الجديدة هذا النموذج. تحقّق من جاهزية الوصول لدى المزود."
                    ),
                    [
                      { text: t("Cancel", "إلغاء"), style: "cancel" },
                      { text: t("Save", "حفظ"), onPress: () => save.mutate(model.key as Parameters<typeof api.updateAdminModelSetting>[0]) }
                    ]
                  )
                }
              />
            ) : null}
          </Card>
        ))
      )}
      {save.isError || retry.isError ? <Notice error>{errorMessage(save.error ?? retry.error, t)}</Notice> : null}
    </Screen>
  );
}
