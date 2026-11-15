import { MarkosMark, TaskFeedback, Enter } from "../../src/motion";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { View, RefreshControl, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Send, Ellipsis } from "lucide-react-native";
import { newRequestId } from "../../src/request-id";
import type { WorkspaceAssistantTurn } from "@markos/shared-types";
import { useAccount, useAppearance } from "../../src/providers";
import { sessionController } from "../../src/auth/transport";
import { BusinessDeviceStore } from "../../src/business/device-store";
import { Button, Card, Field, Loading, Notice, Screen, Txt, TextAction, Row, IconButton } from "../../src/ui";
import { ContentReportSheet } from "../../src/content-report";
import { errorMessage } from "../../src/errors";
import { PersonalMemorySheet } from "../../src/personal-memory";

type Request = { requestId: string; message: string; locale: "en" | "ar" };
export default function Home() {
  const { api, scope, epoch, queryClient, session } = useAccount(),
    { t, locale, colors } = useAppearance(),
    router = useRouter();
  const store = useMemo(() => new BusinessDeviceStore<{ message: string; pending: Request | null }>(scope, epoch, "assistant"), [scope, epoch]);
  const key = [scope, "workspace-assistant"];
  const scrollRef = useRef<ScrollView>(null),
    following = useRef(true);
  const [report, setReport] = useState<string | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const result = useQuery({ queryKey: key, queryFn: () => api.workspaceAssistant(), refetchInterval: 2500 });
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState<Request | null>(null),
    [restored, setRestored] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setRestored(false);
    setMessage("");
    setPending(null);
    setError("");
    setBusy(false);
    void store
      .read()
      .then((v) => {
        if (live) {
          setMessage(v?.message ?? "");
          setPending(v?.pending ?? null);
          setRestored(true);
        }
      })
      .catch(() => {
        if (live) setError(t("Couldn’t restore your saved message. Reopen this screen to retry.", "تعذّر استعادة رسالتك المحفوظة. أعد فتح الشاشة للمحاولة."));
      });
    return () => {
      live = false;
    };
  }, [store]);
  useEffect(() => {
    if (pending && result.data?.some((v) => v.id === pending.requestId)) {
      setPending(null);
      setMessage("");
      void store.clear();
    }
  }, [result.data, pending, store]);
  const active = result.data?.some((v) => v.status === "THINKING" || (v.status === "EXECUTING" && !v.campaign));
  const accept = (saved: WorkspaceAssistantTurn) =>
    queryClient.setQueryData<WorkspaceAssistantTurn[]>(key, (items) =>
      items?.some((i) => i.id === saved.id) ? items.map((i) => (i.id === saved.id ? saved : i)) : [...(items ?? []), saved]
    );
  async function send() {
    following.current = true;
    if (busy || active || !restored) return;
    const request = pending ?? { requestId: newRequestId(), message: message.trim(), locale };
    if (!request.message) return;
    setBusy(true);
    setError("");
    try {
      await store.save({ message: request.message, pending: request });
      sessionController.assertEpoch(epoch);
      setPending(request);
      const saved = await api.messageWorkspaceAssistant(request);
      sessionController.assertEpoch(epoch);
      accept(saved);
      await store.clear();
      setPending(null);
      setMessage("");
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function confirm(turn: WorkspaceAssistantTurn) {
    if (!turn.confirmationToken) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api.confirmWorkspaceAssistant(turn.id, turn.confirmationToken);
      sessionController.assertEpoch(epoch);
      accept(saved);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  function edit(text: string) {
    setMessage(text);
    void store
      .save({ message: text, pending: null })
      .catch(() => setError(t("Couldn’t save this message. Keep the app open.", "تعذّر حفظ الرسالة. أبقِ التطبيق مفتوحًا.")));
  }
  if (!session.roles.some((role) => ["OWNER", "WORKSPACE_ADMIN", "EDITOR", "SUPER_ADMIN", "PRODUCT_ADMIN"].includes(role)))
    return (
      <Screen>
        <Txt variant="title">{t("Your workspace", "مساحة عملك")}</Txt>
        <Txt muted>{t("Review your team’s campaigns and results.", "راجع حملات فريقك ونتائجها.")}</Txt>
        <TextAction label={t("Open campaigns", "فتح الحملات")} onPress={() => router.push("/(tabs)/campaigns")} />
        <TextAction label={t("Open insights", "فتح الإحصاءات")} onPress={() => router.push("/(tabs)/insights")} />
        <TextAction label={t("What MARKOS remembers", "ما يتذكره ماركوس")} onPress={() => setMemoryOpen(true)} />
        {memoryOpen ? <PersonalMemorySheet key={scope} onClose={() => setMemoryOpen(false)} /> : null}
      </Screen>
    );
  async function resumeCampaign(turn: WorkspaceAssistantTurn) {
    if (!turn.campaign?.canResume) return;
    setBusy(true);
    setError("");
    try {
      await api.resumeCampaignGeneration(turn.campaign.requestId);
      sessionController.assertEpoch(epoch);
      await result.refetch();
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      scrollRef={scrollRef}
      scrollProps={{
        onScroll: (e) => {
          const v = e.nativeEvent;
          following.current = v.contentOffset.y + v.layoutMeasurement.height >= v.contentSize.height - 100;
        },
        onContentSizeChange: () => {
          if (following.current) scrollRef.current?.scrollToEnd({ animated: true });
        }
      }}
      footer={
        <>
          {" "}
          <Card>
            <Field
              label={t("Message MARKOS", "راسل ماركوس")}
              value={message}
              onChangeText={edit}
              editable={restored && !pending}
              multiline
              maxLength={4000}
              placeholder={t("An idea, an event, or something to change…", "فكرة أو فعالية أو شيء تريد تغييره…")}
            />
            <Button
              icon={Send}
              label={pending ? t("Retry saved message", "إعادة إرسال الرسالة المحفوظة") : t("Send", "إرسال")}
              busy={busy}
              disabled={!restored || active || !(pending?.message ?? message).trim()}
              onPress={() => void send()}
            />
          </Card>
          <Txt variant="meta" muted style={{ textAlign: "center" }}>
            {t("You review everything before it’s published.", "تراجع كل شيء قبل نشره.")}
          </Txt>
        </>
      }
      refreshControl={<RefreshControl refreshing={result.isRefetching} onRefresh={() => void result.refetch()} tintColor={colors.accentText} />}
    >
      <View style={{ alignItems: "center", gap: 12, paddingVertical: 20 }}>
        <View style={{ padding: 8 }}>
          <MarkosMark size={44} color={colors.accentText} />
        </View>
        <Txt variant="title" style={{ textAlign: "center" }}>
          {t("What shall we create?", "ماذا سنُبدع اليوم؟")}
        </Txt>
        <Txt muted style={{ textAlign: "center" }}>
          {t("Tell me your idea. We’ll make it happen together.", "أخبرني بفكرتك. سنُبدعها معًا.")}
        </Txt>
        <TextAction label={t("What MARKOS remembers", "ما يتذكره ماركوس")} onPress={() => setMemoryOpen(true)} />
      </View>
      {!result.data?.length && !result.isPending ? (
        <View style={{ gap: 8 }}>
          {[
            {
              label: t("Build a strategy", "بناء استراتيجية"),
              message: t("Create an Instagram marketing strategy for my business.", "أنشئ استراتيجية تسويق على إنستغرام لنشاطي.")
            },
            { label: t("Create content", "إنشاء محتوى"), message: t("Help me create an Instagram post.", "ساعدني في إنشاء منشور لإنستغرام.") },
            {
              label: t("Plan a campaign", "تخطيط حملة"),
              message: t("Help me plan a campaign for an upcoming event or offer.", "ساعدني في تخطيط حملة لفعالية أو عرض قادم.")
            }
          ].map((s) => (
            <Button secondary key={s.label} label={s.label} disabled={!restored || busy} onPress={() => edit(s.message)} />
          ))}
        </View>
      ) : null}
      {result.isPending ? <Loading /> : null}
      {result.data?.map((turn, index) => (
        <Enter key={turn.id}>
          <View style={{ gap: 16, marginVertical: 8 }}>
            <Card tone="tint" style={{ alignSelf: "flex-end", maxWidth: "92%" }}>
              <Txt selectable>{turn.message}</Txt>
            </Card>
            <View style={{ gap: 12 }}>
              <Row>
                <MarkosMark size={22} color={colors.accentText} />
                <Txt variant="label" muted style={{ flex: 1 }}>
                  MARKOS
                </Txt>
                {turn.reply ? <IconButton icon={Ellipsis} label={t("Report reply", "الإبلاغ عن الرد")} onPress={() => setReport(turn.id)} /> : null}
              </Row>
              {turn.reply ? (
                <Enter>
                  <Txt selectable>{turn.reply}</Txt>
                </Enter>
              ) : null}
              {turn.status === "THINKING" ? <TaskFeedback label={t("Thinking through your request", "أفكّر في طلبك")} startedAt={turn.createdAt} /> : null}
              {turn.status === "PROPOSED" && turn.proposal ? (
                <Enter>
                  <Card>
                    <Txt variant="label">{t("Here’s the plan", "إليك الخطة")}</Txt>
                    <Txt>{turn.proposal.summary}</Txt>
                    {index === result.data.length - 1 ? (
                      <>
                        <Button label={t("Confirm and start", "تأكيد وبدء")} busy={busy} disabled={active} onPress={() => void confirm(turn)} />
                        <Txt variant="meta" muted>
                          {t("Want to change something? Tell me below.", "تريد تغيير شيء؟ أخبرني أدناه.")}
                        </Txt>
                      </>
                    ) : null}
                  </Card>
                </Enter>
              ) : null}
              {turn.status === "EXECUTING" ? (
                <TaskFeedback
                  label={turn.campaign ? t("Planning your campaign", "أُعدّ حملتك") : t("Starting your plan", "أبدأ تنفيذ خطتك")}
                  progress={turn.campaign?.progress}
                  startedAt={turn.campaign?.createdAt}
                />
              ) : null}
              {turn.contentItemId ? (
                <TextAction
                  label={t("Open draft", "فتح المسودة")}
                  onPress={() => router.push({ pathname: "/content/[id]", params: { id: turn.contentItemId! } })}
                />
              ) : null}
              {turn.campaignId ? (
                <TextAction
                  label={t("Open campaign", "فتح الحملة")}
                  onPress={() => router.push({ pathname: "/campaign/[id]", params: { id: turn.campaignId! } })}
                />
              ) : null}
              {turn.campaign?.status === "FAILED" ? (
                <Card tone="warning">
                  <Txt>
                    {turn.campaign.progress
                      ? t(
                          `${turn.campaign.progress.completedWeeks} of ${turn.campaign.progress.totalWeeks} weeks saved. The campaign is not complete yet.`,
                          `تم حفظ ${turn.campaign.progress.completedWeeks} من ${turn.campaign.progress.totalWeeks} أسابيع. الحملة لم تكتمل بعد.`
                        )
                      : t("The campaign has not finished yet.", "لم يكتمل إعداد الحملة بعد.")}
                  </Txt>
                  {turn.campaign.canResume ? (
                    <Button label={t("Retry remaining work", "إعادة محاولة العمل المتبقي")} busy={busy} onPress={() => void resumeCampaign(turn)} />
                  ) : null}
                </Card>
              ) : null}
              {turn.strategy ? (
                <Card>
                  {strategyLines(turn.strategy).map((line, i) => (
                    <Txt selectable key={i}>
                      {line}
                    </Txt>
                  ))}
                </Card>
              ) : null}
            </View>
          </View>
        </Enter>
      ))}
      {error || result.isError ? <Notice error>{error || errorMessage(result.error, t)}</Notice> : null}
      {report ? <ContentReportSheet source="ASSISTANT_MESSAGE" sourceId={report} visible onClose={() => setReport(null)} /> : null}
      {memoryOpen ? <PersonalMemorySheet key={scope} onClose={() => setMemoryOpen(false)} /> : null}
    </Screen>
  );
}
function strategyLines(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strategyLines);
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, v]) => (typeof v === "string" ? [`${key.replace(/_/g, " ")}: ${v}`] : strategyLines(v)));
  return [];
}
