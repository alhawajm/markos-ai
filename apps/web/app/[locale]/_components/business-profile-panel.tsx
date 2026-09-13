"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Building2, Check, ChevronLeft, ChevronRight, LoaderCircle, Package, Palette, Pencil, Plus, Search, Target, Users, X } from "lucide-react";
import { MarkosApiError } from "@markos/api-client";
import type { BusinessKnowledgeRecord, Locale, OfferingMaintenanceUpdate, OfferingRecord } from "@markos/shared-types";
import { useMarkosClient, useMarkosSession } from "./browser-session";
import { useModalDialog } from "./use-modal-dialog";
import styles from "./business-profile-panel.module.css";
import {
  isBrandColor,
  parseOfferingMoney,
  establishmentOptions,
  profileChanges,
  profileFieldValue,
  profileSections,
  profileTab,
  profileTabs,
  profileText,
  type ProfileField,
  type ProfileSection
} from "./business-profile-fields";

const secondary = "sunlit-secondary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5";
const primary = "sunlit-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5";
const fieldClass = "sunlit-field rounded-xl px-3 py-2.5";
const icons = [Target, Package, Users, Palette, Building2];
function message(error: unknown, locale: Locale): string {
  if (error instanceof MarkosApiError && error.details?.length) {
    const issues = error.details.flatMap((issue) =>
      typeof issue === "object" && issue !== null && "message" in issue && typeof issue.message === "string" ? [issue.message] : []
    );
    if (issues.length) return [...new Set(issues)].join("; ");
  }
  return error instanceof Error ? error.message : locale === "ar" ? "تعذر حفظ التغييرات." : "Could not save changes.";
}

type Editing = { kind: "section"; section: ProfileSection } | { kind: "offering"; offering?: OfferingRecord } | { kind: "catalog" };

export function BusinessProfilePanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = profileTab(params.get("tab"));
  const [data, setData] = useState<BusinessKnowledgeRecord | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState("");
  const editable = Boolean(
    session?.user.isVerified && session.roles.some((role) => ["OWNER", "WORKSPACE_ADMIN", "EDITOR", "SUPER_ADMIN", "PRODUCT_ADMIN"].includes(role))
  );
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setError("");
    setData(null);
    client
      .businessKnowledge()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active) setError(message(cause, locale));
      });
    return () => {
      active = false;
    };
  }, [client, session, attempt, locale]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function saved(value: BusinessKnowledgeRecord) {
    setData(value);
    setEditing(null);
    setNotice(t("Changes saved", "تم حفظ التغييرات"));
  }
  async function reload() {
    const current = await client.businessKnowledge();
    setData(current);
    return current;
  }

  return (
    <section className="min-w-0 space-y-6" aria-labelledby="business-profile-title">
      <header>
        <h1 id="business-profile-title" className="text-3xl font-semibold">
          {t("Business profile", "ملف النشاط")}
        </h1>
        {data?.updatedAt ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            {String(data.modules.company.name || session?.workspace.name || "")} · {t("Updated", "آخر تحديث")}{" "}
            <time dateTime={data.updatedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(data.updatedAt))}</time>
          </p>
        ) : null}
      </header>
      <nav aria-label={t("Business profile sections", "أقسام ملف النشاط")} className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {profileTabs.map((item, index) => {
          const Icon = icons[index]!;
          const search = new URLSearchParams(params.toString());
          search.set("tab", item.id);
          return (
            <Link
              key={item.id}
              href={`${pathname}?${search}`}
              scroll={false}
              aria-current={tab === item.id ? "page" : undefined}
              className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-base font-medium ${tab === item.id ? "border-[var(--link)] text-[var(--link)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}
            >
              <Icon size={19} aria-hidden="true" />
              {profileText(item.label, locale)}
            </Link>
          );
        })}
      </nav>
      {error ? (
        <div role="alert" className="space-y-3 text-[var(--danger)]">
          <p>{error}</p>
          <button className={secondary} onClick={() => setAttempt((value) => value + 1)}>
            {t("Try again", "حاول مجدداً")}
          </button>
        </div>
      ) : !data ? (
        <div role="status" className="flex items-center gap-3 py-12 text-[var(--muted)]">
          <LoaderCircle size={22} className="animate-spin" />
          {t("Loading business profile…", "جارٍ تحميل ملف النشاط…")}
        </div>
      ) : !data.approved ? (
        <div className="sunlit-panel space-y-4 rounded-2xl p-6">
          <h2 className="text-xl font-semibold">{t("Approve your business profile first", "اعتمد ملف نشاطك أولاً")}</h2>
          <p>
            {t(
              "Complete onboarding to review your business knowledge. You can maintain it here afterward.",
              "أكمل الإعداد لمراجعة معلومات نشاطك. يمكنك تعديلها هنا بعد ذلك."
            )}
          </p>
          <Link className={primary} href={`/${locale}/onboarding`}>
            {t("Continue onboarding", "متابعة الإعداد")}
          </Link>
        </div>
      ) : (
        <>
          {tab === "products-services" ? (
            <OfferingCatalogView
              locale={locale}
              data={data}
              editable={editable}
              onEdit={(offering) => setEditing({ kind: "offering", offering })}
              onAdd={() => setEditing({ kind: "offering" })}
              onCatalog={() => setEditing({ kind: "catalog" })}
            />
          ) : (
            <div className="grid items-start gap-5 xl:grid-cols-2">
              {profileSections
                .filter((section) => section.tab === tab)
                .map((section) => (
                  <section key={section.id} className={`sunlit-panel min-w-0 rounded-2xl p-6 ${styles.section}`} aria-labelledby={`profile-${section.id}`}>
                    <header className="mb-6 flex min-h-9 items-center justify-between gap-4">
                      <h2 id={`profile-${section.id}`} className="text-xl font-semibold">
                        {profileText(section.title, locale)}
                      </h2>
                      {editable ? (
                        <button
                          className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-[var(--link)] hover:bg-[var(--surface-muted)]"
                          onClick={() => setEditing({ kind: "section", section })}
                          aria-label={`${t("Edit", "تعديل")} ${profileText(section.title, locale)}`}
                        >
                          <Pencil size={16} />
                          {t("Edit", "تعديل")}
                        </button>
                      ) : null}
                    </header>
                    <dl className={styles.fields}>
                      {section.fields.map((field) => (
                        <div key={field.key} className={`${styles.field} ${field.kind && field.kind !== "stage" ? styles.wideField : ""}`}>
                          <dt className="text-sm font-medium leading-5 text-[var(--muted)]">{profileText(field.label, locale)}</dt>
                          <dd className="break-words text-base leading-7">
                            <ReadValue field={field} value={data.modules[section.module][field.key]} locale={locale} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
            </div>
          )}
        </>
      )}
      {notice ? (
        <div
          role="status"
          className="fixed bottom-6 end-6 z-40 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-5 py-3 shadow-lg"
        >
          <Check size={18} className="text-[var(--success)]" />
          {notice}
        </div>
      ) : null}
      {data && editing?.kind === "section" ? (
        <ProfileEditor
          key={editing.section.id}
          locale={locale}
          section={editing.section}
          data={data}
          onClose={() => setEditing(null)}
          onReload={reload}
          onSave={async (changes, revision) =>
            saved(await client.updateBusinessKnowledge({ module: editing.section.module, changes, expectedVersion: revision }))
          }
        />
      ) : null}
      {data && editing?.kind === "offering" ? (
        <OfferingEditor
          locale={locale}
          data={data}
          offering={editing.offering}
          onClose={() => setEditing(null)}
          onReload={reload}
          onSave={async (input) => saved(await client.maintainOffering(input))}
        />
      ) : null}
      {data && editing?.kind === "catalog" ? (
        <CatalogEditor
          locale={locale}
          data={data}
          onClose={() => setEditing(null)}
          onReload={reload}
          onSave={async (changes, revision) => saved(await client.updateBusinessCatalog({ ...changes, expectedVersion: revision }))}
        />
      ) : null}
    </section>
  );
}

function ReadValue({ field, value, locale }: { field: ProfileField; value: unknown; locale: Locale }) {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && !value.length) ||
    (typeof value === "object" && !Object.keys(value).length)
  )
    return <span className="text-[var(--muted)]">{locale === "ar" ? "غير محدد" : "Not specified"}</span>;
  if (field.kind === "stage")
    return (
      <span className="rounded-lg bg-[var(--surface-muted)] px-2.5 py-1 text-sm">
        {establishmentOptions.find((option) => option[0] === value)?.[locale === "ar" ? 2 : 1] ?? String(value)}
      </span>
    );
  if (field.kind === "competitors")
    return (
      <ul className="space-y-3">
        {(value as Array<Record<string, string>>).map((item, index) => (
          <li key={index}>
            <p className="font-medium" dir="auto">
              {item.name}
            </p>
            {[item.instagramHandle, item.website, item.notes].filter(Boolean).map((text, i) => (
              <p className="break-words text-[var(--muted)]" dir="auto" key={i}>
                {text}
              </p>
            ))}
          </li>
        ))}
      </ul>
    );
  if (field.kind === "targets")
    return (
      <ul className="space-y-1">
        {Object.entries(value as object).map(([name, target]) => (
          <li key={name} dir="auto">
            {name}: {String(target)}
          </li>
        ))}
      </ul>
    );
  if (field.kind === "colors" && Array.isArray(value))
    return (
      <ul className="flex flex-wrap gap-x-5 gap-y-3">
        {value.map((color, index) => (
          <li key={index} className="inline-flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-block size-8 shrink-0 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-muted)]"
              style={isBrandColor(String(color)) ? { backgroundColor: String(color) } : undefined}
            />
            <span dir="ltr" className="break-all text-sm tabular-nums">
              {String(color)}
            </span>
          </li>
        ))}
      </ul>
    );
  if (Array.isArray(value))
    return (
      <ul className="flex flex-wrap gap-2">
        {value.map((text, index) => (
          <li key={index} dir="auto" className="max-w-full break-words rounded-lg bg-[var(--surface-muted)] px-3 py-1">
            {String(text)}
          </li>
        ))}
      </ul>
    );
  return (
    <span className="whitespace-pre-wrap" dir="auto">
      {String(value)}
    </span>
  );
}

type EditorField = ProfileField & { options?: Array<[string, string]>; inputMode?: "decimal" };
type EditorProps = {
  locale: Locale;
  title: string;
  fields: EditorField[];
  initial: Record<string, unknown>;
  revision: number;
  onClose: () => void;
  onSave: (values: Record<string, unknown>, revision: number) => Promise<void>;
  onReload: () => Promise<{ values: Record<string, unknown>; revision: number }>;
  warning?: (values: Record<string, unknown>) => string | undefined;
};

function EditDialog({ locale, title, fields, initial, revision: initialRevision, onClose, onSave, onReload, warning }: EditorProps) {
  const [values, setValues] = useState(initial);
  const [revision, setRevision] = useState(initialRevision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<Record<string, unknown> | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const allowExit = useRef(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (discard) keepEditingRef.current?.focus();
  }, [discard]);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const close = () => {
    if (dirty) setDiscard(true);
    else onClose();
  };
  const { dialogRef, onCancel, onKeyDown } = useModalDialog({ onClose: close, closeDisabled: busy });
  useEffect(() => {
    if (!dirty && !busy) return;
    const prevent = (event: BeforeUnloadEvent) => {
      if (allowExit.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const intercept = (event: Event) => {
      const next = event as Event & { navigationType?: string; destination?: { url: string } };
      if (allowExit.current || !next.cancelable || next.navigationType !== "traverse" || !next.destination) return;
      next.preventDefault();
      if (!busy) {
        setPendingHref(next.destination.url);
        setDiscard(true);
      }
    };
    window.addEventListener("beforeunload", prevent);
    navigation?.addEventListener("navigate", intercept);
    return () => {
      window.removeEventListener("beforeunload", prevent);
      navigation?.removeEventListener("navigate", intercept);
    };
  }, [dirty, busy]);
  function discardChanges() {
    allowExit.current = true;
    if (pendingHref) window.location.assign(pendingHref);
    else onClose();
  }
  const caution = warning?.(values);
  async function submit() {
    if (busy || !dirty || (conflict && !reviewed) || (caution && !confirmed)) return;
    setBusy(true);
    setError("");
    try {
      await onSave(values, revision);
    } catch (cause) {
      setError(message(cause, locale));
      if (cause instanceof MarkosApiError && cause.code === "KNOWLEDGE_REVISION_CONFLICT") {
        setConflict(true);
        setReviewed(false);
        setLatest(null);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialogRef}
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) close();
      }}
      aria-labelledby="profile-editor-title"
      className="sunlit-theme m-auto max-h-[90dvh] w-[min(42rem,calc(100%_-_2rem))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/40"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex max-h-[90dvh] flex-col"
        aria-busy={busy}
      >
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
          <h2 id="profile-editor-title" className="text-2xl font-semibold">
            {title}
          </h2>
          <button type="button" className={secondary} onClick={close} disabled={busy} aria-label={t("Close editor", "إغلاق المحرر")}>
            <X size={19} />
          </button>
        </header>
        <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
          {fields
            .filter((field) =>
              field.key === "price"
                ? ["FIXED", "FROM"].includes(String(values.priceType))
                : ["minimum", "maximum"].includes(field.key)
                  ? values.priceType === "RANGE"
                  : field.key === "currency"
                    ? ["FIXED", "FROM", "RANGE"].includes(String(values.priceType))
                    : true
            )
            .map((field) => (
              <div key={field.key}>
                <FieldInput
                  field={field}
                  value={values[field.key]}
                  locale={locale}
                  disabled={busy}
                  onChange={(value) => {
                    setValues((current) => ({ ...current, [field.key]: value }));
                    setConfirmed(false);
                  }}
                />
                {latest ? (
                  <div className="mt-2 rounded-lg bg-[var(--surface-muted)] p-3 text-sm">
                    <p className="mb-1 font-medium">{t("Currently saved", "القيمة المحفوظة حالياً")}</p>
                    <ReadValue field={field} value={latest[field.key]} locale={locale} />
                  </div>
                ) : null}
              </div>
            ))}
          {error ? (
            <p role="alert" className="text-[var(--danger)]">
              {error}
            </p>
          ) : null}
          {conflict ? (
            <div className="space-y-3 rounded-xl border border-[var(--border-strong)] p-4">
              <p>
                {t(
                  "Your edits are still here. Load the latest values and review the differences before saving.",
                  "تعديلاتك محفوظة هنا. حمّل القيم الحالية وراجع الاختلافات قبل الحفظ."
                )}
              </p>
              <button
                type="button"
                className={secondary}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const current = await onReload();
                    setRevision(current.revision);
                    setLatest(current.values);
                    setReviewed(false);
                  } catch (cause) {
                    setError(message(cause, locale));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("Load latest values", "تحميل القيم الحالية")}
              </button>
              {latest ? (
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 size-5" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
                  {t("I reviewed the current values and want to save my edits.", "راجعت القيم الحالية وأريد حفظ تعديلاتي.")}
                </label>
              ) : null}
            </div>
          ) : null}
          {caution ? (
            <label className="flex items-start gap-3 rounded-xl bg-[var(--surface-muted)] p-4">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 size-5 shrink-0" />
              {caution}
            </label>
          ) : null}
          {discard ? (
            <div role="alert" className="space-y-3 rounded-xl border border-[var(--warning)] p-4">
              <p>{t("Discard your unsaved changes?", "تجاهل التغييرات غير المحفوظة؟")}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={secondary}
                  ref={keepEditingRef}
                  onClick={() => {
                    setDiscard(false);
                    setPendingHref(null);
                  }}
                >
                  {t("Keep editing", "متابعة التعديل")}
                </button>
                <button type="button" className={secondary} onClick={discardChanges}>
                  {t("Discard changes", "تجاهل التغييرات")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <footer className="flex shrink-0 justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
          <button type="button" className={secondary} onClick={close} disabled={busy}>
            {t("Cancel", "إلغاء")}
          </button>
          <button className={primary} type="submit" disabled={!dirty || busy || (conflict && !reviewed) || Boolean(caution && !confirmed)}>
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : null}
            {t("Save changes", "حفظ التغييرات")}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function FieldInput({
  field,
  value,
  locale,
  disabled,
  onChange
}: {
  field: EditorField;
  value: unknown;
  locale: Locale;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const label = profileText(field.label, locale);
  const options =
    field.kind === "stage" ? establishmentOptions.map((option) => [option[0], option[locale === "ar" ? 2 : 1]] as [string, string]) : field.options;
  if (field.kind === "competitors" || field.kind === "targets")
    return <StructuredRows field={field} value={value} locale={locale} disabled={disabled} onChange={onChange} />;
  if (field.kind === "colors") return <BrandColorsInput colors={Array.isArray(value) ? value : []} locale={locale} disabled={disabled} onChange={onChange} />;
  return (
    <label className="block space-y-2 text-base font-medium">
      <span>{label}</span>
      {options ? (
        <select className={fieldClass} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          {options.map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
        </select>
      ) : field.kind === "long" || field.kind === "list" ? (
        <textarea
          className={`${fieldClass} min-h-28 font-normal`}
          rows={4}
          dir="auto"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          maxLength={field.max ?? 5000}
          disabled={disabled}
        />
      ) : (
        <input
          className={`${fieldClass} font-normal`}
          dir={field.kind === "url" || field.kind === "email" ? "ltr" : "auto"}
          type={field.kind === "url" ? "url" : field.kind === "email" ? "email" : "text"}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          maxLength={field.max ?? 1000}
          inputMode={field.inputMode}
          disabled={disabled}
        />
      )}
      {field.kind === "list" ? (
        <span className="block text-sm font-normal text-[var(--muted)]">{locale === "ar" ? "عنصر واحد في كل سطر." : "One item per line."}</span>
      ) : null}
    </label>
  );
}

function BrandColorsInput({
  colors,
  locale,
  disabled,
  onChange
}: {
  colors: string[];
  locale: Locale;
  disabled: boolean;
  onChange: (colors: string[]) => void;
}) {
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const hint = t("Use six-digit hex values, such as #F36A13.", "استخدم رموز ألوان من ست خانات، مثل #F36A13.");
  function replace(index: number, color: string) {
    onChange(colors.map((value, i) => (i === index ? color : value)));
  }
  return (
    <fieldset disabled={disabled} aria-describedby="profile-colors-hint" className="min-w-0 space-y-3">
      <legend className="mb-2 text-base font-medium">{t("Brand colors", "ألوان العلامة")}</legend>
      <p id="profile-colors-hint" className="text-sm text-[var(--muted)]">
        {hint}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {colors.map((color, index) => (
          <div key={index} className="flex min-w-0 items-center gap-2">
            <label
              className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--surface-muted)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]"
              style={isBrandColor(color) ? { backgroundColor: color } : undefined}
            >
              <input
                type="color"
                aria-label={t(`Choose brand color ${index + 1}`, `اختيار لون العلامة ${index + 1}`)}
                className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                value={isBrandColor(color) ? color : "#000000"}
                onChange={(event) => replace(index, event.target.value)}
              />
            </label>
            <input
              className={`${fieldClass} min-w-0 font-normal`}
              aria-label={t(`Brand color ${index + 1} hex value`, `رمز لون العلامة ${index + 1}`)}
              aria-describedby="profile-colors-hint"
              dir="ltr"
              spellCheck={false}
              autoComplete="off"
              value={color}
              required
              pattern="#[0-9A-Fa-f]{6}"
              title={hint}
              maxLength={80}
              onChange={(event) => replace(index, event.target.value)}
            />
            <button
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--danger)]"
              aria-label={t(`Remove brand color ${index + 1}`, `إزالة لون العلامة ${index + 1}`)}
              onClick={() => onChange(colors.filter((_, i) => i !== index))}
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className={secondary} disabled={disabled || colors.length >= 30} onClick={() => onChange([...colors, ""])}>
        <Plus size={17} />
        {t("Add color", "إضافة لون")}
      </button>
    </fieldset>
  );
}

function StructuredRows({
  field,
  value,
  locale,
  disabled,
  onChange
}: {
  field: ProfileField;
  value: unknown;
  locale: Locale;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const rows = (Array.isArray(value) ? value : []) as Array<Record<string, string | number | boolean>>;
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const columns =
    field.kind === "targets"
      ? [
          ["name", t("Measure", "المقياس")],
          ["target", t("Target", "المستهدف")]
        ]
      : [
          ["name", t("Name", "الاسم")],
          ["instagramHandle", t("Instagram account", "حساب إنستغرام")],
          ["website", t("Website", "الموقع الإلكتروني")],
          ["notes", t("Notes", "ملاحظات")]
        ];
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <legend className="mb-3 font-medium">{profileText(field.label, locale)}</legend>
      {rows.map((row, index) => (
        <div key={index} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
          {columns.map(([key, label]) => (
            <label className="block space-y-1.5 text-sm font-medium" key={key}>
              <span>{label}</span>
              <input
                className={fieldClass}
                value={String(row[key!] ?? "")}
                dir="auto"
                required={key === "name"}
                type={key === "website" ? "url" : "text"}
                maxLength={key === "notes" ? 1000 : key === "name" ? 160 : 500}
                onChange={(event) => onChange(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, [key!]: event.target.value } : item)))}
              />
            </label>
          ))}
          <button type="button" className={secondary} onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))}>
            {t("Remove", "إزالة")}
          </button>
        </div>
      ))}
      <button
        className={secondary}
        type="button"
        disabled={rows.length >= 20}
        onClick={() => onChange([...rows, field.kind === "targets" ? { name: "", target: "" } : { name: "" }])}
      >
        <Plus size={17} />
        {field.kind === "targets" ? t("Add target", "إضافة مستهدف") : t("Add competitor", "إضافة منافس")}
      </button>
    </fieldset>
  );
}

function ProfileEditor({
  section,
  data,
  locale,
  onSave,
  onClose,
  onReload
}: {
  section: ProfileSection;
  data: BusinessKnowledgeRecord;
  locale: Locale;
  onSave: (changes: Record<string, unknown>, revision: number) => Promise<void>;
  onClose: () => void;
  onReload: () => Promise<BusinessKnowledgeRecord>;
}) {
  const values = (record: BusinessKnowledgeRecord) =>
    Object.fromEntries(section.fields.map((field) => [field.key, profileFieldValue(field, record.modules[section.module][field.key])]));
  return (
    <EditDialog
      locale={locale}
      title={profileText(section.title, locale)}
      fields={section.fields}
      initial={values(data)}
      revision={data.version}
      onClose={onClose}
      onSave={(input, revision) => onSave(profileChanges(section.fields, input, locale), revision)}
      onReload={async () => {
        const current = await onReload();
        return { revision: current.version, values: current.modules[section.module] };
      }}
    />
  );
}

const catalogFields: EditorField[] = [
  { key: "summary", label: ["Overview", "نبذة"], kind: "long", max: 4000 },
  { key: "differentiators", label: ["What makes these offerings different", "ما يميز هذه العروض"], kind: "list" },
  { key: "priceRange", label: ["General pricing information", "معلومات الأسعار العامة"], max: 120 },
  { key: "salesChannels", label: ["Sales channels", "قنوات البيع"], kind: "list" }
];
function CatalogEditor({
  data,
  locale,
  onSave,
  onClose,
  onReload
}: {
  data: BusinessKnowledgeRecord;
  locale: Locale;
  onSave: (changes: Record<string, unknown>, revision: number) => Promise<void>;
  onClose: () => void;
  onReload: () => Promise<BusinessKnowledgeRecord>;
}) {
  const values = Object.fromEntries(
    catalogFields.map((field) => [field.key, profileFieldValue(field, data.catalog?.[field.key as keyof typeof data.catalog])])
  );
  return (
    <EditDialog
      locale={locale}
      title={locale === "ar" ? "المنتجات والخدمات" : "Products & Services"}
      fields={catalogFields}
      initial={values}
      revision={data.catalog?.version ?? 0}
      onClose={onClose}
      onSave={(input, revision) =>
        onSave(Object.fromEntries(Object.entries(profileChanges(catalogFields, input)).map(([key, value]) => [key, value ?? ""])), revision)
      }
      onReload={async () => {
        const current = await onReload();
        return { revision: current.catalog?.version ?? 0, values: { ...current.catalog } };
      }}
    />
  );
}

function OfferingCatalogView({
  data,
  locale,
  editable,
  onEdit,
  onAdd,
  onCatalog
}: {
  data: BusinessKnowledgeRecord;
  locale: Locale;
  editable: boolean;
  onEdit: (offering: OfferingRecord) => void;
  onAdd: () => void;
  onCatalog: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("ALL");
  const [status, setStatus] = useState("CURRENT");
  const [page, setPage] = useState(0);
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const all = data.catalog?.offerings ?? [];
  const items = all.filter(
    (item) =>
      (kind === "ALL" || item.kind === kind) &&
      (status === "ALL" || status === "CURRENT" ? status === "ALL" || item.status !== "ARCHIVED" : item.status === status) &&
      [item.name, item.nameEn, item.nameAr, item.category, item.description].some((value) => value?.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  );
  const pages = Math.max(1, Math.ceil(items.length / 10));
  const currentPage = Math.min(page, pages - 1);
  return (
    <div className={`space-y-5 ${styles.catalog}`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl space-y-2">
          <h2 className="text-2xl font-semibold">
            {t("Products & Services", "المنتجات والخدمات")}{" "}
            <span className="ms-2 text-lg text-[var(--muted)]">{all.filter((item) => item.status !== "ARCHIVED").length}</span>
          </h2>
          {data.catalog?.summary ? (
            <p className="whitespace-pre-wrap text-base leading-7" dir="auto">
              {data.catalog.summary}
            </p>
          ) : null}
          {data.catalog?.priceRange ? (
            <p className="text-[var(--muted)]" dir="auto">
              {data.catalog.priceRange}
            </p>
          ) : null}
          {data.catalog?.salesChannels.length ? (
            <p className="text-[var(--muted)]" dir="auto">
              {data.catalog.salesChannels.join(" · ")}
            </p>
          ) : null}
        </div>
        {editable ? (
          <div className="flex flex-wrap gap-3">
            <button className={secondary} onClick={onCatalog}>
              <Pencil size={17} />
              {t("Edit overview", "تعديل النبذة")}
            </button>
            <button className={primary} onClick={onAdd}>
              <Plus size={19} />
              {t("Add offering", "إضافة منتج أو خدمة")}
            </button>
          </div>
        ) : null}
      </header>
      <div className="flex flex-wrap gap-3">
        <label className="relative min-w-52 flex-1">
          <Search size={19} className="absolute start-3 top-3.5 text-[var(--muted)]" />
          <input
            aria-label={t("Search offerings", "البحث عن المنتجات والخدمات")}
            className={`${fieldClass} ps-10`}
            placeholder={t("Search offerings", "البحث عن المنتجات والخدمات")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <select
          className={`${fieldClass} !w-auto`}
          aria-label={t("Offering type", "نوع العرض")}
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setPage(0);
          }}
        >
          {[
            ["ALL", t("All types", "كل الأنواع")],
            ["PRODUCT", t("Products", "المنتجات")],
            ["SERVICE", t("Services", "الخدمات")],
            ["UNSPECIFIED", t("Unspecified", "غير محدد")]
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={`${fieldClass} !w-auto`}
          aria-label={t("Offering status", "حالة العرض")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(0);
          }}
        >
          {[
            ["CURRENT", t("Current offerings", "العروض الحالية")],
            ["ACTIVE", t("Active", "نشط")],
            ["PAUSED", t("Paused", "متوقف مؤقتاً")],
            ["ARCHIVED", t("Archived", "مؤرشف")],
            ["ALL", t("All statuses", "كل الحالات")]
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {items.length ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <table className={styles.table} role="table" aria-label={t("Products & Services", "المنتجات والخدمات")}>
            <colgroup>
              <col style={{ width: editable ? "32%" : "36%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: editable ? "19%" : "21%" }} />
              <col style={{ width: editable ? "16%" : "19%" }} />
              <col style={{ width: "13%" }} />
              {editable ? <col style={{ width: "9%" }} /> : null}
            </colgroup>
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">
                  {t("Offering", "المنتج أو الخدمة")}
                </th>
                <th scope="col" role="columnheader">
                  {t("Type", "النوع")}
                </th>
                <th scope="col" role="columnheader">
                  {t("Category", "الفئة")}
                </th>
                <th scope="col" role="columnheader" className={styles.price}>
                  {t("Price", "السعر")}
                </th>
                <th scope="col" role="columnheader">
                  {t("Status", "الحالة")}
                </th>
                {editable ? (
                  <th scope="col" role="columnheader" className={styles.actions}>
                    {t("Actions", "الإجراءات")}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {items.slice(currentPage * 10, currentPage * 10 + 10).map((item) => (
                <tr key={item.id} role="row">
                  <th scope="row" role="rowheader" className={`${styles.offering} text-start font-normal`}>
                    <span className="block text-base font-semibold" dir="auto">
                      {locale === "ar" ? item.nameAr || item.name : item.nameEn || item.name}
                    </span>
                    {item.description ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]" dir="auto">
                        {item.description}
                      </p>
                    ) : null}
                  </th>
                  <td role="cell">
                    <span className={styles.mobileLabel} aria-hidden="true">
                      {t("Type", "النوع")}
                    </span>
                    {item.kind === "PRODUCT" ? t("Product", "منتج") : item.kind === "SERVICE" ? t("Service", "خدمة") : t("Unspecified", "غير محدد")}
                  </td>
                  <td role="cell">
                    <span className={styles.mobileLabel} aria-hidden="true">
                      {t("Category", "الفئة")}
                    </span>
                    <span dir="auto" className="text-[var(--muted)]">
                      {item.category || t("Not specified", "غير محدد")}
                    </span>
                  </td>
                  <td role="cell" className={`${styles.price} font-medium`}>
                    <span className={styles.mobileLabel} aria-hidden="true">
                      {t("Price", "السعر")}
                    </span>
                    <OfferingPrice item={item} locale={locale} />
                  </td>
                  <td role="cell">
                    <span className={styles.mobileLabel} aria-hidden="true">
                      {t("Status", "الحالة")}
                    </span>
                    <span
                      className={`inline-flex items-baseline gap-2 text-sm font-medium ${item.status === "ACTIVE" ? "text-[var(--success)]" : item.status === "PAUSED" ? "text-[var(--warning)]" : "text-[var(--muted)]"}`}
                    >
                      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
                      {item.status === "ACTIVE" ? t("Active", "نشط") : item.status === "PAUSED" ? t("Paused", "متوقف مؤقتاً") : t("Archived", "مؤرشف")}
                    </span>
                  </td>
                  {editable ? (
                    <td role="cell" className={styles.actions}>
                      <button
                        className="sunlit-secondary inline-flex size-11 items-center justify-center rounded-xl"
                        onClick={() => onEdit(item)}
                        aria-label={`${t("Edit", "تعديل")} ${item.name}`}
                        title={`${t("Edit", "تعديل")} ${item.name}`}
                      >
                        <Pencil size={18} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl bg-[var(--surface-muted)] px-6 py-12 text-center">
          <Package size={30} className="mx-auto mb-4 text-[var(--muted)]" />
          <h3 className="text-xl font-semibold">
            {all.length ? t("No matching offerings", "لا توجد نتائج مطابقة") : t("Add your products and services", "أضف منتجاتك وخدماتك")}
          </h3>
          <p className="mt-2 text-[var(--muted)]">
            {all.length
              ? t("Try another search or filter.", "جرّب البحث أو التصفية بشكل مختلف.")
              : t("Keep the details MARKOS uses for future content up to date.", "حدّث التفاصيل التي يستخدمها ماركوس للمحتوى القادم.")}
          </p>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--muted)]">
          {t(`${items.length} offerings · Page ${currentPage + 1} of ${pages}`, `${items.length} عرض · الصفحة ${currentPage + 1} من ${pages}`)}
        </span>
        <div className="flex gap-2">
          <button className={secondary} disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>
            <ChevronLeft size={18} className="rtl:rotate-180" />
            {t("Previous", "السابق")}
          </button>
          <button className={secondary} disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>
            {t("Next", "التالي")}
            <ChevronRight size={18} className="rtl:rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
}

function moneyInput(value: number | undefined, currency: string) {
  if (value === undefined) return "";
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return (value / 10 ** digits).toFixed(digits);
}
function OfferingPrice({ item, locale }: { item: OfferingRecord; locale: Locale }): ReactNode {
  const digits = new Intl.NumberFormat(locale, { style: "currency", currency: item.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const format = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: item.currency }).format(value / 10 ** digits);
  if (item.priceType === "QUOTE") return locale === "ar" ? "السعر عند الطلب" : "On request";
  if (item.priceType === "RANGE" && item.minPriceMinor !== undefined && item.maxPriceMinor !== undefined)
    return (
      <bdi>
        {format(item.minPriceMinor)} – {format(item.maxPriceMinor)}
      </bdi>
    );
  if (item.priceMinor !== undefined)
    return (
      <bdi>
        {item.priceType === "FROM" ? (locale === "ar" ? "من " : "From ") : ""}
        {format(item.priceMinor)}
      </bdi>
    );
  return <span className="text-sm font-normal text-[var(--muted)]">{locale === "ar" ? "السعر غير محدد" : "Price not specified"}</span>;
}

function OfferingEditor({
  data,
  offering,
  locale,
  onSave,
  onClose,
  onReload
}: {
  data: BusinessKnowledgeRecord;
  offering: OfferingRecord | undefined;
  locale: Locale;
  onSave: (input: OfferingMaintenanceUpdate) => Promise<void>;
  onClose: () => void;
  onReload: () => Promise<BusinessKnowledgeRecord>;
}) {
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const initial = (item: OfferingRecord | undefined): Record<string, unknown> => ({
    name: item?.name ?? "",
    nameEn: item?.nameEn ?? "",
    nameAr: item?.nameAr ?? "",
    kind: item?.kind ?? "PRODUCT",
    category: item?.category ?? "",
    description: item?.description ?? "",
    priceType: item?.priceType ?? "UNSPECIFIED",
    currency: item?.currency ?? "BHD",
    price: moneyInput(item?.priceMinor, item?.currency ?? "BHD"),
    minimum: moneyInput(item?.minPriceMinor, item?.currency ?? "BHD"),
    maximum: moneyInput(item?.maxPriceMinor, item?.currency ?? "BHD"),
    status: item?.status ?? "ACTIVE"
  });
  const fields: EditorField[] = [
    { key: "name", label: ["Name", "الاسم"], max: 160, required: true },
    {
      key: "kind",
      label: ["Type", "النوع"],
      options: [
        ["PRODUCT", t("Product", "منتج")],
        ["SERVICE", t("Service", "خدمة")],
        ["UNSPECIFIED", t("Unspecified", "غير محدد")]
      ]
    },
    { key: "nameEn", label: ["English name (optional)", "الاسم الإنجليزي (اختياري)"], max: 160 },
    { key: "nameAr", label: ["Arabic name (optional)", "الاسم العربي (اختياري)"], max: 160 },
    { key: "category", label: ["Category", "الفئة"], max: 120 },
    { key: "description", label: ["Description", "الوصف"], kind: "long", max: 1000 },
    {
      key: "priceType",
      label: ["Pricing", "التسعير"],
      options: [
        ["UNSPECIFIED", t("Not specified", "غير محدد")],
        ["FIXED", t("Fixed price", "سعر ثابت")],
        ["FROM", t("Starting from", "ابتداءً من")],
        ["RANGE", t("Price range", "نطاق سعري")],
        ["QUOTE", t("On request", "عند الطلب")]
      ]
    },
    { key: "currency", label: ["Currency", "العملة"], options: Intl.supportedValuesOf("currency").map((code) => [code, code]) },
    { key: "price", label: ["Fixed / starting price", "السعر الثابت / الابتدائي"], inputMode: "decimal" },
    { key: "minimum", label: ["Range minimum", "الحد الأدنى للنطاق"], inputMode: "decimal" },
    { key: "maximum", label: ["Range maximum", "الحد الأعلى للنطاق"], inputMode: "decimal" },
    {
      key: "status",
      label: ["Status", "الحالة"],
      options: [
        ["ACTIVE", t("Active", "نشط")],
        ["PAUSED", t("Paused", "متوقف مؤقتاً")],
        ["ARCHIVED", t("Archived", "مؤرشف")]
      ]
    }
  ];
  return (
    <EditDialog
      locale={locale}
      title={offering ? t("Edit offering", "تعديل المنتج أو الخدمة") : t("Add offering", "إضافة منتج أو خدمة")}
      fields={fields}
      initial={initial(offering)}
      revision={data.catalog?.version ?? 0}
      onClose={onClose}
      warning={(values) =>
        values.status !== "ACTIVE" && values.status !== offering?.status
          ? t(
              "This offering will be excluded from future AI grounding. Existing posts and campaigns remain unchanged.",
              "لن يُستخدم هذا العرض في سياق الذكاء الاصطناعي القادم. لن تتغير المنشورات والحملات المحفوظة."
            )
          : undefined
      }
      onReload={async () => {
        const current = await onReload();
        const item = current.catalog?.offerings.find((value) => value.id === offering?.id);
        return { revision: current.catalog?.version ?? 0, values: initial(item) };
      }}
      onSave={async (values, revision) => {
        const currency = String(values.currency);
        const type = values.priceType as OfferingRecord["priceType"];
        const optional = Object.fromEntries(
          ["nameEn", "nameAr", "category", "description"].filter((key) => values[key] !== "").map((key) => [key, values[key]])
        );
        const price = type === "FIXED" || type === "FROM" ? parseOfferingMoney(String(values.price), currency) : undefined;
        const minimum = type === "RANGE" ? parseOfferingMoney(String(values.minimum), currency) : undefined;
        const maximum = type === "RANGE" ? parseOfferingMoney(String(values.maximum), currency) : undefined;
        await onSave({
          expectedVersion: revision,
          ...(offering ? { id: offering.id } : {}),
          offering: {
            ...optional,
            name: String(values.name),
            kind: values.kind as OfferingRecord["kind"],
            priceType: type,
            currency,
            status: values.status as OfferingRecord["status"],
            ...(price === undefined ? {} : { priceMinor: price }),
            ...(minimum === undefined ? {} : { minPriceMinor: minimum }),
            ...(maximum === undefined ? {} : { maxPriceMinor: maximum })
          }
        });
      }}
    />
  );
}
