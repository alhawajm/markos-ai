import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useIsFocused } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { CalendarDays, Pencil, Share2, X } from "lucide-react-native";
import {
  postTemplates,
  recommendPostTemplates,
  type ContentAuthoringOperation,
  type ContentRecord,
  type PostArtwork,
  type WorkspaceAssistantTurn
} from "@markos/shared-types";
import { BusinessDeviceStore } from "../business/device-store";
import { sessionController } from "../auth/transport";
import { errorMessage, LocalAppError } from "../errors";
import { canScheduleContent, readinessMessage, scheduleBlockers } from "../instagram/model";
import { TaskFeedback } from "../motion";
import { useAccount, useAppearance } from "../providers";
import { shareFile } from "../share-file";
import { PlannedTime } from "../studio/planned-time";
import { Button, Loading, Notice, Sheet, TextAction } from "../ui";
import { FontChoices, RatioChoices, StyleChoices, TemplateChoices } from "./choices";
import { PostEditor } from "./editor";
import { postDesignFile, removePostFile, savePostJpeg } from "./files";
import { canPublishPostRatio, newPostDesign, postOverlayCopy, postRatiosByValue, wantsPostIdeas, type PostDesignState } from "./model";
import { PostText, usePostFlowTheme } from "./theme";

export function ChatPostDesign({ turn, id }: { turn: WorkspaceAssistantTurn; id: string }) {
  const { scope, epoch, session, api, queryClient } = useAccount();
  const { t, locale, rtl } = useAppearance();
  const theme = usePostFlowTheme();
  const router = useRouter();
  const focused = useIsFocused();
  const device = useMemo(() => new BusinessDeviceStore<PostDesignState>(scope, epoch, "post-design", turn.id), [scope, epoch, turn.id]);
  const [design, setDesign] = useState(() => newPostDesign({ ideas: wantsPostIdeas(turn.message) }));
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"preview" | "edit" | "schedule" | null>(null);
  const [schedule, setSchedule] = useState<string>();
  const [publication, setPublication] = useState<string>();
  const locked = useRef(false);
  const contentKey = [scope, "content", id];
  const content = useQuery({
    queryKey: contentKey,
    queryFn: () => api.contentItem(id),
    enabled: focused,
    refetchInterval: (query) => (query.state.data?.status === "SCHEDULED" ? (publication ? 2500 : 30_000) : false)
  });
  const item = content.data;
  const attachedId = item?.mediaItems[0]?.mediaAssetId;
  const asset = useQuery({ queryKey: [scope, "media-asset", attachedId], enabled: focused && !!attachedId, queryFn: () => api.mediaAsset(attachedId ?? "") });
  const ratio = design.artwork?.ratio;
  const localPreview = design.preview && (design.attachedId ?? null) === (attachedId ?? null) ? postDesignFile(scope, design.preview) : null;
  const hasLocalChoices = !!(design.photo || design.style || design.font || design.ratio);
  const uri = localPreview?.exists ? localPreview.uri : design.stage === "preview" || !hasLocalChoices ? asset.data?.publicUrl : undefined;
  const previewRatio =
    localPreview?.exists && ratio ? postRatiosByValue[ratio] : asset.data?.width && asset.data.height ? asset.data.width / asset.data.height : 4 / 5;
  const editable = !!item && ["DRAFT", "IN_REVIEW"].includes(item.status);

  useEffect(() => {
    let live = true;
    void device
      .read()
      .then((saved) => {
        if (!live) return;
        if (saved) setDesign(saved);
        setRestored(true);
      })
      .catch(() => {
        if (live) setError(t("Couldn’t restore this design. Reopen the chat to try again.", "تعذّر استعادة التصميم. أعد فتح المحادثة للمحاولة."));
      });
    return () => {
      live = false;
    };
  }, [device]);

  function change(next: PostDesignState) {
    setDesign(next);
    void device.save(next).catch((problem) => setError(errorMessage(problem, t)));
  }
  function accept(saved: ContentRecord) {
    sessionController.assertEpoch(epoch);
    queryClient.setQueryData(contentKey, saved);
  }
  async function work(label: string, action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setError("");
    try {
      sessionController.assertEpoch(epoch);
      await action();
    } catch (problem) {
      setError(errorMessage(problem, t));
      void content.refetch();
    } finally {
      locked.current = false;
      setBusy("");
    }
  }
  async function renderAndSave(artwork: PostArtwork, caption: string, base: ContentRecord, next: PostDesignState) {
    const photo = next.photo ? postDesignFile(scope, next.photo) : null;
    if (photo && !photo.exists) throw new LocalAppError(t("The original photo is missing from this device.", "الصورة الأصلية غير موجودة على هذا الجهاز."));
    const options = photo ? { source: { photoBase64: await photo.base64() } } : next.generatedPhoto ? { source: { mediaAssetId: next.generatedPhoto } } : {};
    const jpeg = await api.renderPostArtwork({ ...artwork, ...options });
    sessionController.assertEpoch(epoch);
    const filename = savePostJpeg(scope, jpeg.base64Data);
    try {
      const slot = base.mediaItems[0];
      if (!slot) throw new LocalAppError(t("The draft’s image slot is missing.", "موضع صورة المسودة غير موجود."));
      const asset = canPublishPostRatio(artwork.ratio)
        ? await api.uploadMedia({
            type: "IMAGE",
            filename: "markos-post.jpg",
            mimeType: "image/jpeg",
            base64Data: jpeg.base64Data
          })
        : null;
      const operations: ContentAuthoringOperation[] = [];
      if (caption !== base.caption) operations.push({ type: "updateContent", fields: { caption } });
      if (asset || slot.mediaAssetId)
        operations.push({
          type: "updateMediaItem",
          itemId: slot.id,
          fields: { mediaAssetId: asset?.id ?? null, aspectRatio: asset ? (artwork.ratio === "1:1" ? "SQUARE" : "PORTRAIT") : null }
        });
      const saved = operations.length ? await api.mutateContent(base.id, { expectedRevision: base.revision, operations }) : base;
      const { attachedId: _old, ...choices } = next;
      const updated: PostDesignState = {
        ...choices,
        stage: "preview",
        artwork,
        ratio: artwork.ratio,
        preview: filename,
        ...(asset ? { attachedId: asset.id } : {})
      };
      accept(saved);
      await device.save(updated);
      setDesign(updated);
    } catch (problem) {
      removePostFile(scope, filename);
      throw problem;
    }
    removePostFile(scope, next.preview);
    void queryClient.invalidateQueries({ queryKey: [scope, "media"] });
  }

  function generate() {
    if (!item || !editable || !design.style || !design.font || !design.ratio) return;
    const { style, font, ratio: chosenRatio } = design;
    void work(t("Preparing your preview", "نُعدّ معاينة منشورك"), async () => {
      let base = item;
      if (design.artwork && design.preview) {
        await renderAndSave({ ...design.artwork, style, font, ratio: chosenRatio }, base.caption, base, design);
        return;
      }
      const template = postTemplates.find(({ id, en, ar }) =>
        design.template ? id === design.template : turn.message.toLowerCase().includes(en.toLowerCase()) || turn.message.includes(ar)
      );
      const topic = [
        turn.message.slice(0, 640),
        template?.recipe,
        locale === "ar"
          ? "اكتب عنواناً قصيراً في سطر مستقل، ثم التفاصيل المؤكدة فقط في سطر ثانٍ إن وُجدت. لا تختلق أسعاراً أو مواعيد."
          : "First caption line: short artwork headline. Second line: exact supporting facts if known. Do not invent prices, times or dates."
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 1000);
      const draft = base.caption
        ? { caption: base.caption, visualDirection: base.mediaItems[0]?.visualDirection }
        : await api.ideateContent({ topic, contentType: "POST" });
      let next = design;
      if (!next.photo && !next.generatedPhoto && draft.visualDirection && base.mediaItems[0]) {
        const slot = base.mediaItems[0];
        if (!slot.mediaAssetId) {
          base = await api.mutateContent(base.id, {
            expectedRevision: base.revision,
            operations: [
              {
                type: "updateMediaItem",
                itemId: slot.id,
                fields: { visualDirection: `Photographic background only, no letters or text. ${draft.visualDirection}`.slice(0, 900) }
              }
            ]
          });
          await api.generateContentImage(base.id, { expectedRevision: base.revision, contentMediaItemId: slot.id });
        }
        base = await api.contentItem(base.id);
        const background = base.mediaItems[0]?.mediaAssetId;
        if (background) {
          next = { ...next, generatedPhoto: background };
          await device.save(next);
          setDesign(next);
        }
      }
      await renderAndSave({ style, font, ratio: chosenRatio, zoom: 1, strokes: [], ...postOverlayCopy(draft.caption) }, draft.caption, base, next);
    });
  }

  function share() {
    void work(t("Preparing your share file", "نُجهّز الملف للمشاركة"), async () => {
      if (!uri) return;
      const bytes = localPreview?.exists
        ? await localPreview.bytes()
        : await fetch(uri).then(async (response) => {
            if (!response.ok) throw new LocalAppError(t("Couldn’t download the post. Try again.", "تعذّر تنزيل المنشور. حاول مجدداً."));
            return new Uint8Array(await response.arrayBuffer());
          });
      await shareFile(bytes, "markos-post.jpg", "image/jpeg", epoch, t("Share post", "مشاركة المنشور"));
    });
  }

  async function publishingTarget(revision: number) {
    const [readiness, live] = await Promise.all([api.publishReadiness(id), api.publishingLiveReadiness()]);
    const blocked = scheduleBlockers(readiness, live, revision)[0];
    if (blocked) throw new LocalAppError(readinessMessage(blocked, t));
    if (!readiness.connection.accountId || !readiness.connection.username)
      throw new LocalAppError(t("Check your connected Instagram account first.", "تحقّق من حساب إنستغرام المتصل أولاً."));
    return { account: readiness.connection.accountId, label: `@${readiness.connection.username}` };
  }
  function confirmPublish(at?: string) {
    if (!item || item.status !== "APPROVED") return;
    const revision = item.revision;
    if (at && Date.parse(at) <= Date.now()) {
      setError(t("Choose a time in the future.", "اختر وقتاً مستقبلياً."));
      return;
    }
    void work(t("Checking Instagram", "نتحقق من إنستغرام"), async () => {
      const target = await publishingTarget(revision);
      const time = at ? new Date(at).toLocaleString(locale, { timeZone: "Asia/Bahrain", dateStyle: "medium", timeStyle: "short" }) : null;
      Alert.alert(
        at ? t("Confirm schedule", "تأكيد الجدولة") : t("Publish now?", "النشر الآن؟"),
        time
          ? t(`Publish to ${target.label} on ${time} (Bahrain time)?`, `النشر إلى ${target.label} في ${time} (بتوقيت البحرين)؟`)
          : t(`Publish the reviewed post to ${target.label}?`, `نشر المنشور المعتمد إلى ${target.label}؟`),
        [
          { text: t("Cancel", "إلغاء"), style: "cancel" },
          {
            text: t("Confirm", "تأكيد"),
            onPress: () => {
              void work(t("Sending to Instagram", "إرسال إلى إنستغرام"), async () => {
                if ((await publishingTarget(revision)).account !== target.account)
                  throw new LocalAppError(
                    t("The Instagram account changed. Review the destination and try again.", "تغيّر حساب إنستغرام. راجع الوجهة وحاول مجدداً.")
                  );
                if (at) accept(await api.scheduleContent(id, at, revision));
                else {
                  await api.publishContentNow(id, revision);
                  setPublication("queued");
                  await content.refetch();
                }
                setModal(null);
                void queryClient.invalidateQueries({ queryKey: [scope, "calendar"] });
              });
            }
          }
        ]
      );
    });
  }

  if (!restored || content.isPending) return error ? <Notice error>{error}</Notice> : <Loading />;
  if (content.isError) return <Notice error>{errorMessage(content.error, t)}</Notice>;
  if (!item) return null;
  const step = uri ? "preview" : design.stage === "preview" ? "ratio" : design.stage;
  const showSavedPreview = step === "preview" && !!uri;
  const photoUri = design.photo ? postDesignFile(scope, design.photo).uri : null;
  const publishable = canPublishPostRatio(ratio) && !!attachedId && canScheduleContent(session.roles);
  const openEditor = () => {
    setError("");
    setModal("edit");
  };
  return (
    <View style={{ alignSelf: rtl ? "flex-end" : "flex-start", width: "100%", maxWidth: 390, gap: 10 }}>
      {photoUri && !showSavedPreview ? (
        <Image
          accessibilityLabel={t("Attached photo", "الصورة المرفقة")}
          source={{ uri: photoUri }}
          style={{ width: 136, height: 154, alignSelf: rtl ? "flex-start" : "flex-end", borderRadius: 14 }}
        />
      ) : null}
      {busy ? <TaskFeedback label={busy} /> : null}
      {!showSavedPreview ? (
        <View style={{ borderRadius: 15, backgroundColor: theme.card, padding: 12, gap: 9, opacity: busy ? 0.65 : 1 }} pointerEvents={busy ? "none" : "auto"}>
          {step === "ideas" ? (
            <>
              <PostText variant="label">{t("Here are a few ideas to start with", "إليك بعض الأفكار للبدء")}</PostText>
              <TemplateChoices
                brief={`${turn.message} ${session.workspace.name}`}
                onSelect={(template, style) => change({ ...design, template, style, stage: "style" })}
              />
              <TextAction label={t("Design from my brief", "التصميم من وصفي")} onPress={() => change({ ...design, stage: "style" })} />
            </>
          ) : null}
          {step === "style" ? (
            <>
              <PostText>{t("What aesthetic do you like?", "أي أسلوب بصري تفضّل؟")}</PostText>
              <StyleChoices value={design.style} onSelect={(style) => change({ ...design, style })} />
              <Button secondary disabled={!design.style} label={t("Confirm style", "تأكيد الأسلوب")} onPress={() => change({ ...design, stage: "font" })} />
              <TextAction
                label={t("Use suggested settings", "استخدام الإعدادات المقترحة")}
                onPress={() => {
                  const suggested = recommendPostTemplates(turn.message, 1)[0];
                  change({ ...design, style: design.style ?? suggested?.style ?? "hybrid", font: "regular", ratio: "4:5", stage: "ratio" });
                }}
              />
            </>
          ) : null}
          {step === "font" ? (
            <>
              <PostText>{t("Which font do you prefer?", "أي خط تفضّل؟")}</PostText>
              <FontChoices value={design.font} onSelect={(font) => change({ ...design, font })} />
              <Button secondary disabled={!design.font} label={t("Confirm font", "تأكيد الخط")} onPress={() => change({ ...design, stage: "ratio" })} />
              <TextAction label={t("Change style", "تغيير الأسلوب")} onPress={() => change({ ...design, stage: "style" })} />
            </>
          ) : null}
          {step === "ratio" ? (
            <>
              <PostText>{t("Choose a format for your post.", "اختر مقاس المنشور.")}</PostText>
              <RatioChoices value={design.ratio} onSelect={(selected) => change({ ...design, ratio: selected })} />
              <PostText variant="meta" muted>
                {t("MARKOS recommends 4:5 for feed posts.", "يوصي ماركوس بمقاس ٤:٥ لمنشورات الخلاصة.")}
              </PostText>
              <Button secondary disabled={!design.ratio || !editable} label={t("Generate preview", "إنشاء المعاينة")} onPress={generate} />
              <TextAction label={t("Change font", "تغيير الخط")} onPress={() => change({ ...design, stage: "font" })} />
            </>
          ) : null}
        </View>
      ) : (
        <>
          <PostText>{design.artwork ? t("Here’s your post preview.", "إليك معاينة منشورك.") : t("Here’s your saved post.", "إليك منشورك المحفوظ.")}</PostText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Open full post preview", "فتح معاينة المنشور كاملة")}
            onPress={() => setModal("preview")}
          >
            <Image source={{ uri }} resizeMode="contain" style={{ width: "100%", aspectRatio: previewRatio, borderRadius: 14, backgroundColor: theme.card }} />
          </Pressable>
          {item.caption ? (
            <PostText variant="meta" numberOfLines={4} selectable>
              {item.caption}
            </PostText>
          ) : null}
          <View style={{ flexDirection: rtl ? "row-reverse" : "row", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {editable && design.artwork ? <TextAction icon={Pencil} disabled={!!busy} label={t("Edit", "تعديل")} onPress={openEditor} /> : null}
            <TextAction icon={Share2} disabled={!!busy} label={t("Share", "مشاركة")} onPress={share} />
          </View>
          {ratio === "3:4" ? (
            <PostText variant="meta" muted>
              {t("Share this 3:4 post manually. Choose 4:5 or 1:1 to publish with MARKOS.", "شارك منشور ٣:٤ يدوياً. اختر ٤:٥ أو ١:١ للنشر عبر ماركوس.")}
            </PostText>
          ) : null}
          {publishable && editable ? (
            <Button
              secondary
              disabled={!!busy || !item.caption.trim()}
              label={t("Mark ready", "اعتماد")}
              onPress={() => {
                void work(t("Saving your approval", "نحفظ موافقتك"), async () => accept(await api.updateContentStatus(id, "APPROVED", item.revision)));
              }}
            />
          ) : null}
          {publishable && item.status === "APPROVED" ? (
            <View style={{ gap: 8 }}>
              <Button disabled={!!busy} label={t("Publish with MARKOS", "النشر عبر ماركوس")} onPress={() => confirmPublish()} />
              <TextAction icon={CalendarDays} disabled={!!busy} label={t("Schedule", "جدولة")} onPress={() => setModal("schedule")} />
              {design.artwork ? (
                <TextAction
                  disabled={!!busy}
                  label={t("Return to draft to edit", "العودة إلى المسودة للتعديل")}
                  onPress={() => {
                    void work(t("Reopening your draft", "نُعيد فتح المسودة"), async () => {
                      accept(await api.updateContentStatus(id, "DRAFT", item.revision));
                      openEditor();
                    });
                  }}
                />
              ) : null}
            </View>
          ) : null}
          {item.status === "SCHEDULED" ? (
            <PostText variant="meta">
              {publication
                ? t("Publishing queued. Waiting for Instagram.", "النشر في قائمة الانتظار. ننتظر إنستغرام.")
                : item.scheduledAt
                  ? new Date(item.scheduledAt).toLocaleString(locale, { timeZone: "Asia/Bahrain", dateStyle: "medium", timeStyle: "short" })
                  : t("Scheduled", "مجدول")}
            </PostText>
          ) : null}
          {item.status === "PUBLISHED" ? <PostText variant="label">{t("Published on Instagram", "تم النشر على إنستغرام")}</PostText> : null}
          {item.status === "FAILED" ? (
            <>
              <Notice error>{t("Instagram couldn’t publish this post.", "تعذّر النشر على إنستغرام.")}</Notice>
              <TextAction
                label={t("Check publishing status", "التحقّق من حالة النشر")}
                onPress={() => router.push({ pathname: "/content/publication", params: { id } })}
              />
            </>
          ) : null}
        </>
      )}
      {error && modal !== "edit" && modal !== "schedule" ? <Notice error>{error}</Notice> : null}
      {modal === "edit" && uri && design.artwork ? (
        <PostEditor
          initial={design.artwork}
          caption={item.caption}
          uri={uri}
          busy={!!busy}
          error={error}
          onClose={() => setModal(null)}
          onSave={(artwork, caption) => {
            void work(t("Applying your edits", "نُطبّق تعديلاتك"), async () => {
              await renderAndSave(artwork, caption, item, design);
              setModal(null);
            });
          }}
        />
      ) : null}
      {modal === "preview" && uri ? (
        <Modal visible animationType="fade" onRequestClose={() => setModal(null)}>
          <View style={{ flex: 1, paddingTop: 58, paddingHorizontal: 18, backgroundColor: "#202020" }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("Close preview", "إغلاق المعاينة")}
              onPress={() => setModal(null)}
              style={{ padding: 12, alignSelf: "flex-end" }}
            >
              <X color="white" size={22} />
            </Pressable>
            <ScrollView contentContainerStyle={{ gap: 16, alignSelf: "center", width: "100%", maxWidth: 540 }}>
              <Image source={{ uri }} resizeMode="contain" style={{ width: "100%", aspectRatio: previewRatio, borderRadius: 12 }} />
              {item.caption ? (
                <PostText selectable style={{ color: "white" }}>
                  {item.caption}
                </PostText>
              ) : null}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
      {modal === "schedule" ? (
        <Sheet
          visible
          title={t("Schedule post", "جدولة المنشور")}
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <PlannedTime {...(schedule ? { value: schedule } : {})} disabled={!!busy} change={setSchedule} purpose="schedule" />
          {error ? <Notice error>{error}</Notice> : null}
          <Button
            disabled={!schedule || !!busy}
            label={t("Review schedule", "مراجعة الموعد")}
            onPress={() => {
              if (schedule) confirmPublish(schedule);
            }}
          />
        </Sheet>
      ) : null}
    </View>
  );
}
