import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useIsFocused, useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Eye, MessageCircle, Save } from "lucide-react-native";
import type { ContentAuthoringOperation, ContentMediaItemRecord, ContentRecord } from "@markos/shared-types";
import { captionValidationIssue, captionCharacterCount, captionHashtagCount } from "@markos/shared-types";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Field, Loading, Notice, Row, Screen, Txt } from "../../src/ui";
import { QueryFailure, StatusBadge, typeLabel } from "../../src/content";
import { errorMessage } from "../../src/errors";
import { StudioConversation } from "../../src/studio/conversation";
import { StudioMedia } from "../../src/studio/media";
import { draftOperations, preserveDraftEdits, conversationActive, generationActive } from "../../src/studio/model";
import { restoreEditor, StudioDeviceStore } from "../../src/studio/device-store";
import { FormatControl } from "../../src/studio/format-control";
import { ReelScript } from "../../src/studio/reel-script";
import { Readiness } from "../../src/studio/readiness";
import { PostPreview } from "../../src/studio/post-preview";
import { draftReadiness, saveDraftEdits } from "../../src/studio/workflow";
import { PlannedTime } from "../../src/studio/planned-time";

export default function ContentDraft() {
  const focused = useIsFocused();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, scope } = useAccount();
  const result = useQuery({ queryKey: [scope, "content", id], queryFn: () => api.contentItem(id), refetchInterval: 4000, enabled: focused });
  if (result.isPending)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!result.data)
    return (
      <Screen>
        <QueryFailure
          error={result.error}
          retry={() => {
            void result.refetch();
          }}
        />
      </Screen>
    );
  return <Editor key={`${scope}:${id}`} initial={result.data} />;
}
function Editor({ initial }: { initial: ContentRecord }) {
  const { api, scope, epoch, queryClient } = useAccount();
  const focused = useIsFocused();
  const assets = useQuery({ queryKey: [scope, "media"], queryFn: () => api.mediaAssets() });
  const thread = useQuery({
    queryKey: [scope, "conversation", initial.id],
    queryFn: () => api.contentConversation(initial.id),
    enabled: focused,
    refetchInterval: 2500
  });
  const generation = useQuery({
    queryKey: [scope, "video-job", initial.id],
    queryFn: () => api.latestMediaGenerationJob(initial.id),
    enabled: focused,
    refetchInterval: 2500
  });
  const generating = conversationActive(thread.data?.latestRun?.status) || generationActive(generation.data?.status);
  const device = useMemo(() => new StudioDeviceStore(scope, epoch, initial.id, initial.workspaceId), [scope, epoch, initial.id, initial.workspaceId]);
  const { t } = useAppearance();
  const navigation = useNavigation();
  const router = useRouter();
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const state = useRef({ base, draft });
  state.current = { base, draft };
  const [remote, setRemote] = useState<ContentRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"preview" | "assistant">("preview");
  const [section, setSection] = useState<"review" | "caption" | "media" | "details">("review");
  const [restored, setRestored] = useState(false);
  const ready = useRef(false);
  const latestInitial = useRef(initial);
  latestInitial.current = initial;
  const [restoreError, setRestoreError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [deviceStatus, setDeviceStatus] = useState<"saving" | "saved" | "error">("saved");
  const leaving = useRef(false);
  const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    if (deleted) router.replace("/(tabs)/create");
  }, [deleted, router]);
  useEffect(() => {
    let mounted = true;
    setRestoreError(false);
    void device
      .readEditor()
      .then((saved) => {
        if (!mounted) return;
        const current = latestInitial.current;
        const recovered = saved ? restoreEditor(saved, current) : { base: current, draft: current, remote: null };
        state.current = recovered;
        setBase(recovered.base);
        setDraft(recovered.draft);
        setRemote(recovered.remote);
        if (saved && draftOperations(recovered.base, recovered.draft).length)
          setNotice(t("Your unfinished edits were restored from this device.", "تمت استعادة تعديلاتك غير المكتملة من هذا الجهاز."));
        ready.current = true;
        setRestored(true);
      })
      .catch(() => {
        if (mounted) setRestoreError(true);
      });
    return () => {
      mounted = false;
    };
  }, [device, restoreAttempt]);
  useEffect(() => {
    if (!restored || leaving.current) return;
    let current = true;
    setDeviceStatus("saving");
    void device
      .saveEditor(base, draft)
      .then(() => {
        if (current) setDeviceStatus("saved");
      })
      .catch(() => {
        if (current) setDeviceStatus("error");
      });
    return () => {
      current = false;
    };
  }, [base, draft, device, restored]);
  const dirty = draftOperations(base, draft).length > 0;
  const editable = ["DRAFT", "IN_REVIEW"].includes(base.status);
  const invalid = captionValidationIssue(draft.caption);
  const locked = busy || generating || !editable || !!remote;
  const readiness = draftReadiness(draft, assets.data);
  const attachmentKey = base.mediaItems.map((media) => media.mediaAssetId ?? "").join(",");
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: [scope, "media"] });
  }, [attachmentKey, scope, queryClient]);
  usePreventRemove(dirty && !deleted, ({ data }) =>
    Alert.alert(
      t("Keep editing?", "متابعة التعديل؟"),
      t("Save these edits to MARKOS before leaving, or discard them.", "احفظ هذه التعديلات في ماركوس قبل المغادرة أو تجاهلها."),
      [
        { text: t("Keep editing", "متابعة التعديل"), style: "cancel" },
        {
          text: t("Save and leave", "حفظ ومغادرة"),
          onPress: () => {
            void run(async () => {
              await save();
              await device.clearEditor();
              navigation.dispatch(data.action);
            });
          }
        },
        {
          text: t("Discard edits", "تجاهل التعديلات"),
          style: "destructive",
          onPress: () => {
            void run(async () => {
              leaving.current = true;
              try {
                await device.clearEditor();
                navigation.dispatch(data.action);
              } catch (problem) {
                leaving.current = false;
                throw problem;
              }
            });
          }
        }
      ]
    )
  );
  const accept = useCallback((value: ContentRecord) => {
    const current = state.current;
    if (
      !ready.current ||
      working.current ||
      value.revision < current.base.revision ||
      (value.revision === current.base.revision && value.updatedAt <= current.base.updatedAt)
    )
      return;
    if (draftOperations(current.base, current.draft).length) setRemote(value);
    else {
      setBase(value);
      setDraft(value);
      state.current = { base: value, draft: value };
      setRemote(null);
    }
  }, []);
  useEffect(() => accept(initial), [initial, accept, busy, restored]);
  function commit(value: ContentRecord) {
    setBase(value);
    setDraft(value);
    state.current = { base: value, draft: value };
    setRemote(null);
    queryClient.setQueryData([scope, "content", value.id], value);
  }
  async function save(): Promise<ContentRecord> {
    const current = state.current;
    if (remote) throw new Error(t("Review the newer saved draft first.", "راجع المسودة المحفوظة الأحدث أولًا."));
    const operations = draftOperations(current.base, current.draft);
    if (!operations.length) return current.base;
    const result = await saveDraftEdits(api, current.base, current.draft, (saved, remaining) => {
      state.current = { base: saved, draft: remaining };
      setBase(saved);
      setDraft(remaining);
      queryClient.setQueryData([scope, "content", saved.id], saved);
    });
    commit(result);
    return result;
  }
  async function run(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (problem) {
      setError(errorMessage(problem, t));
      const latest = await api.contentItem(base.id).catch(() => null);
      if (latest && latest.revision > state.current.base.revision) setRemote(latest);
    } finally {
      working.current = false;
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: [scope, "content"] });
      void queryClient.invalidateQueries({ queryKey: [scope, "conversation", base.id] });
      void queryClient.invalidateQueries({ queryKey: [scope, "video-job", base.id] });
      void queryClient.invalidateQueries({ queryKey: [scope, "campaigns"] });
      void queryClient.invalidateQueries({ queryKey: [scope, "campaign"] });
      void queryClient.invalidateQueries({ queryKey: [scope, "calendar"] });
      void queryClient.invalidateQueries({ queryKey: [scope, "media"] });
    }
  }
  async function structure(operations: ContentAuthoringOperation[]) {
    await run(async () => {
      const saved = await save();
      commit(await api.mutateContent(saved.id, { expectedRevision: saved.revision, operations }));
    });
  }
  function openSection(next: "assistant" | "review" | "caption" | "media") {
    if (next === "assistant") setView("assistant");
    else {
      setView("preview");
      setSection(next);
    }
  }
  function editMedia(id: string, fields: Partial<ContentMediaItemRecord>) {
    setDraft((current) => ({ ...current, mediaItems: current.mediaItems.map((item) => (item.id === id ? { ...item, ...fields } : item)) }));
  }
  function markReady() {
    if (readiness || locked) return;
    Alert.alert(
      t("Mark this content ready?", "اعتماد هذا المحتوى؟"),
      t(
        "Confirm the caption, event details and final media. Scheduling is a separate step.",
        "أكّد النص وتفاصيل الفعالية والوسائط النهائية. الجدولة خطوة مستقلة."
      ),
      [
        { text: t("Keep reviewing", "متابعة المراجعة"), style: "cancel" },
        {
          text: t("Mark ready", "اعتماد"),
          onPress: () => {
            void run(async () => {
              const saved = await save();
              const currentThread = await api.contentConversation(saved.id);
              const currentJob = await api.latestMediaGenerationJob(saved.id);
              if (conversationActive(currentThread.latestRun?.status) || generationActive(currentJob?.status))
                throw new Error(t("Wait for generation to finish and review the result first.", "انتظر اكتمال الإنشاء وراجع النتيجة أولًا."));
              commit(await api.updateContentStatus(base.id, "APPROVED", saved.revision));
              setView("preview");
              setSection("review");
              setNotice(t("Ready. Choose a publishing time when you’re ready to schedule.", "تم الاعتماد. اختر موعد النشر عندما تكون مستعدًا للجدولة."));
            });
          }
        }
      ]
    );
  }
  if (!restored)
    return (
      <Screen>
        {restoreError ? (
          <>
            <Notice error>
              {t("Couldn’t restore your device draft. Retry to keep your edits safe.", "تعذّرت استعادة مسودة الجهاز. أعد المحاولة للحفاظ على تعديلاتك.")}
            </Notice>
            <Button label={t("Retry recovery", "إعادة محاولة الاستعادة")} onPress={() => setRestoreAttempt((value) => value + 1)} />
          </>
        ) : (
          <Loading />
        )}
      </Screen>
    );
  return (
    <Screen
      footer={
        <>
          {editable ? (
            <Row>
              <View style={{ flex: 1 }}>
                <Button
                  secondary
                  icon={Save}
                  label={t("Save", "حفظ")}
                  disabled={!dirty || locked || !!invalid}
                  onPress={() => {
                    void run(async () => {
                      await save();
                      setNotice(t("Draft saved.", "تم حفظ المسودة."));
                    });
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  icon={Check}
                  label={
                    generating
                      ? t("Generating…", "جارٍ الإنشاء…")
                      : readiness === "caption" || readiness === "caption-invalid"
                        ? t("Prepare caption", "إعداد النص")
                        : readiness
                          ? t("Complete media", "إكمال الوسائط")
                          : t("Mark ready", "اعتماد")
                  }
                  disabled={locked || readiness === "loading"}
                  onPress={() =>
                    readiness ? openSection(readiness === "caption" ? "assistant" : readiness === "caption-invalid" ? "caption" : "media") : markReady()
                  }
                />
              </View>
            </Row>
          ) : ["APPROVED", "SCHEDULED", "FAILED"].includes(base.status) ? (
            <Button
              icon={CalendarDays}
              label={base.status === "SCHEDULED" ? t("Manage schedule", "إدارة الجدولة") : t("Schedule", "جدولة")}
              disabled={busy}
              onPress={() => router.push({ pathname: "/content/schedule", params: { id: base.id } })}
            />
          ) : null}
          <Txt variant="meta" muted>
            {busy
              ? t("Saving or generating…", "جارٍ الحفظ أو الإنشاء…")
              : dirty
                ? deviceStatus === "saved"
                  ? t("Saved on this device · Save to sync with MARKOS", "محفوظة على هذا الجهاز · اضغط حفظ للمزامنة مع ماركوس")
                  : deviceStatus === "saving"
                    ? t("Saving on this device…", "جارٍ الحفظ على هذا الجهاز…")
                    : t("Device save failed · Keep this screen open", "فشل الحفظ على الجهاز · أبقِ هذه الشاشة مفتوحة")
                : t("All changes saved", "تم حفظ جميع التغييرات")}
          </Txt>
        </>
      }
    >
      <Txt variant="title">{base.brief?.split("\n")[0] || typeLabel(base.contentType, t)}</Txt>
      <Row>
        <StatusBadge status={base.status} />
        <Txt muted>{typeLabel(base.contentType, t)}</Txt>
      </Row>
      {base.campaignId ? (
        <Button
          secondary
          label={t("Open campaign", "فتح الحملة")}
          onPress={() => router.push({ pathname: "/campaign/[id]", params: { id: base.campaignId! } })}
        />
      ) : null}
      {editable ? <FormatControl item={draft} disabled={locked} save={save} accept={commit} run={run} /> : null}
      {["SCHEDULED", "FAILED", "PUBLISHED"].includes(base.status) ? (
        <Button
          secondary
          label={t("Publishing status and recovery", "حالة النشر والمعالجة")}
          onPress={() => router.push({ pathname: "/content/publication", params: { id: base.id } })}
        />
      ) : null}
      <Row>
        <View style={{ flex: 1 }}>
          <Button secondary={view !== "preview"} icon={Eye} label={t("Preview", "معاينة")} onPress={() => setView("preview")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button secondary={view !== "assistant"} icon={MessageCircle} label={t("Assistant", "المساعد")} onPress={() => setView("assistant")} />
        </View>
      </Row>
      {editable && view === "preview" && section === "review" ? (
        <Readiness item={draft} assets={assets.data} busy={busy || generating} open={openSection} />
      ) : null}
      {generating ? (
        <Notice>
          {t("MARKOS is generating. You can leave; review the result when it finishes.", "ماركوس ينشئ المحتوى. يمكنك المغادرة ومراجعة النتيجة عند اكتمالها.")}
        </Notice>
      ) : null}
      {assets.isError ? <QueryFailure error={assets.error} retry={() => void assets.refetch()} /> : null}
      {remote ? (
        <Card tone="warning">
          <Txt>
            {t("The saved draft changed while you were editing. Your edits are still here.", "تغيّرت المسودة المحفوظة أثناء تعديلك. ما زالت تعديلاتك هنا.")}
          </Txt>
          {editable && ["DRAFT", "IN_REVIEW"].includes(remote.status) ? (
            <Button
              secondary
              label={t("Keep my edits on the latest draft", "إبقاء تعديلاتي على المسودة الأحدث")}
              onPress={() => {
                try {
                  const merged = preserveDraftEdits(base, draft, remote);
                  setBase(remote);
                  setDraft(merged);
                  setRemote(null);
                  setError("");
                } catch {
                  setError(
                    t(
                      "An edited slide or script was removed. Copy any text you need before loading the latest draft.",
                      "أُزيلت شريحة أو نص كنت تعدّله. انسخ النص الذي تحتاجه قبل تحميل المسودة الأحدث."
                    )
                  );
                }
              }}
            />
          ) : null}
          <Button
            secondary
            label={t("Use saved version", "استخدام النسخة المحفوظة")}
            onPress={() =>
              Alert.alert(
                t("Discard these edits?", "تجاهل هذه التعديلات؟"),
                t("The latest saved version will replace your unsaved edits.", "ستحلّ النسخة المحفوظة الأحدث محل تعديلاتك غير المحفوظة."),
                [
                  { text: t("Keep editing", "متابعة التعديل"), style: "cancel" },
                  { text: t("Use saved version", "استخدام النسخة المحفوظة"), onPress: () => commit(remote) }
                ]
              )
            }
          />
        </Card>
      ) : null}
      {error ? <Notice error>{error}</Notice> : null}
      {deviceStatus === "error" ? (
        <Notice error>
          {t(
            "Your latest edits could not be saved on this device. Save to MARKOS before closing the app.",
            "تعذّر حفظ أحدث تعديلاتك على هذا الجهاز. احفظها في ماركوس قبل إغلاق التطبيق."
          )}
        </Notice>
      ) : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {view === "preview" ? (
        <>
          <Row style={{ flexWrap: "wrap" }}>
            {(["review", "caption", "media", "details"] as const).map((key) => (
              <View key={key} style={{ flexGrow: 1, flexBasis: "40%" }}>
                <Button
                  secondary={section !== key}
                  label={
                    key === "review"
                      ? t("Full preview", "معاينة كاملة")
                      : key === "caption"
                        ? t("Caption", "النص")
                        : key === "media"
                          ? t("Media", "الوسائط")
                          : t("Details", "التفاصيل")
                  }
                  onPress={() => setSection(key)}
                />
              </View>
            ))}
          </Row>
          {section === "review" ? <PostPreview item={draft} assets={assets.data ?? []} /> : null}
          {section === "caption" ? (
            <>
              <Field
                label={t("Caption", "النص")}
                value={draft.caption}
                multiline
                style={{ minHeight: 240 }}
                editable={!locked}
                onChangeText={(caption) => setDraft((current) => ({ ...current, caption }))}
              />
              <Txt variant="meta" muted>
                {captionCharacterCount(draft.caption)} / 2200 · {captionHashtagCount(draft.caption)} / 30 {t("hashtags", "وسمًا")}
              </Txt>
              {draft.contentType === "STORY" ? (
                <Notice>
                  {t(
                    "This is supporting text. It is not automatically drawn onto the Story or published as a caption.",
                    "هذا نص مساند. لا يُضاف تلقائيًا إلى صورة القصة ولا يُنشر كنص معها."
                  )}
                </Notice>
              ) : null}
              {invalid ? <Notice error>{t("Shorten the caption or reduce its hashtags before saving.", "اختصر النص أو قلّل الوسوم قبل الحفظ.")}</Notice> : null}
            </>
          ) : null}
          {section === "media" ? (
            <StudioMedia
              item={draft}
              editable={editable && !remote && !conversationActive(thread.data?.latestRun?.status)}
              busy={busy}
              edit={editMedia}
              save={save}
              accept={commit}
              run={run}
            />
          ) : null}
          {section === "details" ? (
            <>
              <Field
                label={t("Brief", "الملخص")}
                value={draft.brief ?? ""}
                maxLength={1000}
                multiline
                style={{ minHeight: 120 }}
                editable={!locked}
                onChangeText={(brief) => setDraft((current) => ({ ...current, brief }))}
              />
              <Field
                label={t("Goal", "الهدف")}
                value={draft.campaignGoal ?? ""}
                maxLength={500}
                editable={!locked}
                onChangeText={(campaignGoal) => setDraft((current) => ({ ...current, campaignGoal }))}
              />
              <Field
                label={t("Content pillar", "محور المحتوى")}
                value={draft.contentPillar ?? ""}
                maxLength={160}
                editable={!locked}
                onChangeText={(contentPillar) => setDraft((current) => ({ ...current, contentPillar }))}
              />
              <PlannedTime value={draft.plannedAt} disabled={locked} change={(plannedAt) => setDraft((current) => ({ ...current, plannedAt }))} />
              <Field
                label={t("Tone", "النبرة")}
                value={draft.tone ?? ""}
                maxLength={200}
                editable={!locked}
                onChangeText={(tone) => setDraft((current) => ({ ...current, tone }))}
              />
              {draft.contentType === "REEL" ? <ReelScript item={draft} disabled={locked} edit={setDraft} mutate={structure} /> : null}
              {["DRAFT", "IN_REVIEW", "APPROVED", "FAILED"].includes(base.status) ? (
                <Button
                  secondary
                  disabled={busy || generating}
                  label={t("Delete draft", "حذف المسودة")}
                  onPress={() =>
                    Alert.alert(
                      t("Delete this draft?", "حذف هذه المسودة؟"),
                      t("This removes the draft. Saved media remains in your library.", "سيُحذف المحتوى وتبقى الوسائط المحفوظة في مكتبتك."),
                      [
                        { text: t("Keep draft", "إبقاء المسودة"), style: "cancel" },
                        {
                          text: t("Delete", "حذف"),
                          style: "destructive",
                          onPress: () =>
                            void run(async () => {
                              await api.deleteContent(base.id, state.current.base.revision);
                              leaving.current = true;
                              await device.clearEditor().catch(() => {});
                              setDeleted(true);
                            })
                        }
                      ]
                    )
                  }
                />
              ) : null}
            </>
          ) : null}
          {base.status === "APPROVED" ? (
            <Button
              secondary
              disabled={busy}
              label={t("Return to draft to edit", "العودة إلى المسودة للتعديل")}
              onPress={() => {
                void run(async () => commit(await api.updateContentStatus(base.id, "DRAFT", base.revision)));
              }}
            />
          ) : null}
        </>
      ) : null}
      <StudioConversation
        item={base}
        busy={busy}
        save={save}
        accept={accept}
        run={run}
        disabled={!editable || !!remote || !!invalid}
        visible={view === "assistant"}
        openMedia={() => openSection("media")}
        openPreview={() => openSection("review")}
      />
    </Screen>
  );
}
