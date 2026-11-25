import React, { useRef, useState } from "react";
import { Image, Modal, Pressable, ScrollView, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import { Check, Crop, Minus, Pencil, Plus, RotateCcw, Type, X, type LucideIcon } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Polyline } from "react-native-svg";
import type { PostArtwork } from "@markos/shared-types";
import { Button, Field, Notice } from "../ui";
import { useAppearance } from "../providers";
import { RatioChoices } from "./choices";
import { postRatiosByValue } from "./model";
import { postFlowLight, PostText } from "./theme";

export function PostEditor({
  initial,
  caption: initialCaption,
  uri,
  busy,
  error,
  onClose,
  onSave
}: {
  initial: PostArtwork;
  caption: string;
  uri: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (artwork: PostArtwork, caption: string) => void;
}) {
  const { t, rtl } = useAppearance();
  const { width, height } = useWindowDimensions();
  const [artwork, setArtwork] = useState(initial);
  const [caption, setCaption] = useState(initialCaption);
  const [tool, setTool] = useState<"text" | "markup" | "resize" | null>(null);
  const [layer, setLayer] = useState<"title" | "detail">("title");
  const [pendingStroke, setPendingStroke] = useState<PostArtwork["strokes"][number]>([]);
  const stroke = useRef<PostArtwork["strokes"][number]>([]);
  const imageRatio = postRatiosByValue[artwork.ratio];
  const size = Math.min(width - 36, height * 0.52 * imageRatio, 460);
  const frameHeight = size / imageRatio;
  function point(event: GestureResponderEvent) {
    return {
      x: Math.max(0, Math.min(1, event.nativeEvent.locationX / size)),
      y: Math.max(0, Math.min(1, event.nativeEvent.locationY / frameHeight))
    };
  }
  function finishStroke() {
    const finished = stroke.current;
    stroke.current = [];
    setPendingStroke([]);
    if (finished.length > 1) setArtwork((old) => ({ ...old, strokes: [...old.strokes, finished] }));
  }
  function icon(Icon: LucideIcon, label: string, onPress: () => void, checked = false) {
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: checked, disabled: busy }}
        disabled={busy}
        onPress={onPress}
        style={{ alignItems: "center", minWidth: 60, gap: 4 }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: checked ? postFlowLight.editSelection : "#F7F8FA",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Icon size={20} color="#202428" />
        </View>
        <PostText variant="meta" style={{ color: "#FFFFFF", textAlign: "center" }}>
          {label}
        </PostText>
      </Pressable>
    );
  }
  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "#202020" }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          scrollEnabled={tool !== "markup"}
          contentContainerStyle={{ padding: 18, gap: 14, alignSelf: "center", width: "100%", maxWidth: 520 }}
        >
          <View style={{ flexDirection: rtl ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <PostText variant="heading" style={{ color: "white" }}>
                {t("Edit post", "تعديل المنشور")}
              </PostText>
              <PostText variant="meta" style={{ color: "#C6C6C8" }}>
                {artwork.ratio}
              </PostText>
            </View>
            {icon(X, t("Close", "إغلاق"), onClose)}
          </View>
          <View style={{ borderRadius: 14, overflow: "hidden", alignSelf: "center", width: size, height: frameHeight, backgroundColor: "#101618" }}>
            <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            {tool === "text" ? (
              <View style={{ position: "absolute", bottom: 12, left: 14, right: 14, gap: 5 }}>
                {(["title", "detail"] as const).map((key) => (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: layer === key }}
                    onPress={() => setLayer(key)}
                    style={{
                      borderWidth: 1,
                      minHeight: 34,
                      justifyContent: "center",
                      backgroundColor: "#20202066",
                      borderColor: layer === key ? postFlowLight.editSelection : "#FFFFFF99",
                      paddingHorizontal: 8
                    }}
                  >
                    <PostText variant="meta" style={{ color: "#FFFFFF" }} numberOfLines={1}>
                      {artwork[key] || (key === "title" ? t("Title", "العنوان") : t("Details", "التفاصيل"))}
                    </PostText>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {tool === "markup" ? (
              <View
                style={{ position: "absolute", inset: 0 }}
                accessibilityLabel={t("Draw on artwork", "ارسم على التصميم")}
                onStartShouldSetResponder={() => !busy && artwork.strokes.length < 16}
                onResponderGrant={(e) => {
                  stroke.current = [point(e)];
                  setPendingStroke(stroke.current);
                }}
                onResponderMove={(e) => {
                  if (stroke.current.length >= 250) return;
                  stroke.current = [...stroke.current, point(e)];
                  setPendingStroke(stroke.current);
                }}
                onResponderRelease={finishStroke}
                onResponderTerminate={finishStroke}
              >
                <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
                  <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${frameHeight}`}>
                    {[...artwork.strokes.slice(initial.strokes.length), pendingStroke].map((line, index) =>
                      line.length > 1 ? (
                        <Polyline
                          key={index}
                          points={line.map((p) => `${p.x * size},${p.y * frameHeight}`).join(" ")}
                          stroke={postFlowLight.editSelection}
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      ) : null
                    )}
                  </Svg>
                </View>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: rtl ? "row-reverse" : "row", justifyContent: "space-evenly", flexWrap: "wrap", gap: 4 }}>
            {icon(Type, t("Edit box", "تعديل النص"), () => setTool("text"), tool === "text")}
            {icon(Minus, t("Remove", "إزالة"), () => {
              if (tool === "markup") setArtwork((old) => ({ ...old, strokes: old.strokes.slice(0, -1) }));
              else {
                setTool("text");
                setArtwork((old) => ({ ...old, [layer]: "" }));
              }
            })}
            {icon(Pencil, t("Markup", "رسم"), () => setTool(tool === "markup" ? null : "markup"), tool === "markup")}
            {icon(Crop, t("Resize", "تغيير المقاس"), () => setTool("resize"), tool === "resize")}
          </View>
          {tool === "text" ? (
            <>
              <Field
                label={layer === "title" ? t("Artwork title", "عنوان التصميم") : t("Artwork details", "تفاصيل التصميم")}
                value={artwork[layer]}
                maxLength={layer === "title" ? 100 : 190}
                editable={!busy}
                onChangeText={(value) => setArtwork((old) => ({ ...old, [layer]: value }))}
              />
              <Field
                label={t("Instagram caption", "نص منشور إنستغرام")}
                value={caption}
                maxLength={2200}
                multiline
                editable={!busy}
                onChangeText={setCaption}
              />
            </>
          ) : null}
          {tool === "resize" ? (
            <>
              <RatioChoices value={artwork.ratio} onSelect={(ratio) => setArtwork((old) => ({ ...old, ratio }))} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center" }}>
                {icon(Minus, t("Zoom out", "تصغير"), () => setArtwork((old) => ({ ...old, zoom: Math.max(1, old.zoom - 0.1) })))}
                <PostText style={{ color: "white" }}>{Math.round(artwork.zoom * 100)}%</PostText>
                {icon(Plus, t("Zoom in", "تكبير"), () => setArtwork((old) => ({ ...old, zoom: Math.min(2, old.zoom + 0.1) })))}
              </View>
            </>
          ) : null}
          {tool === "markup" ? (
            <Button
              secondary
              icon={RotateCcw}
              disabled={busy || !artwork.strokes.length}
              label={t("Undo last mark", "تراجع عن آخر رسم")}
              onPress={() => setArtwork((old) => ({ ...old, strokes: old.strokes.slice(0, -1) }))}
            />
          ) : null}
          {error ? <Notice error>{error}</Notice> : null}
          <Button icon={Check} busy={busy} disabled={busy} label={t("Apply edits", "تطبيق التعديلات")} onPress={() => onSave(artwork, caption)} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
