"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, LogOut, RefreshCcw, Save, ShieldCheck, UploadCloud } from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import type { AuthSession, Locale, MediaAssetRecord, OnboardingState } from "@markos/shared-types";

const sessionKey = "markos.session";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type Mode = "login" | "register";
type ModuleSlug = "company" | "story" | "products" | "audience" | "competitors" | "brand" | "objectives";

interface ModuleDefinition {
  slug: ModuleSlug;
  title: Record<Locale, string>;
  description: Record<Locale, string>;
  fields: Array<{
    name: string;
    label: Record<Locale, string>;
    kind?: "number" | "textarea";
    placeholder?: string;
  }>;
  toPayload: (values: Record<string, string>) => Record<string, unknown>;
}

const modules: ModuleDefinition[] = [
  {
    slug: "company",
    title: { ar: "الشركة", en: "Company" },
    description: { ar: "الاسم، المجال، الموقع، واللغات.", en: "Name, industry, location, and languages." },
    fields: [
      { name: "name", label: { ar: "اسم النشاط", en: "Business name" } },
      { name: "industry", label: { ar: "المجال", en: "Industry" } },
      { name: "size", label: { ar: "الحجم", en: "Size" } },
      { name: "location", label: { ar: "الموقع", en: "Location" } },
      { name: "languages", label: { ar: "اللغات", en: "Languages" }, placeholder: "Arabic, English" }
    ],
    toPayload: (values) => ({
      industry: valueOf(values, "industry"),
      languages: splitList(valueOf(values, "languages")),
      location: valueOf(values, "location"),
      name: valueOf(values, "name"),
      size: valueOf(values, "size") || undefined
    })
  },
  {
    slug: "story",
    title: { ar: "القصة", en: "Story" },
    description: { ar: "الرسالة، البداية، القيم، ونقطة التميز.", en: "Mission, origin, values, and USP." },
    fields: [
      { name: "mission", label: { ar: "الرسالة", en: "Mission" }, kind: "textarea" },
      { name: "origin", label: { ar: "البداية", en: "Origin" }, kind: "textarea" },
      { name: "values", label: { ar: "القيم", en: "Values" } },
      { name: "usp", label: { ar: "نقطة التميز", en: "USP" }, kind: "textarea" }
    ],
    toPayload: (values) => ({
      mission: valueOf(values, "mission"),
      origin: valueOf(values, "origin") || undefined,
      usp: valueOf(values, "usp"),
      values: splitList(valueOf(values, "values"))
    })
  },
  {
    slug: "products",
    title: { ar: "المنتجات", en: "Products" },
    description: { ar: "منتج رئيسي واحد كبداية.", en: "One primary product to start." },
    fields: [
      { name: "name", label: { ar: "اسم المنتج", en: "Product name" } },
      { name: "category", label: { ar: "الفئة", en: "Category" } },
      { name: "priceMinor", label: { ar: "السعر بالفلس", en: "Price in fils" }, kind: "number" },
      { name: "description", label: { ar: "الوصف", en: "Description" }, kind: "textarea" }
    ],
    toPayload: (values) => ({
      items: [
        {
          category: valueOf(values, "category") || undefined,
          currency: "BHD",
          description: valueOf(values, "description") || undefined,
          name: valueOf(values, "name"),
          priceMinor: valueOf(values, "priceMinor") ? Number(valueOf(values, "priceMinor")) : undefined
        }
      ]
    })
  },
  {
    slug: "audience",
    title: { ar: "الجمهور", en: "Audience" },
    description: { ar: "من نخاطب وما الذي يهمهم.", en: "Who we speak to and what matters to them." },
    fields: [
      { name: "demographics", label: { ar: "الوصف الديموغرافي", en: "Demographics" }, kind: "textarea" },
      { name: "interests", label: { ar: "الاهتمامات", en: "Interests" } },
      { name: "painPoints", label: { ar: "نقاط الألم", en: "Pain points" } }
    ],
    toPayload: (values) => ({
      demographics: valueOf(values, "demographics"),
      interests: splitList(valueOf(values, "interests")),
      painPoints: splitList(valueOf(values, "painPoints"))
    })
  },
  {
    slug: "competitors",
    title: { ar: "المنافسون", en: "Competitors" },
    description: { ar: "منافس واحد للمقارنة الأولية.", en: "One competitor for the first comparison." },
    fields: [
      { name: "name", label: { ar: "اسم المنافس", en: "Competitor name" } },
      { name: "instagramHandle", label: { ar: "حساب إنستغرام", en: "Instagram handle" } },
      { name: "notes", label: { ar: "ملاحظات", en: "Notes" }, kind: "textarea" }
    ],
    toPayload: (values) => ({
      items: [
        {
          instagramHandle: valueOf(values, "instagramHandle") || undefined,
          name: valueOf(values, "name"),
          notes: valueOf(values, "notes") || undefined
        }
      ]
    })
  },
  {
    slug: "brand",
    title: { ar: "الهوية", en: "Brand" },
    description: { ar: "الألوان، الخطوط، ونبرة الصوت.", en: "Colors, fonts, and tone of voice." },
    fields: [
      { name: "colors", label: { ar: "الألوان", en: "Colors" }, placeholder: "#0F2D52, #F64B6A" },
      { name: "fonts", label: { ar: "الخطوط", en: "Fonts" } },
      { name: "toneWords", label: { ar: "كلمات النبرة", en: "Tone words" } },
      { name: "voiceNotes", label: { ar: "ملاحظات الصوت", en: "Voice notes" }, kind: "textarea" }
    ],
    toPayload: (values) => ({
      colors: splitList(valueOf(values, "colors")),
      fonts: splitList(valueOf(values, "fonts")),
      guidelinesMediaId: valueOf(values, "guidelinesMediaId") || undefined,
      logoMediaId: valueOf(values, "logoMediaId") || undefined,
      toneWords: splitList(valueOf(values, "toneWords")),
      voiceNotes: valueOf(values, "voiceNotes") || undefined
    })
  },
  {
    slug: "objectives",
    title: { ar: "الأهداف", en: "Objectives" },
    description: { ar: "أهداف التسويق ومؤشرات القياس.", en: "Marketing goals and KPI targets." },
    fields: [
      { name: "goals", label: { ar: "الأهداف", en: "Goals" } },
      { name: "primaryKpi", label: { ar: "مؤشر رئيسي", en: "Primary KPI" } },
      { name: "target", label: { ar: "الهدف الرقمي", en: "Target" } }
    ],
    toPayload: (values) => ({
      goals: splitList(valueOf(values, "goals")),
      kpiTargets: valueOf(values, "primaryKpi") ? { [valueOf(values, "primaryKpi")]: valueOf(values, "target") || true } : {}
    })
  }
];

export function OnboardingPanel({ locale }: { locale: Locale }) {
  const [mode, setMode] = useState<Mode>("register");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleSlug>("company");
  const [authValues, setAuthValues] = useState({
    email: "",
    fullName: "",
    password: "",
    workspaceName: ""
  });
  const [moduleValues, setModuleValues] = useState<Record<string, string>>({});
  const [brandAssets, setBrandAssets] = useState<Record<string, MediaAssetRecord | undefined>>({});
  const [message, setMessage] = useState<string>("");
  const [isBusy, setIsBusy] = useState(false);

  const client = useMemo(() => {
    const options = {
      baseUrl: apiBaseUrl
    } satisfies { baseUrl: string; accessToken?: string; workspaceId?: string };

    return new MarkosApiClient(
      session
        ? {
            ...options,
            accessToken: session.tokens.accessToken,
            workspaceId: session.workspace.id
          }
        : options
    );
  }, [session]);
  const activeDefinition = modules.find((item) => item.slug === activeModule) ?? modules[0]!;
  const missingModules = modules.filter((item) => state?.modules.find((module) => module.module === item.slug)?.completed !== true);
  const activeModuleState = state?.modules.find((module) => module.module === activeDefinition.slug);
  const canComplete = Boolean(session) && !isBusy && (state?.vaultScore.score ?? 0) === 100;

  useEffect(() => {
    const stored = window.localStorage.getItem(sessionKey);
    if (stored) {
      setSession(JSON.parse(stored) as AuthSession);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void refreshState(client, setState, setMessage);
  }, [client, session]);

  async function submitAuth() {
    setIsBusy(true);
    setMessage("");

    try {
      const nextSession =
        mode === "register"
          ? await client.register(
              authValues.workspaceName
                ? {
                    email: authValues.email,
                    fullName: authValues.fullName,
                    locale,
                    password: authValues.password,
                    workspaceName: authValues.workspaceName
                  }
                : {
                    email: authValues.email,
                    fullName: authValues.fullName,
                    locale,
                    password: authValues.password
                  }
            )
          : await client.login({
              email: authValues.email,
              password: authValues.password
            });

      window.localStorage.setItem(sessionKey, JSON.stringify(nextSession));
      setSession(nextSession);
      setMessage(copy(locale, "signedIn"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function saveModule() {
    setIsBusy(true);
    setMessage("");

    try {
      const payload = activeDefinition.toPayload(moduleValues);
      const nextState = await client.saveOnboardingModule(activeDefinition.slug, payload);
      setState(nextState);
      setMessage(copy(locale, "saved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function complete() {
    setIsBusy(true);
    setMessage("");

    try {
      setState(await client.completeOnboarding());
      setMessage(copy(locale, "complete"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  function signOut() {
    window.localStorage.removeItem(sessionKey);
    setSession(null);
    setState(null);
    setMessage("");
  }

  return (
    <section className="mt-8 grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 text-accent">
          <ShieldCheck size={20} />
          <h2 className="text-base font-semibold text-navy">{copy(locale, "workspace")}</h2>
        </div>

        {session ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-navy">{session.workspace.name}</p>
              <p className="mt-1 text-xs text-muted">{session.user.email}</p>
            </div>
            <ProgressBar value={state?.vaultScore.score ?? 0} />
            <GapList
              locale={locale}
              missingModules={missingModules.map((item) => item.title[locale])}
              missingSections={state?.vaultScore.missingSections ?? []}
            />
            <div className="grid grid-cols-2 gap-2">
              <button className="inline-flex items-center justify-center gap-2 rounded-button border border-border px-3 py-2 text-sm" onClick={() => refreshState(client, setState, setMessage)} type="button">
                <RefreshCcw size={16} />
                {copy(locale, "refresh")}
              </button>
              <button className="inline-flex items-center justify-center gap-2 rounded-button border border-border px-3 py-2 text-sm" onClick={signOut} type="button">
                <LogOut size={16} />
                {copy(locale, "signOut")}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 rounded-button border border-border p-1">
              {(["register", "login"] as const).map((item) => (
                <button
                  className={mode === item ? "rounded-button bg-midnavy px-3 py-2 text-sm text-white" : "rounded-button px-3 py-2 text-sm text-muted"}
                  key={item}
                  onClick={() => setMode(item)}
                  type="button"
                >
                  {copy(locale, item)}
                </button>
              ))}
            </div>
            <Field label={copy(locale, "email")} onChange={(value) => setAuthValues((current) => ({ ...current, email: value }))} type="email" value={authValues.email} />
            {mode === "register" ? (
              <>
                <Field label={copy(locale, "fullName")} onChange={(value) => setAuthValues((current) => ({ ...current, fullName: value }))} value={authValues.fullName} />
                <Field label={copy(locale, "workspaceName")} onChange={(value) => setAuthValues((current) => ({ ...current, workspaceName: value }))} value={authValues.workspaceName} />
              </>
            ) : null}
            <Field label={copy(locale, "password")} onChange={(value) => setAuthValues((current) => ({ ...current, password: value }))} type="password" value={authValues.password} />
            <button className="w-full rounded-button bg-midnavy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={isBusy} onClick={submitAuth} type="button">
              {copy(locale, mode)}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-navy">{copy(locale, "onboarding")}</h2>
            <p className="mt-1 text-sm text-muted">{copy(locale, "onboardingSubtitle")}</p>
          </div>
          <button className="rounded-button bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!canComplete} onClick={complete} type="button">
            {copy(locale, "completeButton")}
          </button>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[220px_1fr]">
          <div className="grid gap-1">
            {modules.map((item) => {
              const done = state?.modules.find((module) => module.module === item.slug)?.completed ?? false;
              return (
                <button
                  className={activeModule === item.slug ? "flex items-center gap-2 rounded-button bg-midnavy px-3 py-2 text-sm text-white" : "flex items-center gap-2 rounded-button px-3 py-2 text-sm text-muted hover:bg-navy/5"}
                  key={item.slug}
                  onClick={() => {
                    setActiveModule(item.slug);
                    setModuleValues({});
                    setBrandAssets({});
                  }}
                  type="button"
                >
                  {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  {item.title[locale]}
                </button>
              );
            })}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-navy">{activeDefinition.title[locale]}</h3>
            <p className="mt-1 text-sm text-muted">{activeDefinition.description[locale]}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(activeModuleState?.sections ?? []).map((section) => {
                const complete = state?.vaultScore.completedSections.includes(section) ?? false;
                return (
                  <span
                    className={complete ? "rounded-full bg-accent/10 px-2 py-1 text-xs font-medium text-accent" : "rounded-full bg-navy/5 px-2 py-1 text-xs font-medium text-muted"}
                    key={section}
                  >
                    {sectionLabel(locale, section)}
                  </span>
                );
              })}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {activeDefinition.fields.map((field) => (
                <Field
                  {...(field.kind ? { kind: field.kind } : {})}
                  {...(field.placeholder ? { placeholder: field.placeholder } : {})}
                  key={field.name}
                  label={field.label[locale]}
                  onChange={(value) => setModuleValues((current) => ({ ...current, [field.name]: value }))}
                  value={moduleValues[field.name] ?? ""}
                />
              ))}
            </div>
            {activeDefinition.slug === "brand" ? (
              <BrandAssetUploads
                assets={brandAssets}
                client={client}
                disabled={!session || isBusy}
                locale={locale}
                onUploaded={(key, asset) => {
                  setBrandAssets((current) => ({ ...current, [key]: asset }));
                  setModuleValues((current) => ({ ...current, [key]: asset.id }));
                  setMessage(copy(locale, "uploaded"));
                }}
                setBusy={setIsBusy}
                setMessage={setMessage}
              />
            ) : null}
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="min-h-5 text-sm text-muted">{message}</p>
              <button className="inline-flex items-center gap-2 rounded-button bg-midnavy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!session || isBusy} onClick={saveModule} type="button">
                <Save size={16} />
                {copy(locale, "save")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  kind,
  label,
  onChange,
  placeholder,
  type = "text",
  value
}: {
  kind?: "number" | "textarea";
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  const className = "mt-1 w-full rounded-input border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <label className={kind === "textarea" ? "md:col-span-2" : undefined}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {kind === "textarea" ? (
        <textarea className={`${className} min-h-24 resize-y`} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
      ) : (
        <input className={className} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={kind === "number" ? "number" : type} value={value} />
      )}
    </label>
  );
}

function BrandAssetUploads({
  assets,
  client,
  disabled,
  locale,
  onUploaded,
  setBusy,
  setMessage
}: {
  assets: Record<string, MediaAssetRecord | undefined>;
  client: MarkosApiClient;
  disabled: boolean;
  locale: Locale;
  onUploaded: (key: "guidelinesMediaId" | "logoMediaId", asset: MediaAssetRecord) => void;
  setBusy: (busy: boolean) => void;
  setMessage: (message: string) => void;
}) {
  async function upload(key: "guidelinesMediaId" | "logoMediaId", file: File | undefined) {
    if (!file) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const asset = await client.uploadMedia({
        type: "BRAND_ASSET",
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        base64Data: await fileToBase64(file)
      });
      onUploaded(key, asset);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <UploadField
        accept="image/*"
        asset={assets.logoMediaId}
        disabled={disabled}
        label={copy(locale, "logoUpload")}
        onChange={(file) => upload("logoMediaId", file)}
      />
      <UploadField
        accept=".pdf,image/*"
        asset={assets.guidelinesMediaId}
        disabled={disabled}
        label={copy(locale, "guidelinesUpload")}
        onChange={(file) => upload("guidelinesMediaId", file)}
      />
    </div>
  );
}

function UploadField({
  accept,
  asset,
  disabled,
  label,
  onChange
}: {
  accept: string;
  asset: MediaAssetRecord | undefined;
  disabled: boolean;
  label: string;
  onChange: (file: File | undefined) => void;
}) {
  return (
    <label className="rounded-card border border-dashed border-border bg-canvas p-3">
      <span className="flex items-center gap-2 text-xs font-medium text-muted">
        <UploadCloud size={16} />
        {label}
      </span>
      <input
        accept={accept}
        className="mt-2 block w-full text-xs text-muted file:me-3 file:rounded-button file:border-0 file:bg-midnavy file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white disabled:opacity-50"
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0])}
        type="file"
      />
      {asset ? (
        <a className="mt-2 block truncate text-xs font-medium text-accent" href={asset.publicUrl} rel="noreferrer" target="_blank">
          {asset.filename}
        </a>
      ) : null}
    </label>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Vault</span>
        <span>{value}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-navy/10">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function GapList({
  locale,
  missingModules,
  missingSections
}: {
  locale: Locale;
  missingModules: string[];
  missingSections: OnboardingState["vaultScore"]["missingSections"];
}) {
  if (missingSections.length === 0) {
    return (
      <div className="rounded-card border border-accent/20 bg-accent/5 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-accent">
          <CheckCircle2 size={16} />
          {copy(locale, "allComplete")}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-canvas p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-navy">
        <AlertCircle size={16} className="text-accent" />
        {copy(locale, "remaining")}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {missingModules.map((module) => (
          <span className="rounded-full bg-white px-2 py-1 text-xs text-muted" key={module}>
            {module}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted">
        {copy(locale, "missingSections")}: {missingSections.map((section) => sectionLabel(locale, section)).join(", ")}
      </p>
    </div>
  );
}

async function refreshState(
  client: MarkosApiClient,
  setState: (state: OnboardingState) => void,
  setMessage: (message: string) => void
) {
  try {
    setState(await client.onboarding());
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Request failed");
  }
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function valueOf(values: Record<string, string>, key: string): string {
  return values[key] ?? "";
}

function sectionLabel(locale: Locale, section: OnboardingState["vaultScore"]["requiredSections"][number]): string {
  const labels: Record<OnboardingState["vaultScore"]["requiredSections"][number], Record<Locale, string>> = {
    AUDIENCE: { ar: "الجمهور", en: "Audience" },
    BRAND: { ar: "الهوية", en: "Brand" },
    COMPANY: { ar: "الشركة", en: "Company" },
    COMPETITORS: { ar: "المنافسون", en: "Competitors" },
    OBJECTIVES: { ar: "الأهداف", en: "Objectives" },
    PRODUCTS: { ar: "المنتجات", en: "Products" },
    STORY: { ar: "القصة", en: "Story" },
    TONE: { ar: "النبرة", en: "Tone" }
  };

  return labels[section][locale];
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window.btoa(binary);
}

function copy(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      allComplete: "كل وحدات المعرفة مكتملة",
      complete: "اكتملت التهيئة",
      completeButton: "إنهاء التهيئة",
      email: "البريد الإلكتروني",
      failed: "تعذر تنفيذ الطلب",
      fullName: "الاسم الكامل",
      guidelinesUpload: "رفع دليل الهوية",
      login: "تسجيل الدخول",
      logoUpload: "رفع الشعار",
      onboarding: "تهيئة معرفة النشاط",
      onboardingSubtitle: "كل وحدة تحفظ معرفة قابلة للاسترجاع في الخزنة.",
      missingSections: "الأقسام الناقصة",
      password: "كلمة المرور",
      refresh: "تحديث",
      remaining: "المتبقي للإكمال",
      register: "إنشاء حساب",
      save: "حفظ الوحدة",
      saved: "تم الحفظ",
      signedIn: "تم تسجيل الدخول",
      signOut: "خروج",
      uploaded: "تم رفع الملف",
      workspace: "مساحة العمل",
      workspaceName: "اسم مساحة العمل"
    },
    en: {
      allComplete: "All knowledge modules are complete",
      complete: "Onboarding complete",
      completeButton: "Complete onboarding",
      email: "Email",
      failed: "Request failed",
      fullName: "Full name",
      guidelinesUpload: "Upload brand guidelines",
      login: "Log in",
      logoUpload: "Upload logo",
      onboarding: "Business Knowledge Onboarding",
      onboardingSubtitle: "Each module saves retrievable business memory into the Vault.",
      missingSections: "Missing sections",
      password: "Password",
      refresh: "Refresh",
      remaining: "Remaining to complete",
      register: "Create account",
      save: "Save module",
      saved: "Saved",
      signedIn: "Signed in",
      signOut: "Sign out",
      uploaded: "Uploaded",
      workspace: "Workspace",
      workspaceName: "Workspace name"
    }
  };

  return dictionary[locale][key] ?? key;
}
