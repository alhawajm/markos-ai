import { ArrowLeft, FileText, Globe2, ShieldCheck, Sparkles } from "lucide-react";
import type { Locale } from "@markos/shared-types";
import { SectionNavigation } from "./section-navigation";
import styles from "./legal-document-preview.module.css";

export type LegalDocumentKind = "privacy" | "terms";

const legalCopy = {
  en: {
    brand: "MARKOS AI",
    back: "Back to sign up",
    language: "العربية",
    draftLabel: "Working draft",
    draftMessage: "This page prepares the product structure only. Final wording requires legal review before launch.",
    version: "Draft version 0.1",
    effective: "Effective date: to be confirmed",
    contents: "On this page",
    footer: "Powered by Ra'edat Software L.L.C.",
    termsLink: "Terms of Service",
    privacyLink: "Privacy Policy",
    terms: {
      eyebrow: "Terms of Service",
      title: "The terms for using MARKOS",
      intro:
        "These draft terms outline the relationship between MARKOS and the people who use it. They are placeholders for product review, not approved legal terms.",
      sections: [
        {
          id: "status",
          title: "1. About these draft terms",
          paragraphs: [
            "MARKOS is an Instagram-first marketing workspace operated by Ra'edat Software L.L.C. The final terms will identify the service, the contracting entity, and the rules that apply when someone creates or uses an account.",
            "Any dates, contact details, governing-law language, and formal remedies still need to be supplied and approved before launch."
          ]
        },
        {
          id: "account",
          title: "2. Your account",
          paragraphs: [
            "You will be responsible for providing accurate account information, protecting your login details, and telling us if you believe your account has been used without permission.",
            "The final service may set eligibility, age, business-authority, and account-verification requirements."
          ]
        },
        {
          id: "working-with-markos",
          title: "3. Working with MARKOS",
          paragraphs: [
            "MARKOS can help plan, create, publish, and learn from marketing work. Generated suggestions may require your review, editing, or approval before they are used.",
            "You remain responsible for the information, brand materials, instructions, approvals, and content you provide, and for deciding whether an output is suitable for your business."
          ]
        },
        {
          id: "acceptable-use",
          title: "4. Acceptable use",
          paragraphs: [
            "The final terms will prohibit unlawful activity, abuse, security interference, impersonation, intellectual-property violations, and attempts to misuse or disrupt the service.",
            "Users must also follow the rules of connected services such as Instagram."
          ]
        },
        {
          id: "connected-services",
          title: "5. Connected services",
          paragraphs: [
            "Some features depend on third-party platforms and providers. Their availability, permissions, and separate terms can affect what MARKOS is able to do.",
            "The final terms will explain how account connections, publishing approvals, service interruptions, and third-party changes are handled."
          ]
        },
        {
          id: "plans",
          title: "6. Plans and billing",
          paragraphs: [
            "Pricing, trial, quota, renewal, cancellation, refund, and tax terms will be added when the commercial plans are confirmed. No placeholder on this preview creates a payment obligation."
          ]
        },
        {
          id: "closing",
          title: "7. Closing an account",
          paragraphs: [
            "The final terms will describe how users can close an account, when access may be limited or suspended, what notice may apply, and what happens to stored business information afterward."
          ]
        },
        {
          id: "contact",
          title: "8. Contact",
          paragraphs: ["Formal support, legal-notice, and company contact details will be added after internal and legal review."]
        }
      ]
    },
    privacy: {
      eyebrow: "Privacy Policy",
      title: "How information is handled in MARKOS",
      intro: "This draft maps the privacy topics the final product needs to explain. It does not yet make final legal or operational commitments.",
      sections: [
        {
          id: "status",
          title: "1. About this draft",
          paragraphs: [
            "The final policy will describe how Ra'edat Software L.L.C. handles personal information when people visit MARKOS, create an account, connect a business profile, or use the service.",
            "It will be updated to match the systems and providers that are actually approved for launch."
          ]
        },
        {
          id: "collection",
          title: "2. Information we may collect",
          paragraphs: [
            "This may include account and contact details, business-profile information, brand materials, instructions, connected-platform data, content, approvals, support messages, and basic technical or usage information.",
            "The final policy will distinguish required information from optional information and explain when it comes from you, your team, or a connected service."
          ]
        },
        {
          id: "use",
          title: "3. How information may be used",
          paragraphs: [
            "Information may be used to provide and secure the service, personalize marketing work, prepare requested content, support publishing, present insights, answer support requests, and improve reliability.",
            "The final policy will state the applicable legal grounds and any uses for product improvement, communications, fraud prevention, or compliance."
          ]
        },
        {
          id: "providers",
          title: "4. Connected services and AI providers",
          paragraphs: [
            "MARKOS may send limited information to approved providers when needed for connected-platform or AI-assisted features. The final policy will identify relevant provider categories, purposes, safeguards, and choices.",
            "Connecting Instagram or another service will also be subject to that service's privacy practices and permissions."
          ]
        },
        {
          id: "sharing",
          title: "5. Sharing and disclosures",
          paragraphs: [
            "The final policy will explain when information may be shared with service providers, workspace members, professional advisers, authorities, or another organization involved in a lawful business transaction."
          ]
        },
        {
          id: "storage",
          title: "6. Storage, retention, and security",
          paragraphs: [
            "Hosting locations, retention periods, deletion behavior, access controls, and security measures will be documented after the production architecture and operating procedures are confirmed.",
            "No online service can promise absolute security; the final policy will explain the safeguards and reporting routes that apply."
          ]
        },
        {
          id: "choices",
          title: "7. Your choices and rights",
          paragraphs: [
            "The final policy will explain how people can update account information, disconnect services, manage communications, ask questions, and exercise any privacy rights that apply to them."
          ]
        },
        {
          id: "contact",
          title: "8. Contact",
          paragraphs: ["A privacy contact and request process will be added before this policy is approved and published."]
        }
      ]
    }
  },
  ar: {
    brand: "MARKOS AI",
    back: "العودة إلى إنشاء الحساب",
    language: "English",
    draftLabel: "مسودة عمل",
    draftMessage: "تهدف هذه الصفحة إلى تجهيز بنية المنتج فقط. تحتاج الصياغة النهائية إلى مراجعة قانونية قبل الإطلاق.",
    version: "نسخة المسودة 0.1",
    effective: "تاريخ السريان: سيُحدد لاحقًا",
    contents: "محتويات الصفحة",
    footer: "من تطوير Ra'edat Software L.L.C.",
    termsLink: "شروط الخدمة",
    privacyLink: "سياسة الخصوصية",
    terms: {
      eyebrow: "شروط الخدمة",
      title: "شروط استخدام MARKOS",
      intro: "توضح هذه المسودة العلاقة بين MARKOS ومستخدميه. وهي نص مبدئي لمراجعة المنتج وليست شروطًا قانونية معتمدة.",
      sections: [
        {
          id: "status",
          title: "1. حول هذه المسودة",
          paragraphs: [
            "MARKOS مساحة عمل للتسويق تركز أولًا على إنستغرام وتديرها شركة Ra'edat Software L.L.C. ستحدد الشروط النهائية الخدمة والجهة المتعاقدة والقواعد التي تنطبق عند إنشاء الحساب أو استخدامه.",
            "لا تزال التواريخ وبيانات التواصل والقانون المنظم ووسائل المعالجة الرسمية بحاجة إلى الإضافة والاعتماد قبل الإطلاق."
          ]
        },
        {
          id: "account",
          title: "2. حسابك",
          paragraphs: [
            "ستكون مسؤولًا عن تقديم معلومات صحيحة وحماية بيانات الدخول وإبلاغنا إذا اعتقدت أن حسابك استُخدم دون إذن.",
            "قد تحدد الخدمة النهائية متطلبات الأهلية والعمر وصلاحية تمثيل النشاط والتحقق من الحساب."
          ]
        },
        {
          id: "working-with-markos",
          title: "3. العمل مع MARKOS",
          paragraphs: [
            "يمكن لـ MARKOS المساعدة في التخطيط والإنشاء والنشر والتعلم من العمل التسويقي. وقد تحتاج الاقتراحات المولدة إلى مراجعتك أو تعديلك أو اعتمادك قبل استخدامها.",
            "تظل مسؤولًا عن المعلومات ومواد العلامة والتعليمات والاعتمادات والمحتوى الذي تقدمه، وعن تحديد مدى ملاءمة أي مخرج لنشاطك."
          ]
        },
        {
          id: "acceptable-use",
          title: "4. الاستخدام المقبول",
          paragraphs: [
            "ستحظر الشروط النهائية الأنشطة غير القانونية والإساءة والتدخل الأمني وانتحال الهوية وانتهاك الملكية الفكرية ومحاولات إساءة استخدام الخدمة أو تعطيلها.",
            "يجب على المستخدمين كذلك الالتزام بقواعد الخدمات المتصلة مثل إنستغرام."
          ]
        },
        {
          id: "connected-services",
          title: "5. الخدمات المتصلة",
          paragraphs: [
            "تعتمد بعض الميزات على منصات ومزودين خارجيين. وقد يؤثر توفرها وصلاحياتها وشروطها المنفصلة في ما يستطيع MARKOS تنفيذه.",
            "ستوضح الشروط النهائية كيفية التعامل مع ربط الحسابات واعتمادات النشر وانقطاع الخدمات وتغييرات الأطراف الأخرى."
          ]
        },
        {
          id: "plans",
          title: "6. الخطط والفوترة",
          paragraphs: [
            "ستُضاف شروط الأسعار والتجربة والحصص والتجديد والإلغاء والاسترداد والضرائب عند اعتماد الخطط التجارية. ولا ينشئ أي نص مبدئي في هذه المعاينة التزامًا بالدفع."
          ]
        },
        {
          id: "closing",
          title: "7. إغلاق الحساب",
          paragraphs: ["ستوضح الشروط النهائية كيفية إغلاق الحساب ومتى يمكن تقييد الوصول أو تعليقه والإشعار المحتمل وما يحدث لمعلومات النشاط المخزنة بعد ذلك."]
        },
        {
          id: "contact",
          title: "8. التواصل",
          paragraphs: ["ستُضاف بيانات الدعم والإشعارات القانونية والتواصل مع الشركة بعد المراجعة الداخلية والقانونية."]
        }
      ]
    },
    privacy: {
      eyebrow: "سياسة الخصوصية",
      title: "كيفية التعامل مع المعلومات في MARKOS",
      intro: "ترسم هذه المسودة موضوعات الخصوصية التي يحتاج المنتج النهائي إلى توضيحها، ولا تقدم بعد التزامات قانونية أو تشغيلية نهائية.",
      sections: [
        {
          id: "status",
          title: "1. حول هذه المسودة",
          paragraphs: [
            "ستوضح السياسة النهائية كيفية تعامل شركة Ra'edat Software L.L.C. مع المعلومات الشخصية عند زيارة MARKOS أو إنشاء حساب أو ربط ملف نشاط أو استخدام الخدمة.",
            "وستُحدّث لتطابق الأنظمة والمزودين المعتمدين فعليًا عند الإطلاق."
          ]
        },
        {
          id: "collection",
          title: "2. المعلومات التي قد نجمعها",
          paragraphs: [
            "قد يشمل ذلك بيانات الحساب والتواصل ومعلومات النشاط ومواد العلامة والتعليمات وبيانات المنصات المتصلة والمحتوى والاعتمادات ورسائل الدعم والمعلومات التقنية أو معلومات الاستخدام الأساسية.",
            "ستميز السياسة النهائية بين المعلومات المطلوبة والاختيارية وتوضح متى تأتي منك أو من فريقك أو من خدمة متصلة."
          ]
        },
        {
          id: "use",
          title: "3. كيفية استخدام المعلومات",
          paragraphs: [
            "قد تُستخدم المعلومات لتقديم الخدمة وحمايتها وتخصيص العمل التسويقي وإعداد المحتوى المطلوب ودعم النشر وعرض الرؤى والرد على طلبات الدعم وتحسين الاعتمادية.",
            "ستبين السياسة النهائية الأسس القانونية المنطبقة وأي استخدامات لتحسين المنتج أو التواصل أو منع الاحتيال أو الامتثال."
          ]
        },
        {
          id: "providers",
          title: "4. الخدمات المتصلة ومزودو الذكاء الاصطناعي",
          paragraphs: [
            "قد يرسل MARKOS معلومات محدودة إلى مزودين معتمدين عند الحاجة إلى ميزات المنصات المتصلة أو الميزات المدعومة بالذكاء الاصطناعي. وستحدد السياسة النهائية فئات المزودين والأغراض والضمانات والخيارات ذات الصلة.",
            "كما سيخضع ربط إنستغرام أو أي خدمة أخرى لممارسات الخصوصية والصلاحيات الخاصة بتلك الخدمة."
          ]
        },
        {
          id: "sharing",
          title: "5. المشاركة والإفصاح",
          paragraphs: [
            "ستوضح السياسة النهائية متى قد تُشارك المعلومات مع مزودي الخدمات أو أعضاء مساحة العمل أو المستشارين المهنيين أو الجهات الرسمية أو مؤسسة أخرى ضمن معاملة تجارية مشروعة."
          ]
        },
        {
          id: "storage",
          title: "6. التخزين والاحتفاظ والأمان",
          paragraphs: [
            "ستُوثق مواقع الاستضافة ومدد الاحتفاظ وسلوك الحذف وضوابط الوصول وإجراءات الأمان بعد اعتماد بنية الإنتاج وإجراءات التشغيل.",
            "لا يمكن لأي خدمة عبر الإنترنت ضمان الأمان المطلق؛ وستوضح السياسة النهائية الضمانات وقنوات الإبلاغ المنطبقة."
          ]
        },
        {
          id: "choices",
          title: "7. خياراتك وحقوقك",
          paragraphs: ["ستوضح السياسة النهائية كيفية تحديث معلومات الحساب وفصل الخدمات وإدارة الرسائل وطرح الأسئلة وممارسة أي حقوق خصوصية تنطبق على المستخدم."]
        },
        {
          id: "contact",
          title: "8. التواصل",
          paragraphs: ["ستُضاف جهة تواصل للخصوصية وآلية للطلبات قبل اعتماد هذه السياسة ونشرها."]
        }
      ]
    }
  }
} as const;

export function LegalDocumentPreview({ kind, locale }: { kind: LegalDocumentKind; locale: Locale }) {
  const copy = legalCopy[locale];
  const document = copy[kind];
  const isArabic = locale === "ar";
  const otherLocale = isArabic ? "en" : "ar";
  const landingHref = `/${locale}/design-preview`;
  const signupHref = `/${locale}/design-preview/signup`;
  const termsHref = `/${locale}/design-preview/terms`;
  const privacyHref = `/${locale}/design-preview/privacy`;

  return (
    <main className={`sunlit-theme ${styles.legalPage}`} data-legal-preview={kind} dir={isArabic ? "rtl" : "ltr"} lang={locale}>
      <header className={styles.header}>
        <a className={styles.brand} href={landingHref} aria-label={copy.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <Sparkles size={21} />
          </span>
          <strong>{copy.brand}</strong>
        </a>
        <nav aria-label={isArabic ? "تنقل المستند" : "Document navigation"}>
          <a className={styles.backLink} href={signupHref}>
            <ArrowLeft className={styles.backIcon} aria-hidden="true" size={17} />
            {copy.back}
          </a>
          <a className={styles.languageLink} href={`/${otherLocale}/design-preview/${kind}`}>
            <Globe2 aria-hidden="true" size={17} />
            {copy.language}
          </a>
        </nav>
      </header>

      <div className={styles.draftBanner} role="note">
        <span aria-hidden="true">
          <FileText size={19} />
        </span>
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
            <span className={styles.documentIcon} aria-hidden="true">
              {kind === "privacy" ? <ShieldCheck size={25} /> : <FileText size={25} />}
            </span>
            <p className={styles.eyebrow}>{document.eyebrow}</p>
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
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}
          </div>
        </article>
      </div>

      <footer className={styles.footer}>
        <span>{copy.footer}</span>
        <span>
          <a aria-current={kind === "terms" ? "page" : undefined} href={termsHref}>
            {copy.termsLink}
          </a>
          <i aria-hidden="true">·</i>
          <a aria-current={kind === "privacy" ? "page" : undefined} href={privacyHref}>
            {copy.privacyLink}
          </a>
        </span>
      </footer>
    </main>
  );
}
