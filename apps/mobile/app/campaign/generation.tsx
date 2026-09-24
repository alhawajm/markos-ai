import React, { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MarkosApiError } from "@markos/api-client";
import { Check, Clock3, Sparkles } from "lucide-react-native";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Loading, Notice, Row, Screen, Txt } from "../../src/ui";
import { QueryFailure } from "../../src/content";
import { briefStore } from "../../src/campaigns/brief-store";
import { campaignStart } from "../../src/campaigns/brief-model";
import { errorMessage } from "../../src/errors";

export default function CampaignGeneration() {
  const focused = useIsFocused();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { api, scope, epoch, queryClient } = useAccount();
  const { t, colors } = useAppearance();
  const router = useRouter();
  const store = useMemo(() => briefStore(scope, epoch), [scope, epoch]);
  const [hasBrief, setHasBrief] = useState(false);
  const [localError, setLocalError] = useState("");
  const queryKey = [scope, "campaign-generation", requestId];
  const result = useQuery({
    enabled: focused,
    queryKey,
    queryFn: () => api.campaignGeneration(requestId),
    retry: false,
    refetchInterval: (query) => (["QUEUED", "RUNNING"].includes(query.state.data?.status ?? "") ? 2500 : false)
  });
  const job = result.data;
  const missing = result.error instanceof MarkosApiError && result.error.code === "CAMPAIGN_GENERATION_NOT_FOUND";
  useEffect(() => {
    void store
      .read()
      .then((value) => setHasBrief(value.requestId === requestId))
      .catch(() => {});
  }, [store, requestId]);
  useEffect(() => {
    if (job?.status === "COMPLETED") {
      void store.finishRequest(requestId, true).catch(() => {});
      void queryClient.invalidateQueries({ queryKey: [scope, "campaigns"] });
      void queryClient.invalidateQueries({ queryKey: [scope, "campaign-generations"] });
    }
  }, [job?.status, requestId, store]);
  const send = useMutation({
    mutationFn: async () => {
      const brief = await store.read();
      if (brief.requestId !== requestId || !brief.requestLocale) throw new Error("Brief unavailable");
      // Resume the exact persisted intent, even after a lost response or app kill.
      return api.queueCampaignGeneration(requestId, {
        objective: brief.objective.trim(),
        description: brief.description.trim() || undefined,
        referenceFiles: await store.upload(brief.files),
        durationDays: brief.durationDays,
        publishesPerDay: brief.publishesPerDay,
        startsAt: campaignStart(brief.startDate),
        locale: brief.requestLocale
      });
    },
    onSuccess: (value) => {
      queryClient.setQueryData(queryKey, value);
      void queryClient.invalidateQueries({ queryKey: [scope, "campaign-generations"] });
    }
  });
  async function editBrief() {
    try {
      await store.finishRequest(requestId, false);
      router.replace("/campaign/new");
    } catch (error) {
      setLocalError(errorMessage(error, t));
    }
  }
  return (
    <Screen footer={<Button secondary label={t("Back to campaigns", "العودة إلى الحملات")} onPress={() => router.replace("/(tabs)/campaigns")} />}>
      <Txt variant="title">
        {job?.status === "COMPLETED"
          ? t("Your campaign is ready to review", "حملتك جاهزة للمراجعة")
          : job?.status === "FAILED"
            ? t("Let’s try that again", "لنحاول مجددًا")
            : t("Drafting your campaign", "جارٍ إعداد حملتك")}
      </Txt>
      <Sparkles size={40} strokeWidth={1.5} color={colors.accent} />
      {job?.objective ? <Txt>{job.objective}</Txt> : null}
      {result.isPending ? <Loading /> : null}
      {missing ? (
        <Card tone="warning">
          <Txt>
            {t(
              "The server hasn’t confirmed this request yet. You can safely send the same brief again.",
              "لم يؤكّد الخادم استلام هذا الطلب بعد. يمكنك إعادة إرسال الملخص نفسه بأمان."
            )}
          </Txt>
          {hasBrief ? <Button label={t("Continue sending", "متابعة الإرسال")} busy={send.isPending} onPress={() => send.mutate()} /> : null}
        </Card>
      ) : result.isError ? (
        <QueryFailure
          error={result.error}
          retry={() => {
            void result.refetch();
          }}
        />
      ) : null}
      {job && ["QUEUED", "RUNNING"].includes(job.status) ? (
        <>
          <Txt muted>{t("MARKOS is bringing your business context and event references together.", "يجمع ماركوس سياق نشاطك التجاري ومراجع الفعالية.")}</Txt>
          <Card>
            <Row>
              <Check size={24} color={colors.accent} />
              <Txt>{t("Brief and references received", "تم استلام الملخص والمراجع")}</Txt>
            </Row>
            <Row>
              <Clock3 size={24} color={colors.accent} />
              <Txt>{job.status === "QUEUED" ? t("Waiting to start", "بانتظار البدء") : t("Drafting the campaign", "جارٍ إعداد الحملة")}</Txt>
            </Row>
          </Card>
          <Notice>
            {t(
              "You can leave this screen or lock your phone. Your campaign will be here when you return.",
              "يمكنك مغادرة هذه الشاشة أو قفل هاتفك. ستجد حملتك هنا عند عودتك."
            )}
          </Notice>
        </>
      ) : null}
      {job?.status === "COMPLETED" && job.campaignId ? (
        <Button label={t("Review campaign", "مراجعة الحملة")} onPress={() => router.replace({ pathname: "/campaign/[id]", params: { id: job.campaignId! } })} />
      ) : null}
      {job?.status === "FAILED" ? (
        <Card tone="warning">
          <Txt>
            {t(
              "Generation didn’t finish. Your saved campaigns are unchanged. Review your brief before trying again.",
              "لم يكتمل الإنشاء. لم تتغيّر حملاتك المحفوظة. راجع ملخصك قبل المحاولة مجددًا."
            )}
          </Txt>
          <Button
            label={hasBrief ? t("Review brief and retry", "مراجعة الملخص وإعادة المحاولة") : t("New campaign", "حملة جديدة")}
            onPress={() => {
              void editBrief();
            }}
          />
        </Card>
      ) : null}
      {send.isError ? (
        <>
          <Notice error>{errorMessage(send.error, t)}</Notice>
          {send.error instanceof MarkosApiError &&
          ["VALIDATION_ERROR", "CAMPAIGN_REFERENCE_INVALID", "CAMPAIGN_CONTEXT_MISSING"].includes(send.error.code ?? "") ? (
            <Button
              secondary
              label={t("Edit brief", "تعديل الملخص")}
              onPress={() => {
                void editBrief();
              }}
            />
          ) : null}
        </>
      ) : null}
      {localError ? <Notice error>{localError}</Notice> : null}
    </Screen>
  );
}
