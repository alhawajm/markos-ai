import React, { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useQuery } from "@tanstack/react-query";
import { useIsFocused } from "expo-router/react-navigation";
import { ArrowDown, ArrowUp, FolderOpen, Plus, Sparkles, Trash2, Upload } from "lucide-react-native";
import type { ContentAuthoringOperation, ContentMediaItemRecord, ContentRecord, MediaAssetRecord } from "@markos/shared-types";
import { useAccount, useAppearance } from "../providers";
import { Button, Card, Field, IconButton, Notice, Row, Txt } from "../ui";
import { MediaPreview } from "./media-preview";
import { MotionReel } from "./motion-reel";
import { generationActive } from "./model";
import { errorMessage, LocalAppError } from "../errors";

export function StudioMedia({
  item,
  editable,
  busy,
  edit,
  save,
  accept,
  run
}: {
  item: ContentRecord;
  editable: boolean;
  busy: boolean;
  edit: (id: string, fields: Partial<ContentMediaItemRecord>) => void;
  save: () => Promise<ContentRecord>;
  accept: (item: ContentRecord) => void;
  run: (work: () => Promise<void>) => Promise<void>;
}) {
  const { api, scope, queryClient } = useAccount();
  const focused = useIsFocused();
  const { t, colors } = useAppearance();
  const [libraryTarget, setLibraryTarget] = useState<string | null>(null);
  const assets = useQuery({ queryKey: [scope, "media"], queryFn: () => api.mediaAssets() });
  const capabilities = useQuery({ queryKey: [scope, "video-capabilities"], queryFn: () => api.videoCapabilities() });
  const jobResult = useQuery({
    enabled: focused,
    queryKey: [scope, "video-job", item.id],
    queryFn: () => api.latestMediaGenerationJob(item.id),
    refetchInterval: (query) => (generationActive(query.state.data?.status) ? 2500 : 6000)
  });
  const job = jobResult.data;
  const active = generationActive(job?.status);
  useEffect(() => {
    if (job?.status === "COMPLETED") {
      void queryClient.invalidateQueries({ queryKey: [scope, "media"] });
      void queryClient.invalidateQueries({ queryKey: [scope, "content", item.id] });
    }
  }, [job?.id, job?.status]);
  const video = item.contentType === "REEL" || item.contentType === "STORY";
  const locked = !editable || busy || active;
  async function mutate(operations: ContentAuthoringOperation[]) {
    await run(async () => {
      const saved = await save();
      accept(await api.mutateContent(item.id, { expectedRevision: saved.revision, operations }));
    });
  }
  async function attach(target: string, asset: MediaAssetRecord) {
    const saved = await save();
    accept(await api.attachMediaToContent(item.id, { contentMediaItemId: target, mediaAssetId: asset.id, expectedRevision: saved.revision }));
    setLibraryTarget(null);
  }
  async function upload(target: string) {
    await run(async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: video ? ["video/mp4"] : ["image/jpeg"], copyToCacheDirectory: true });
      if (picked.canceled) return;
      const file = picked.assets[0]!;
      const local = new File(file.uri);
      if (!local.size || local.size > 8_000_000) throw new LocalAppError(t("Choose a file no larger than 8 MB.", "اختر ملفًا لا يتجاوز ٨ ميغابايت."));
      const asset = await api.uploadMedia({
        type: video ? "VIDEO" : "IMAGE",
        filename: file.name,
        mimeType: video ? "video/mp4" : "image/jpeg",
        base64Data: await local.base64()
      });
      await queryClient.invalidateQueries({ queryKey: [scope, "media"] });
      await attach(target, asset);
    });
  }
  async function generate(target: string) {
    await run(async () => {
      const saved = await save();
      const input = { contentMediaItemId: target, expectedRevision: saved.revision };
      if (video) {
        const next = await api.generateContentVideo(item.id, input);
        queryClient.setQueryData([scope, "video-job", item.id], next);
      } else {
        await api.generateContentImage(item.id, input);
        await queryClient.invalidateQueries({ queryKey: [scope, "media"] });
      }
      accept(await api.contentItem(item.id));
    });
  }
  return (
    <View style={{ gap: 20 }}>
      {assets.isError ? <Notice error>{errorMessage(assets.error, t)}</Notice> : null}
      {item.mediaItems.map((media, index) => {
        const asset = assets.data?.find((asset) => asset.id === media.mediaAssetId);
        return (
          <Card key={media.id}>
            <Row>
              <Txt variant="heading" style={{ flex: 1 }}>
                {item.contentType === "CAROUSEL" ? `${t("Slide", "الشريحة")} ${index + 1}` : t("Media", "الوسائط")}
              </Txt>
              {item.contentType === "CAROUSEL" && editable ? (
                <>
                  <IconButton
                    icon={ArrowUp}
                    label={t("Move slide earlier", "تقديم الشريحة")}
                    disabled={locked || index === 0}
                    onPress={() => {
                      const ids = item.mediaItems.map((x) => x.id);
                      [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
                      void mutate([{ type: "reorderMediaItems", orderedIds: ids }]);
                    }}
                  />
                  <IconButton
                    icon={ArrowDown}
                    label={t("Move slide later", "تأخير الشريحة")}
                    disabled={locked || index === item.mediaItems.length - 1}
                    onPress={() => {
                      const ids = item.mediaItems.map((x) => x.id);
                      [ids[index], ids[index + 1]] = [ids[index + 1]!, ids[index]!];
                      void mutate([{ type: "reorderMediaItems", orderedIds: ids }]);
                    }}
                  />
                </>
              ) : null}
            </Row>
            {asset ? (
              <MediaPreview asset={asset} portrait={video} />
            ) : (
              <View style={{ backgroundColor: colors.surfaceMuted, padding: 32, borderRadius: 16 }}>
                <Txt muted>
                  {media.mediaAssetId
                    ? t("Loading attached media…", "جارٍ تحميل الوسائط المرفقة…")
                    : t("Give MARKOS a visual direction, or choose your own media.", "حدّد التوجّه البصري لماركوس أو اختر وسائطك.")}
                </Txt>
              </View>
            )}
            {editable ? (
              <>
                {item.contentType === "CAROUSEL" ? (
                  <>
                    <Field
                      label={t("Slide title", "عنوان الشريحة")}
                      value={media.title ?? ""}
                      maxLength={160}
                      editable={!locked}
                      onChangeText={(title) => edit(media.id, { title })}
                    />
                    <Field
                      label={t("Slide copy", "نص الشريحة")}
                      value={media.body ?? ""}
                      maxLength={800}
                      multiline
                      editable={!locked}
                      onChangeText={(body) => edit(media.id, { body })}
                    />
                  </>
                ) : null}
                <Field
                  label={video ? t("Visual direction and on-screen wording", "التوجّه البصري والنص على الشاشة") : t("Visual direction", "التوجّه البصري")}
                  value={media.visualDirection ?? ""}
                  maxLength={2000}
                  multiline
                  style={{ minHeight: 120 }}
                  editable={!locked}
                  onChangeText={(visualDirection) => edit(media.id, { visualDirection })}
                  hint={
                    video
                      ? t(
                          "Include the exact English or Arabic wording in quotes. Review the generated Reel before marking ready.",
                          "ضع النص الإنجليزي أو العربي المطلوب بين علامتَي اقتباس. راجع الريل قبل اعتماده."
                        )
                      : undefined
                  }
                />
                {video ? (
                  <Row>
                    {[4, 8, 12].map((seconds) => (
                      <View key={seconds} style={{ flex: 1 }}>
                        <Button
                          secondary={(media.generationDurationSeconds ?? 8) !== seconds}
                          disabled={locked}
                          label={`${seconds} ${t("sec", "ث")}`}
                          onPress={() => edit(media.id, { generationDurationSeconds: seconds, aspectRatio: "VERTICAL" })}
                        />
                      </View>
                    ))}
                  </Row>
                ) : (
                  <Row>
                    {(["SQUARE", "PORTRAIT"] as const).map((ratio) => (
                      <View key={ratio} style={{ flex: 1 }}>
                        <Button
                          secondary={(media.aspectRatio ?? "PORTRAIT") !== ratio}
                          label={ratio === "SQUARE" ? "1:1" : "4:5"}
                          disabled={locked}
                          onPress={() => edit(media.id, { aspectRatio: ratio })}
                        />
                      </View>
                    ))}
                  </Row>
                )}
                {video ? (
                  <MotionReel
                    key={media.id}
                    disabled={locked}
                    duration={media.generationDurationSeconds ?? 8}
                    assets={assets.data ?? []}
                    generate={async (motion) => {
                      await run(async () => {
                        const saved = await save();
                        const next = await api.generateContentVideo(saved.id, { contentMediaItemId: media.id, expectedRevision: saved.revision, motion });
                        queryClient.setQueryData([scope, "video-job", item.id], next);
                        accept(await api.contentItem(saved.id));
                      });
                    }}
                  />
                ) : null}
                {!video || capabilities.data?.generatedFootage ? (
                  <Button
                    icon={Sparkles}
                    label={
                      video
                        ? t("Generate AI footage", "توليد مشاهد بالذكاء الاصطناعي")
                        : asset
                          ? t("Generate a replacement", "إنشاء بديل")
                          : t("Generate", "إنشاء")
                    }
                    disabled={locked || (media.visualDirection?.trim().length ?? 0) < 3}
                    onPress={() => {
                      void generate(media.id);
                    }}
                  />
                ) : null}
                <Row>
                  <View style={{ flex: 1 }}>
                    <Button
                      secondary
                      icon={Upload}
                      label={t("Upload", "رفع")}
                      disabled={locked}
                      onPress={() => {
                        void upload(media.id);
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      secondary
                      icon={FolderOpen}
                      label={t("Library", "المكتبة")}
                      disabled={locked}
                      onPress={() => setLibraryTarget(libraryTarget === media.id ? null : media.id)}
                    />
                  </View>
                </Row>
                <Txt variant="meta" muted>
                  {video ? t("MP4 · up to 8 MB", "MP4 · حتى ٨ ميغابايت") : t("JPEG · up to 8 MB", "JPEG · حتى ٨ ميغابايت")}
                </Txt>
                {item.contentType === "CAROUSEL" ? (
                  <Button
                    secondary
                    icon={Trash2}
                    disabled={locked}
                    label={t("Remove slide", "إزالة الشريحة")}
                    onPress={() =>
                      Alert.alert(t("Remove this slide?", "إزالة هذه الشريحة؟"), t("Its media stays in your library.", "ستبقى وسائطها في مكتبتك."), [
                        { text: t("Keep", "إبقاء"), style: "cancel" },
                        {
                          text: t("Remove", "إزالة"),
                          style: "destructive",
                          onPress: () => {
                            void mutate([{ type: "removeMediaItem", itemId: media.id }]);
                          }
                        }
                      ])
                    }
                  />
                ) : null}
              </>
            ) : null}
            {libraryTarget === media.id ? (
              <Card tone="tint">
                <Txt variant="heading">{t("Choose from your library", "اختر من مكتبتك")}</Txt>
                {(assets.data ?? [])
                  .filter((asset) => asset.mimeType === (video ? "video/mp4" : "image/jpeg"))
                  .map((asset) => (
                    <Button
                      key={asset.id}
                      secondary
                      disabled={locked}
                      label={asset.filename}
                      onPress={() => {
                        void run(() => attach(media.id, asset));
                      }}
                    />
                  ))}
                {!assets.data?.some((asset) => asset.mimeType === (video ? "video/mp4" : "image/jpeg")) ? (
                  <Txt muted>{t("No matching media yet.", "لا توجد وسائط مناسبة بعد.")}</Txt>
                ) : null}
                <Button secondary label={t("Close library", "إغلاق المكتبة")} onPress={() => setLibraryTarget(null)} />
              </Card>
            ) : null}
          </Card>
        );
      })}
      {editable && (item.mediaItems.length === 0 || (item.contentType === "CAROUSEL" && item.mediaItems.length < 10)) ? (
        <Button
          secondary
          icon={Plus}
          label={item.contentType === "CAROUSEL" ? t("Add slide", "إضافة شريحة") : t("Add media", "إضافة وسائط")}
          disabled={locked}
          onPress={() => {
            void mutate([
              {
                type: "addMediaItem",
                fields: { mediaKind: video ? "VIDEO" : "IMAGE", aspectRatio: video ? "VERTICAL" : "PORTRAIT", generationDurationSeconds: video ? 8 : null }
              }
            ]);
          }}
        />
      ) : null}
      {job ? (
        <Card tone={job.status === "FAILED" ? "warning" : "tint"}>
          <Txt variant="heading">
            {active
              ? t("Generating your Reel", "جارٍ إنشاء الريل")
              : job.status === "COMPLETED"
                ? t("Reel generation complete", "اكتمل إنشاء الريل")
                : job.status === "CANCELLED"
                  ? t("Generation cancelled", "تم إلغاء الإنشاء")
                  : t("Reel generation needs attention", "يتطلب إنشاء الريل انتباهك")}
          </Txt>
          {active ? (
            <>
              <Txt>
                {t("You can leave this screen. We’ll keep the result with this draft.", "يمكنك مغادرة هذه الشاشة. سنحفظ النتيجة مع هذه المسودة.")}{" "}
                {job.progress}%
              </Txt>
              <Button
                secondary
                disabled={busy}
                label={t("Cancel generation", "إلغاء الإنشاء")}
                onPress={() => {
                  void run(async () => {
                    queryClient.setQueryData([scope, "video-job", item.id], await api.cancelMediaGeneration(job.id));
                  });
                }}
              />
            </>
          ) : null}
          {job.status === "FAILED" ? (
            <>
              <Txt>{t("Review the direction and try again, or upload your own video.", "راجع التوجّه وحاول مجددًا أو ارفع فيديو من جهازك.")}</Txt>
              {job.errorCode === "AI_VIDEO_START_RESULT_UNKNOWN" ? (
                <Notice>
                  {t(
                    "The provider may have started the previous video. A new attempt can incur another charge.",
                    "ربما بدأ المزوّد إنشاء الفيديو السابق. قد تترتّب تكلفة إضافية على محاولة جديدة."
                  )}
                </Notice>
              ) : null}
              <Button
                secondary
                disabled={busy || !editable}
                label={t("Retry Reel", "إعادة محاولة الريل")}
                onPress={() => {
                  void run(async () => {
                    const saved = await save();
                    queryClient.setQueryData([scope, "video-job", item.id], await api.retryMediaGeneration(job.id, saved.revision));
                    accept(await api.contentItem(item.id));
                  });
                }}
              />
            </>
          ) : null}
          {job.status === "COMPLETED" && !item.mediaItems.some((media) => media.mediaAssetId === job.outputMediaAssetId) ? (
            <Txt>
              {t("The draft changed during generation. Your video is available in the library.", "تغيّرت المسودة أثناء الإنشاء. الفيديو متاح في المكتبة.")}
            </Txt>
          ) : null}
        </Card>
      ) : null}
      {jobResult.isError ? <Notice error>{errorMessage(jobResult.error, t)}</Notice> : null}
    </View>
  );
}
