import React, { useEffect, useState } from "react";
import { AppState, Image, Modal, ScrollView, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import type { MediaAssetRecord } from "@markos/shared-types";
import { useAppearance } from "../providers";
import { Button, IconButton, Notice, Row, Txt } from "../ui";

export function MediaViewer({ assets, initialId, onClose }: { assets: MediaAssetRecord[]; initialId: string; onClose: () => void }) {
  const { colors, t } = useAppearance(),
    { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(
      Math.max(
        0,
        assets.findIndex((asset) => asset.id === initialId)
      )
    ),
    [zoom, setZoom] = useState(false),
    [failed, setFailed] = useState(false);
  const asset = assets[Math.min(index, assets.length - 1)];
  if (!asset) return null;
  const video = asset.mimeType.startsWith("video/"),
    availableWidth = Math.max(160, width - 24),
    availableHeight = Math.max(200, height - 180);
  const ratio = asset.width && asset.height ? asset.width / asset.height : 4 / 5;
  const fitWidth = Math.min(availableWidth, availableHeight * ratio),
    imageWidth = fitWidth * (zoom ? 2 : 1),
    imageHeight = imageWidth / ratio;
  function move(next: number) {
    setIndex(next);
    setZoom(false);
    setFailed(false);
  }
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background }} accessibilityViewIsModal>
        <Row style={{ paddingHorizontal: 8, minHeight: 56 }}>
          <IconButton icon={X} label={t("Close full-size view", "إغلاق العرض")} onPress={onClose} />
          <Txt numberOfLines={1} style={{ flex: 1 }}>
            {asset.filename}
          </Txt>
          {!video ? (
            <IconButton
              icon={zoom ? ZoomOut : ZoomIn}
              label={zoom ? t("Fit to screen", "ملاءمة الشاشة") : t("Zoom in", "تكبير")}
              onPress={() => setZoom(!zoom)}
            />
          ) : null}
        </Row>
        {failed ? (
          <Notice error>{t("Couldn’t load this media. Close and try again.", "تعذّر تحميل الوسائط. أغلق العرض وحاول مجددًا.")}</Notice>
        ) : video ? (
          <FullVideo key={asset.id} uri={asset.publicUrl} height={availableHeight} />
        ) : (
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={zoom}
            contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
          >
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={zoom}
              minimumZoomScale={1}
              maximumZoomScale={4}
              centerContent
              contentContainerStyle={{ minHeight: availableHeight, minWidth: availableWidth, alignItems: "center", justifyContent: "center" }}
            >
              <Image
                source={{ uri: asset.publicUrl }}
                accessibilityLabel={asset.filename}
                resizeMode="contain"
                style={{ width: imageWidth, height: imageHeight }}
                onError={() => setFailed(true)}
              />
            </ScrollView>
          </ScrollView>
        )}
        <Row style={{ justifyContent: "center", padding: 8 }}>
          {assets.length > 1 ? (
            <IconButton icon={ChevronLeft} label={t("Previous media", "الوسائط السابقة")} disabled={index === 0} onPress={() => move(index - 1)} />
          ) : null}
          <Txt variant="meta" muted>
            {index + 1} / {assets.length}
          </Txt>
          {assets.length > 1 ? (
            <IconButton icon={ChevronRight} label={t("Next media", "الوسائط التالية")} disabled={index === assets.length - 1} onPress={() => move(index + 1)} />
          ) : null}
        </Row>
      </SafeAreaView>
    </Modal>
  );
}
function FullVideo({ uri, height }: { uri: string; height: number }) {
  const player = useVideoPlayer(uri),
    { colors, t } = useAppearance();
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") player.pause();
    });
    return () => {
      listener.remove();
      player.pause();
    };
  }, [player]);
  return (
    <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
      <VideoView player={player} nativeControls contentFit="contain" style={{ width: "100%", height }} />
      {status === "loading" ? <Txt muted>{t("Loading Reel…", "جارٍ تحميل الريل…")}</Txt> : null}
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
    </View>
  );
}
