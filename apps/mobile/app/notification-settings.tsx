import React from "react";
import { Linking } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAccount, useAppearance } from "../src/providers";
import { Button, Card, Loading, Notice, Screen, Txt } from "../src/ui";
import { QueryFailure } from "../src/content";
import { errorMessage } from "../src/errors";
import { enablePhoneNotifications } from "../src/push-notifications";

export default function NotificationSettings() {
  const { api, scope, session, epoch, queryClient } = useAccount();
  const { t, locale } = useAppearance();
  const preferences = useQuery({ queryKey: [scope, "notification-preferences"], queryFn: () => api.notificationPreferences() });
  const reports = useQuery({ queryKey: [scope, "report-deliveries"], queryFn: () => api.reportDeliveries(), refetchInterval: 30000 });
  const change = useMutation({
    mutationFn: async (input: { pushPublishing?: boolean; monthlyReportEmail?: boolean }) => {
      if (input.pushPublishing) await enablePhoneNotifications(api, session.user.id, epoch, locale, true);
      return api.updateNotificationPreferences(input);
    },
    onSuccess: (value) => queryClient.setQueryData([scope, "notification-preferences"], value)
  });
  const email = useMutation({
    mutationFn: () => api.sendMonthlyAnalyticsEmail({ locale }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [scope, "report-deliveries"] })
  });
  return (
    <Screen>
      <Txt variant="title">{t("Stay informed", "ابقَ على اطلاع")}</Txt>
      <Txt muted>
        {t(
          "Your preferences for this workspace. In-app activity stays available even when phone alerts are off.",
          "تفضيلاتك لهذه المساحة. يبقى سجل النشاط متاحًا داخل التطبيق حتى عند إيقاف إشعارات الهاتف."
        )}
      </Txt>
      {preferences.isPending ? (
        <Loading />
      ) : preferences.isError ? (
        <QueryFailure error={preferences.error} retry={() => void preferences.refetch()} />
      ) : (
        <>
          <Card>
            <Txt variant="heading">{t("Publishing alerts", "إشعارات النشر")}</Txt>
            <Txt>
              {t("Get a phone notification when content publishes or needs attention.", "تلقَّ إشعارًا على الهاتف عند نشر المحتوى أو الحاجة إلى تدخلك.")}
            </Txt>
            <Button
              label={
                preferences.data.pushPublishing ? t("Turn off publishing alerts", "إيقاف إشعارات النشر") : t("Enable on this phone", "تفعيل على هذا الهاتف")
              }
              busy={change.isPending}
              onPress={() => change.mutate({ pushPublishing: !preferences.data.pushPublishing })}
            />
            {preferences.data.pushPublishing ? (
              <Button
                secondary
                label={t("Register this phone again", "إعادة تسجيل هذا الهاتف")}
                disabled={change.isPending}
                onPress={() => change.mutate({ pushPublishing: true })}
              />
            ) : null}
            <Button secondary label={t("Phone notification settings", "إعدادات إشعارات الهاتف")} onPress={() => void Linking.openSettings()} />
          </Card>
          <Card>
            <Txt variant="heading">{t("Monthly report email", "البريد الشهري للتقارير")}</Txt>
            <Txt>
              {t(
                "Send the previous month’s PDF report to your verified account email. You can turn this off any time.",
                "أرسل تقرير الشهر السابق بصيغة PDF إلى بريد حسابك المؤكد. يمكنك إيقافه في أي وقت."
              )}
            </Txt>
            <Txt muted>{session.user.email}</Txt>
            <Button
              secondary={!preferences.data.monthlyReportEmail}
              busy={change.isPending}
              label={
                preferences.data.monthlyReportEmail
                  ? t("Unsubscribe from monthly reports", "إلغاء اشتراك التقارير الشهرية")
                  : t("Subscribe to monthly reports", "الاشتراك في التقارير الشهرية")
              }
              onPress={() => change.mutate({ monthlyReportEmail: !preferences.data.monthlyReportEmail })}
            />
            <Button
              secondary
              label={t("Email last month’s report once", "إرسال تقرير الشهر السابق مرة واحدة")}
              busy={email.isPending}
              onPress={() => email.mutate()}
            />
            {email.isSuccess ? (
              <Notice>
                {t(
                  "Request saved. Delivery status appears below; each report is sent at most once per month.",
                  "حُفظ الطلب. تظهر حالة الإرسال أدناه؛ يُرسل كل تقرير مرة واحدة كحد أقصى في الشهر."
                )}
              </Notice>
            ) : null}
          </Card>
        </>
      )}
      {change.isError || email.isError ? <Notice error>{errorMessage(change.error ?? email.error, t)}</Notice> : null}
      {reports.isError ? (
        <QueryFailure error={reports.error} retry={() => void reports.refetch()} />
      ) : (
        reports.data?.map((report) => (
          <Card key={report.id}>
            <Txt variant="label">{report.month}</Txt>
            <Txt>
              {report.status === "ACCEPTED"
                ? t("Accepted by email provider", "قبله مزود البريد")
                : ["PENDING", "PROCESSING"].includes(report.status)
                  ? t("Queued for delivery", "في قائمة الإرسال")
                  : report.status === "UNKNOWN"
                    ? t(
                        "Delivery could not be confirmed. Check your inbox before contacting support.",
                        "تعذّر تأكيد الإرسال. تحقّق من بريدك قبل التواصل مع الدعم."
                      )
                    : report.status === "SIMULATED"
                      ? t("Simulated — no email sent", "محاكاة — لم يُرسل بريد")
                      : report.status === "CANCELLED"
                        ? t("Cancelled", "أُلغي")
                        : t("Delivery failed", "فشل الإرسال")}
            </Txt>
          </Card>
        ))
      )}
    </Screen>
  );
}
