import React from "react";
import { Linking, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Clapperboard, Images, Palette } from "lucide-react-native";
import type { ContentRecord } from "@markos/shared-types";
import { config } from "./config";
import { useAppearance } from "./providers";
import { Button, Card, Notice, Row, Txt } from "./ui";
import { errorMessage } from "./errors";

export function statusLabel(status: string, t: (en: string, ar: string) => string) {
  const labels: Record<string, [string, string]> = {
    REVIEW: ["In review", "قيد المراجعة"],
    APPROVED: ["Approved", "معتمدة"],
    ACTIVE: ["Active", "نشطة"],
    COMPLETED: ["Completed", "مكتملة"],
    ARCHIVED: ["Archived", "مؤرشفة"],
    IDEA: ["Idea", "فكرة"],
    DRAFT: ["Draft", "مسودة"],
    IN_REVIEW: ["In review", "قيد المراجعة"],
    READY: ["Ready", "جاهز"],
    SCHEDULED: ["Scheduled", "مجدول"],
    PUBLISHED: ["Published", "منشور"],
    FAILED: ["Needs attention", "يحتاج انتباهك"]
  };
  const label = labels[status];
  return label ? t(...label) : status;
}
export function StatusBadge({ status }: { status: string }) {
  const { colors, t } = useAppearance();
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 999, backgroundColor: colors.surfaceMuted, paddingVertical: 4, paddingHorizontal: 10 }}>
      <Txt variant="meta" style={{ color: status === "APPROVED" ? colors.statusReady : status === "SCHEDULED" ? colors.statusScheduled : colors.textSoft }}>
        {status === "APPROVED" ? t("Ready", "جاهز") : statusLabel(status, t)}
      </Txt>
    </View>
  );
}
export function typeLabel(type: string, t: (en: string, ar: string) => string) {
  return type === "REEL" ? t("Reel", "ريل") : type === "CAROUSEL" ? t("Carousel", "منشور متعدد") : t("Post", "منشور");
}
export function ContentCard({ item }: { item: ContentRecord }) {
  const { colors, locale, t } = useAppearance();
  const router = useRouter();
  const Icon = item.contentType === "REEL" ? Clapperboard : item.contentType === "CAROUSEL" ? Images : Palette;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/content/[id]", params: { id: item.id } })}>
      <Card>
        <Row style={{ alignItems: "flex-start" }}>
          <View style={{ backgroundColor: colors.secondarySoft, padding: 12, borderRadius: 12 }}>
            <Icon color={colors.accent} size={24} strokeWidth={1.5} />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Txt variant="label" numberOfLines={2} style={{ fontSize: 16 }}>
              {item.brief?.split("\n")[0] || item.caption || typeLabel(item.contentType, t)}
            </Txt>
            <Txt variant="meta" muted>
              {typeLabel(item.contentType, t)}
              {item.scheduledAt
                ? ` · ${new Date(item.scheduledAt).toLocaleString(locale, { timeZone: "Asia/Bahrain", dateStyle: "medium", timeStyle: "short" })}`
                : ""}
            </Txt>
            <StatusBadge status={item.status} />
          </View>
        </Row>
      </Card>
    </Pressable>
  );
}
export function QueryFailure({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useAppearance();
  return (
    <>
      <Notice error>{errorMessage(error, t)}</Notice>
      <Button secondary label={t("Try again", "حاول مجددًا")} onPress={retry} />
    </>
  );
}
export function WebButton({ label, path }: { label: string; path: string }) {
  const { locale, t } = useAppearance();
  const [error, setError] = React.useState(false);
  return (
    <>
      {error ? <Notice error>{t("Couldn’t open your browser. Try again.", "تعذّر فتح المتصفح. حاول مجددًا.")}</Notice> : null}
      <Button
        secondary
        label={label}
        onPress={() => {
          void Linking.openURL(`${config.webUrl}/${locale}/${path}`).catch(() => setError(true));
        }}
      />
    </>
  );
}
