import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Loading, Notice, Screen, Txt } from "../../src/ui";
import { QueryFailure, StatusBadge } from "../../src/content";
import { canScheduleContent } from "../../src/instagram/model";
import { publicationLabel, publicationState, publishingMessage } from "../../src/publishing/model";
export default function Publication() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, scope, session } = useAccount();
  const { t, locale } = useAppearance();
  const router = useRouter();
  const focused = useIsFocused();
  const manage = canScheduleContent(session.roles);
  const result = useQuery({
    queryKey: [scope, "publication", id],
    queryFn: async () => {
      const [content, job] = await Promise.all([api.contentItem(id), manage ? api.latestPublishJob(id) : Promise.resolve(null)]);
      return { content, job };
    },
    enabled: focused,
    refetchInterval: (query) => (query.state.data?.content.status === "PUBLISHED" ? false : 5000),
    refetchOnWindowFocus: "always"
  });
  if (result.isPending)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!result.data || result.isError)
    return (
      <Screen>
        <QueryFailure error={result.error} retry={() => void result.refetch()} />
      </Screen>
    );
  const { content, job } = result.data;
  const state = publicationState(content, job);
  const code = content.failureReason || job?.lastErrorCode;
  const schedule = () => router.push({ pathname: "/content/schedule", params: { id } });
  return (
    <Screen>
      <Txt variant="title">{publicationLabel(state, t)}</Txt>
      <Txt variant="heading">{content.brief?.split("\n")[0] || content.caption || t("Instagram post", "منشور إنستغرام")}</Txt>
      <StatusBadge status={content.status} />
      <Card tone={content.status === "FAILED" ? "warning" : "tint"}>
        {content.status === "FAILED" ? (
          <Txt>{publishingMessage(code, t)}</Txt>
        ) : state === "PROCESSING" ? (
          <Txt>
            {t(
              "Instagram is processing your post. You can leave this screen; MARKOS continues on the server.",
              "يعالج إنستغرام منشورك. يمكنك مغادرة الشاشة؛ يواصل ماركوس العمل على الخادم."
            )}
          </Txt>
        ) : state === "RETRY_WAIT" ? (
          <Txt>
            {t(
              "A temporary provider error occurred. MARKOS will retry within the configured attempt limit.",
              "حدث خطأ مؤقت لدى المزوّد. سيعيد ماركوس المحاولة ضمن الحد المحدّد."
            )}
          </Txt>
        ) : content.status === "PUBLISHED" ? (
          <Txt>
            {t(
              "Instagram confirmed publication. Performance appears in Insights as data becomes available.",
              "أكّد إنستغرام النشر. يظهر الأداء في التحليلات عند توفّر البيانات."
            )}
          </Txt>
        ) : content.status === "SCHEDULED" ? (
          <Txt>{t("The server handles scheduled publishing even when your phone is closed.", "يتولى الخادم النشر المجدول حتى عند إغلاق هاتفك.")}</Txt>
        ) : (
          <Txt>{t("This content is not scheduled. Review it before choosing a publishing time.", "هذا المحتوى غير مجدول. راجعه قبل اختيار موعد النشر.")}</Txt>
        )}
        {content.scheduledAt ? (
          <Txt>{t("Scheduled: ", "الموعد: ") + new Date(content.scheduledAt).toLocaleString(locale, { timeZone: "Asia/Bahrain" })}</Txt>
        ) : null}
        {content.publishedAt ? (
          <Txt>{t("Published: ", "تم النشر: ") + new Date(content.publishedAt).toLocaleString(locale, { timeZone: "Asia/Bahrain" })}</Txt>
        ) : null}
        {state === "RETRY_WAIT" && job ? (
          <Txt>{t("Next attempt: ", "المحاولة القادمة: ") + new Date(job.nextAttemptAt).toLocaleString(locale, { timeZone: "Asia/Bahrain" })}</Txt>
        ) : null}
        <Txt variant="meta" muted>
          {t("Times shown in Bahrain · UTC+3", "الأوقات بتوقيت البحرين · UTC+3")}
        </Txt>
      </Card>
      {state === "PROCESSING" ? (
        <Notice>
          {t(
            "Changes are locked while publishing is in progress. Wait for the result before trying again.",
            "التعديلات مقفلة أثناء النشر. انتظر النتيجة قبل المحاولة مجددًا."
          )}
        </Notice>
      ) : null}
      <Button secondary label={t("Review content", "مراجعة المحتوى")} onPress={() => router.push({ pathname: "/content/[id]", params: { id } })} />
      {manage && ["SCHEDULED", "FAILED"].includes(content.status) && state !== "PROCESSING" ? (
        <Button label={content.status === "FAILED" ? t("Choose a new time", "اختيار موعد جديد") : t("Manage schedule", "إدارة الجدولة")} onPress={schedule} />
      ) : null}
      {content.status === "FAILED" ? <Button secondary label={t("Instagram connection", "اتصال إنستغرام")} onPress={() => router.push("/instagram")} /> : null}
      {content.status === "PUBLISHED" ? <Button label={t("View insights", "عرض الأداء")} onPress={() => router.push("/(tabs)/insights")} /> : null}
      <Button secondary busy={result.isFetching} label={t("Refresh status", "تحديث الحالة")} onPress={() => void result.refetch()} />
    </Screen>
  );
}
