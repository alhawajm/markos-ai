import type { Locale } from "@markos/shared-types";
import { ThemeSelect } from "../../_components/theme-control";
import { SectionNavigation } from "./section-navigation";
import styles from "./legal-document.module.css";
import { legalCopy } from "./legal-copy";

export type LegalDocumentKind = "privacy" | "terms" | "support";

export function LegalDocument({ kind, locale }: { kind: LegalDocumentKind; locale: Locale }) {
  const copy = legalCopy[locale];
  const document = copy[kind];
  const isArabic = locale === "ar";
  const otherLocale = isArabic ? "en" : "ar";
  const landingHref = `/${locale}`;
  const signupHref = `/${locale}/signup`;
  const termsHref = `/${locale}/terms`;
  const privacyHref = `/${locale}/privacy`;

  return (
    <main className={`sunlit-theme ${styles.legalPage}`} data-legal-document={kind} dir={isArabic ? "rtl" : "ltr"} lang={locale}>
      <header className={`brand-chrome ${styles.header}`}>
        <a className={`brand-logo ${styles.brand}`} href={landingHref} aria-label={copy.brand}>
          <strong>{copy.brand}</strong>
        </a>
        <nav aria-label={isArabic ? "تنقل المستند" : "Document navigation"}>
          <ThemeSelect locale={locale} />
          <a className={styles.backLink} href={signupHref}>
            {copy.back}
          </a>
          <a className={styles.languageLink} href={`/${otherLocale}/${kind}`}>
            {copy.language}
          </a>
        </nav>
      </header>

      <div className={styles.draftBanner} role="note">
        <p>
          <strong>{copy.draftLabel}</strong>
          {copy.draftMessage}
        </p>
      </div>

      <div className={styles.documentShell}>
        <SectionNavigation
          className={styles.contents}
          heading={copy.contents}
          items={document.sections.map((section) => ({
            id: section.id,
            label: section.title
          }))}
          mobileLabel={copy.contents}
        />

        <article className={styles.document}>
          <div className={styles.documentHeading}>
            <h1>{document.title}</h1>
            <p className={styles.intro}>{document.intro}</p>
            <div className={styles.documentMeta}>
              <span>{copy.version}</span>
              <i aria-hidden="true">·</i>
              <span>{copy.effective}</span>
            </div>
          </div>

          <div className={styles.sections}>
            {document.sections.map((section) => (
              <section id={section.id} key={section.id}>
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>
                    {paragraph.split("info.raedat.2024@gmail.com").map((part, index) => (
                      <span key={index}>
                        {index ? <a href="mailto:info.raedat.2024@gmail.com">info.raedat.2024@gmail.com</a> : null}
                        {part}
                      </span>
                    ))}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </article>
      </div>

      <footer className={`brand-chrome ${styles.footer}`}>
        <span>{copy.footer}</span>
        <span>
          <a aria-current={kind === "terms" ? "page" : undefined} href={termsHref}>
            {copy.termsLink}
          </a>
          <i aria-hidden="true">·</i>
          <a aria-current={kind === "privacy" ? "page" : undefined} href={privacyHref}>
            {copy.privacyLink}
          </a>
          <i aria-hidden="true">·</i>
          <a href={`/${locale}/delete-account`}>{isArabic ? "حذف الحساب" : "Delete account"}</a>
        </span>
      </footer>
    </main>
  );
}
