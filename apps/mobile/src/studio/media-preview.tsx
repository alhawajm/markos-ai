import React, { useState } from "react";
import { AppState, Image, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import type { MediaAssetRecord } from "@markos/shared-types";
import { useAppearance } from "../providers";
import { Button, Notice, Txt } from "../ui";

export function MediaPreview({ asset, portrait = false }: { asset: MediaAssetRecord; portrait?: boolean }) {
  const { colors, t } = useAppearance();
  const [failed, setFailed] = useState(false);
  if (asset.mimeType === "video/mp4") return <VideoPreview key={asset.publicUrl} uri={asset.publicUrl} />;
  if (failed)
    return <Notice error>{t("Couldn’t load this image. Reopen the draft to try again.", "تعذّر تحميل الصورة. أعد فتح المسودة للمحاولة مجددًا.")}</Notice>;
  return (
    <Image
      source={{ uri: asset.publicUrl }}
      accessibilityLabel={asset.filename}
      resizeMode="contain"
      onError={() => setFailed(true)}
      style={{
        width: "100%",
        aspectRatio: portrait ? 9 / 16 : asset.width && asset.height ? asset.width / asset.height : 4 / 5,
        maxHeight: 380,
        borderRadius: 16,
        backgroundColor: colors.surfaceMuted
      }}
    />
  );
}
function VideoPreview({ uri }: { uri: string }) {
  const { colors, t } = useAppearance();
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
        <VideoView player={player} nativeControls contentFit="contain" style={{ width: "100%", height: 340 }} />
      </View>
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
