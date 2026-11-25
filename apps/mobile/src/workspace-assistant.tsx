import { MarkosMark, TaskFeedback, Enter } from "./motion";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { Image, Keyboard, View, RefreshControl, ScrollView, Pressable, type TextInput } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { CalendarDays, Ellipsis, LayoutTemplate, Pencil, X } from "lucide-react-native";
import { newRequestId } from "./request-id";
import type { WorkspaceAssistantTurn, WorkspaceChatSelection } from "@markos/shared-types";
import { taskIntroductions, taskSuggestions, guidanceOutput, postTemplates, type TaskIntent } from "@markos/shared-types";
import { useAccount, useAppearance } from "./providers";
import { sessionController } from "./auth/transport";
import { BusinessDeviceStore } from "./business/device-store";
import { Button, Card, Disclosure, Loading, Notice, Screen, Txt, TextAction, Row, IconButton } from "./ui";
import { ChatComposer } from "./chat-composer";
import { ContentReportSheet } from "./content-report";
import { errorMessage } from "./errors";
import { PersonalMemorySheet } from "./personal-memory";
import { HomeChats } from "./home-chats";
import { AssistantArtifact } from "./assistant-artifact";
import { ChatPostDesign } from "./post-design/card";
import { TemplateChoices } from "./post-design/choices";
import { pickPostPhoto, postDesignFile, removePostFile } from "./post-design/files";
import { newPostDesign, requestsPostDesign, wantsPostIdeas, type PostDesignState } from "./post-design/model";
import { PostMascot, PostText, usePostFlowTheme, WelcomeGlow } from "./post-design/theme";

type Request = { requestId: string; message: string; locale: "en" | "ar"; intent?: TaskIntent; chatId?: string; postDesign?: true; photo?: string };
type SavedChatInput = { message: string; pending: Request | null; photo?: string; designing?: boolean };
export function WorkspaceAssistantScreen(props: { intent?: TaskIntent; embedded?: boolean }) {
  const { scope } = useAccount();
  if ((!props.intent || props.intent === "GENERAL") && !props.embedded)
    return <HomeChats key={scope}>{(chat, onSent) => <WorkspaceConversation key={`${scope}:${chat.id}`} {...props} chat={chat} onSent={onSent} />}</HomeChats>;
  return <WorkspaceConversation key={`${scope}:${props.intent ?? "GENERAL"}`} {...props} />;
}
function WorkspaceConversation({
  intent = "GENERAL",
  embedded = false,
  chat,
  onSent
}: {
  intent?: TaskIntent;
  embedded?: boolean;
  chat?: WorkspaceChatSelection;
  onSent?: (id: string) => void;
}) {
  const focused = useIsFocused();
  const { api, scope, epoch, queryClient, session } = useAccount(),
    { t, locale, colors } = useAppearance(),
    router = useRouter();
  const chatTheme = usePostFlowTheme();
  const isHome = !!chat && intent === "GENERAL";
  const kind = { GENERAL: "assistant", CONTENT: "assistant-content", CAMPAIGN: "assistant-campaign", STRATEGY: "assistant-strategy" } as const;
  const store = useMemo(() => new BusinessDeviceStore<SavedChatInput>(scope, epoch, kind[intent], chat?.id), [scope, epoch, intent, chat?.id]);
  const key = chat ? [scope, "workspace-assistant", chat.id] : intent === "GENERAL" ? [scope, "workspace-assistant"] : [scope, "workspace-assistant", intent];
  const intro = taskIntroductions[intent],
    language = locale === "ar" ? 1 : 0;
  const scrollRef = useRef<ScrollView>(null),
    following = useRef(true);
  const inputRef = useRef<TextInput>(null);
  const [report, setReport] = useState<string | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [earlier, setEarlier] = useState(false);
  const [older, setOlder] = useState<WorkspaceAssistantTurn[]>([]),
    [before, setBefore] = useState<string | null>(null),
    [loadingOlder, setLoadingOlder] = useState(false);
  const loadedOlder = useRef(false);
  const result = useQuery({
    queryKey: key,
    queryFn: () =>
      chat
        ? api.assistantChatMessages(chat.id).then((page) => {
            if (!loadedOlder.current) setBefore(page.nextBefore);
            return page.turns;
          })
        : api.workspaceAssistant(intent === "GENERAL" ? undefined : intent),
    initialData: chat?.isNew ? [] : undefined,
    refetchInterval: 2500,
    enabled: focused && !chat?.isNew
  });
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState<Request | null>(null),
    [restored, setRestored] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [photo, setPhoto] = useState<string>();
  const [designing, setDesigning] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const sending = useRef(false);
  useEffect(() => {
    let live = true;
    setRestored(false);
    setMessage("");
    setPending(null);
    setError("");
    setBusy(false);
    void store
      .read()
      .then(async (v) => {
        if (!v && chat?.legacy) {
          const legacy = new BusinessDeviceStore<SavedChatInput>(scope, epoch, kind[intent]);
          v = await legacy.read();
          if (v) {
            await store.save(v);
            await legacy.clear();
          }
        }
        if (live) {
          setMessage(v?.message ?? "");
          setPending(v?.pending ?? null);
          setPhoto(v?.photo);
          setDesigning(v?.designing === true);
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
    if (pending && !pending.postDesign && result.data?.some((v) => v.id === pending.requestId)) {
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
    if (sending.current || busy || active || !restored || pickingPhoto) return;
    const text = message.trim();
    const useDesign = isHome && (designing || !!photo || (requestsPostDesign(text) && !wantsPostIdeas(text)));
    const request = pending ?? {
      requestId: newRequestId(),
      message: text || (useDesign && photo ? t("Design a post with this photo", "صمّم منشوراً بهذه الصورة") : ""),
      locale,
      ...(intent === "GENERAL" ? {} : { intent }),
      ...(chat ? { chatId: chat.id } : {}),
      ...(useDesign ? { postDesign: true as const, ...(photo ? { photo } : {}) } : {})
    };
    if (!request.message) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await store.save({ message: request.message, pending: request, designing, ...(photo ? { photo } : {}) });
      sessionController.assertEpoch(epoch);
      setPending(request);
      const { postDesign, photo: attachment, ...wire } = request;
      let saved: WorkspaceAssistantTurn;
      if (postDesign && wire.chatId) {
        const postStore = new BusinessDeviceStore<PostDesignState>(scope, epoch, "post-design", wire.requestId);
        if (!(await postStore.read())) {
          await postStore.save(newPostDesign({ ideas: wantsPostIdeas(wire.message), ...(attachment ? { photo: attachment } : {}) }));
        }
        saved = await api.beginPostDesign({ requestId: wire.requestId, chatId: wire.chatId, message: wire.message, locale: wire.locale });
        Keyboard.dismiss();
      } else {
        saved = await api.messageWorkspaceAssistant(wire);
      }
      sessionController.assertEpoch(epoch);
      accept(saved);
      if (chat) onSent?.(chat.id);
      await store.clear();
      setPending(null);
      setMessage("");
      setPhoto(undefined);
      setDesigning(false);
      setShowIdeas(false);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      sending.current = false;
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
  function saveInput(text: string, attachment: string | undefined, postMode: boolean) {
    setMessage(text);
    setPhoto(attachment);
    setDesigning(postMode);
    void store
      .save({ message: text, pending: null, designing: postMode, ...(attachment ? { photo: attachment } : {}) })
      .catch(() => setError(t("Couldn’t save this message. Keep the app open.", "تعذّر حفظ الرسالة. أبقِ التطبيق مفتوحًا.")));
  }
  const edit = (text: string) => saveInput(text, photo, designing);
  async function attachPhoto() {
    if (pickingPhoto || pending || busy) return;
    setPickingPhoto(true);
    try {
      const replacement = await pickPostPhoto(scope, epoch);
      if (!replacement) return;
      removePostFile(scope, photo);
      saveInput(message, replacement, true);
    } catch (problem) {
      setError(errorMessage(problem, t));
    } finally {
      setPickingPhoto(false);
    }
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
  const welcome = isHome && result.data?.length === 0;
  const homePrompts = [
    {
      label: t("Design a post", "صمّم منشوراً"),
      icon: Pencil,
      choose: () => {
        setShowIdeas(false);
        saveInput(message, photo, true);
        inputRef.current?.focus();
      }
    },
    {
      label: t("Plan my week", "خطّط لأسبوعي"),
      icon: CalendarDays,
      choose: () => {
        setShowIdeas(false);
        saveInput(t("Help me plan this week for my Instagram.", "ساعدني في التخطيط لهذا الأسبوع على إنستغرام."), undefined, false);
        inputRef.current?.focus();
      }
    },
    {
      label: t("Post ideas", "أفكار لمنشورات"),
      icon: LayoutTemplate,
      choose: () => {
        setShowIdeas((open) => !open);
      }
    }
  ];
  return (
    <AssistantFrame
      embedded={embedded}
      {...(isHome ? { centerContent: welcome, backgroundColor: chatTheme.canvas, ...(welcome ? { backdrop: <WelcomeGlow /> } : {}) } : {})}
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
          {welcome && !photo ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 6, flexDirection: locale === "ar" ? "row-reverse" : "row" }}
            >
              {homePrompts.map(({ label, icon: Icon, choose }, index) => (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: (designing && index === 0) || (showIdeas && index === 2) }}
                  disabled={!restored || busy || !!pending || (designing && index !== 0)}
                  onPress={choose}
                  style={{
                    paddingHorizontal: 10,
                    minHeight: 40,
                    borderRadius: 16,
                    gap: 5,
                    alignItems: "center",
                    flexDirection: locale === "ar" ? "row-reverse" : "row",
                    backgroundColor: (designing && index === 0) || (showIdeas && index === 2) ? chatTheme.action : chatTheme.canvas,
                    opacity: designing && index !== 0 ? 0.45 : 1
                  }}
                >
                  <Icon size={15} color={chatTheme.ink} />
                  <PostText variant="meta">{label}</PostText>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {isHome && photo ? (
            <View
              style={{
                alignSelf: locale === "ar" ? "flex-end" : "flex-start",
                position: "relative",
                padding: 4,
                borderRadius: 12,
                backgroundColor: chatTheme.canvas
              }}
            >
              <Image
                accessibilityLabel={t("Attached photo", "الصورة المرفقة")}
                source={{ uri: postDesignFile(scope, photo).uri }}
                style={{ width: 82, height: 82, borderRadius: 10 }}
              />
              {!pending ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("Remove attachment", "إزالة المرفق")}
                  onPress={() => {
                    removePostFile(scope, photo);
                    saveInput(message, undefined, designing);
                  }}
                  style={{ position: "absolute", top: 4, right: 4, width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
                >
                  <View style={{ backgroundColor: chatTheme.canvas, borderRadius: 12, padding: 3 }}>
                    <X size={15} color={chatTheme.ink} />
                  </View>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <ChatComposer
            inputRef={inputRef}
            value={message}
            onChange={edit}
            onSend={() => void send()}
            editable={restored && !pending}
            busy={busy || pickingPhoto}
            retry={!!pending}
            disabled={!restored || active || (!(pending?.message ?? message).trim() && !photo)}
            postFlow={isHome}
            onAttach={isHome ? () => void attachPhoto() : undefined}
          />
          {!isHome && !result.data?.length && !result.isPending ? (
            <Txt variant="meta" muted style={{ textAlign: "center" }}>
              {t("You approve before publishing.", "توافق قبل النشر.")}
            </Txt>
          ) : null}
        </>
      }
      refreshControl={<RefreshControl refreshing={result.isRefetching} onRefresh={() => void result.refetch()} tintColor={colors.accentText} />}
    >
      {welcome ? (
        <View style={{ alignItems: "center", gap: 3, paddingVertical: 12 }}>
          <PostText variant="title" style={{ color: chatTheme.title, textAlign: "center", fontSize: 30, lineHeight: 39 }}>
            {t("Your business is ready", "نشاطك جاهز")}
          </PostText>
          <PostText muted style={{ textAlign: "center" }}>
            {t("What would you like MARKOS to do?", "ماذا تريد من ماركوس أن يفعل؟")}
          </PostText>
          <View style={{ width: "100%", alignItems: "center", paddingTop: 28 }}>
            <PostMascot />
          </View>
          {showIdeas ? (
            <View style={{ width: "100%", maxWidth: 390, borderRadius: 14, backgroundColor: chatTheme.card, padding: 10, gap: 8 }}>
              <PostText variant="label">{t("Pick an idea to make your own", "اختر فكرة وخصّصها لك")}</PostText>
              <TemplateChoices
                brief={`${message} ${session.workspace.name}`}
                onSelect={(id) => {
                  const template = postTemplates.find((item) => item.id === id);
                  if (!template) return;
                  saveInput(t(`Design a post for: ${template.en}. `, `صمّم منشوراً بعنوان: ${template.ar}. `), photo, true);
                  setShowIdeas(false);
                  inputRef.current?.focus();
                }}
              />
            </View>
          ) : null}
        </View>
      ) : result.data?.length === 0 ? (
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
          {intent === "GENERAL" && !chat ? <TextAction label={t("What MARKOS remembers", "ما يتذكره ماركوس")} onPress={() => setMemoryOpen(true)} /> : null}
        </View>
      ) : intent === "GENERAL" && !chat ? (
        <TextAction label={t("Memory", "الذاكرة")} accessibilityLabel={t("What MARKOS remembers", "ما يتذكره ماركوس")} onPress={() => setMemoryOpen(true)} />
      ) : null}
      {!isHome && !result.data?.length && !result.isPending ? (
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
      {chat && before ? (
        <TextAction
          label={t("Earlier messages", "الرسائل السابقة")}
          disabled={loadingOlder}
          onPress={() => {
            setLoadingOlder(true);
            following.current = false;
            void api
              .assistantChatMessages(chat.id, before)
              .then((page) => {
                loadedOlder.current = true;
                setOlder((rows) => [...page.turns, ...rows.filter((turn) => !page.turns.some((row) => row.id === turn.id))]);
                setBefore(page.nextBefore);
              })
              .catch((e) => setError(errorMessage(e, t)))
              .finally(() => setLoadingOlder(false));
          }}
        />
      ) : null}
      {intent !== "GENERAL" && !earlier && (result.data?.length ?? 0) > 4 ? (
        <TextAction label={t("Earlier work", "الأعمال السابقة")} onPress={() => setEarlier(true)} />
      ) : null}
      {(intent === "GENERAL" || earlier
        ? [...older.filter((row) => !(result.data ?? []).some((turn) => turn.id === row.id)), ...(result.data ?? [])]
        : result.data?.slice(-4)
      )?.map((turn) => (
        <Enter key={turn.id}>
          <View style={{ gap: 10 }}>
            <View
              style={{
                alignSelf: isHome && locale === "ar" ? "flex-start" : "flex-end",
                maxWidth: "88%",
                padding: 14,
                borderRadius: 18,
                backgroundColor: isHome ? chatTheme.user : colors.accentSoft
              }}
            >
              {isHome ? <PostText selectable>{turn.message}</PostText> : <Txt selectable>{turn.message}</Txt>}
            </View>
            <View style={{ gap: 8 }}>
              {!turn.postDesign ? (
                <Row>
                  <MarkosMark size={18} color={colors.accentText} />
                  <Txt variant="meta" muted style={{ flex: 1 }}>
                    MARKOS
                  </Txt>
                  {turn.reply ? <IconButton icon={Ellipsis} label={t("Report reply", "الإبلاغ عن الرد")} onPress={() => setReport(turn.id)} /> : null}
                </Row>
              ) : null}
              {turn.reply ? <Enter>{isHome ? <PostText selectable>{turn.reply}</PostText> : <Txt selectable>{turn.reply}</Txt>}</Enter> : null}
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
              {isHome && turn.postDesign && turn.contentItemId ? <ChatPostDesign turn={turn} id={turn.contentItemId} /> : null}
              {turn.result && !(isHome && turn.postDesign) ? <AssistantArtifact artifact={turn.result} /> : null}
              {!turn.result && turn.contentItemId && !(isHome && turn.postDesign) ? (
                <TextAction
                  label={t("Open draft", "فتح المسودة")}
                  onPress={() => router.push({ pathname: "/content/[id]", params: { id: turn.contentItemId! } })}
                />
              ) : null}
              {!turn.result && turn.campaignId ? (
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
              {!turn.result && turn.strategy ? (
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
