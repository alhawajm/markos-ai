import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { useIsMutating, useMutation } from "@tanstack/react-query";
import { FileText, Paperclip, Sparkles, X } from "lucide-react-native";
import { useAccount, useAppearance } from "../../src/providers";
import { Button, Card, Field, IconButton, Loading, Notice, Row, Screen, Txt } from "../../src/ui";
import { briefStore, ReferenceError } from "../../src/campaigns/brief-store";
import { campaignStart, localDate, newBrief, validDate, type Brief } from "../../src/campaigns/brief-model";
import { errorMessage } from "../../src/errors";
import { sessionController } from "../../src/auth/transport";
import { newRequestId } from "../../src/request-id";

export default function NewCampaign() {
  const { api, scope, epoch, queryClient } = useAccount();
  const { t, locale, colors, mode } = useAppearance();
  const router = useRouter();
  const store = useMemo(() => briefStore(scope, epoch), [scope, epoch]);
  const [brief, setBrief] = useState<Brief>(newBrief);
  const current = useRef(brief);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(1);
  const mutationKey = [scope, "generate-campaign"];
  const activeGenerations = useIsMutating({ mutationKey });
  const working = useRef(false);
  const mounted = useRef(true);
  const [picking, setPicking] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const generation = useMutation({
    mutationKey,
    mutationFn: async (value: Brief) => {
      const referenceFiles = await store.upload(value.files);
      const pending = { ...value, requestId: newRequestId(), requestLocale: locale, pendingSince: new Date().toISOString() };
      await store.save(pending);
      if (mounted.current) {
        current.current = pending;
        setBrief(pending);
      }
      const job = await api.queueCampaignGeneration(pending.requestId, {
        objective: value.objective.trim(),
        description: value.description.trim() || undefined,
        referenceFiles,
        durationDays: value.durationDays,
        publishesPerDay: value.publishesPerDay,
        startsAt: campaignStart(value.startDate),
        locale
      });
      sessionController.assertEpoch(epoch);
      await queryClient.invalidateQueries({ queryKey: [scope, "campaign-generations"] });
      return job;
    }
  });
  const busy = activeGenerations > 0;
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    mounted.current = true;
    void store
      .read()
      .then((value) => {
        if (mounted.current) {
          current.current = value;
          setBrief(value);
          setReady(true);
          if (value.requestId) router.replace({ pathname: "/campaign/generation", params: { requestId: value.requestId } });
        }
      })
      .catch((problem) => {
        if (mounted.current) setError(errorMessage(problem, t));
      });
    return () => {
      mounted.current = false;
    };
  }, [store]);
  async function update(patch: Partial<Brief>) {
    const next = { ...current.current, ...patch };
    current.current = next;
    setBrief(next);
    setSaved(false);
    try {
      await store.save(next);
      if (mounted.current && current.current === next) setSaved(true);
      return true;
    } catch {
      if (mounted.current)
        setError(
          t("Couldn’t save this brief on your device. Keep this screen open and try again.", "تعذّر حفظ الملخص على جهازك. أبقِ هذه الشاشة مفتوحة وحاول مجددًا.")
        );
      return false;
    }
  }
  function describe(problem: unknown) {
    if (!(problem instanceof ReferenceError)) return errorMessage(problem, t);
    if (problem.message === "count") return t("Choose up to five files in total.", "اختر خمسة ملفات كحد أقصى.");
    if (problem.message === "type") return t("Use PDF, DOCX, TXT, PNG, JPG or WebP files.", "استخدم ملفات PDF أو DOCX أو TXT أو PNG أو JPG أو WebP.");
    if (problem.message === "total") return t("Your files must be 20 MB or less in total.", "يجب ألا يتجاوز مجموع الملفات ٢٠ ميغابايت.");
    if (problem.message === "missing")
      return t("A saved file is no longer available. Remove it and attach it again.", "أحد الملفات المحفوظة لم يعد متاحًا. أزله ثم أرفقه مجددًا.");
    return t("Each file must be readable, non-empty and no larger than 8 MB.", "يجب أن يكون كل ملف قابلًا للقراءة وغير فارغ وألا يتجاوز ٨ ميغابايت.");
  }
  async function pick() {
    if (picking || busy) return;
    setPicking(true);
    setError("");
    try {
      const files = await store.pick(current.current.files);
      sessionController.assertEpoch(epoch);
      await update({ files });
    } catch (problem) {
      if (mounted.current) setError(describe(problem));
    } finally {
      if (mounted.current) setPicking(false);
    }
  }
  async function generate() {
    if (working.current || queryClient.isMutating({ mutationKey }) > 0) return;
    const value = current.current;
    if (value.objective.trim().length < 3 || !validDate(value.startDate)) {
      setError(t("Add an objective and a valid start date.", "أضف هدفًا وتاريخ بدء صحيحًا."));
      return;
    }
    working.current = true;
    setError("");
    try {
      const job = await generation.mutateAsync(value);
      if (mounted.current) router.replace({ pathname: "/campaign/generation", params: { requestId: job.requestId } });
    } catch (problem) {
      if (mounted.current) {
        if (current.current.requestId) router.replace({ pathname: "/campaign/generation", params: { requestId: current.current.requestId } });
        else setError(describe(problem));
      }
    } finally {
      working.current = false;
    }
  }
  if (!ready) return <Screen>{error ? <Notice error>{error}</Notice> : <Loading />}</Screen>;
  return (
    <Screen
      footer={
        <>
          <Button
            label={step === 1 ? t("Continue", "متابعة") : t("Draft campaign", "إنشاء مسودة الحملة")}
            icon={step === 2 ? Sparkles : undefined}
            busy={busy}
            disabled={picking || brief.objective.trim().length < 3 || !saved}
            onPress={() => {
              if (step === 1) {
                setError("");
                setStep(2);
              } else void generate();
            }}
          />
          <Txt variant="meta" muted>
            {t("Your campaign is saved as a draft. Review it before preparing posts.", "تُحفظ حملتك كمسودة. راجعها قبل إعداد المنشورات.")}
          </Txt>
        </>
      }
    >
      <Row>
        {[1, 2].map((value) => (
          <View key={value} style={{ flex: 1 }}>
            <Button
              label={value === 1 ? t("1. Brief", "١. الملخص") : t("2. Plan", "٢. الخطة")}
              secondary={step !== value}
              disabled={busy || (value === 2 && brief.objective.trim().length < 3)}
              onPress={() => setStep(value)}
            />
          </View>
        ))}
      </Row>
      <Txt variant="title">{step === 1 ? t("Give your idea context", "امنح فكرتك سياقًا") : t("Set the plan", "حدّد الخطة")}</Txt>
      {brief.pendingSince && !busy ? (
        <>
          <Notice>
            {t(
              "A previous request may have finished. Check your campaigns before generating again to avoid a duplicate.",
              "ربما اكتمل طلب سابق. تحقّق من حملاتك قبل الإنشاء مجددًا لتجنّب التكرار."
            )}
          </Notice>
          <Button secondary label={t("Check campaigns", "عرض الحملات")} onPress={() => router.replace("/(tabs)/campaigns")} />
        </>
      ) : null}
      {step === 1 ? (
        <>
          <Txt muted>
            {t(
              "Share the event, proposal, design direction and details that make this campaign yours.",
              "شارك تفاصيل الفعالية والمقترح والتوجّه البصري وكل ما يميّز حملتك."
            )}
          </Txt>
          <Field
            label={t("Campaign objective", "هدف الحملة")}
            placeholder={t("What do you want this campaign to achieve?", "ما الذي تريد تحقيقه بهذه الحملة؟")}
            value={brief.objective}
            maxLength={500}
            editable={!busy}
            onChangeText={(objective) => {
              void update({ objective });
            }}
            multiline
            style={{ minHeight: 84 }}
          />
          <Field
            label={t("Description and context", "الوصف والسياق")}
            placeholder={t(
              "Event details, audience, look and feel, key messages, and anything to avoid…",
              "تفاصيل الفعالية والجمهور والطابع البصري والرسائل الأساسية وما ينبغي تجنّبه…"
            )}
            value={brief.description}
            maxLength={5000}
            editable={!busy}
            onChangeText={(description) => {
              void update({ description });
            }}
            multiline
            style={{ minHeight: 160 }}
            hint={`${brief.description.length} / 5000`}
          />
          <Row style={{ justifyContent: "space-between" }}>
            <Txt variant="heading">{t("Supporting files", "الملفات الداعمة")}</Txt>
            <Txt variant="label">{brief.files.length}/5</Txt>
          </Row>
          <Txt variant="meta" muted>
            {t(
              "PDF, DOCX, TXT, PNG, JPG or WebP. Up to 8 MB each; 20 MB total.",
              "PDF وDOCX وTXT وPNG وJPG وWebP. حتى ٨ ميغابايت لكل ملف و٢٠ ميغابايت إجمالًا."
            )}
          </Txt>
          {brief.files.map((file) => (
            <Card key={file.id}>
              <Row>
                <FileText size={24} strokeWidth={1.5} color={colors.accent} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt variant="label" numberOfLines={2}>
                    {file.filename}
                  </Txt>
                  <Txt variant="meta" muted>
                    {(file.sizeBytes / 1_000_000).toFixed(1)} MB
                  </Txt>
                </View>
                <IconButton
                  icon={X}
                  label={`${t("Remove", "إزالة")} ${file.filename}`}
                  disabled={busy || picking}
                  onPress={() => {
                    void update({ files: brief.files.filter((item) => item.id !== file.id) }).then((persisted) => {
                      if (persisted) store.remove(file);
                    });
                  }}
                />
              </Row>
            </Card>
          ))}
          <Button
            secondary
            icon={Paperclip}
            label={t("Attach files", "إرفاق ملفات")}
            busy={picking}
            disabled={busy || brief.files.length >= 5}
            onPress={() => {
              void pick();
            }}
          />
        </>
      ) : (
        <>
          <Txt muted>{t("Choose the pace. You can review every draft before scheduling.", "اختر وتيرة النشر. يمكنك مراجعة كل مسودة قبل جدولتها.")}</Txt>
          <Card tone="tint">
            <Txt variant="label">{brief.objective}</Txt>
            <Txt muted>
              {brief.files.length} {t("references attached", "ملفات مرفقة")}
            </Txt>
            {brief.description ? <Txt numberOfLines={4}>{brief.description}</Txt> : null}
          </Card>
          <Txt variant="label">{t("Duration", "المدة")}</Txt>
          <Row>
            {([3, 7, 14] as const).map((durationDays) => (
              <View style={{ flex: 1 }} key={durationDays}>
                <Button
                  label={`${durationDays} ${t("days", "أيام")}`}
                  secondary={brief.durationDays !== durationDays}
                  disabled={busy}
                  onPress={() => {
                    void update({ durationDays });
                  }}
                />
              </View>
            ))}
          </Row>
          <Txt variant="label">{t("Start date · Bahrain time", "تاريخ البدء · توقيت البحرين")}</Txt>
          <Button
            secondary
            label={new Date(`${brief.startDate}T12:00:00`).toLocaleDateString(locale, { dateStyle: "long" })}
            disabled={busy}
            onPress={() => setShowDate(!showDate)}
          />
          {showDate ? (
            <DateTimePicker
              value={new Date(`${brief.startDate}T12:00:00`)}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              themeVariant={mode}
              locale={locale}
              onChange={(event, date) => {
                if (Platform.OS !== "ios") setShowDate(false);
                if (event.type === "set" && date) void update({ startDate: localDate(date) });
              }}
            />
          ) : null}
          <Txt variant="label">{t("Publishing intensity", "وتيرة النشر")}</Txt>
          <Row>
            {[1, 2, 3].map((publishesPerDay) => (
              <View style={{ flex: 1 }} key={publishesPerDay}>
                <Button
                  label={`${publishesPerDay} ${t("/ day", "/ يوم")}`}
                  secondary={brief.publishesPerDay !== publishesPerDay}
                  disabled={busy}
                  onPress={() => {
                    void update({ publishesPerDay });
                  }}
                />
              </View>
            ))}
          </Row>
          <Card tone="tint">
            <Txt variant="heading">
              {brief.durationDays * brief.publishesPerDay} {t("planned posts", "منشورًا مخطّطًا")}
            </Txt>
            <Txt>{t("Nothing is scheduled automatically.", "لا تتم جدولة أي منشور تلقائيًا.")}</Txt>
          </Card>
        </>
      )}
      {busy ? (
        <Notice>
          {t(
            "Sending your brief and references. Once received, MARKOS can finish while you’re away.",
            "جارٍ إرسال الملخص والمراجع. بعد استلامها يستطيع ماركوس إكمال الحملة أثناء غيابك."
          )}
        </Notice>
      ) : null}
      {error ? (
        <>
          <Notice error>{error}</Notice>
          {!saved ? (
            <Button
              secondary
              label={t("Retry saving brief", "إعادة حفظ الملخص")}
              onPress={() => {
                void update({});
              }}
            />
          ) : null}
          <Button secondary label={t("Open business profile", "فتح ملف النشاط")} onPress={() => router.push("/business")} />
        </>
      ) : null}
      <Txt variant="meta" muted>
        {saved ? t("Brief saved on this device", "الملخص محفوظ على هذا الجهاز") : t("Saving brief…", "جارٍ حفظ الملخص…")}
      </Txt>
    </Screen>
  );
}
