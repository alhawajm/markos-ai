import React from "react";
import { Pressable, View } from "react-native";
import { ArrowUpRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import type { WorkspaceAssistantArtifact } from "@markos/shared-types";
import { useAppearance } from "./providers";
import { Card, Row, Txt } from "./ui";
import { typeLabel } from "./content";
export function AssistantArtifact({ artifact }: { artifact: WorkspaceAssistantArtifact }) {
  const { t, locale, colors } = useAppearance(),
    router = useRouter();
  const campaign = artifact.kind === "CAMPAIGN",
    content = artifact.kind === "CONTENT";
  const label = campaign ? t("Campaign", "حملة") : content ? t("Content draft", "مسودة محتوى") : t("Strategy", "استراتيجية");
  const open = campaign ? t("Open campaign", "فتح الحملة") : content ? t("Open draft", "فتح المسودة") : t("Open strategy", "فتح الاستراتيجية");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${open}: ${artifact.title || label}`}
      onPress={() =>
        campaign
          ? router.push({ pathname: "/campaign/[id]", params: { id: artifact.id } })
          : content
            ? router.push({ pathname: "/content/[id]", params: { id: artifact.id } })
            : router.push({ pathname: "/strategy", params: { plan: artifact.id } })
      }
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <Card>
        <Txt variant="meta" muted>
          {label}
          {artifact.contentType ? ` · ${typeLabel(artifact.contentType, t)}` : ""}
        </Txt>
        <Txt variant="heading" numberOfLines={2}>
          {artifact.title || label}
        </Txt>
        {artifact.summary ? (
          <Txt muted numberOfLines={2}>
            {artifact.summary}
          </Txt>
        ) : null}
        {campaign ? (
          <Row style={{ flexWrap: "wrap", gap: 24 }}>
            {[
              [artifact.postCount, t("planned posts", "منشورًا مخططًا")],
              [artifact.durationDays, t("days", "أيام")],
              [artifact.publishesPerDay, t("per day", "يوميًا")]
            ].map(([value, label], i) =>
              typeof value === "number" ? (
                <View key={i}>
                  <Txt variant="heading">{value.toLocaleString(locale)}</Txt>
                  <Txt variant="meta" muted>
                    {label}
                  </Txt>
                </View>
              ) : null
            )}
          </Row>
        ) : null}
        {artifact.startsAt ? (
          <Txt variant="meta" muted>
            {new Date(artifact.startsAt).toLocaleDateString(locale, { timeZone: "Asia/Bahrain", dateStyle: "medium" })}
            {artifact.endsAt ? ` – ${new Date(artifact.endsAt).toLocaleDateString(locale, { timeZone: "Asia/Bahrain", dateStyle: "medium" })}` : ""}
          </Txt>
        ) : null}
        <Row>
          <Txt variant="label" style={{ color: colors.link }}>
            {open}
          </Txt>
          <ArrowUpRight size={18} color={colors.link} />
        </Row>
      </Card>
    </Pressable>
  );
}
