import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useAppearance } from "./providers";
import { sessionController } from "./auth/transport";
import { Card, Loading, Notice, Sheet, TextAction, Txt } from "./ui";
import { errorMessage } from "./errors";

export function PersonalMemorySheet({ onClose }: { onClose: () => void }) {
  const { api, scope, epoch, queryClient } = useAccount(),
    { t } = useAppearance();
  const key = [scope, "personal-memory"];
  const memory = useQuery({ queryKey: key, queryFn: () => api.personalMemory() });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function forget(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.forgetMemory(id);
      sessionController.assertEpoch(epoch);
      queryClient.setQueryData(
        key,
        memory.data?.filter((item) => item.id !== id)
      );
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title={t("What MARKOS remembers", "ما يتذكره ماركوس")} visible onClose={onClose}>
      <Txt muted>
        {t(
          "Personal defaults for your work in this workspace. Your business profile remains the source for company facts.",
          "تفضيلات شخصية لعملك في هذه المساحة. يظل ملف النشاط مصدر معلومات الشركة."
        )}
      </Txt>
      {memory.isPending ? <Loading label={t("Loading your preferences", "جارٍ تحميل تفضيلاتك")} /> : null}
      {memory.data?.length === 0 ? (
        <Txt>
          {t("Nothing saved yet. Tell MARKOS “Remember that I prefer…” in chat.", "لا توجد تفضيلات محفوظة بعد. أخبر ماركوس في المحادثة: «تذكّر أنني أفضل…».")}
        </Txt>
      ) : null}
      {memory.data?.map((item) => (
        <Card key={item.id}>
          <Txt>{item.text}</Txt>
          <TextAction
            label={t("Forget", "نسيان")}
            accessibilityLabel={t(`Forget: ${item.text}`, `نسيان: ${item.text}`)}
            disabled={busy}
            onPress={() => void forget(item.id)}
          />
        </Card>
      ))}
      <Txt muted>
        {t(
          "MARKOS also uses your approved business knowledge and content, plus shared marketing guidance. Private conversations never become shared guidance.",
          "يستخدم ماركوس معرفة نشاطك ومحتواه المعتمدين، وإرشادات تسويق مشتركة. لا تتحول المحادثات الخاصة إلى إرشادات مشتركة."
        )}
      </Txt>
      {error || memory.isError ? <Notice error>{error || errorMessage(memory.error, t)}</Notice> : null}
    </Sheet>
  );
}
