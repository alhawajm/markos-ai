import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, BackHandler, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, FileText, Pencil, Sparkles, Trash2, Upload } from "lucide-react-native";
import type { BusinessProfile, OnboardingDocumentAnalysisRecord, OnboardingState } from "@markos/shared-types";
import { approveBusinessProfileSchema } from "@markos/validation";
import { sessionController } from "../auth/transport";
import { useAccount, useAppearance } from "../providers";
import { Button, Card, Field, Loading, Notice, Row, Screen, Txt } from "../ui";
import { QueryFailure } from "../content";
import { JoinWorkspace } from "../join-workspace";
import { errorMessage, LocalAppError } from "../errors";
import { ReferenceError } from "../campaigns/brief-store";
import type { Reference } from "../campaigns/brief-model";
import { BusinessDeviceStore, clearBusinessDeviceData } from "./device-store";
import { ModuleForm } from "./forms";
import { recoverDocumentAnalysis } from "./recovery";
import {
  clean,
  documentApproval,
  fields,
  fromDocuments,
  fromKnowledge,
  labels,
  meaningful,
  modules,
  moduleSummary,
  onboardingPayload,
  profileFields,
  schemas,
  type BusinessDraft
} from "./model";

type Page = "welcome" | "documents" | "module" | "review" | "profile";
type SetupDraft = {
  page: Page;
  step: number;
  draft: BusinessDraft;
  files: Reference[];
  analysisId?: string;
  profile?: BusinessProfile;
  interactionId?: string;
};

export function VerifyEmail() {
  const { api, session } = useAccount();
  const { t, locale } = useAppearance();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function run(send: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (send) {
        await api.requestEmailVerification({ email: session.user.email, locale });
        setMessage(
          t(
            "Check your email, including spam. Open the verification link, then return here.",
            "تحقّق من بريدك، بما فيه البريد غير المرغوب. افتح رابط التحقّق ثم عد إلى هنا."
          )
        );
      } else {
        await sessionController.renew();
        if (!sessionController.getSnapshot().session?.user.isVerified)
          setMessage(t("Your email is not verified yet. Open the link in your email first.", "لم يتم التحقّق من بريدك بعد. افتح الرابط في بريدك أولًا."));
      }
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Txt variant="title">{t("Check your email", "تحقّق من بريدك")}</Txt>
      <Txt>{session.user.email}</Txt>
      <Txt muted>{t("Verify your email to set up your business.", "تحقّق من بريدك لبدء إعداد نشاطك.")}</Txt>
      {message ? <Notice>{message}</Notice> : null}
      {error ? <Notice error>{error}</Notice> : null}
      <Button busy={busy} label={t("I’ve verified my email", "تحقّقت من بريدي")} onPress={() => void run(false)} />
      <Button secondary disabled={busy} label={t("Send verification email", "إرسال بريد التحقّق")} onPress={() => void run(true)} />
      <Button
        secondary
        disabled={busy}
        label={t("Use another account", "استخدام حساب آخر")}
        onPress={() => void sessionController.logout().catch((e) => setError(errorMessage(e, t)))}
      />
    </Screen>
  );
}

export function NativeOnboarding({ initial, onConnectInstagram }: { initial: OnboardingState; onConnectInstagram: () => void }) {
  const { api, scope, epoch, queryClient } = useAccount();
  const { t, locale, setPreferences, colors } = useAppearance();
  const store = useMemo(() => new BusinessDeviceStore<SetupDraft>(scope, epoch, "setup"), [scope, epoch]);
  const [state, setState] = useState(initial);
  const [saved, setSaved] = useState<SetupDraft | null>(null);
  const [analysis, setAnalysis] = useState<OnboardingDocumentAnalysisRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [diskError, setDiskError] = useState(false);
  const [diskSaving, setDiskSaving] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [done, setDone] = useState<OnboardingState | null>(null);
  const [profileLanguage, setProfileLanguage] = useState<"en" | "ar">(locale);
  const [returnToReview, setReturnToReview] = useState(false);
  const writeId = useRef(0);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function change(next: SetupDraft) {
    setSaved(next);
    setDiskSaving(true);
    const id = ++writeId.current;
    void store
      .save(next)
      .then(() => {
        if (mounted.current && id === writeId.current) {
          setDiskError(false);
          setDiskSaving(false);
        }
      })
      .catch(() => {
        if (mounted.current && id === writeId.current) {
          setDiskError(true);
          setDiskSaving(false);
        }
      });
  }
  async function load() {
    setLoadError(null);
    try {
      const [knowledge, active, local, latestState] = await Promise.all([
        api.businessKnowledge(),
        api.onboardingDocumentAnalysis(),
        store.read(),
        api.onboarding()
      ]);
      sessionController.assertEpoch(epoch);
      if (!mounted.current) return;
      const validLocal = local && modules.every((m) => local.draft?.[m] && typeof local.draft[m] === "object") && Array.isArray(local.files);
      let next: SetupDraft = validLocal ? local : { page: "welcome", step: 0, draft: fromKnowledge(knowledge), files: [] };
      if (active?.status === "READY" && active.result)
        next = { ...next, page: "review", analysisId: active.id, draft: local?.analysisId === active.id ? next.draft : fromDocuments(active.result.profile) };
      else if (active && ["PROCESSING", "FAILED"].includes(active.status)) next = { ...next, page: "documents", analysisId: active.id };
      else if (next.analysisId) next = { ...next, analysisId: undefined, page: "review", draft: fromKnowledge(knowledge) };
      setState(latestState);
      if (latestState.status === "COMPLETE") setDone(latestState);
      if (latestState.businessProfile.status === "DRAFT" && latestState.businessProfile.profile && latestState.businessProfile.interactionId)
        next = {
          ...next,
          page: "profile",
          profile:
            next.interactionId === latestState.businessProfile.interactionId
              ? (next.profile ?? latestState.businessProfile.profile)
              : latestState.businessProfile.profile,
          interactionId: latestState.businessProfile.interactionId
        };
      else if (next.page === "profile") next = { ...next, page: "review", profile: undefined, interactionId: undefined };
      setAnalysis(active);
      setSaved(next);
    } catch (e) {
      if (mounted.current) setLoadError(e);
    }
  }
  useEffect(() => {
    void load();
  }, [scope, epoch]);
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (busyRef.current) return true;
      if (!saved || done || saved.page === "welcome") return false;
      if (analysis && saved.page !== "module") return false;
      change({
        ...saved,
        page:
          saved.page === "profile"
            ? "review"
            : saved.page === "module"
              ? returnToReview || !!saved.analysisId
                ? "review"
                : saved.step > 0
                  ? "module"
                  : "welcome"
              : "welcome",
        step: saved.page === "module" && !returnToReview && !saved.analysisId ? Math.max(0, saved.step - 1) : saved.step
      });
      return true;
    });
    return () => listener.remove();
  }, [saved, done, returnToReview, analysis]);
  function acceptAnalysis(value: OnboardingDocumentAnalysisRecord | null) {
    setAnalysis(value);
    if (!value)
      setError(
        t(
          "This analysis has expired or was closed in another session. Your chosen files are still listed; analyze them again or enter details yourself.",
          "انتهت صلاحية التحليل أو أُغلق في جلسة أخرى. ما زالت ملفاتك المختارة ظاهرة؛ حلّلها مجددًا أو أدخل التفاصيل بنفسك."
        )
      );
    if (value?.status === "READY" && value.result)
      setSaved((old) => {
        if (!old) return old;
        const next: SetupDraft = { ...old, page: "review", analysisId: value.id, draft: fromDocuments(value.result!.profile) };
        void store.save(next).catch(() => setDiskError(true));
        return next;
      });
  }
  useEffect(() => {
    if (analysis?.status !== "PROCESSING" || busy) return;
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling || cancelled) return;
      polling = true;
      try {
        const next = await api.onboardingDocumentAnalysis();
        if (!cancelled) {
          if (next) setError("");
          acceptAnalysis(next);
        }
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, t));
      } finally {
        polling = false;
      }
    };
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void poll();
    }, 4000);
    const listener = AppState.addEventListener("change", (s) => {
      if (s === "active") void poll();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      listener.remove();
    };
  }, [analysis?.id, analysis?.status, busy, api]);
  async function run(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof ReferenceError
          ? t(
              "Choose up to five PDF, Word, TXT or image files: 8 MB per file, 20 MB total. Re-select a missing file.",
              "اختر حتى خمسة ملفات PDF أو Word أو نصوص أو صور: ٨ ميغابايت للملف و٢٠ ميغابايت إجمالًا. أعد اختيار أي ملف مفقود."
            )
          : errorMessage(e, t)
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function analyze(retry = false) {
    if (!saved) return;
    await run(async () => {
      const payload = retry ? null : await store.files.upload(saved.files);
      const result = await recoverDocumentAnalysis(
        () => (retry && analysis ? api.retryOnboardingDocumentAnalysis(analysis.id) : api.analyzeOnboardingDocuments(payload!)),
        () => api.onboardingDocumentAnalysis(),
        retry ? analysis?.id : undefined
      );
      acceptAnalysis(result);
      if (result.status !== "READY") change({ ...saved, page: "documents", analysisId: result.id });
    });
  }
  async function discard() {
    if (!saved) return;
    await run(async () => {
      if (analysis) await api.discardOnboardingDocumentAnalysis(analysis.id);
      await store.files.clear();
      setAnalysis(null);
      const knowledge = await api.businessKnowledge();
      change({ ...saved, files: [], analysisId: undefined, draft: fromKnowledge(knowledge), page: "welcome" });
    });
  }
  async function saveModule(skip = false) {
    if (!saved) return;
    const module = modules[saved.step]!;
    if (saved.analysisId && analysis?.status === "READY") {
      change({ ...saved, page: "review" });
      return;
    }
    await run(async () => {
      const parsed = schemas[module].safeParse(clean(saved.draft[module]));
      if (!skip && !parsed.success) {
        const key = String(parsed.error.issues[0]?.path[0] ?? "");
        const label = fields[module].find((f) => f.key === key)?.label ?? labels[module];
        throw new LocalAppError(t(`Check ${label[0].toLowerCase()} before continuing.`, `تحقّق من ${label[1]} قبل المتابعة.`));
      }
      const value = skip ? await api.skipOnboardingModule(module) : await api.saveOnboardingModule(module, onboardingPayload(module, saved.draft[module]));
      setState(value);
      const knowledge = await api.businessKnowledge();
      change({
        ...saved,
        draft: { ...saved.draft, [module]: fromKnowledge(knowledge)[module] },
        page: returnToReview || saved.step === 6 ? "review" : "module",
        step: returnToReview ? saved.step : Math.min(6, saved.step + 1)
      });
      setReturnToReview(false);
    });
  }
  async function generate() {
    if (!saved) return;
    await run(async () => {
      let value: OnboardingState;
      if (state.businessProfile.status === "DRAFT" && state.businessProfile.profile && state.businessProfile.interactionId) {
        change({
          ...saved,
          page: "profile",
          profile:
            saved.interactionId === state.businessProfile.interactionId ? (saved.profile ?? state.businessProfile.profile) : state.businessProfile.profile,
          interactionId: state.businessProfile.interactionId
        });
        return;
      }
      try {
        value = await api.generateBusinessProfile();
      } catch (e) {
        value = await api.onboarding();
        if (value.businessProfile.status !== "DRAFT") throw e;
      }
      setState(value);
      if (value.businessProfile.profile && value.businessProfile.interactionId)
        change({ ...saved, page: "profile", profile: value.businessProfile.profile, interactionId: value.businessProfile.interactionId });
    });
  }
  async function approveDocuments() {
    if (!saved || !analysis?.result) return;
    await run(async () => {
      let profile;
      try {
        profile = documentApproval(saved.draft);
      } catch {
        throw new LocalAppError(
          t(
            "Review the details. Add a business name and an offer summary or product, and check any incomplete fields.",
            "راجع التفاصيل. أضف اسم النشاط وملخص العروض أو منتجًا، وتحقّق من الحقول غير المكتملة."
          )
        );
      }
      const result = await api.approveOnboardingDocumentAnalysis(analysis.id, profile);
      setState(result.onboarding);
      setAnalysis(null);
      await store.files.clear();
      const knowledge = await api.businessKnowledge();
      change({ ...saved, analysisId: undefined, files: [], draft: fromKnowledge(knowledge), page: "review" });
    });
  }
  async function approveProfile() {
    if (!saved?.profile || !saved.interactionId) return;
    const input = { profile: saved.profile, interactionId: saved.interactionId };
    await run(async () => {
      if (!approveBusinessProfileSchema.safeParse(input).success)
        throw new LocalAppError(
          t("Complete every profile section in both English and Arabic before approval.", "أكمل جميع أقسام الملف بالإنجليزية والعربية قبل الاعتماد.")
        );
      let next;
      try {
        next = await api.approveBusinessProfile(input);
      } catch (e) {
        next = await api.onboarding();
        if (next.status !== "COMPLETE") throw e;
      }
      await store.clear();
      await store.files.clear();
      setDone(next);
    });
  }
  if (loadError)
    return (
      <Screen>
        <QueryFailure error={loadError} retry={() => void load()} />
      </Screen>
    );
  if (!saved) return <Loading />;
  const module = modules[saved.step] ?? "company";
  const reviewingDocuments = analysis?.status === "READY" && !!saved.analysisId;
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen key={done ? "done" : `${saved.page}:${saved.step}`}>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt variant="label">MARKOS</Txt>
          <Button secondary label={locale === "en" ? "العربية" : "English"} onPress={() => void setPreferences({ locale: locale === "en" ? "ar" : "en" })} />
        </Row>
        {done ? (
          <>
            <Card tone="tint">
              <Check color={colors.accent} size={32} />
              <Txt variant="title">{t("Your business is ready", "نشاطك جاهز")}</Txt>
              <Txt>
                {t(
                  "Next, connect Instagram and secure your account to prepare for publishing. You can also explore MARKOS first.",
                  "اربط إنستغرام وأمّن حسابك استعدادًا للنشر. يمكنك أيضًا استكشاف ماركوس أولًا."
                )}
              </Txt>
            </Card>
            <Button
              label={t("Connect Instagram", "ربط إنستغرام")}
              onPress={() => {
                queryClient.setQueryData([scope, "onboarding"], done);
                onConnectInstagram();
              }}
            />
            <Button label={t("Go to my workspace", "الانتقال إلى مساحة عملي")} onPress={() => queryClient.setQueryData([scope, "onboarding"], done)} />
          </>
        ) : (
          <>
            <Txt variant="title">
              {saved.page === "welcome"
                ? t("Let’s learn your business", "لنتعرّف على نشاطك")
                : saved.page === "documents"
                  ? t("Start with your files", "ابدأ بملفاتك")
                  : saved.page === "review"
                    ? t("Review your details", "راجع تفاصيلك")
                    : saved.page === "profile"
                      ? t("Your business profile", "ملف نشاطك")
                      : t(...labels[module])}
            </Txt>
            {saved.page === "welcome" ? (
              <>
                <JoinWorkspace />
                <Txt muted>
                  {t(
                    "Share your business documents or tell us about your business. You’ll review everything before approval.",
                    "شارك مستندات نشاطك أو حدّثنا عنه. ستراجع كل شيء قبل الاعتماد."
                  )}
                </Txt>
                <Button
                  secondary
                  icon={Upload}
                  label={t("Use business documents", "استخدام مستندات النشاط")}
                  onPress={() => change({ ...saved, page: "documents" })}
                />
                <Button
                  secondary
                  icon={Pencil}
                  label={t("Enter details myself", "إدخال التفاصيل بنفسي")}
                  onPress={() => change({ ...saved, page: "module", step: 0 })}
                />
                {state.readyForProfile ? (
                  <Button label={t("Review saved details", "مراجعة التفاصيل المحفوظة")} onPress={() => change({ ...saved, page: "review" })} />
                ) : null}
              </>
            ) : null}
            {saved.page === "documents" ? (
              <>
                <Txt muted>
                  {t(
                    "PDF, Word, TXT, PNG, JPG or WebP. Up to five files, 8 MB each, 20 MB total.",
                    "PDF أو Word أو نصوص أو PNG أو JPG أو WebP. حتى خمسة ملفات، ٨ ميغابايت لكل ملف و٢٠ ميغابايت إجمالًا."
                  )}
                </Txt>
                {(analysis?.files ?? saved.files).map((file, index) => (
                  <Card key={file.id}>
                    <Row>
                      <FileText size={22} color={colors.accent} />
                      <View style={{ flex: 1 }}>
                        <Txt variant="label">{file.filename}</Txt>
                        <Txt muted variant="meta">
                          {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
                        </Txt>
                      </View>
                      {!analysis ? (
                        <Button
                          secondary
                          icon={Trash2}
                          label={t("Remove", "إزالة")}
                          disabled={busy}
                          onPress={() => {
                            const selected = saved.files[index]!;
                            change({ ...saved, files: saved.files.filter((_, i) => i !== index) });
                            store.files.remove(selected);
                          }}
                        />
                      ) : null}
                    </Row>
                  </Card>
                ))}
                {!analysis ? (
                  <>
                    <Button
                      secondary
                      disabled={busy || saved.files.length >= 5}
                      label={t("Choose files", "اختيار الملفات")}
                      onPress={() => void run(async () => change({ ...saved, files: await store.files.pick(saved.files) }))}
                    />
                    <Button
                      icon={Sparkles}
                      busy={busy}
                      disabled={!saved.files.length}
                      label={t("Analyze files", "تحليل الملفات")}
                      onPress={() => void analyze()}
                    />
                  </>
                ) : analysis.status === "PROCESSING" ? (
                  <Card tone="tint">
                    <Loading />
                    <Txt>
                      {t("MARKOS is reading your files. You can return here to check progress.", "يقرأ ماركوس ملفاتك. يمكنك العودة إلى هنا لمتابعة التقدّم.")}
                    </Txt>
                  </Card>
                ) : (
                  <>
                    <Notice error>
                      {t(
                        "These files need another attempt. Retry, or discard them to choose different files or enter details yourself.",
                        "تحتاج هذه الملفات إلى محاولة أخرى. أعد المحاولة أو احذفها لاختيار ملفات مختلفة أو إدخال التفاصيل بنفسك."
                      )}
                    </Notice>
                    <Button busy={busy} label={t("Retry analysis", "إعادة التحليل")} onPress={() => void analyze(true)} />
                  </>
                )}
                <Txt variant="meta" muted>
                  {t(
                    "Unapproved files expire after 24 hours. Approval or discarding removes the staged files.",
                    "تنتهي صلاحية الملفات غير المعتمدة بعد ٢٤ ساعة. تُحذف الملفات المؤقتة عند الاعتماد أو الإلغاء."
                  )}
                </Txt>
                {analysis ? (
                  <Button
                    secondary
                    disabled={busy || analysis.status === "PROCESSING"}
                    label={t("Discard files and start again", "حذف الملفات والبدء مجددًا")}
                    onPress={() => void discard()}
                  />
                ) : (
                  <Button secondary disabled={busy} label={t("Back", "رجوع")} onPress={() => change({ ...saved, page: "welcome" })} />
                )}
              </>
            ) : null}
            {saved.page === "module" ? (
              <>
                <Txt variant="meta" muted>
                  {reviewingDocuments
                    ? t("Review extracted details", "مراجعة التفاصيل المستخرجة")
                    : t(
                        `Step ${saved.step + 1} of 7 · ${saved.step < 2 ? "Essential" : "Optional"}`,
                        `الخطوة ${saved.step + 1} من ٧ · ${saved.step < 2 ? "أساسية" : "اختيارية"}`
                      )}
                </Txt>
                <ModuleForm
                  module={module}
                  value={saved.draft[module]}
                  disabled={busy}
                  onChange={(value) => change({ ...saved, draft: { ...saved.draft, [module]: value } })}
                />
                <Button
                  busy={busy}
                  label={reviewingDocuments ? t("Back to review", "العودة للمراجعة") : t("Save and continue", "حفظ ومتابعة")}
                  onPress={() => void saveModule()}
                />
                {!reviewingDocuments && saved.step > 1 ? (
                  <Button secondary disabled={busy} label={t("Skip for now", "التخطي الآن")} onPress={() => void saveModule(true)} />
                ) : null}
                <Button
                  secondary
                  disabled={busy}
                  label={t("Back", "رجوع")}
                  onPress={() =>
                    change({
                      ...saved,
                      page: returnToReview || reviewingDocuments ? "review" : saved.step === 0 ? "welcome" : "module",
                      step: Math.max(0, saved.step - 1)
                    })
                  }
                />
              </>
            ) : null}
            {saved.page === "review" ? (
              <>
                <Txt muted>
                  {reviewingDocuments
                    ? t(
                        "Review the extracted facts, including inferred brand colors. Nothing becomes business knowledge until you approve these details.",
                        "راجع المعلومات المستخرجة، بما فيها ألوان العلامة المستنتجة. لن تُحفظ كمعرفة للنشاط حتى تعتمدها."
                      )
                    : t(
                        "Check your saved business details before MARKOS drafts your bilingual profile.",
                        "تحقّق من التفاصيل المحفوظة قبل أن يُعد ماركوس ملف نشاطك باللغتين."
                      )}
                </Txt>
                {analysis?.result?.issues.map((issue, i) => (
                  <Notice key={i}>
                    {issue.message}
                    {issue.sourceFiles.length ? `\n${issue.sourceFiles.join(" · ")}` : ""}
                  </Notice>
                ))}
                {modules.map((m, step) => (
                  <Card key={m}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Txt variant="heading">{t(...labels[m])}</Txt>
                      <Button
                        secondary
                        disabled={busy}
                        label={t("Review", "مراجعة")}
                        onPress={() => {
                          setReturnToReview(true);
                          change({ ...saved, page: "module", step });
                        }}
                      />
                    </Row>
                    <Txt muted>
                      {meaningful(saved.draft[m])
                        ? moduleSummary(m, saved.draft[m]) || t("Details added", "تمت إضافة التفاصيل")
                        : step < 2
                          ? t("Required", "مطلوب")
                          : t("Optional · no details yet", "اختياري · لا تفاصيل بعد")}
                    </Txt>
                    {reviewingDocuments
                      ? analysis?.result?.evidence
                          .filter((e) => e.field.startsWith(m === "products" ? "offerings" : m))
                          .map((e, i) => (
                            <Txt key={i} variant="meta" muted>
                              {t(...(fields[m].find((field) => field.key === e.field.split(".")[1])?.label ?? labels[m]))} ·{" "}
                              {e.confidence === "HIGH"
                                ? t("High confidence", "ثقة عالية")
                                : e.confidence === "MEDIUM"
                                  ? t("Medium confidence", "ثقة متوسطة")
                                  : t("Low confidence", "ثقة منخفضة")}{" "}
                              ·{" "}
                              {e.basis === "VISUAL_INFERENCE"
                                ? t("Visually inferred — please confirm", "مستنتج بصريًا — يرجى التأكيد")
                                : t("From document", "من المستند")}
                              {"\n"}
                              {e.sourceFiles.join(" · ")}
                            </Txt>
                          ))
                      : null}
                  </Card>
                ))}
                <Button
                  busy={busy}
                  icon={reviewingDocuments ? Check : Sparkles}
                  disabled={!reviewingDocuments && !state.readyForProfile}
                  label={
                    reviewingDocuments
                      ? t("Approve these details", "اعتماد هذه التفاصيل")
                      : state.businessProfile.status === "DRAFT"
                        ? t("Resume profile review", "متابعة مراجعة الملف")
                        : t("Draft my business profile", "إعداد مسودة ملف نشاطي")
                  }
                  onPress={() => void (reviewingDocuments ? approveDocuments() : generate())}
                />
                {reviewingDocuments ? (
                  <Button secondary disabled={busy} label={t("Discard extracted details", "إلغاء التفاصيل المستخرجة")} onPress={() => void discard()} />
                ) : (
                  <Button secondary disabled={busy} label={t("Back to setup", "العودة للإعداد")} onPress={() => change({ ...saved, page: "welcome" })} />
                )}
              </>
            ) : null}
            {saved.page === "profile" && saved.profile ? (
              <>
                <Notice>
                  {t(
                    "This is a draft. Review and edit both languages, then approve your business profile.",
                    "هذه مسودة. راجع وعدّل اللغتين ثم اعتمد ملف نشاطك."
                  )}
                </Notice>
                <Row>
                  <Button secondary={profileLanguage !== "en"} label="English" onPress={() => setProfileLanguage("en")} />
                  <Button secondary={profileLanguage !== "ar"} label="العربية" onPress={() => setProfileLanguage("ar")} />
                </Row>
                <Field
                  label={t("Business name", "اسم النشاط")}
                  editable={!busy}
                  value={saved.profile.businessName}
                  maxLength={200}
                  onChangeText={(businessName) => change({ ...saved, profile: { ...saved.profile!, businessName } })}
                />
                {profileFields.map((field) => (
                  <Field
                    key={field.key}
                    label={t(...field.label)}
                    value={saved.profile![field.key][profileLanguage]}
                    maxLength={2000}
                    multiline
                    editable={!busy}
                    style={{ textAlign: profileLanguage === "ar" ? "right" : "left", writingDirection: profileLanguage === "ar" ? "rtl" : "ltr" }}
                    onChangeText={(text) =>
                      change({ ...saved, profile: { ...saved.profile!, [field.key]: { ...saved.profile![field.key], [profileLanguage]: text } } })
                    }
                  />
                ))}
                <Button busy={busy} icon={Check} label={t("Approve business profile", "اعتماد ملف النشاط")} onPress={() => void approveProfile()} />
                <Button
                  secondary
                  disabled={busy}
                  label={t("Review business details", "مراجعة تفاصيل النشاط")}
                  onPress={() => change({ ...saved, page: "review" })}
                />
              </>
            ) : null}
            {diskError ? (
              <Notice error>
                {t(
                  "Your last edits could not be saved on this device. Keep the app open and try again.",
                  "تعذّر حفظ آخر تعديلاتك على الجهاز. أبقِ التطبيق مفتوحًا وحاول مجددًا."
                )}
              </Notice>
            ) : (
              <Txt variant="meta" muted>
                {diskSaving
                  ? t("Saving on this device…", "جارٍ الحفظ على الجهاز…")
                  : t("Unfinished edits stay on this device until you log out.", "تبقى التعديلات غير المكتملة على هذا الجهاز حتى تسجيل الخروج.")}
              </Txt>
            )}
            {diskError ? <Button secondary label={t("Retry device save", "إعادة الحفظ على الجهاز")} onPress={() => change(saved)} /> : null}
          </>
        )}
        {error ? (
          <>
            <Notice error>{error}</Notice>
            <Button secondary disabled={busy} label={t("Check saved setup", "التحقّق من الإعداد المحفوظ")} onPress={() => void load()} />
          </>
        ) : null}
        <Button
          secondary
          disabled={busy}
          label={t("Log out", "تسجيل الخروج")}
          onPress={() =>
            void run(async () => {
              await Promise.all([sessionController.logout(), clearBusinessDeviceData(scope, epoch)]);
            })
          }
        />
      </Screen>
    </SafeAreaView>
  );
}
