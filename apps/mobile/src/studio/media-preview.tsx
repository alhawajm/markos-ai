import React, { useState } from "react";
import { AppState, Image, View, Pressable, useWindowDimensions } from "react-native";
import { Maximize2 } from "lucide-react-native";
import { useFocusEffect } from "expo-router";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import type { MediaAssetRecord } from "@markos/shared-types";
import { useAppearance } from "../providers";
import { Button, IconButton, Notice, Txt } from "../ui";
import { MediaViewer } from "./media-viewer";

export function MediaPreview({
  asset,
  portrait = false,
  gallery,
  canvas = false
}: {
  asset: MediaAssetRecord;
  portrait?: boolean;
  gallery?: MediaAssetRecord[];
  canvas?: boolean;
}) {
  const { colors, t } = useAppearance();
  const { height } = useWindowDimensions();
  const ratio = asset.width && asset.height ? asset.width / asset.height : portrait ? 9 / 16 : 4 / 5;
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  if (asset.mimeType === "video/mp4")
    return (
      <>
        <VideoPreview key={asset.publicUrl} uri={asset.publicUrl} canvas={canvas} ratio={ratio} onExpand={() => setOpen(true)} />
        {open ? <MediaViewer assets={gallery ?? [asset]} initialId={asset.id} onClose={() => setOpen(false)} /> : null}
      </>
    );
  if (failed)
    return <Notice error>{t("Couldn’t load this image. Reopen the draft to try again.", "تعذّر تحميل الصورة. أعد فتح المسودة للمحاولة مجددًا.")}</Notice>;
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={t("Open full-size image", "فتح الصورة بالحجم الكامل")} onPress={() => setOpen(true)}>
        <Image
          source={{ uri: asset.publicUrl }}
          accessibilityLabel={asset.filename}
          resizeMode="contain"
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            aspectRatio: canvas ? ratio : portrait ? 9 / 16 : ratio,
            maxHeight: canvas ? Math.max(240, Math.min(height * 0.65, 760)) : 380,
            borderRadius: 16,
            backgroundColor: colors.surfaceMuted
          }}
        />
      </Pressable>
      {canvas ? (
        <View style={{ position: "absolute", top: 8, end: 8, backgroundColor: colors.surface, borderRadius: 12 }}>
          <IconButton icon={Maximize2} label={t("Open full-size media", "فتح الوسائط بالحجم الكامل")} onPress={() => setOpen(true)} />
        </View>
      ) : null}
      {open ? <MediaViewer assets={gallery ?? [asset]} initialId={asset.id} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}
function VideoPreview({ uri, onExpand, canvas, ratio }: { uri: string; onExpand: () => void; canvas: boolean; ratio: number }) {
  const { colors, t } = useAppearance();
  const { height } = useWindowDimensions();
  const player = useVideoPlayer(uri, (player) => {
    player.loop = true;
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useFocusEffect(
    React.useCallback(() => {
      const listener = AppState.addEventListener("change", (state) => {
        if (state !== "active") player.pause();
      });
      return () => {
        listener.remove();
        player.pause();
      };
    }, [player])
  );
  return (
    <View style={{ gap: 8 }}>
      <View style={{ alignItems: "center", borderRadius: 16, backgroundColor: colors.surfaceMuted, overflow: "hidden" }}>
        <VideoView
          player={player}
          nativeControls
          contentFit="contain"
          style={canvas ? { width: "100%", aspectRatio: ratio, maxHeight: Math.max(240, Math.min(height * 0.65, 760)) } : { width: "100%", height: 340 }}
        />
        {canvas ? (
          <View style={{ position: "absolute", top: 8, end: 8, backgroundColor: colors.surface, borderRadius: 12 }}>
            <IconButton
              icon={Maximize2}
              label={t("Open full-size Reel", "فتح الريل بالحجم الكامل")}
              onPress={() => {
                player.pause();
                onExpand();
              }}
            />
          </View>
        ) : null}
      </View>
      {!canvas ? (
        <Button
          secondary
          label={t("Open full-size Reel", "فتح الريل بالحجم الكامل")}
          onPress={() => {
            player.pause();
            onExpand();
          }}
        />
      ) : null}
      {status === "error" ? (
        <>
          <Notice error>{t("The Reel couldn’t be loaded. Check your connection.", "تعذّر تحميل الريل. تحقّق من اتصالك.")}</Notice>
          <Button
            secondary
            label={t("Reload Reel", "إعادة تحميل الريل")}
            onPress={() => {
              void player.replaceAsync(uri).catch(() => {});
            }}
          />
        </>
      ) : null}
      {status === "loading" ? <Txt muted>{t("Loading Reel…", "جارٍ تحميل الريل…")}</Txt> : null}
    </View>
  );
}
