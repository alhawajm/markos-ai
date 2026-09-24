import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Clapperboard, Images, Palette } from "lucide-react-native";
import type { ContentType } from "@markos/shared-types";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Loading, Notice, Screen, Txt } from "../../src/ui";
import { ContentCard, QueryFailure, typeLabel } from "../../src/content";
import { errorMessage } from "../../src/errors";

export default function Create() {
  const { api, scope, queryClient } = useAccount();
  const { t } = useAppearance();
  const router = useRouter();
  const result = useQuery({ queryKey: [scope, "content"], queryFn: () => api.contentItems() });
  const create = useMutation({
    mutationFn: (contentType: ContentType) => api.createContent({ contentType }),
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: [scope, "content"] });
      router.push({ pathname: "/content/[id]", params: { id: item.id } });
    }
  });
  const drafts = result.data?.filter((item) => ["DRAFT", "IN_REVIEW", "IDEA"].includes(item.status)) ?? [];
  return (
    <Screen>
      <Txt variant="title">{t("Create", "إنشاء")}</Txt>
      <Txt muted>{t("Make something your audience will care about.", "اصنع محتوى يهم جمهورك.")}</Txt>
      <Txt variant="heading">{t("Start with a format", "ابدأ بنوع المحتوى")}</Txt>
      {(["POST", "REEL", "CAROUSEL"] as const).map((type) => (
        <Button
          key={type}
          secondary
          icon={type === "REEL" ? Clapperboard : type === "CAROUSEL" ? Images : Palette}
          label={typeLabel(type, t)}
          disabled={create.isPending}
          busy={create.isPending && create.variables === type}
          onPress={() => create.mutate(type)}
        />
      ))}
      {create.isError ? <Notice error>{errorMessage(create.error, t)}</Notice> : null}
      <Txt variant="heading">{t("Continue a draft", "متابعة مسودة")}</Txt>
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
              "Your drafts will appear here. Start with a format above or prepare an idea from a campaign.",
              "ستظهر مسوداتك هنا. ابدأ بنوع محتوى أعلاه أو أعدّ فكرة من إحدى الحملات."
            )}
          </Txt>
        </Card>
      ) : (
        drafts.map((item) => <ContentCard key={item.id} item={item} />)
      )}
    </Screen>
  );
}
