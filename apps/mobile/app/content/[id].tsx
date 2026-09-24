import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useIsFocused, useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Eye, MessageCircle, Save } from "lucide-react-native";
import type { ContentMediaItemRecord, ContentRecord } from "@markos/shared-types";
import { captionValidationIssue } from "@markos/shared-types";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Field, Loading, Notice, Row, Screen, Txt } from "../../src/ui";
import { QueryFailure, StatusBadge, typeLabel } from "../../src/content";
import { errorMessage } from "../../src/errors";
import { StudioConversation } from "../../src/studio/conversation";
import { StudioMedia } from "../../src/studio/media";
import { draftOperations, preserveDraftEdits } from "../../src/studio/model";
import { restoreEditor, StudioDeviceStore } from "../../src/studio/device-store";

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
  const [section, setSection] = useState<"caption" | "media" | "details">("media");
  const [restored, setRestored] = useState(false);
  const ready = useRef(false);
  const latestInitial = useRef(initial);
  latestInitial.current = initial;
  const [restoreError, setRestoreError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [deviceStatus, setDeviceStatus] = useState<"saving" | "saved" | "error">("saved");
  const leaving = useRef(false);
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
  const locked = busy || !editable || !!remote;
  usePreventRemove(dirty, ({ data }) =>
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
    if (!ready.current || working.current || value.revision < current.base.revision || value.updatedAt <= current.base.updatedAt) return;
    if (draftOperations(current.base, current.draft).length) setRemote(value);
    else {
      setBase(value);
      setDraft(value);
      state.current = { base: value, draft: value };
      setRemote(null);
    }
  }, []);
  useEffect(() => accept(initial), [initial, accept]);
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
    const result = await api.mutateContent(base.id, { expectedRevision: current.base.revision, operations });
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
    }
  }
  function editMedia(id: string, fields: Partial<ContentMediaItemRecord>) {
    setDraft((current) => ({ ...current, mediaItems: current.mediaItems.map((item) => (item.id === id ? { ...item, ...fields } : item)) }));
  }
  function markReady() {
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
              commit(await api.updateContentStatus(base.id, "APPROVED", saved.revision));
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
        view === "preview" ? (
          <>
            {editable ? (
              <Row>
                <View style={{ flex: 1 }}>
                  <Button
                    secondary
                    icon={Save}
                    label={t("Save", "حفظ")}
                    disabled={!dirty || busy || !!remote || !!invalid}
                    onPress={() => {
                      void run(async () => {
                        await save();
                        setNotice(t("Draft saved.", "تم حفظ المسودة."));
                      });
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button icon={Check} label={t("Mark ready", "اعتماد")} disabled={busy || !!remote || !!invalid} onPress={markReady} />
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
        ) : undefined
      }
    >
      <Txt variant="title">{base.brief?.split("\n")[0] || typeLabel(base.contentType, t)}</Txt>
      <Row>
        <StatusBadge status={base.status} />
        <Txt muted>{typeLabel(base.contentType, t)}</Txt>
      </Row>
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
                      "An edited slide was removed. Copy any text you need before loading the latest draft.",
                      "أُزيلت شريحة كنت تعدّلها. انسخ النص الذي تحتاجه قبل تحميل المسودة الأحدث."
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
          <Row>
            {(["caption", "media", "details"] as const).map((key) => (
              <View key={key} style={{ flex: 1 }}>
                <Button
                  secondary={section !== key}
                  label={key === "caption" ? t("Caption", "النص") : key === "media" ? t("Media", "الوسائط") : t("Details", "التفاصيل")}
                  onPress={() => setSection(key)}
                />
              </View>
            ))}
          </Row>
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
              {invalid ? <Notice error>{t("Shorten the caption or reduce its hashtags before saving.", "اختصر النص أو قلّل الوسوم قبل الحفظ.")}</Notice> : null}
            </>
          ) : null}
          {section === "media" ? (
            <StudioMedia item={draft} editable={editable && !remote} busy={busy} edit={editMedia} save={save} accept={commit} run={run} />
          ) : null}
          {section === "details" ? (
            <>
              <Field
                label={t("Brief", "الملخص")}
                value={draft.brief ?? ""}
                maxLength={5000}
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
                label={t("Tone", "النبرة")}
                value={draft.tone ?? ""}
                maxLength={500}
                editable={!locked}
                onChangeText={(tone) => setDraft((current) => ({ ...current, tone }))}
              />
              {base.reelScript ? (
                <Card>
                  <Txt variant="heading">{t("Reel script", "نص الريل")}</Txt>
                  {base.reelScript.hook ? <Txt>{base.reelScript.hook}</Txt> : null}
                  {base.reelScript.beats.map((beat) => (
                    <Txt key={beat.id}>{beat.text}</Txt>
                  ))}
                  <Button secondary label={t("Refine with MARKOS", "تحسين مع ماركوس")} onPress={() => setView("assistant")} />
                </Card>
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
      />
    </Screen>
  );
}
