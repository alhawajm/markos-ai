import React, { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FileText, Link2, Pencil } from "lucide-react-native";
import type { OnboardingState, OnboardingDocumentAnalysisRecord } from "@markos/shared-types";
import {
  emptyQuickOnboarding,
  quickOnboardingSchema,
  quickDetailsFromDocuments,
  quickDetailsFromKnowledge,
  type QuickOnboardingDetails
} from "@markos/validation";
import { useAccount, useAppearance } from "../providers";
import { Button, Card, Field, ListGroup, ListRow, Loading, Notice, Screen, TextAction, Txt } from "../ui";
import { sessionController } from "../auth/transport";
import { errorMessage } from "../errors";
import { BusinessDeviceStore } from "./device-store";
import type { Reference } from "../campaigns/brief-model";
type Page = "choose" | "manual" | "instagram" | "documents" | "summary";
type Saved = { details: QuickOnboardingDetails; url: string; files: Reference[]; manual?: boolean };
export function QuickNativeOnboarding({ initial }: { initial: OnboardingState; onConnectInstagram: () => void }) {
  const { api, scope, epoch, queryClient } = useAccount(),
    { t, locale, colors } = useAppearance();
  const store = useMemo(() => new BusinessDeviceStore<Saved>(scope, epoch, "quick-setup"), [scope, epoch]);
  const [details, setDetails] = useState(emptyQuickOnboarding),
    [url, setUrl] = useState(""),
    [files, setFiles] = useState<Reference[]>([]);
  const [state, setState] = useState(initial),
    [page, setPage] = useState<Page>(initial.businessProfile.status === "DRAFT" ? "summary" : "choose");
  const [analysis, setAnalysis] = useState<OnboardingDocumentAnalysisRecord | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [restored, setRestored] = useState(false),
    [diskError, setDiskError] = useState(false),
    [restoreAttempt, setRestoreAttempt] = useState(0);
  const alive = useRef(true),
    preparing = useRef<string | null>(null);
  const detailsEdited = useRef(false);
  async function prepare(value: QuickOnboardingDetails, analysisId?: string) {
    setDetails(value);
    setError("");
    const parsed = quickOnboardingSchema.safeParse(value);
    if (!parsed.success) {
      setPage("manual");
      setError(t("Add your business name and what you offer. Everything else can wait.", "أضف اسم نشاطك وما تقدمه فقط. يمكنك إضافة البقية لاحقًا."));
      return;
    }
    setBusy(t("Preparing your short summary…", "نعدّ ملخصك القصير…"));
    try {
      const next = await api.previewQuickOnboarding({ details: parsed.data, ...(analysisId ? { analysisId } : {}) });
      sessionController.assertEpoch(epoch);
      if (alive.current) {
        setState(next);
        setPage("summary");
      }
    } catch (e) {
      if (alive.current) setError(errorMessage(e, t));
    } finally {
      if (alive.current) setBusy("");
    }
  }
  async function receive(value: OnboardingDocumentAnalysisRecord) {
    if (!alive.current || detailsEdited.current) return;
    setAnalysis(value);
    if (value.status === "READY" && value.result && preparing.current !== value.id) {
      preparing.current = value.id;
      await prepare(quickDetailsFromDocuments(value.result.profile), value.id);
    }
    if (value.status === "FAILED")
      setError(t("We couldn’t read these files. Retry or use quick setup.", "تعذرت قراءة الملفات. أعد المحاولة أو استخدم الإعداد المختصر."));
  }
  useEffect(() => {
    alive.current = true;
    void Promise.all([store.read(), api.businessKnowledge(), api.onboardingDocumentAnalysis()])
      .then(([saved, knowledge, active]) => {
        sessionController.assertEpoch(epoch);
        if (!alive.current) return;
        detailsEdited.current = saved?.manual === true;
        setDetails(saved?.details ?? quickDetailsFromKnowledge(knowledge));
        setUrl(saved?.url ?? "");
        setFiles(saved?.files ?? []);
        setRestored(true);
        if (active && !detailsEdited.current) {
          setAnalysis(active);
          if (initial.businessProfile.status !== "DRAFT") {
            setPage(active.status === "READY" ? "manual" : "documents");
            if (active.status === "READY") void receive(active);
          }
        }
      })
      .catch((e) => {
        if (alive.current) {
          setError(errorMessage(e, t));
        }
      });
    return () => {
      alive.current = false;
    };
  }, [store, epoch, restoreAttempt]);
  useEffect(() => {
    if (!restored) return;
    void store
      .save({ details, url, files, manual: detailsEdited.current && !analysis })
      .then(() => {
        if (alive.current) setDiskError(false);
      })
      .catch(() => {
        if (alive.current) setDiskError(true);
      });
  }, [details, url, files, restored, store, page, analysis]);
  useEffect(() => {
    if (analysis?.status !== "PROCESSING") return;
    const timer = setInterval(() => {
      void api
        .onboardingDocumentAnalysis()
        .then((v) => {
          sessionController.assertEpoch(epoch);
          if (v && alive.current) void receive(v);
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [analysis?.id, analysis?.status, epoch]);
  async function analyze() {
    detailsEdited.current = false;
    setError("");
    setBusy(t("Reading your business context…", "نقرأ سياق نشاطك…"));
    try {
      if (analysis && analysis.status !== "PROCESSING") await api.discardOnboardingDocumentAnalysis(analysis.id);
      preparing.current = null;
      const value = page === "instagram" ? await api.analyzeInstagramProfile(url) : await api.analyzeOnboardingDocuments(await store.files.upload(files));
      sessionController.assertEpoch(epoch);
      await receive(value);
    } catch (e) {
      const active = await api.onboardingDocumentAnalysis().catch(() => null);
      sessionController.assertEpoch(epoch);
      if (active) await receive(active);
      else if (alive.current)
        setError(
          page === "instagram"
            ? t(
                "Instagram could not make that public profile readable. Check the account privacy or use files or quick setup.",
                "تعذرت قراءة الملف العام من إنستغرام. تحقق من خصوصية الحساب أو استخدم الملفات أو الإعداد المختصر."
              )
            : errorMessage(e, t)
        );
    } finally {
      if (alive.current) setBusy("");
    }
  }
  async function confirm() {
    const id = state.businessProfile.interactionId;
    if (!id) return;
    setBusy(t("Saving your business…", "نحفظ تفاصيل نشاطك…"));
    setError("");
    try {
      const next = await api.confirmQuickOnboarding(id);
      sessionController.assertEpoch(epoch);
      queryClient.setQueryData([scope, "onboarding"], next);
      await store.clear();
      await store.files.clear();
      await queryClient.invalidateQueries({ queryKey: [scope, "business-knowledge"] });
    } catch (e) {
      if (alive.current) setError(errorMessage(e, t));
    } finally {
      if (alive.current) setBusy("");
    }
  }
  const definitions: [keyof QuickOnboardingDetails, string, string, number][] = [
    ["name", t("Business name", "اسم النشاط"), t("Your business name", "اسم نشاطك"), 160],
    ["offer", t("What do you offer?", "ماذا تقدم؟"), t("A sentence about your products or services", "جملة عن منتجاتك أو خدماتك"), 2000],
    ["location", t("Where do you operate? · optional", "أين تعمل؟ · اختياري"), t("City, country or online", "المدينة أو الدولة أو عبر الإنترنت"), 120],
    ["audience", t("Who is it for? · optional", "من هم عملاؤك؟ · اختياري"), t("Who you want to reach", "من ترغب في الوصول إليه"), 1000],
    ["voice", t("Your brand voice · optional", "نبرة علامتك · اختياري"), t("For example: warm, simple and confident", "مثلًا: ودود وبسيط وواثق"), 1000],
    ["goal", t("Your first goal · optional", "هدفك الأول · اختياري"), t("Your marketing priority", "أولويتك التسويقية"), 1000]
  ];
  const profile = state.businessProfile.profile;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen>
        <Txt variant="heading">MARKOS AI</Txt>
        {page !== "choose" && !busy ? (
          <TextAction
            label={t("Back", "رجوع")}
            onPress={() => {
              setPage("choose");
              setError("");
            }}
          />
        ) : null}
        <Txt variant="title">
          {page === "summary"
            ? t("Here’s what I understand.", "هذا ما فهمته عن نشاطك.")
            : page === "manual"
              ? t("Just the essentials.", "الأساسيات فقط.")
              : t("Let’s meet your business.", "لنتعرّف على نشاطك.")}
        </Txt>
        <Txt muted>
          {t("A short setup, then we get to work. Connect Instagram for publishing later.", "إعداد مختصر، ثم نبدأ العمل. ربط إنستغرام للنشر يأتي لاحقًا.")}
        </Txt>
        {error ? <Notice error>{error}</Notice> : null}
        {error && !restored ? (
          <Button
            label={t("Retry recovery", "إعادة محاولة الاستعادة")}
            onPress={() => {
              setError("");
              setRestoreAttempt((n) => n + 1);
            }}
          />
        ) : null}
        {diskError ? (
          <Notice error>
            {t(
              "This device could not save your answers. Keep this screen open until you finish.",
              "تعذر حفظ إجاباتك على الجهاز. أبقِ هذه الشاشة مفتوحة حتى تنتهي."
            )}
          </Notice>
        ) : null}
        {busy || !restored ? (
          <Card>
            <Loading
              label={busy || t("Restoring your setup…", "نستعيد إعدادك…")}
              detail={t("Your details stay here while we work.", "تبقى تفاصيلك هنا أثناء العمل.")}
            />
          </Card>
        ) : (
          <>
            {page === "choose" ? (
              <ListGroup>
                <ListRow
                  icon={Link2}
                  label={t("Use your Instagram", "استخدم إنستغرام")}
                  detail={t("Paste your public business profile link", "ألصق رابط ملف نشاطك العام")}
                  onPress={() => setPage("instagram")}
                />
                <ListRow
                  icon={FileText}
                  label={t("Upload business files", "ارفع ملفات النشاط")}
                  detail={t("Proposals, menus or brand guides · up to 5 files", "عروض أو قوائم أو دليل العلامة · حتى ٥ ملفات")}
                  onPress={() => setPage("documents")}
                />
                <ListRow
                  last
                  icon={Pencil}
                  label={t("Tell me the basics", "أخبرني بالأساسيات")}
                  detail={t("Six short answers. Only two required.", "ست إجابات قصيرة. اثنتان فقط مطلوبتان.")}
                  onPress={() => {
                    detailsEdited.current = true;
                    setAnalysis(null);
                    setPage("manual");
                  }}
                />
              </ListGroup>
            ) : null}
            {page === "manual" ? (
              <>
                {definitions.map(([key, label, placeholder, maxLength]) => (
                  <Field
                    key={key}
                    label={label}
                    placeholder={placeholder}
                    value={details[key]}
                    multiline={key === "offer"}
                    maxLength={maxLength}
                    onChangeText={(text) => {
                      detailsEdited.current = true;
                      setDetails({ ...details, [key]: text });
                    }}
                  />
                ))}
                <Button
                  label={t("Review my summary", "مراجعة الملخص")}
                  onPress={() => void prepare(details, analysis?.status === "READY" ? analysis.id : undefined)}
                />
              </>
            ) : null}
            {page === "instagram" ? (
              <>
                <Field
                  label={t("Public Instagram profile URL", "رابط ملف إنستغرام العام")}
                  value={url}
                  onChangeText={setUrl}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="https://www.instagram.com/yourbusiness/"
                />
                <Txt variant="meta" muted>
                  {t("The account must be public. No Instagram sign-in needed.", "يجب أن يكون الحساب عامًا. لا تحتاج إلى تسجيل الدخول إلى إنستغرام.")}
                </Txt>
              </>
            ) : null}
            {page === "documents" ? (
              <Card>
                <Txt>{t("PDF, Word, TXT or images. Up to 5 files, 8 MB each.", "PDF أو Word أو TXT أو صور. حتى ٥ ملفات، ٨ ميغابايت لكل ملف.")}</Txt>
                {files.map((f) => (
                  <Txt key={f.id}>{f.filename}</Txt>
                ))}
                <Button
                  secondary
                  label={t("Choose files", "اختيار الملفات")}
                  onPress={() =>
                    void store.files
                      .pick([])
                      .then(setFiles)
                      .catch((e) => setError(errorMessage(e, t)))
                  }
                />
              </Card>
            ) : null}
            {page === "instagram" || page === "documents" ? (
              <>
                <Button
                  disabled={analysis?.status === "PROCESSING" || (page === "documents" && !files.length) || (page === "instagram" && !url.trim())}
                  label={analysis?.status === "PROCESSING" ? t("Reading…", "نقرأ الملفات…") : t("Understand my business", "تعرّف على نشاطي")}
                  onPress={() => void analyze()}
                />
                <TextAction label={t("Use quick manual setup instead", "استخدم الإعداد اليدوي المختصر")} onPress={() => setPage("manual")} />
              </>
            ) : null}
            {page === "summary" && profile ? (
              <>
                <Card>
                  <Txt variant="heading">{profile.businessName}</Txt>
                  <Txt>{profile.overview[locale]}</Txt>
                  {[
                    [t("What you offer", "ما تقدمه"), profile.offerSummary[locale]],
                    [t("Your audience", "جمهورك"), profile.idealCustomer[locale]],
                    [t("Your voice", "نبرة علامتك"), profile.brandVoice[locale]],
                    [t("Your first goal", "هدفك الأول"), profile.marketingFocus[locale]]
                  ].map(([label, value]) => (
                    <View key={label} style={{ gap: 6, marginTop: 8 }}>
                      <Txt variant="meta" muted>
                        {label}
                      </Txt>
                      <Txt>{value}</Txt>
                    </View>
                  ))}
                </Card>
                <Button label={t("Looks good. Let’s start.", "يبدو جيدًا. لنبدأ.")} onPress={() => void confirm()} />
                <TextAction label={t("Adjust the basics", "تعديل الأساسيات")} onPress={() => setPage("manual")} />
              </>
            ) : null}
          </>
        )}
      </Screen>
    </SafeAreaView>
  );
}
