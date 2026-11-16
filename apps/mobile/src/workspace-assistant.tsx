import { MarkosMark, TaskFeedback, Enter } from "./motion";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { View, RefreshControl, ScrollView, Pressable, type TextInput } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { Ellipsis } from "lucide-react-native";
import { newRequestId } from "./request-id";
import type { WorkspaceAssistantTurn } from "@markos/shared-types";
import { taskIntroductions, taskSuggestions, guidanceOutput, type TaskIntent } from "@markos/shared-types";
import { useAccount, useAppearance } from "./providers";
import { sessionController } from "./auth/transport";
import { BusinessDeviceStore } from "./business/device-store";
import { Button, Card, Disclosure, Loading, Notice, Screen, Txt, TextAction, Row, IconButton } from "./ui";
import { ChatComposer } from "./chat-composer";
import { ContentReportSheet } from "./content-report";
import { errorMessage } from "./errors";
import { PersonalMemorySheet } from "./personal-memory";

type Request = { requestId: string; message: string; locale: "en" | "ar"; intent?: TaskIntent };
export function WorkspaceAssistantScreen(props: { intent?: TaskIntent; embedded?: boolean }) {
  const { scope } = useAccount();
  return <WorkspaceConversation key={`${scope}:${props.intent ?? "GENERAL"}`} {...props} />;
}
function WorkspaceConversation({ intent = "GENERAL", embedded = false }: { intent?: TaskIntent; embedded?: boolean }) {
  const focused = useIsFocused();
  const { api, scope, epoch, queryClient, session } = useAccount(),
    { t, locale, colors } = useAppearance(),
    router = useRouter();
  const kind = { GENERAL: "assistant", CONTENT: "assistant-content", CAMPAIGN: "assistant-campaign", STRATEGY: "assistant-strategy" } as const;
  const store = useMemo(() => new BusinessDeviceStore<{ message: string; pending: Request | null }>(scope, epoch, kind[intent]), [scope, epoch, intent]);
  const key = intent === "GENERAL" ? [scope, "workspace-assistant"] : [scope, "workspace-assistant", intent];
  const intro = taskIntroductions[intent],
    language = locale === "ar" ? 1 : 0;
  const scrollRef = useRef<ScrollView>(null),
    following = useRef(true);
  const inputRef = useRef<TextInput>(null);
  const [report, setReport] = useState<string | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [earlier, setEarlier] = useState(false);
  const result = useQuery({
    queryKey: key,
    queryFn: () => api.workspaceAssistant(intent === "GENERAL" ? undefined : intent),
    refetchInterval: 2500,
    enabled: focused
  });
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
    const request = pending ?? { requestId: newRequestId(), message: message.trim(), locale, ...(intent === "GENERAL" ? {} : { intent }) };
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
      <AssistantFrame embedded={embedded}>
        <Txt variant="title">{t("Your workspace", "مساحة عملك")}</Txt>
        <Txt muted>{t("Review your team’s campaigns and results.", "راجع حملات فريقك ونتائجها.")}</Txt>
        <TextAction label={t("Open campaigns", "فتح الحملات")} onPress={() => router.push("/(tabs)/campaigns")} />
        <TextAction label={t("Open insights", "فتح الإحصاءات")} onPress={() => router.push("/(tabs)/insights")} />
        <TextAction label={t("What MARKOS remembers", "ما يتذكره ماركوس")} onPress={() => setMemoryOpen(true)} />
        {memoryOpen ? <PersonalMemorySheet key={scope} onClose={() => setMemoryOpen(false)} /> : null}
      </AssistantFrame>
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
    <AssistantFrame
      embedded={embedded}
      scrollRef={scrollRef}
      scrollProps={{
        onLayout: () => {
          if (following.current) scrollRef.current?.scrollToEnd({ animated: false });
        },
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
          <ChatComposer
            inputRef={inputRef}
            value={message}
            onChange={edit}
            onSend={() => void send()}
            editable={restored && !pending}
            busy={busy}
            retry={!!pending}
            disabled={!restored || active || !(pending?.message ?? message).trim()}
          />
          {!result.data?.length && !result.isPending ? (
            <Txt variant="meta" muted style={{ textAlign: "center" }}>
              {t("You approve before publishing.", "توافق قبل النشر.")}
            </Txt>
          ) : null}
        </>
      }
      refreshControl={<RefreshControl refreshing={result.isRefetching} onRefresh={() => void result.refetch()} tintColor={colors.accentText} />}
    >
      {result.data?.length === 0 ? (
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 16 }}>
          <View style={{ padding: 8 }}>
            <MarkosMark size={32} color={colors.accentText} />
          </View>
          <Txt variant="title" style={{ textAlign: "center", fontSize: 24 }}>
            {intro.title[language]}
          </Txt>
          <Txt muted style={{ textAlign: "center" }}>
            {intro.detail[language]}
          </Txt>
          {intent === "GENERAL" ? <TextAction label={t("What MARKOS remembers", "ما يتذكره ماركوس")} onPress={() => setMemoryOpen(true)} /> : null}
        </View>
      ) : intent === "GENERAL" ? (
        <TextAction label={t("Memory", "الذاكرة")} accessibilityLabel={t("What MARKOS remembers", "ما يتذكره ماركوس")} onPress={() => setMemoryOpen(true)} />
      ) : null}
      {!result.data?.length && !result.isPending ? (
        <View style={{ flexDirection: locale === "ar" ? "row-reverse" : "row", flexWrap: "wrap", gap: 8 }}>
          {taskSuggestions[intent]
            .map((entry) => ({ label: entry[language], message: entry[language + 2]! }))
            .map((s) => (
              <Pressable
                key={s.label}
                accessibilityRole="button"
                accessibilityLabel={s.label}
                disabled={!restored || busy}
                onPress={() => {
                  edit(s.message);
                  inputRef.current?.focus();
                }}
                style={({ pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.accentSoft : colors.surface,
                  justifyContent: "center",
                  opacity: !restored || busy ? 0.5 : 1
                })}
              >
                <Txt style={{ fontSize: 15 }}>{s.label}</Txt>
              </Pressable>
            ))}
        </View>
      ) : null}
      {result.isPending ? <Loading /> : null}
      {intent !== "GENERAL" && !earlier && (result.data?.length ?? 0) > 4 ? (
        <TextAction label={t("Earlier work", "الأعمال السابقة")} onPress={() => setEarlier(true)} />
      ) : null}
      {(intent === "GENERAL" || earlier ? result.data : result.data?.slice(-4))?.map((turn) => (
        <Enter key={turn.id}>
          <View style={{ gap: 10 }}>
            <View style={{ alignSelf: "flex-end", maxWidth: "88%", padding: 14, borderRadius: 18, backgroundColor: colors.accentSoft }}>
              <Txt selectable>{turn.message}</Txt>
            </View>
            <View style={{ gap: 8 }}>
              <Row>
                <MarkosMark size={18} color={colors.accentText} />
                <Txt variant="meta" muted style={{ flex: 1 }}>
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
                    {turn.id === result.data?.at(-1)?.id ? (
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
                  label={
                    turn.campaign || turn.proposal?.action === "CAMPAIGN"
                      ? t("Planning your campaign", "أُعدّ حملتك")
                      : turn.proposal?.action === "STRATEGY"
                        ? t("Shaping your strategy", "أصوغ استراتيجيتك")
                        : t("Preparing your draft", "أُعدّ مسودتك")
                  }
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
                <>
                  <GuidanceResult value={turn.strategy} />
                  <TextAction label={t("Plan a campaign", "تخطيط حملة")} onPress={() => router.push("/(tabs)/campaigns")} />
                </>
              ) : null}
            </View>
          </View>
        </Enter>
      ))}
      {error || result.isError ? <Notice error>{error || errorMessage(result.error, t)}</Notice> : null}
      {report ? <ContentReportSheet source="ASSISTANT_MESSAGE" sourceId={report} visible onClose={() => setReport(null)} /> : null}
      {memoryOpen ? <PersonalMemorySheet key={scope} onClose={() => setMemoryOpen(false)} /> : null}
    </AssistantFrame>
  );
}
function AssistantFrame({ embedded, ...props }: React.ComponentProps<typeof Screen> & { embedded: boolean }) {
  return embedded ? (
    <View style={{ gap: 16 }}>
      {props.children}
      {props.footer}
    </View>
  ) : (
    <Screen {...props} layout="chat" />
  );
}
export function GuidanceResult({ value }: { value: Record<string, unknown> }) {
  const { t, locale } = useAppearance(),
    result = guidanceOutput(value);
  return (
    <Card>
      {result.summary ? <Txt selectable>{result.summary}</Txt> : null}
      {result.sections.map((section) => (
        <Disclosure
          key={section.key}
          title={section.title[locale === "ar" ? 1 : 0]}
          defaultOpen={section.key === "nextActions" || section.key === "recommendations"}
        >
          {section.items.map((text, i) => (
            <Txt selectable key={i}>
              • {text}
            </Txt>
          ))}
        </Disclosure>
      ))}
      {result.missingInformation.length || result.assumptions.length ? (
        <Disclosure title={t("What still needs confirming", "ما زال بحاجة إلى تأكيد")}>
          {[...result.missingInformation, ...result.assumptions].map((text, i) => (
            <Txt muted key={i}>
              {text}
            </Txt>
          ))}
        </Disclosure>
      ) : null}
    </Card>
  );
}
