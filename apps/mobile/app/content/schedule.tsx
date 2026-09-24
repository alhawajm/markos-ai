import React, { useState } from "react";
import { Alert, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Clock3 } from "lucide-react-native";
import type { ContentRecord } from "@markos/shared-types";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Loading, Notice, Screen, Txt } from "../../src/ui";
import { QueryFailure, StatusBadge } from "../../src/content";
import { bahrainDate } from "../../src/campaigns/brief-model";
import { scheduleInstant } from "../../src/studio/model";
import { errorMessage, LocalAppError } from "../../src/errors";
import { canScheduleContent, readinessMessage, scheduleBlockers } from "../../src/instagram/model";
import { publishingMessage, uncertainPublish } from "../../src/publishing/model";

function bahrainTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bahrain", hour: "2-digit", minute: "2-digit", hourCycle: "h23", numberingSystem: "latn" }).format(
    date
  );
}
export default function ScheduleContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, scope } = useAccount();
  const result = useQuery({ queryKey: [scope, "content", id], queryFn: () => api.contentItem(id) });
  if (result.isPending)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!result.data)
    return (
      <Screen>
        <QueryFailure
          error={result.error}
          retry={() => {
            void result.refetch();
          }}
        />
      </Screen>
    );
  return <ScheduleForm key={id} item={result.data} />;
}
function ScheduleForm({ item }: { item: ContentRecord }) {
  const { api, scope, queryClient, session } = useAccount();
  const { t, locale, mode } = useAppearance();
  const router = useRouter();
  const initial = item.scheduledAt || item.plannedAt;
  const [date, setDate] = useState(initial ? bahrainDate(new Date(initial)) : bahrainDate());
  const [time, setTime] = useState(item.scheduledAt ? bahrainTime(new Date(item.scheduledAt)) : "18:00");
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [done, setDone] = useState<ContentRecord | null>(null);
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  const checkInstagram = item.status === "FAILED" && uncertainPublish(item.failureReason);
  const readiness = useQuery({
    queryKey: [scope, "publish-readiness", item.id],
    queryFn: async () => {
      const [content, live] = await Promise.all([api.publishReadiness(item.id), api.publishingLiveReadiness()]);
      return { content, live };
    },
    staleTime: 0
  });
  const blockers = readiness.data ? scheduleBlockers(readiness.data.content, readiness.data.live, item.revision) : [];
  const instant = scheduleInstant(date, time);
  const future = !!instant && Date.parse(instant) > Date.now();
  const allowed = canScheduleContent(session.roles);
  const canSchedule = allowed && ["APPROVED", "SCHEDULED", "FAILED"].includes(item.status);
  const mutation = useMutation({
    mutationFn: async (cancel: boolean) => {
      if (cancel) return api.unscheduleContent(item.id);
      if (checkInstagram && !retryConfirmed) throw new LocalAppError(publishingMessage(item.failureReason, t));
      if (!instant || Date.parse(instant) <= Date.now()) throw new LocalAppError(t("Choose a future publishing time.", "اختر موعد نشر في المستقبل."));
      const latest = await readiness.refetch({ throwOnError: true });
      if (!latest.data) throw new LocalAppError(t("Could not check publishing readiness. Try again.", "تعذّر التحقّق من الاستعداد للنشر. حاول مجددًا."));
      const blocked = scheduleBlockers(latest.data.content, latest.data.live, item.revision);
      if (blocked.length) throw new LocalAppError(readinessMessage(blocked[0]!, t));
      return item.status === "APPROVED" ? api.scheduleContent(item.id, instant, item.revision) : api.rescheduleContent(item.id, instant, item.revision);
    },
    onSuccess: (result) => {
      setDone(result);
      queryClient.setQueryData([scope, "content", item.id], result);
      void queryClient.invalidateQueries({ queryKey: [scope, "calendar"] });
      void queryClient.invalidateQueries({ queryKey: [scope, "campaigns"] });
      void queryClient.invalidateQueries({ queryKey: [scope, "content"] });
      void queryClient.invalidateQueries({ queryKey: [scope, "publication", item.id] });
      void queryClient.invalidateQueries({ queryKey: [scope, "publishing-activity"] });
    }
  });
  if (done)
    return (
      <Screen footer={<Button label={t("Open calendar", "فتح التقويم")} onPress={() => router.replace("/(tabs)/calendar")} />}>
        <Txt variant="title">
          {done.status === "SCHEDULED" ? t("Your content is scheduled", "تمت جدولة المحتوى") : t("Schedule cancelled", "تم إلغاء الجدولة")}
        </Txt>
        <StatusBadge status={done.status} />
        {done.scheduledAt ? (
          <Card tone="tint">
            <Txt variant="heading">
              {new Date(done.scheduledAt).toLocaleString(locale, { timeZone: "Asia/Bahrain", dateStyle: "full", timeStyle: "short" })}
            </Txt>
            <Txt>{t("Bahrain · UTC+3", "البحرين · UTC+3")}</Txt>
          </Card>
        ) : (
          <Txt>{t("The content is still ready. You can choose a new time later.", "ما زال المحتوى معتمدًا. يمكنك اختيار موعد جديد لاحقًا.")}</Txt>
        )}
      </Screen>
    );
  return (
    <Screen
      footer={
        canSchedule ? (
          <Button
            icon={Check}
            label={item.status === "SCHEDULED" ? t("Confirm new schedule", "تأكيد الموعد الجديد") : t("Confirm schedule", "تأكيد الجدولة")}
            busy={mutation.isPending}
            disabled={!future || readiness.isPending || readiness.isError || readiness.isFetching || blockers.length > 0 || (checkInstagram && !retryConfirmed)}
            onPress={() => mutation.mutate(false)}
          />
        ) : undefined
      }
    >
      <Txt variant="title">{t("Choose a publishing time", "اختر موعد النشر")}</Txt>
      <Txt>{item.brief?.split("\n")[0] || item.caption}</Txt>
      <StatusBadge status={item.status} />
      {checkInstagram ? (
        <Card tone="warning">
          <Txt>{publishingMessage(item.failureReason, t)}</Txt>
          <Button
            secondary={retryConfirmed}
            label={
              retryConfirmed
                ? t("Instagram checked — ready to reschedule", "تم التحقّق من إنستغرام — جاهز لإعادة الجدولة")
                : t("I checked Instagram; this post was not published", "تحقّقت من إنستغرام؛ لم يُنشر هذا المنشور")
            }
            onPress={() => setRetryConfirmed(!retryConfirmed)}
          />
        </Card>
      ) : null}
      {!canSchedule ? (
        <Notice>
          {allowed
            ? t("Return to the draft and mark it ready before scheduling.", "عد إلى المسودة واعتمدها قبل الجدولة.")
            : t("Your workspace role does not allow scheduling.", "دورك في مساحة العمل لا يسمح بالجدولة.")}
        </Notice>
      ) : (
        <>
          <Txt variant="label">{t("Publishing date", "تاريخ النشر")}</Txt>
          <Button
            secondary
            icon={CalendarDays}
            label={new Date(`${date}T12:00:00+03:00`).toLocaleDateString(locale, { dateStyle: "long", timeZone: "Asia/Bahrain" })}
            disabled={mutation.isPending}
            onPress={() => setPicker(picker === "date" ? null : "date")}
          />
          <Txt variant="label">{t("Time", "الوقت")}</Txt>
          <Button secondary icon={Clock3} label={time} disabled={mutation.isPending} onPress={() => setPicker(picker === "time" ? null : "time")} />
          {picker ? (
            <DateTimePicker
              mode={picker}
              value={new Date(`${date}T${time}:00+03:00`)}
              timeZoneName="Asia/Bahrain"
              minuteInterval={30}
              is24Hour
              themeVariant={mode}
              onChange={(event, chosen) => {
                if (Platform.OS === "android") setPicker(null);
                if (event.type === "set" && chosen) {
                  if (picker === "date") setDate(bahrainDate(chosen));
                  else setTime(bahrainTime(chosen));
                }
              }}
            />
          ) : null}
          <Txt variant="meta" muted>
            {t("Bahrain · UTC+3", "البحرين · UTC+3")}
          </Txt>
          {!future ? (
            <Notice error>
              {t("Choose a future time on the hour or half-hour, such as 18:00 or 18:30.", "اختر موعدًا مستقبليًا عند الساعة أو نصفها، مثل ١٨:٠٠ أو ١٨:٣٠.")}
            </Notice>
          ) : null}
          <Card tone="tint">
            <Txt variant="heading">{t("Check before scheduling", "تحقّق قبل الجدولة")}</Txt>
            <Txt>
              {t(
                "Confirm the event details, final media and caption. MARKOS checks permissions, media and Instagram’s publishing limits again at the scheduled time.",
                "أكّد تفاصيل الفعالية والوسائط النهائية والنص. يتحقّق ماركوس مجددًا من الأذونات والوسائط وحدود النشر في إنستغرام عند الموعد المحدّد."
              )}
            </Txt>
          </Card>
        </>
      )}
      {readiness.isPending ? (
        <Loading />
      ) : readiness.isError ? (
        <QueryFailure
          error={readiness.error}
          retry={() => {
            void readiness.refetch();
          }}
        />
      ) : blockers.length > 0 ? (
        <Card tone="warning">
          <Txt variant="heading">{t("Before you schedule", "قبل الجدولة")}</Txt>
          {[...new Set(blockers.map((reason) => readinessMessage(reason, t)))].map((message) => (
            <Txt key={message}>{message}</Txt>
          ))}
          <Button secondary label={t("Instagram settings", "إعدادات إنستغرام")} onPress={() => router.push("/instagram")} />
          <Button secondary label={t("Check again", "التحقّق مجددًا")} busy={readiness.isFetching} onPress={() => void readiness.refetch()} />
        </Card>
      ) : (
        <Txt muted>{t("Connection, caption and media checks passed.", "اجتازت فحوص الاتصال والنص والوسائط.")}</Txt>
      )}
      {mutation.isError ? <Notice error>{errorMessage(mutation.error, t)}</Notice> : null}
      {allowed && item.status === "SCHEDULED" ? (
        <Button
          secondary
          disabled={mutation.isPending}
          label={t("Cancel schedule", "إلغاء الجدولة")}
          onPress={() =>
            Alert.alert(
              t("Cancel this schedule?", "إلغاء هذا الموعد؟"),
              t("The content will stay ready for a new publishing time.", "سيبقى المحتوى معتمدًا لاختيار موعد نشر جديد."),
              [
                { text: t("Keep schedule", "إبقاء الموعد"), style: "cancel" },
                { text: t("Cancel schedule", "إلغاء الجدولة"), onPress: () => mutation.mutate(true) }
              ]
            )
          }
        />
      ) : null}
    </Screen>
  );
}
