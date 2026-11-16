import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useAccount, useAppearance } from "../src/providers";
import { Button, Card, Loading, Screen, TitleBar, Txt } from "../src/ui";
import { GuidanceResult } from "../src/workspace-assistant";
import { QueryFailure } from "../src/content";
export default function Strategy() {
  const { api, scope } = useAccount(),
    { t, locale } = useAppearance(),
    router = useRouter(),
    focused = useIsFocused();
  const { plan } = useLocalSearchParams<{ plan?: string }>();
  const result = useQuery({ queryKey: [scope, "strategy", plan ?? "latest"], queryFn: () => api.currentStrategy(plan), enabled: focused });
  const strategy = result.data;
  return (
    <Screen>
      <TitleBar title={t("Strategy", "الاستراتيجية")} />
      {result.isPending ? (
        <Loading />
      ) : result.isError ? (
        <QueryFailure error={result.error} retry={() => void result.refetch()} />
      ) : strategy?.strategy ? (
        <>
          <Txt variant="meta" muted>
            {t("Latest saved plan", "آخر خطة محفوظة")} · {new Date(strategy.createdAt).toLocaleDateString(locale, { dateStyle: "medium" })}
          </Txt>
          <GuidanceResult value={strategy.strategy} />
        </>
      ) : (
        <Card>
          <Txt variant="heading">{t("A clear direction for your business", "وجهة واضحة لنشاطك")}</Txt>
          <Txt muted>
            {t(
              "Discuss your goals with MARKOS on Home. Your strategy will be saved here to review and return to.",
              "ناقش أهدافك مع ماركوس في الرئيسية. ستظهر استراتيجيتك هنا لمراجعتها والرجوع إليها."
            )}
          </Txt>
        </Card>
      )}
      <Button
        label={strategy?.strategy ? t("Update with MARKOS", "تحديث مع ماركوس") : t("Plan with MARKOS", "التخطيط مع ماركوس")}
        onPress={() => router.navigate("/(tabs)")}
      />
    </Screen>
  );
}
