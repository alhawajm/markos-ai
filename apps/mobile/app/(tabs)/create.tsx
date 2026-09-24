import React, { useState } from "react";
import { RefreshControl, View } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { Clapperboard, Images, Palette, RectangleVertical } from "lucide-react-native";
import type { ContentType } from "@markos/shared-types";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Field, Loading, Notice, Row, Screen, Txt } from "../../src/ui";
import { ContentCard, QueryFailure, typeLabel } from "../../src/content";
import { errorMessage } from "../../src/errors";

export default function Create() {
  const { api, scope, queryClient } = useAccount();
  const { t, colors } = useAppearance();
  const focused = useIsFocused();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"drafts" | "ready" | "scheduled" | "published" | "all">("drafts");
  const router = useRouter();
  const result = useQuery({ queryKey: [scope, "content"], queryFn: () => api.contentItems(), enabled: focused, refetchInterval: 6000 });
  const create = useMutation({
    mutationFn: (contentType: ContentType) => api.createContent({ contentType }),
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: [scope, "content"] });
      router.push({ pathname: "/content/[id]", params: { id: item.id } });
    }
  });
  const drafts =
    result.data?.filter(
      (item) =>
        (filter === "all" ||
          (filter === "drafts"
            ? ["DRAFT", "IN_REVIEW", "IDEA", "FAILED"].includes(item.status)
            : item.status === { ready: "APPROVED", scheduled: "SCHEDULED", published: "PUBLISHED" }[filter])) &&
        `${item.brief ?? ""} ${item.caption}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    ) ?? [];
  return (
    <Screen refreshControl={<RefreshControl refreshing={result.isRefetching} onRefresh={() => void result.refetch()} tintColor={colors.accent} />}>
      <Txt variant="title">{t("Create", "إنشاء")}</Txt>
      <Txt muted>{t("Make something your audience will care about.", "اصنع محتوى يهم جمهورك.")}</Txt>
      <Txt variant="heading">{t("Start with a format", "ابدأ بنوع المحتوى")}</Txt>
      <Row style={{ flexWrap: "wrap" }}>
        {(["POST", "REEL", "CAROUSEL", "STORY"] as const).map((type) => (
          <View key={type} style={{ flexBasis: "40%", flexGrow: 1 }}>
            <Button
              key={type}
              secondary
              icon={type === "REEL" ? Clapperboard : type === "CAROUSEL" ? Images : type === "STORY" ? RectangleVertical : Palette}
              label={typeLabel(type, t)}
              disabled={create.isPending}
              busy={create.isPending && create.variables === type}
              onPress={() => create.mutate(type)}
            />
          </View>
        ))}
      </Row>
      <Button secondary label={t("Choose an idea from a campaign", "اختيار فكرة من حملة")} onPress={() => router.push("/(tabs)/campaigns")} />
      {create.isError ? <Notice error>{errorMessage(create.error, t)}</Notice> : null}
      <Txt variant="heading">{t("Your content", "محتواك")}</Txt>
      <Field label={t("Search content", "البحث في المحتوى")} value={search} onChangeText={setSearch} />
      <Row style={{ flexWrap: "wrap" }}>
        {(["drafts", "ready", "scheduled", "published", "all"] as const).map((key) => (
          <Button
            key={key}
            secondary={filter !== key}
            label={
              key === "drafts"
                ? t("Drafts", "المسودات")
                : key === "ready"
                  ? t("Ready", "جاهز")
                  : key === "scheduled"
                    ? t("Scheduled", "مجدول")
                    : key === "published"
                      ? t("Published", "منشور")
                      : t("All", "الكل")
            }
            onPress={() => setFilter(key)}
          />
        ))}
      </Row>
      {result.isPending ? (
        <Loading />
      ) : result.isError ? (
        <QueryFailure
          error={result.error}
          retry={() => {
            void result.refetch();
          }}
        />
      ) : drafts.length === 0 ? (
        <Card tone="tint">
          <Txt>
            {t(
              "No content matches this view. Try another filter, start with a format above or prepare a campaign idea.",
              "لا يوجد محتوى مطابق. جرّب مرشحًا آخر أو ابدأ بنوع محتوى أعلاه أو أعدّ فكرة من حملة."
            )}
          </Txt>
        </Card>
      ) : (
        drafts.map((item) => <ContentCard key={item.id} item={item} />)
      )}
    </Screen>
  );
}
