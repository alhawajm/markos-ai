import React, { useState } from "react";
import { RefreshControl } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { ChevronDown, Clapperboard, Images, Palette, Plus, RectangleVertical, Target } from "lucide-react-native";
import type { ContentType } from "@markos/shared-types";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Field, ListGroup, ListRow, Loading, Notice, Row, Screen, Sheet, TextAction, TitleBar, Txt } from "../../src/ui";
import { ContentCard, QueryFailure, typeLabel } from "../../src/content";
import { errorMessage } from "../../src/errors";

export default function Create() {
  const { api, scope, queryClient } = useAccount();
  const { t, colors } = useAppearance();
  const focused = useIsFocused();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"drafts" | "ready" | "scheduled" | "published" | "all">("drafts");
  const [panel, setPanel] = useState<"new" | "filter" | null>(null);
  const filters = [
    { value: "drafts", label: t("Drafts", "المسودات") },
    { value: "ready", label: t("Ready", "جاهز") },
    { value: "scheduled", label: t("Scheduled", "مجدول") },
    { value: "published", label: t("Published", "منشور") },
    { value: "all", label: t("All", "الكل") }
  ] as const;
  const router = useRouter();
  const result = useQuery({ queryKey: [scope, "content"], queryFn: () => api.contentItems(), enabled: focused, refetchInterval: 6000 });
  const create = useMutation({
    mutationFn: (contentType: ContentType) => api.createContent({ contentType }),
    onSuccess: async (item) => {
      setPanel(null);
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
      <TitleBar title={t("Create", "إنشاء")} />
      <Button icon={Plus} label={t("New content", "محتوى جديد")} onPress={() => setPanel("new")} />
      <Row style={{ justifyContent: "space-between" }}>
        <Txt variant="heading">{t("Your content", "محتواك")}</Txt>
        <TextAction icon={ChevronDown} label={filters.find((option) => option.value === filter)!.label} onPress={() => setPanel("filter")} />
      </Row>
      <Field label={t("Search content", "البحث في المحتوى")} value={search} onChangeText={setSearch} />
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
          <Txt>{t("No content here yet. Start something new or choose another filter.", "لا يوجد محتوى هنا بعد. ابدأ محتوى جديدًا أو اختر مرشحًا آخر.")}</Txt>
        </Card>
      ) : (
        drafts.map((item) => <ContentCard key={item.id} item={item} />)
      )}
      <Sheet
        title={t("New content", "محتوى جديد")}
        visible={panel === "new"}
        onClose={() => {
          if (!create.isPending) setPanel(null);
        }}
      >
        <ListGroup>
          {(["POST", "CAROUSEL", "REEL", "STORY"] as const).map((type, index) => (
            <ListRow
              key={type}
              icon={type === "REEL" ? Clapperboard : type === "CAROUSEL" ? Images : type === "STORY" ? RectangleVertical : Palette}
              label={typeLabel(type, t)}
              detail={
                type === "POST"
                  ? t("One image and a caption", "صورة ونص")
                  : type === "CAROUSEL"
                    ? t("A sequence of slides", "مجموعة شرائح")
                    : type === "REEL"
                      ? t("A short video", "فيديو قصير")
                      : t("An image or video Story", "قصة بصورة أو فيديو")
              }
              disabled={create.isPending}
              last={index === 3}
              onPress={() => create.mutate(type)}
            />
          ))}
        </ListGroup>
        {create.isPending ? <Loading /> : null}
        {create.isError ? <Notice error>{errorMessage(create.error, t)}</Notice> : null}
        <ListRow
          icon={Target}
          last
          label={t("Choose an idea from a campaign", "اختيار فكرة من حملة")}
          onPress={() => {
            setPanel(null);
            router.push("/(tabs)/campaigns");
          }}
        />
      </Sheet>
      <Sheet title={t("Show content", "عرض المحتوى")} visible={panel === "filter"} onClose={() => setPanel(null)}>
        <ListGroup>
          {filters.map((option, index) => (
            <ListRow
              key={option.value}
              label={option.label}
              selected={filter === option.value}
              last={index === filters.length - 1}
              onPress={() => {
                setFilter(option.value);
                setPanel(null);
              }}
            />
          ))}
        </ListGroup>
      </Sheet>
    </Screen>
  );
}
