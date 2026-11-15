"use client";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, FileText, Instagram, LoaderCircle, Pencil, Sparkles } from "lucide-react";
import type { Locale, OnboardingState, OnboardingDocumentAnalysisRecord } from "@markos/shared-types";
import {
  emptyQuickOnboarding,
  quickOnboardingSchema,
  quickDetailsFromDocuments,
  quickDetailsFromKnowledge,
  type QuickOnboardingDetails
} from "@markos/validation";
import { useMarkosClient, useMarkosSession } from "./browser-session";
import type { OnboardingDraft } from "./onboarding-draft";
import "./quick-onboarding.css";

type Page = "choose" | "manual" | "instagram" | "documents" | "summary";
export function QuickOnboarding({ locale, initialState, initialDraft }: { locale: Locale; initialState: OnboardingState; initialDraft?: OnboardingDraft }) {
  const ar = locale === "ar",
    t = (en: string, arabic: string) => (ar ? arabic : en);
  const api = useMarkosClient(locale),
    session = useMarkosSession(),
    router = useRouter();
  const key = `markos.quick-setup:${session?.user.id}:${session?.workspace.id}`;
  const [details, setDetails] = useState<QuickOnboardingDetails>(() =>
    initialDraft
      ? {
          name: initialDraft.businessName,
          offer: initialDraft.offer,
          location: initialDraft.market,
          audience: initialDraft.audience,
          voice: initialDraft.voice || initialDraft.toneWords,
          goal: initialDraft.priority
        }
      : emptyQuickOnboarding()
  );
  const [state, setState] = useState(initialState),
    [page, setPage] = useState<Page>(initialState.businessProfile.status === "DRAFT" ? "summary" : "choose");
  const [analysis, setAnalysis] = useState<OnboardingDocumentAnalysisRecord | null>(null),
    [url, setUrl] = useState(""),
    [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [restored, setRestored] = useState(false);
  const preparing = useRef<string | null>(null),
    alive = useRef(true);
  const detailsEdited = useRef(false);
  const message = (e: unknown) =>
    e instanceof Error ? e.message : t("Could not finish. Your details are kept here.", "تعذر إكمال الطلب. تفاصيلك محفوظة هنا.");
  async function prepare(value: QuickOnboardingDetails, sourceId?: string) {
    const parsed = quickOnboardingSchema.safeParse(value);
    setDetails(value);
    if (!parsed.success) {
      setPage("manual");
      setError(t("Add your business name and what you offer. The other answers can wait.", "أضف اسم نشاطك وما تقدمه فقط. يمكنك إضافة البقية لاحقًا."));
      return;
    }
    setBusy(t("Preparing your short business summary…", "نعدّ ملخصًا قصيرًا لنشاطك…"));
    setError("");
    try {
      const next = await api.previewQuickOnboarding({ details: parsed.data, ...(sourceId ? { analysisId: sourceId } : {}) });
      if (alive.current) {
        setState(next);
        setPage("summary");
      }
    } catch (e) {
      if (alive.current) setError(message(e));
    } finally {
      if (alive.current) setBusy("");
    }
  }
  async function acceptAnalysis(value: OnboardingDocumentAnalysisRecord) {
    if (detailsEdited.current) return;
    setAnalysis(value);
    if (value.status === "READY" && value.result && preparing.current !== value.id && !detailsEdited.current) {
      preparing.current = value.id;
      await prepare(quickDetailsFromDocuments(value.result.profile), value.id);
    }
    if (value.status === "FAILED")
      setError(t("We couldn’t read these files. Retry, or use the six-question setup.", "تعذرت قراءة الملفات. أعد المحاولة أو استخدم الإعداد المختصر."));
  }
  const restore = useEffectEvent(() => {
    let saved = false;
    try {
      for (const legacyKey of ["markos.onboarding.draft", "markos.onboarding.draft.v2", "markos.onboarding.draft.v3"]) localStorage.removeItem(legacyKey);
      const raw = localStorage.getItem(key);
      if (raw) {
        const d = JSON.parse(raw);
        detailsEdited.current = d.manual === true;
        if (d.details) {
          setDetails({ ...emptyQuickOnboarding(), ...d.details });
          saved = true;
        }
        if (typeof d.url === "string") setUrl(d.url);
      }
    } catch {}
    setRestored(true);
    void Promise.all([api.businessKnowledge(), api.onboardingDocumentAnalysis()])
      .then(([knowledge, active]) => {
        if (!alive.current) return;
        if (!saved && !initialDraft && !detailsEdited.current) setDetails(quickDetailsFromKnowledge(knowledge));
        if (active && !detailsEdited.current) {
          setAnalysis(active);
          if (initialState.businessProfile.status !== "DRAFT") {
            setPage(active.status === "READY" ? "manual" : "documents");
            if (active.status === "READY") void acceptAnalysis(active);
          }
        }
      })
      .catch((e) => {
        if (alive.current) setError(message(e));
      });
  });
  useEffect(() => {
    alive.current = true;
    restore();
    return () => {
      alive.current = false;
    };
  }, [key]);
  useEffect(() => {
    if (restored)
      try {
        localStorage.setItem(key, JSON.stringify({ details, url, manual: detailsEdited.current && !analysis }));
      } catch {}
  }, [details, url, key, restored, page, analysis]);
  const pollAnalysis = useEffectEvent(() => {
    void api
      .onboardingDocumentAnalysis()
      .then((v) => {
        if (alive.current && v) void acceptAnalysis(v);
      })
      .catch(() => {});
  });
  useEffect(() => {
    if (analysis?.status !== "PROCESSING") return;
    const timer = setInterval(() => {
      pollAnalysis();
    }, 2500);
    return () => clearInterval(timer);
  }, [analysis?.id, analysis?.status]);
  async function analyze(event: FormEvent) {
    detailsEdited.current = false;
    event.preventDefault();
    setError("");
    setBusy(
      page === "instagram" ? t("Reading your public Instagram profile…", "نقرأ ملف إنستغرام العام…") : t("Reading your business files…", "نقرأ ملفات نشاطك…")
    );
    try {
      if (analysis && analysis.status !== "PROCESSING") await api.discardOnboardingDocumentAnalysis(analysis.id);
      preparing.current = null;
      const result =
        page === "instagram"
          ? await api.analyzeInstagramProfile(url)
          : await api.analyzeOnboardingDocuments(
              await Promise.all(files.map(async (file) => ({ filename: file.name, mimeType: fileMime(file), base64Data: await fileBase64(file) })))
            );
      await acceptAnalysis(result);
    } catch (e) {
      const active = await api.onboardingDocumentAnalysis().catch(() => null);
      if (active) await acceptAnalysis(active);
      else
        setError(
          page === "instagram"
            ? t(
                "Instagram couldn’t make this public profile readable. Check the link and account privacy, or use files or quick setup.",
                "لم يتيح إنستغرام قراءة هذا الملف. تحقق من الرابط وأن الحساب عام، أو استخدم الملفات أو الإعداد المختصر."
              )
            : message(e)
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
      await api.confirmQuickOnboarding(id);
      try {
        localStorage.removeItem(key);
      } catch {}
      router.replace(`/${locale}/app`);
    } catch (e) {
      setError(message(e));
    } finally {
      if (alive.current) setBusy("");
    }
  }
  const fields: [keyof QuickOnboardingDetails, string, string, boolean][] = [
    ["name", t("Business name", "اسم النشاط"), t("What should MARKOS call your business?", "ما اسم نشاطك؟"), false],
    ["offer", t("What do you offer?", "ماذا تقدم؟"), t("A sentence about your products or services", "جملة عن منتجاتك أو خدماتك"), true],
    ["location", t("Where do you operate? · optional", "أين تعمل؟ · اختياري"), t("City, country or online", "المدينة أو الدولة أو عبر الإنترنت"), false],
    ["audience", t("Who is it for? · optional", "من هم عملاؤك؟ · اختياري"), t("Who you would like to reach", "من ترغب في الوصول إليه"), false],
    [
      "voice",
      t("How should your brand sound? · optional", "كيف تريد أن تتحدث علامتك؟ · اختياري"),
      t("For example: warm, simple and confident", "مثلًا: ودود وبسيط وواثق"),
      false
    ],
    [
      "goal",
      t("What would you like to achieve? · optional", "ما الذي تريد تحقيقه؟ · اختياري"),
      t("Your first marketing priority", "أولويتك التسويقية الأولى"),
      false
    ]
  ];
  const profile = state.businessProfile.profile;
  return (
    <main className="sunlit-theme sunlit-app quick-setup" dir={ar ? "rtl" : "ltr"}>
      <div className="quick-setup-brand">
        MARKOS <span>AI</span>
      </div>
      <section className="quick-setup-card">
        {page !== "choose" && !busy ? (
          <button
            className="quick-setup-back"
            type="button"
            onClick={() => {
              setPage("choose");
              setError("");
            }}
          >
            <ArrowLeft size={17} />
            {t("Back", "رجوع")}
          </button>
        ) : null}
        <div className="quick-setup-kicker">
          <Sparkles size={19} />
          {t("A little context. A better start.", "سياق بسيط. بداية أفضل.")}
        </div>
        <h1>
          {page === "summary"
            ? t("Here’s what I understand.", "هذا ما فهمته عن نشاطك.")
            : page === "manual"
              ? t("Just the essentials.", "الأساسيات فقط.")
              : t("Let’s get to know your business.", "لنتعرّف على نشاطك.")}
        </h1>
        <p className="quick-setup-intro">
          {page === "summary"
            ? t(
                "Check this short summary. You can refine the details any time inside MARKOS.",
                "راجع هذا الملخص القصير. يمكنك تحسين التفاصيل في أي وقت داخل ماركوس."
              )
            : t("Choose the easiest way to start. Connect Instagram for publishing later.", "اختر أسهل طريقة للبدء. ربط إنستغرام للنشر يأتي لاحقًا.")}
        </p>
        {error ? (
          <p className="quick-setup-error" role="alert">
            {error}
          </p>
        ) : null}
        {busy ? (
          <div className="quick-setup-progress" role="status">
            <LoaderCircle className="animate-spin" size={22} />
            <p>{busy}</p>
            <small>{t("No long forms. We’ll show you a summary to confirm.", "بدون استمارات طويلة. سنعرض ملخصًا لتأكيده.")}</small>
          </div>
        ) : null}
        {page === "choose" && !busy ? (
          <div className="quick-setup-options">
            {(
              [
                ["instagram", Instagram, t("Use your Instagram", "استخدم إنستغرام"), t("Paste your public business profile link", "ألصق رابط ملف نشاطك العام")],
                [
                  "documents",
                  FileText,
                  t("Upload business files", "ارفع ملفات النشاط"),
                  t("A proposal, menu or brand guide · up to 5 files", "عرض أو قائمة أو دليل للعلامة · حتى ٥ ملفات")
                ],
                [
                  "manual",
                  Pencil,
                  t("Tell me the basics", "أخبرني بالأساسيات"),
                  t("Six short answers. Only two are required.", "ست إجابات قصيرة. اثنتان فقط مطلوبتان.")
                ]
              ] as const
            ).map(([value, Icon, title, body]) => (
              <button
                key={value}
                className="quick-setup-option"
                onClick={() => {
                  if (value === "manual") {
                    detailsEdited.current = true;
                    setAnalysis(null);
                  }
                  setPage(value);
                }}
              >
                <Icon size={23} />
                <span>
                  <strong>{title}</strong>
                  <small>{body}</small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        ) : null}
        {page === "manual" && !busy ? (
          <form
            className="quick-setup-form"
            onSubmit={(e) => {
              e.preventDefault();
              void prepare(details, analysis?.status === "READY" ? analysis.id : undefined);
            }}
          >
            {fields.map(([key, label, placeholder, area]) => (
              <label key={key}>
                {label}
                {area ? (
                  <textarea
                    rows={3}
                    value={details[key]}
                    required={key === "offer"}
                    maxLength={2000}
                    placeholder={placeholder}
                    onChange={(e) => {
                      detailsEdited.current = true;
                      setDetails({ ...details, [key]: e.target.value });
                    }}
                  />
                ) : (
                  <input
                    value={details[key]}
                    required={key === "name"}
                    maxLength={key === "name" ? 160 : key === "location" ? 120 : 1000}
                    placeholder={placeholder}
                    onChange={(e) => {
                      detailsEdited.current = true;
                      setDetails({ ...details, [key]: e.target.value });
                    }}
                  />
                )}
              </label>
            ))}
            <button className="sunlit-primary quick-setup-primary" type="submit">
              {t("Review my summary", "مراجعة الملخص")}
              <ArrowRight size={18} />
            </button>
          </form>
        ) : null}
        {(page === "instagram" || page === "documents") && !busy ? (
          <form className="quick-setup-form" onSubmit={(e) => void analyze(e)}>
            {page === "instagram" ? (
              <label>
                {t("Public Instagram profile URL", "رابط ملف إنستغرام العام")}
                <input type="url" required placeholder="https://www.instagram.com/yourbusiness/" value={url} onChange={(e) => setUrl(e.target.value)} />
                <small>
                  {t("The account must be public. No Instagram sign-in is needed.", "يجب أن يكون الحساب عامًا. لا تحتاج إلى تسجيل الدخول إلى إنستغرام.")}
                </small>
              </label>
            ) : (
              <label className="quick-setup-upload">
                {t("Choose up to 5 files", "اختر حتى ٥ ملفات")}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const picked = [...files];
                    for (const file of Array.from(e.target.files ?? []))
                      if (!picked.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified))
                        picked.push(file);
                    e.target.value = "";
                    if (picked.length > 5 || picked.some((f) => f.size > 8_000_000) || picked.reduce((s, f) => s + f.size, 0) > 20_000_000) {
                      setError(t("Choose up to 5 files, 8 MB each and 20 MB total.", "اختر حتى ٥ ملفات، ٨ ميغابايت لكل ملف و٢٠ ميغابايت إجمالًا."));
                      return;
                    }
                    setFiles(picked);
                    setError("");
                  }}
                />
                {files.length ? <small>{files.length}/5</small> : null}
                {files.map((f) => (
                  <small key={`${f.name}:${f.size}:${f.lastModified}`}>{f.name}</small>
                ))}
              </label>
            )}
            <button
              type="submit"
              className="sunlit-primary quick-setup-primary"
              disabled={analysis?.status === "PROCESSING" || (page === "documents" && !files.length)}
            >
              {analysis?.status === "PROCESSING" ? t("Reading…", "نقرأ الملفات…") : t("Understand my business", "تعرّف على نشاطي")}
              <ArrowRight size={18} />
            </button>
            <button
              type="button"
              className="quick-setup-back"
              onClick={() => {
                detailsEdited.current = true;
                setAnalysis(null);
                setPage("manual");
              }}
            >
              {t("Use quick manual setup instead", "استخدم الإعداد اليدوي المختصر")}
            </button>
          </form>
        ) : null}
        {page === "summary" && profile && !busy ? (
          <div className="quick-setup-summary">
            <h2>{profile.businessName}</h2>
            <p>{profile.overview[locale]}</p>
            {[
              [t("What you offer", "ما تقدمه"), profile.offerSummary[locale]],
              [t("Your audience", "جمهورك"), profile.idealCustomer[locale]],
              [t("Your voice", "نبرة علامتك"), profile.brandVoice[locale]],
              [t("Your first goal", "هدفك الأول"), profile.marketingFocus[locale]]
            ].map(([label, value]) => (
              <div key={label}>
                <strong>{label}</strong>
                <p>{value}</p>
              </div>
            ))}
            <button className="sunlit-primary quick-setup-primary" onClick={() => void confirm()}>
              {t("Looks good. Let’s start.", "يبدو جيدًا. لنبدأ.")}
              <ArrowRight size={18} />
            </button>
            <button type="button" className="quick-setup-back" onClick={() => setPage("manual")}>
              {t("Adjust the basics", "تعديل الأساسيات")}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Could not read file"));
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.readAsDataURL(file);
  });
}
function fileMime(file: File) {
  const types: Record<
    string,
    "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "text/plain" | "image/png" | "image/jpeg" | "image/webp"
  > = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp"
  };
  const mime = types[file.name.split(".").pop()?.toLowerCase() ?? ""];
  if (!mime) throw new Error("Unsupported file");
  return mime;
}
