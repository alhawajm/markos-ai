import React, { useState } from "react";
import { Linking } from "react-native";
import { FileText, Flag, Mail, ShieldCheck } from "lucide-react-native";
import { ContentReportSheet } from "../src/content-report";
import { config } from "../src/config";
import { useAppearance } from "../src/providers";
import { Card, ListGroup, ListRow, Notice, Screen, TaskHeader, Txt } from "../src/ui";

export default function Support() {
  const { t, locale } = useAppearance();
  const [error, setError] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  async function open(url: string) {
    setError(false);
    try {
      await Linking.openURL(url);
    } catch {
      setError(true);
    }
  }
  return (
    <Screen>
      <TaskHeader title={t("Help and legal", "المساعدة والمعلومات القانونية")} />
      <Card>
        <Txt variant="heading">{t("Here to help", "نحن هنا لمساعدتك")}</Txt>
        <Txt>
          {t(
            "Email support@raedat.online with what happened and your app version. Never send passwords or verification codes.",
            "راسل support@raedat.online بوصف المشكلة ورقم إصدار التطبيق. لا ترسل كلمات المرور أو رموز التحقق."
          )}
        </Txt>
      </Card>
      {error ? (
        <Notice error>
          {t("Couldn’t open that link. Email support@raedat.online or try again.", "تعذر فتح الرابط. راسل support@raedat.online أو حاول مجددًا.")}
        </Notice>
      ) : null}
      <ListGroup>
        <ListRow icon={Flag} label={t("Report AI content", "الإبلاغ عن محتوى الذكاء الاصطناعي")} onPress={() => setReportOpen(true)} />
        <ListRow
          icon={Mail}
          label={t("Contact support", "التواصل مع الدعم")}
          onPress={() => void open("mailto:support@raedat.online?subject=MARKOS%20support")}
        />
        <ListRow icon={ShieldCheck} label={t("Privacy policy", "سياسة الخصوصية")} onPress={() => void open(`${config.webUrl}/${locale}/privacy`)} />
        <ListRow icon={FileText} last label={t("Terms of service", "شروط الاستخدام")} onPress={() => void open(`${config.webUrl}/${locale}/terms`)} />
      </ListGroup>
      <ContentReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} source="GENERAL_AI" />
      <Txt variant="meta" muted>
        Raedat Software Company W.L.L
      </Txt>
    </Screen>
  );
}
