/* Design prototype only. All records are fictional and live in memory until refresh. */
"use strict";

const text = {
  title: ["Business profile", "ملف النشاط"],
  subtitle: ["The business knowledge that guides MARKOS.", "معلومات نشاطك التي توجّه MARKOS."],
  business: ["Business", "النشاط"],
  offerings: ["Products & Services", "المنتجات والخدمات"],
  audience: ["Audience & market", "الجمهور والسوق"],
  brand: ["Brand & voice", "الهوية والأسلوب"],
  strategy: ["Marketing strategy", "الاستراتيجية التسويقية"],
  overviewNav: ["Overview", "نظرة عامة"],
  campaigns: ["Campaigns", "الحملات"],
  create: ["Create", "إنشاء"],
  calendar: ["Calendar", "التقويم"],
  insights: ["Insights", "التحليلات"],
  settings: ["Settings", "الإعدادات"],
  notifications: ["Notifications", "الإشعارات"],
  edit: ["Edit", "تعديل"],
  add: ["Add", "إضافة"],
  cancel: ["Cancel", "إلغاء"],
  close: ["Close", "إغلاق"],
  save: ["Save changes", "حفظ التغييرات"],
  saving: ["Saving…", "جارٍ الحفظ…"],
  saved: ["Saved in this preview.", "تم الحفظ في هذه المعاينة."],
  justSaved: ["Saved just now", "حُفظ الآن"],
  sample: ["UI draft · Sample business", "مسودة واجهة · نشاط تجريبي"],
  tools: ["Preview tools", "أدوات المعاينة"],
  toolsNote: [
    "Fictional data. Changes reset on refresh. These controls simulate review states.",
    "بيانات تجريبية تُعاد عند تحديث الصفحة. هذه الأدوات تحاكي حالات الواجهة."
  ],
  pageState: ["Page state", "حالة الصفحة"],
  populated: ["Populated", "مكتملة البيانات"],
  incomplete: ["Incomplete profile / empty catalog", "ملف غير مكتمل / قائمة فارغة"],
  loading: ["Loading", "جارٍ التحميل"],
  loadError: ["Loading failed", "تعذّر التحميل"],
  nextSave: ["Next save", "الحفظ القادم"],
  success: ["Successful", "ناجح"],
  fail: ["Connection failure", "فشل الاتصال"],
  conflict: ["Newer version exists", "توجد نسخة أحدث"],
  reset: ["Reset sample data", "إعادة البيانات التجريبية"],
  sampleFooter: ["Sample data · Changes stay in this preview and reset on refresh.", "بيانات تجريبية · تبقى التغييرات في المعاينة وتُعاد عند تحديث الصفحة."],
  updated: ["Updated 3 Sep 2026", "آخر تحديث ٣ سبتمبر ٢٠٢٦"],
  optional: ["Optional", "اختياري"],
  emptyField: ["Not added yet", "لم تُضف بعد"],
  basics: ["Business details", "تفاصيل النشاط"],
  story: ["Our story", "قصتنا"],
  contact: ["Where to find us", "أين تجدنا"],
  difference: ["What makes us different", "ما يميّزنا"],
  businessName: ["Business name", "اسم النشاط"],
  industry: ["Industry", "القطاع"],
  location: ["Location", "الموقع"],
  stage: ["Business establishment", "مرحلة تأسيس النشاط"],
  stageHint: ["Choose the stage that best describes your business today.", "اختر المرحلة التي تصف نشاطك اليوم."],
  unspecified: ["Not specified", "غير محدد"],
  prelaunch: ["Preparing to launch", "قيد الإطلاق"],
  newly: ["Newly operating", "بدأ العمل حديثًا"],
  established: ["Established", "قائم ومستقر"],
  website: ["Website", "الموقع الإلكتروني"],
  instagram: ["Instagram", "إنستغرام"],
  email: ["Business email", "البريد الإلكتروني للنشاط"],
  summary: ["Business overview", "نبذة عن النشاط"],
  origin: ["How we started", "كيف بدأنا"],
  values: ["Values", "القيم"],
  differentiator: ["Our difference", "ما يميّزنا"],
  customers: ["Our customers", "عملاؤنا"],
  customer: ["Who we serve", "من نخدم"],
  needs: ["What matters to them", "ما يهمّهم"],
  market: ["Market context", "سياق السوق"],
  competitors: ["Competitors", "المنافسون"],
  position: ["Our position", "موقعنا في السوق"],
  identity: ["Brand identity", "هوية العلامة"],
  colors: ["Brand colors", "ألوان العلامة"],
  languages: ["Content languages", "لغات المحتوى"],
  voice: ["Tone & writing", "الأسلوب والكتابة"],
  tone: ["Tone of voice", "نبرة التواصل"],
  writing: ["Writing preferences", "تفضيلات الكتابة"],
  avoid: ["What to avoid", "ما نتجنّبه"],
  goals: ["Business goals", "أهداف النشاط"],
  goal: ["Main goal", "الهدف الرئيسي"],
  priorities: ["Current priorities", "الأولويات الحالية"],
  approach: ["Marketing approach", "النهج التسويقي"],
  marketing: ["Marketing strategy", "الاستراتيجية التسويقية"],
  pillars: ["Content themes", "محاور المحتوى"],
  audienceIntro: ["The people you serve and the market around you.", "الأشخاص الذين تخدمهم والسوق من حولك."],
  brandIntro: ["How your business looks, sounds and communicates.", "كيف يظهر نشاطك ويتحدث ويتواصل."],
  strategyIntro: ["The goals and choices behind your marketing.", "الأهداف والخيارات التي توجّه تسويقك."],
  catalogIntro: ["Keep what you offer accurate and easy to find.", "حافظ على دقة ما تقدّمه وسهولة الوصول إليه."],
  addOffering: ["Add offering", "إضافة منتج أو خدمة"],
  editOffering: ["Edit offering", "تعديل المنتج أو الخدمة"],
  search: ["Search offerings…", "ابحث في المنتجات والخدمات…"],
  allTypes: ["All types", "كل الأنواع"],
  allStatuses: ["All statuses", "كل الحالات"],
  product: ["Product", "منتج"],
  service: ["Service", "خدمة"],
  active: ["Active", "متاح"],
  paused: ["Paused", "متوقف مؤقتًا"],
  archived: ["Archived", "مؤرشف"],
  offering: ["Offering", "المنتج أو الخدمة"],
  name: ["Name", "الاسم"],
  type: ["Type", "النوع"],
  price: ["Price", "السعر"],
  status: ["Status", "الحالة"],
  category: ["Category", "الفئة"],
  description: ["Description", "الوصف"],
  priceType: ["Pricing", "نوع السعر"],
  amount: ["Amount", "المبلغ"],
  currency: ["Currency", "العملة"],
  fixed: ["Fixed price", "سعر ثابت"],
  from: ["Starting from", "يبدأ من"],
  range: ["Price range", "نطاق سعري"],
  quote: ["On quotation", "حسب عرض السعر"],
  minimum: ["Minimum", "الحد الأدنى"],
  maximum: ["Maximum", "الحد الأعلى"],
  moreDetails: ["Category & translated name", "الفئة والاسم المترجم"],
  nameEn: ["English name", "الاسم بالإنجليزية"],
  nameAr: ["Arabic name", "الاسم بالعربية"],
  statusHint: [
    "Paused offerings stay in your catalog but are excluded from new suggestions.",
    "تبقى العناصر المتوقفة في قائمتك وتُستبعد من الاقتراحات الجديدة."
  ],
  offeringHint: ["Update the details of this product or service.", "حدّث تفاصيل هذا المنتج أو الخدمة."],
  addHint: ["Add one product or service to your catalog.", "أضف منتجًا أو خدمة واحدة إلى قائمتك."],
  saveNote: [
    "Saved details guide future generation. Existing posts and campaigns keep their content.",
    "توجّه التفاصيل المحفوظة الإنشاء القادم. تحتفظ المنشورات والحملات الحالية بمحتواها."
  ],
  archive: ["Archive offering", "أرشفة المنتج أو الخدمة"],
  restore: ["Restore offering", "استعادة المنتج أو الخدمة"],
  archiveTitle: ["Archive this offering?", "أرشفة هذا المنتج أو الخدمة؟"],
  archiveNote: [
    "MARKOS will stop suggesting it in new content. Existing posts and campaigns will stay as they are. You can restore it from the Archived filter.",
    "سيتوقف MARKOS عن اقتراحه في المحتوى الجديد. تبقى المنشورات والحملات الحالية كما هي. يمكنك استعادته من فلتر المؤرشف."
  ],
  archiveUnsaved: ["Your unsaved edits will be discarded when you archive.", "ستُهمل تعديلاتك غير المحفوظة عند الأرشفة."],
  archivedToast: ["Offering archived in this preview.", "تمت الأرشفة في هذه المعاينة."],
  discardTitle: ["Discard your changes?", "تجاهل التغييرات؟"],
  discardNote: [
    "Your saved information will stay as it is. The changes in this editor will be lost.",
    "تبقى معلوماتك المحفوظة كما هي. ستفقد التغييرات في هذا المحرّر."
  ],
  keepEditing: ["Keep editing", "متابعة التعديل"],
  discard: ["Discard changes", "تجاهل التغييرات"],
  saveFailed: ["We couldn’t save your changes. Your edits are still here. Try saving again.", "تعذّر حفظ التغييرات. تعديلاتك ما زالت هنا. حاول الحفظ مجددًا."],
  stale: [
    "This information was updated elsewhere. Your edits haven’t been saved. Load the latest version before trying again.",
    "تم تحديث هذه المعلومات في مكان آخر. لم تُحفظ تعديلاتك. حمّل النسخة الأحدث قبل المحاولة مجددًا."
  ],
  loadLatest: ["Load latest version", "تحميل أحدث نسخة"],
  reloadTitle: ["Load the latest information?", "تحميل المعلومات الأحدث؟"],
  reloadNote: [
    "This replaces the unsaved edits in this editor with the latest saved information.",
    "يستبدل هذا الإجراء تعديلاتك غير المحفوظة بأحدث المعلومات المحفوظة."
  ],
  required: ["Enter a name.", "أدخل اسمًا."],
  invalidPrice: [
    "Enter a valid amount of zero or more, with up to three decimal places for BHD.",
    "أدخل مبلغًا صالحًا غير سالب، وبحد أقصى ثلاث خانات عشرية للدينار البحريني."
  ],
  invalidRange: ["Maximum price must be greater than or equal to minimum price.", "يجب ألّا يقل الحد الأعلى عن الحد الأدنى."],
  duplicate: ["An offering with this name already exists. Choose a different name.", "يوجد عنصر بهذا الاسم. اختر اسمًا مختلفًا."],
  invalidUrl: ["Enter a complete website address, such as https://example.com.", "أدخل عنوانًا كاملًا، مثل https://example.com."],
  invalidEmail: ["Enter a valid email address.", "أدخل بريدًا إلكترونيًا صالحًا."],
  invalidColors: ["Use up to seven hex colors, separated by commas (for example #704326).", "استخدم حتى سبعة ألوان بصيغة hex مفصولة بفواصل، مثل #704326."],
  noOfferings: ["Your offerings belong here", "منتجاتك وخدماتك مكانها هنا"],
  noOfferingsNote: ["Add a product or service with the details MARKOS should know.", "أضف منتجًا أو خدمة مع التفاصيل التي يحتاجها MARKOS."],
  noMatches: ["No matching offerings", "لا توجد نتائج مطابقة"],
  noMatchesNote: ["Try another search or change your filters.", "جرّب بحثًا آخر أو غيّر الفلاتر."],
  clearFilters: ["Clear filters", "مسح الفلاتر"],
  previous: ["Previous page", "الصفحة السابقة"],
  next: ["Next page", "الصفحة التالية"],
  errorTitle: ["Your profile couldn’t load", "تعذّر تحميل ملف النشاط"],
  errorNote: ["Your saved information hasn’t changed. Try loading it again.", "لم تتغيّر معلوماتك المحفوظة. حاول تحميلها مجددًا."],
  retry: ["Try again", "إعادة المحاولة"],
  loadingText: ["Loading your business profile…", "جارٍ تحميل ملف نشاطك…"],
  finishLoading: ["Finish preview loading", "إنهاء تحميل المعاينة"],
  onlyProfile: ["This draft previews Business profile only.", "تعرض هذه المسودة ملف النشاط فقط."],
  incompleteNote: ["Add details when you’re ready.", "أضف التفاصيل عندما تكون مستعدًا."],
  localeNote: ["You’re editing the English wording.", "أنت تعدّل النص العربي."]
};

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
let locale = "en";
const local = (value) => (Array.isArray(value) ? value[locale === "ar" ? 1 : 0] : value);
const t = (key) => local(text[key] ?? [key, key]);
const icon = (name, extra = "") =>
  `<svg class="icon ${extra} ${name.startsWith("chevron-") ? "directional" : ""}" aria-hidden="true"><use href="business-profile-icons.svg#${name}"></use></svg>`;
const button = (label, action, style = "", symbol = "", extra = "") =>
  `<button type="button" class="button ${style}" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ""}${esc(label)}</button>`;
const stageOptions = ["unspecified", "prelaunch", "newly", "established"];
const sections = [
  ["business", "building"],
  ["offerings", "package"],
  ["audience", "users"],
  ["brand", "palette"],
  ["strategy", "target"]
];

const initialProfile = {
  businessName: "SnackLab",
  industry: ["Bakery & catering", "مخبوزات وضيافة"],
  location: ["Manama, Bahrain", "المنامة، البحرين"],
  stage: "established",
  website: "https://snacklab.example",
  instagram: "@the.snacklab",
  email: "hello@snacklab.example",
  summary: [
    "Small-batch bakes, thoughtful ingredients, and a little everyday indulgence. We make pastries, celebration treats and sharing boxes for people across Bahrain.",
    "مخبوزات بكميات صغيرة، ومكوّنات مختارة، ولحظات حلوة كل يوم. نقدّم المعجنات وحلويات المناسبات وعلب المشاركة في مختلف أنحاء البحرين."
  ],
  origin: [
    "SnackLab began in a home kitchen in 2019, baking for friends and family. That same hands-on care still goes into every batch.",
    "بدأ سناك لاب في مطبخ منزلي عام ٢٠١٩، بالخبز للأصدقاء والعائلة. وما زلنا نمنح كل دفعة الاهتمام نفسه."
  ],
  values: ["Craft, generosity, thoughtful ingredients", "الإتقان، الكرم، والمكوّنات المختارة"],
  differentiator: [
    "Familiar favourites with a playful twist. Everything is made in small batches, with seasonal flavours and flexible options for gatherings.",
    "نكهات مألوفة بلمسة مبتكرة. نحضّر كل شيء بكميات صغيرة، مع نكهات موسمية وخيارات مرنة للتجمّعات."
  ],
  customer: [
    "People in Bahrain looking for quality treats to share, gift or enjoy with their daily coffee.",
    "أشخاص في البحرين يبحثون عن حلويات مميّزة للمشاركة أو الإهداء أو الاستمتاع بها مع القهوة."
  ],
  needs: ["Fresh bakes, clear ingredients, reliable delivery and gifts that feel personal.", "مخبوزات طازجة، ومكوّنات واضحة، وتوصيل موثوق، وهدايا بطابع شخصي."],
  competitors: ["Local independent bakeries and specialty cafés.", "المخابز المستقلة والمقاهي المتخصصة المحلية."],
  position: [
    "Approachable, carefully made treats between everyday bakery staples and elaborate occasion cakes.",
    "حلويات متقنة وقريبة من الناس، بين مخبوزات اليوم العادي وكعكات المناسبات الكبيرة."
  ],
  colors: "#704326, #F8E4C9, #FFFDFB",
  languages: ["English and Arabic", "الإنجليزية والعربية"],
  tone: ["Warm, conversational and quietly playful.", "دافئ، قريب من الناس، ومرح باعتدال."],
  writing: [
    "Keep captions concise. Lead with flavour or the occasion. Use natural Arabic, and make ordering instructions easy to find.",
    "اكتب نصوصًا موجزة. ابدأ بالنكهة أو المناسبة. استخدم عربية طبيعية، واجعل تعليمات الطلب واضحة."
  ],
  avoid: [
    "Exaggerated claims, forced slang, repetitive urgency and too many emojis.",
    "المبالغات، والعامية المتكلّفة، والإلحاح المتكرر، والإفراط في الرموز التعبيرية."
  ],
  goal: ["Build a loyal local customer base and grow repeat orders.", "بناء قاعدة عملاء محلية وفية وزيادة الطلبات المتكررة."],
  priorities: [
    "Introduce seasonal bakes. Make event catering easier to discover. Keep the weekly ordering routine clear.",
    "تقديم المخبوزات الموسمية، وإبراز خدمات ضيافة المناسبات، وتوضيح آلية الطلب الأسبوعية."
  ],
  marketing: [
    "Make the product the story: show the ingredients, the process and the moments our bakes belong in. Balance seasonal discovery with familiar favourites.",
    "اجعل المنتج محور القصة: أبرز المكوّنات والتحضير واللحظات التي تناسب مخبوزاتنا. وازن بين الاكتشاف الموسمي والخيارات المفضلة."
  ],
  pillars: ["Fresh from the oven · Behind the bake · Sharing & gifting · Seasonal flavours", "طازج من الفرن · كواليس الخَبز · المشاركة والإهداء · نكهات موسمية"]
};
const offeringSeeds = [
  [
    "Orange-cardamom knot",
    "عقدة البرتقال والهيل",
    "Pastries",
    "معجنات",
    "product",
    "fixed",
    1800,
    null,
    "active",
    "Flaky pastry with an orange glaze and a touch of cardamom.",
    "معجنات مورّقة بصلصة البرتقال ولمسة من الهيل."
  ],
  [
    "Pumpkin pie",
    "فطيرة اليقطين",
    "Seasonal bakes",
    "مخبوزات موسمية",
    "product",
    "fixed",
    12500,
    null,
    "active",
    "A whole spiced pumpkin pie with a buttery crust.",
    "فطيرة يقطين كاملة بالتوابل وقشرة زبدية."
  ],
  [
    "Chocolate babka",
    "بابكا الشوكولاتة",
    "Sharing bakes",
    "مخبوزات للمشاركة",
    "product",
    "fixed",
    7500,
    null,
    "active",
    "A braided loaf layered with dark chocolate.",
    "رغيف مضفّر بطبقات من الشوكولاتة الداكنة."
  ],
  [
    "Corporate breakfast catering",
    "ضيافة فطور الشركات",
    "Catering",
    "ضيافة",
    "service",
    "from",
    45000,
    null,
    "active",
    "Fresh breakfast bakes for meetings and team gatherings.",
    "مخبوزات فطور طازجة للاجتماعات ولقاءات الفرق."
  ],
  [
    "Mini dessert box",
    "علبة حلويات صغيرة",
    "Gifting",
    "هدايا",
    "product",
    "range",
    6000,
    12000,
    "active",
    "A selection of small treats in two box sizes.",
    "تشكيلة حلويات صغيرة بحجمين للعلبة."
  ],
  [
    "Celebration cake",
    "كعكة المناسبات",
    "Celebrations",
    "مناسبات",
    "product",
    "quote",
    null,
    null,
    "active",
    "Made to order for your occasion. Pricing depends on size and finish.",
    "تُحضّر حسب الطلب لمناسبتك. يعتمد السعر على الحجم والتزيين."
  ],
  [
    "Weekend baking workshop",
    "ورشة الخَبز الأسبوعية",
    "Experiences",
    "تجارب",
    "service",
    "fixed",
    25000,
    null,
    "paused",
    "A hands-on introduction to baking in a small group.",
    "تجربة عملية لتعلّم أساسيات الخَبز في مجموعة صغيرة."
  ],
  [
    "Pistachio cookies",
    "كوكيز الفستق",
    "Cookies",
    "كوكيز",
    "product",
    "fixed",
    4500,
    null,
    "active",
    "A box of six pistachio cookies.",
    "علبة من ست قطع كوكيز بالفستق."
  ],
  [
    "Sourdough loaf",
    "خبز العجين المخمّر",
    "Bread",
    "خبز",
    "product",
    "fixed",
    3000,
    null,
    "active",
    "A slow-fermented loaf with a crisp crust.",
    "رغيف بتخمير بطيء وقشرة مقرمشة."
  ],
  [
    "Private dessert table",
    "طاولة حلويات خاصة",
    "Catering",
    "ضيافة",
    "service",
    "quote",
    null,
    null,
    "active",
    "A tailored dessert selection for private celebrations.",
    "تشكيلة حلويات مخصصة للاحتفالات الخاصة."
  ],
  [
    "Bake-at-home cookie dough",
    "عجين كوكيز للخَبز المنزلي",
    "Bake at home",
    "خَبز منزلي",
    "product",
    "fixed",
    5000,
    null,
    "active",
    "Ready-to-bake portions for warm cookies at home.",
    "حصص جاهزة للخَبز والاستمتاع بكوكيز دافئ في المنزل."
  ],
  [
    "Ramadan sharing box",
    "علبة المشاركة الرمضانية",
    "Seasonal bakes",
    "مخبوزات موسمية",
    "product",
    "fixed",
    18000,
    null,
    "archived",
    "Our previous Ramadan collection, kept for reference.",
    "تشكيلتنا الرمضانية السابقة، محفوظة للرجوع إليها."
  ]
];
const createOfferings = () =>
  offeringSeeds.map((item, index) => ({
    id: `sample-${index + 1}`,
    name: [item[0], item[1]],
    nameEn: item[0],
    nameAr: item[1],
    category: [item[2], item[3]],
    kind: item[4],
    priceType: item[5],
    min: item[6],
    max: item[7],
    status: item[8],
    description: [item[9], item[10]],
    currency: "BHD",
    version: 1
  }));
let profile = structuredClone(initialProfile);
let offerings = createOfferings();
let section = "business",
  mode = "populated",
  nextSave = "success",
  query = "",
  kindFilter = "all",
  statusFilter = "all",
  page = 1;
let profileVersion = 1,
  edited = false,
  modal = null,
  toastTimer;
const pageSize = 7;

const blocks = {
  basics: { title: "basics", fields: ["businessName", "industry", "location", "stage"], facts: true },
  story: { title: "story", fields: ["summary", "origin"], long: true },
  difference: { title: "difference", fields: ["differentiator", "values"], long: true },
  contact: { title: "contact", fields: ["website", "instagram", "email"] },
  customers: { title: "customers", fields: ["customer", "needs"], long: true },
  market: { title: "market", fields: ["position", "competitors"], long: true },
  identity: { title: "identity", fields: ["colors", "languages"] },
  voice: { title: "voice", fields: ["tone", "writing", "avoid"], long: true },
  goals: { title: "goals", fields: ["goal", "priorities"], long: true },
  approach: { title: "approach", fields: ["marketing", "pillars"], long: true }
};

function renderShell() {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  $(".skip-link").textContent = locale === "ar" ? "انتقل إلى المحتوى" : "Skip to content";
  $("#section-tabs").setAttribute("aria-label", locale === "ar" ? "أقسام الملف" : "Profile sections");
  $("#sidebar").innerHTML =
    `<div class="brand"><div class="brand-mark">${icon("wand")}</div><div class="brand-text"><strong>MARKOS AI</strong><small>${locale === "ar" ? "استوديو التسويق" : "Marketing studio"}</small></div></div><nav class="nav-list" aria-label="${locale === "ar" ? "التنقل الرئيسي" : "Main navigation"}">${[
      ["overviewNav", "home"],
      ["campaigns", "target"],
      ["create", "palette"],
      ["calendar", "calendar"],
      ["insights", "chart"],
      ["title", "brain"]
    ]
      .map(
        ([key, symbol]) =>
          `<button class="nav-item" data-action="${key === "title" ? "home" : "unavailable"}" ${key === "title" ? 'aria-current="page"' : ""} aria-label="${t(key)}">${icon(symbol)}<span>${t(key)}</span></button>`
      )
      .join(
        ""
      )}</nav><div class="sidebar-bottom"><button class="nav-item" data-action="unavailable" aria-label="${t("notifications")}">${icon("bell")}<span>${t("notifications")}</span></button><button class="nav-item" data-action="locale" aria-label="${locale === "en" ? "Switch to Arabic" : "Switch to English"}">${icon("languages")}<span>${locale === "en" ? "العربية" : "English"}</span></button><button class="nav-item" data-action="unavailable" aria-label="${t("settings")}">${icon("settings")}<span>${t("settings")}</span></button><div class="workspace-switch"><div class="avatar">S</div><div><strong>SnackLab</strong><br>${locale === "ar" ? "مساحة عمل تجريبية" : "Sample workspace"}</div></div></div>`;
  renderHeader();
  renderTabs();
  renderContent();
  $("#page-footer").innerHTML = `${icon("flask")}${t("sampleFooter")}`;
}

function renderHeader() {
  $("#page-heading").innerHTML =
    `<div><h1>${t("title")}</h1><p>${t("subtitle")}</p></div><div class="prototype-meta"><span class="sample-label">${t("sample")}</span><details class="review-tools"><summary class="button small">${icon("sliders")}<span>${t("tools")}</span></summary><div class="tools-popover"><strong>${t("tools")}</strong><p>${t("toolsNote")}</p><label for="preview-mode">${t("pageState")}</label><select id="preview-mode">${["populated", "incomplete", "loading", "loadError"].map((value) => `<option value="${value}" ${mode === value ? "selected" : ""}>${t(value)}</option>`).join("")}</select><label for="preview-save">${t("nextSave")}</label><select id="preview-save">${["success", "fail", "conflict"].map((value) => `<option value="${value}" ${nextSave === value ? "selected" : ""}>${t(value)}</option>`).join("")}</select>${button(t("reset"), "reset", "small", "rotate")}</div></details></div>`;
}

function renderTabs() {
  $("#section-tabs").innerHTML = sections
    .map(
      ([key, symbol]) =>
        `<button id="tab-${key}" class="section-tab ${section === key ? "active" : ""}" data-action="section" data-section="${key}" ${section === key ? 'aria-current="page"' : ""}>${icon(symbol)}${t(key)}</button>`
    )
    .join("");
}

function renderContent() {
  if (mode === "loading") {
    $("#content").innerHTML =
      `<section class="card"><div class="empty-state" role="status"><h3>${t("loadingText")}</h3><div style="max-width:360px;margin:28px auto" aria-hidden="true"><div class="skeleton"></div><div class="skeleton short"></div><div class="skeleton"></div></div>${button(t("finishLoading"), "retry", "small")}</div></section>`;
    return;
  }
  if (mode === "loadError") {
    $("#content").innerHTML = emptyState("errorTitle", "errorNote", button(t("retry"), "retry", "primary", "rotate"), "cloud-off");
    return;
  }
  if (section === "offerings") {
    renderCatalog();
    return;
  }
  const identity =
    section === "business"
      ? `<div class="business-identity"><div class="business-logo" aria-hidden="true">SL</div><div><h2>${esc(profile.businessName)}</h2><div class="identity-details"><span>${esc(local(profile.industry) || t("emptyField"))}</span><span aria-hidden="true">·</span><span>${esc(local(profile.location) || t("emptyField"))}</span><span class="badge stage-badge">${t(profile.stage)}</span></div></div><span class="identity-note">${icon("check")}${t(edited ? "justSaved" : "updated")}</span></div>`
      : `<div class="section-intro"><div><h2>${t(section)}</h2><p>${t(`${section}Intro`)}</p></div></div>`;
  const columns = {
    business: [
      ["story", "difference"],
      ["basics", "contact"]
    ],
    audience: [["customers"], ["market"]],
    brand: [["voice"], ["identity"]],
    strategy: [["approach"], ["goals"]]
  }[section];
  $("#content").innerHTML =
    `${identity}<div class="profile-grid">${columns.map((ids) => `<div class="profile-column">${ids.map(renderCard).join("")}</div>`).join("")}</div>`;
}

function renderCard(id) {
  const block = blocks[id];
  const isEmpty = block.fields.every((key) => !local(profile[key]));
  return `<section class="card"><div class="card-heading"><h3>${t(block.title)}</h3><button type="button" class="edit-link" id="edit-${id}" data-action="edit-block" data-block="${id}" aria-label="${t(isEmpty ? "add" : "edit")} ${t(block.title)}">${icon(isEmpty ? "plus" : "pencil")}${t(isEmpty ? "add" : "edit")}</button></div><div class="card-body"><dl class="${block.facts ? "facts-grid" : ""}">${block.fields.map((key) => `<div class="field-reading"><dt>${t(key)}</dt><dd>${renderValue(key)}</dd></div>`).join("")}</dl></div></section>`;
}

function renderValue(key) {
  const value = local(profile[key]);
  if (!value) return `<span class="empty-field">${t("emptyField")}</span>`;
  if (key === "stage") return `<span class="badge stage-badge">${t(value)}</span>`;
  if (key === "colors")
    return `<div class="color-swatches">${value
      .split(",")
      .map((color) => color.trim())
      .filter((color) => /^#[0-9a-f]{6}$/i.test(color))
      .map((color) => `<span class="swatch"><i style="background:${color}" aria-hidden="true"></i><bdi>${color.toUpperCase()}</bdi></span>`)
      .join("")}</div>`;
  if (["website", "instagram", "email"].includes(key)) return `<bdi>${esc(value)}</bdi>`;
  return esc(value);
}

function emptyState(title, note, action, symbol = "package") {
  return `<section class="card"><div class="empty-state"><div class="empty-icon">${icon(symbol)}</div><h3>${t(title)}</h3><p>${t(note)}</p>${action}</div></section>`;
}

function renderCatalog() {
  $("#content").innerHTML =
    `<div class="section-intro"><div><h2>${t("offerings")}</h2><p>${t("catalogIntro")}</p></div>${button(t("addOffering"), "add-offering", "primary", "plus", 'id="add-offering"')}</div><section class="card"><div class="catalog-toolbar"><label class="search-box">${icon("search")}<input id="catalog-search" type="search" placeholder="${t("search")}" aria-label="${t("search")}" value="${esc(query)}" /></label><select id="kind-filter" aria-label="${t("type")}">${["all", "product", "service"].map((value) => `<option value="${value}" ${kindFilter === value ? "selected" : ""}>${t(value === "all" ? "allTypes" : value)}</option>`).join("")}</select><select id="status-filter" aria-label="${t("status")}">${["all", "active", "paused", "archived"].map((value) => `<option value="${value}" ${statusFilter === value ? "selected" : ""}>${t(value === "all" ? "allStatuses" : value)}</option>`).join("")}</select></div><div id="catalog-results"></div></section>`;
  renderRows();
}

function renderRows() {
  const filtered = offerings.filter(
    (item) =>
      (kindFilter === "all" || item.kind === kindFilter) &&
      (statusFilter === "all" || item.status === statusFilter) &&
      `${item.name.join(" ")} ${item.category.join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  page = Math.max(1, Math.min(page, pages));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  if (!rows.length) {
    $("#catalog-results").innerHTML =
      `<div class="empty-state"><div class="empty-icon">${icon("package")}</div><h3>${t(offerings.length ? "noMatches" : "noOfferings")}</h3><p>${t(offerings.length ? "noMatchesNote" : "noOfferingsNote")}</p>${button(t(offerings.length ? "clearFilters" : "addOffering"), offerings.length ? "clear-filters" : "add-offering", offerings.length ? "" : "primary", offerings.length ? "rotate" : "plus")}</div>`;
    return;
  }
  const start = (page - 1) * pageSize + 1,
    end = Math.min(page * pageSize, filtered.length);
  $("#catalog-results").innerHTML =
    `<table class="catalog-table"><thead><tr><th scope="col">${t("offering")}</th><th scope="col">${t("type")}</th><th scope="col">${t("price")}</th><th scope="col">${t("status")}</th><th scope="col"><span class="eyebrow">${t("edit")}</span></th></tr></thead><tbody>${rows.map((item) => `<tr><td><div class="offering-title"><div class="offering-monogram ${item.kind}">${icon(item.kind === "service" ? "handshake" : "croissant")}</div><div><div class="offering-name">${esc(local(item.name))}</div><div class="offering-category">${esc(local(item.category))}</div></div></div></td><td>${t(item.kind)}</td><td class="price">${formatPrice(item)}</td><td><span class="badge ${item.status}">${t(item.status)}</span></td><td class="table-actions"><button class="icon-button" id="edit-${item.id}" data-action="edit-offering" data-id="${item.id}" aria-label="${t("edit")} ${esc(local(item.name))}">${icon("pencil")}</button></td></tr>`).join("")}</tbody></table><div class="catalog-pagination"><span>${locale === "en" ? `${start}–${end} of ${filtered.length} offerings` : `${start}–${end} من ${filtered.length} منتج وخدمة`}</span><div class="pagination-buttons">${button(t("previous"), "previous", "small", "chevron-left", page === 1 ? "disabled" : "")}<span>${page} / ${pages}</span>${button(t("next"), "next", "small", "chevron-right", page === pages ? "disabled" : "")}</div></div>`;
}

function formatPrice(item) {
  if (["quote", "unspecified"].includes(item.priceType)) return t(item.priceType);
  const amount = (minor) => (minor / 1000).toFixed(3);
  return `${item.priceType === "from" ? `<small>${t("from")}</small>` : ""}<bdi>${item.currency} ${amount(item.min)}${item.priceType === "range" ? `–${amount(item.max)}` : ""}</bdi>`;
}

function inputField(key, value, { wide = false, type = "text", optional = false, hint = "", choices = null, multiline = false, required = false } = {}) {
  const attrs = `id="field-${key}" name="${key}" ${required ? "required" : ""} aria-describedby="hint-${key} error-${key}"`;
  const control = choices
    ? `<select ${attrs}>${choices.map((choice) => `<option value="${choice}" ${value === choice ? "selected" : ""}>${t(choice)}</option>`).join("")}</select>`
    : multiline
      ? `<textarea ${attrs} maxlength="4000">${esc(value)}</textarea>`
      : `<input ${attrs} type="${type}" value="${esc(value)}" maxlength="${type === "text" ? "300" : "1000"}" ${type === "number" ? 'min="0" step="0.001" inputmode="decimal"' : ""} />`;
  return `<div class="form-field ${wide ? "wide" : ""}"><label for="field-${key}">${t(key)}${optional ? `<span>${t("optional")}</span>` : ""}</label>${control}<p class="field-hint" id="hint-${key}" ${hint ? "" : "hidden"}>${esc(hint)}</p><p class="field-error" id="error-${key}" hidden></p></div>`;
}

function priceFields(priceType, min = "", max = "") {
  if (["unspecified", "quote"].includes(priceType)) return "";
  return `${inputField(priceType === "range" ? "minimum" : "amount", min, { type: "number" })}${priceType === "range" ? inputField("maximum", max, { type: "number" }) : '<div class="form-field"><label for="currency">' + t("currency") + '</label><input id="currency" value="BHD" readonly aria-readonly="true" /></div>'}`;
}

function currentForm() {
  return Object.fromEntries(new FormData($("#edit-form")).entries());
}
function dirty() {
  return modal && JSON.stringify(currentForm()) !== modal.baseline;
}

function openEditor(kind, id, focusId) {
  const dialog = $("#editor");
  const item = kind === "offering" && id ? offerings.find((entry) => entry.id === id) : null;
  const block = kind === "block" ? blocks[id] : null;
  modal = {
    kind,
    id,
    focusId,
    baseVersion: kind === "block" ? profileVersion : (item?.version ?? 0),
    baseline: "",
    confirmation: null,
    saving: false,
    conflict: false
  };
  const title = kind === "block" ? `${t("edit")} ${t(block.title)}` : t(item ? "editOffering" : "addOffering");
  let form;
  if (block) {
    form = block.fields
      .map((key) =>
        inputField(key, local(profile[key]) || "", {
          wide: block.long || ["website", "instagram", "email", "colors", "languages"].includes(key),
          multiline: block.long,
          type: key === "website" ? "url" : key === "email" ? "email" : "text",
          required: key === "businessName",
          choices: key === "stage" ? stageOptions : null,
          hint: key === "stage" ? t("stageHint") : ""
        })
      )
      .join("");
  } else {
    const value = item ?? {
      name: ["", ""],
      kind: "product",
      description: ["", ""],
      priceType: "fixed",
      min: null,
      max: null,
      status: "active",
      category: ["", ""],
      nameEn: "",
      nameAr: ""
    };
    const number = (minor) => (minor === null ? "" : (minor / 1000).toFixed(3));
    form = `${inputField("name", local(value.name), { wide: true, required: true })}${inputField("type", value.kind, { choices: ["product", "service"] })}${inputField("status", value.status, { choices: value.status === "archived" ? ["archived", "active", "paused"] : ["active", "paused"] })}${inputField("description", local(value.description), { multiline: true, wide: true, optional: true })}${inputField("priceType", value.priceType, { choices: ["fixed", "from", "range", "quote", "unspecified"], wide: true })}<div class="form-grid wide" id="price-fields" style="grid-column:1/-1">${priceFields(value.priceType, number(value.min), number(value.max))}</div><details class="optional-fields"><summary>${t("moreDetails")}</summary><div class="form-grid">${inputField("category", local(value.category), { optional: true, wide: true })}${inputField(locale === "en" ? "nameAr" : "nameEn", locale === "en" ? value.nameAr : value.nameEn, { optional: true, wide: true })}</div></details>`;
  }
  dialog.innerHTML = `<header class="dialog-header"><div><h2 id="dialog-title">${esc(title)}</h2><p id="dialog-description">${block ? t("localeNote") : t(item ? "offeringHint" : "addHint")}</p></div><button class="icon-button" data-action="close-modal" aria-label="${t("close")}">${icon("x")}</button></header><div class="dialog-main"><form id="edit-form" class="dialog-form" novalidate><div class="form-grid">${form}</div>${kind === "offering" ? `<p class="field-hint" style="margin-top:16px">${t("statusHint")}</p>` : ""}<p class="form-note">${t("saveNote")}</p></form><div id="save-alert" class="alert" role="alert" hidden></div><section class="dialog-confirmation" id="confirmation" hidden tabindex="-1"></section></div><footer class="dialog-footer" id="dialog-footer"></footer>`;
  modal.baseline = JSON.stringify(currentForm());
  renderDialogFooter();
  if (!dialog.open) dialog.showModal();
  document.body.style.overflow = "hidden";
  $("#edit-form input, #edit-form textarea, #edit-form select")?.focus();
}

function renderDialogFooter() {
  const footer = $("#dialog-footer");
  if (modal.confirmation) {
    const action = modal.confirmation;
    footer.innerHTML = `${button(t("keepEditing"), "keep-editing")}${button(t(action === "discard" ? "discard" : action === "archive" ? "archive" : "loadLatest"), `confirm-${action}`, action === "reload" ? "primary" : "danger")}`;
    return;
  }
  const item = modal.kind === "offering" && modal.id ? offerings.find((entry) => entry.id === modal.id) : null;
  footer.innerHTML = `${item && item.status !== "archived" ? `<button type="button" class="edit-link archive-action" data-action="archive" ${modal.saving ? "disabled" : ""}>${icon("archive")}${t("archive")}</button>` : ""}${modal.saving ? `<span class="saving-label">${t("saving")}</span>` : ""}${button(t("cancel"), "close-modal", "", "", modal.saving ? "disabled" : "")}<button type="submit" form="edit-form" class="button primary" ${modal.saving || modal.conflict ? "disabled" : ""}>${modal.saving ? t("saving") : t("save")}</button>`;
  $("#editor .dialog-header button").disabled = modal.saving;
}

function confirm(action) {
  modal.confirmation = action;
  $("#edit-form").hidden = true;
  $("#save-alert").hidden = true;
  $("#confirmation").hidden = false;
  $("#confirmation").innerHTML =
    `<h3>${t(action === "discard" ? "discardTitle" : action === "archive" ? "archiveTitle" : "reloadTitle")}</h3><p>${t(action === "discard" ? "discardNote" : action === "archive" ? "archiveNote" : "reloadNote")}</p>${action === "archive" && dirty() ? `<p style="margin-top:14px">${t("archiveUnsaved")}</p>` : ""}`;
  renderDialogFooter();
  $("#confirmation").focus();
}

function keepEditing() {
  modal.confirmation = null;
  $("#edit-form").hidden = false;
  $("#confirmation").hidden = true;
  if (modal.conflict) showSaveError(true);
  renderDialogFooter();
  $("#edit-form input, #edit-form textarea, #edit-form select")?.focus();
}

function requestClose() {
  if (!modal || modal.saving) return;
  if (modal.confirmation) {
    keepEditing();
    return;
  }
  if (dirty()) confirm("discard");
  else closeEditor();
}

function closeEditor() {
  const focusId = modal?.focusId;
  modal = null;
  $("#editor").close();
  document.body.style.overflow = "";
  renderContent();
  const target = focusId ? document.getElementById(focusId) : null;
  (target || document.getElementById(`tab-${section}`))?.focus();
}

function fieldError(key, message) {
  const input = document.getElementById(`field-${key}`),
    error = document.getElementById(`error-${key}`);
  if (input) input.setAttribute("aria-invalid", "true");
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function validate(form) {
  $("#edit-form")
    .querySelectorAll('[aria-invalid="true"]')
    .forEach((input) => input.removeAttribute("aria-invalid"));
  $("#edit-form")
    .querySelectorAll(".field-error")
    .forEach((error) => {
      error.hidden = true;
    });
  const nameKey = modal.kind === "offering" ? "name" : modal.id === "basics" ? "businessName" : null;
  if (nameKey && !form[nameKey].trim()) fieldError(nameKey, t("required"));
  if (modal.kind === "offering") {
    const normalized = form.name.normalize("NFKC").trim().toLocaleLowerCase();
    if (offerings.some((item) => item.id !== modal.id && item.name.some((value) => value.normalize("NFKC").trim().toLocaleLowerCase() === normalized)))
      fieldError("name", t("duplicate"));
    for (const key of ["amount", "minimum", "maximum"].filter((key) => key in form)) {
      if (!/^\d+(\.\d{1,3})?$/.test(form[key]) || !Number.isFinite(Number(form[key]))) fieldError(key, t("invalidPrice"));
    }
    if (form.priceType === "range" && Number(form.maximum) < Number(form.minimum)) fieldError("maximum", t("invalidRange"));
  }
  if (form.website) {
    try {
      if (!["https:", "http:"].includes(new URL(form.website).protocol)) throw new Error();
    } catch {
      fieldError("website", t("invalidUrl"));
    }
  }
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) fieldError("email", t("invalidEmail"));
  if (form.colors) {
    const colors = form.colors.split(",").map((value) => value.trim());
    if (colors.length > 7 || colors.some((value) => !/^#[0-9a-f]{6}$/i.test(value))) fieldError("colors", t("invalidColors"));
  }
  const invalid = $("#edit-form [aria-invalid='true']");
  invalid?.focus();
  return !invalid;
}

function showSaveError(isConflict) {
  const alert = $("#save-alert");
  alert.hidden = false;
  alert.innerHTML = `<p>${t(isConflict ? "stale" : "saveFailed")}</p>${isConflict ? button(t("loadLatest"), "load-latest", "small") : ""}`;
  alert.scrollIntoView({ block: "nearest" });
}

async function persist(action = "save") {
  if (!modal || modal.saving) return;
  const form = currentForm();
  if (action === "save" && !validate(form)) return;
  const outcome = nextSave;
  nextSave = "success";
  renderHeader();
  if (modal.confirmation) keepEditing();
  modal.saving = true;
  $("#edit-form")
    .querySelectorAll("input,textarea,select")
    .forEach((input) => {
      input.disabled = true;
    });
  $("#save-alert").hidden = true;
  renderDialogFooter();
  await new Promise((resolve) => setTimeout(resolve, 600));
  const item = modal.kind === "offering" && modal.id ? offerings.find((entry) => entry.id === modal.id) : null;
  if (outcome === "conflict") {
    if (item) item.version += 1;
    else profileVersion += 1;
  }
  const stale = modal.baseVersion !== (modal.kind === "block" ? profileVersion : (item?.version ?? 0));
  if (outcome === "fail" || stale) {
    modal.saving = false;
    modal.conflict = stale;
    $("#edit-form")
      .querySelectorAll("input,textarea,select")
      .forEach((input) => {
        input.disabled = false;
      });
    renderDialogFooter();
    showSaveError(stale);
    return;
  }
  if (action === "archive") {
    item.status = "archived";
    item.version += 1;
  } else if (modal.kind === "block") {
    for (const key of blocks[modal.id].fields) {
      if (Array.isArray(profile[key])) profile[key][locale === "ar" ? 1 : 0] = form[key].trim();
      else profile[key] = form[key].trim();
    }
    profileVersion += 1;
  } else {
    const entry = item ?? { id: `sample-${crypto.randomUUID()}`, name: ["", ""], description: ["", ""], category: ["", ""], version: 0 };
    const langIndex = locale === "ar" ? 1 : 0;
    entry.name[langIndex] = form.name.trim();
    entry.name[1 - langIndex] = (locale === "en" ? form.nameAr : form.nameEn).trim() || form.name.trim();
    entry.description[langIndex] = form.description.trim();
    entry.category[langIndex] = form.category.trim();
    Object.assign(entry, {
      nameEn: (locale === "en" ? form.name : form.nameEn).trim(),
      nameAr: (locale === "ar" ? form.name : form.nameAr).trim(),
      kind: form.type,
      status: form.status,
      priceType: form.priceType,
      currency: "BHD",
      min: ["fixed", "from", "range"].includes(form.priceType) ? Math.round(Number(form.amount ?? form.minimum) * 1000) : null,
      max: form.priceType === "range" ? Math.round(Number(form.maximum) * 1000) : null,
      version: entry.version + 1
    });
    if (!item) {
      offerings.unshift(entry);
      query = "";
      kindFilter = "all";
      statusFilter = "all";
      page = 1;
    }
  }
  edited = true;
  closeEditor();
  toast(t(action === "archive" ? "archivedToast" : "saved"));
}

function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").innerHTML = `${icon("check")}<span>${esc(message)}</span>`;
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, 4000);
}

function setMode(value) {
  mode = value;
  if (value === "incomplete") {
    profile = structuredClone(initialProfile);
    for (const key of Object.keys(profile)) {
      if (!["businessName", "industry", "location", "stage"].includes(key)) profile[key] = Array.isArray(profile[key]) ? ["", ""] : "";
    }
    profile.stage = "newly";
    offerings = [];
  } else if (value === "populated") {
    profile = structuredClone(initialProfile);
    offerings = createOfferings();
  }
  page = 1;
  edited = false;
  renderShell();
}

document.addEventListener("click", (event) => {
  if (event.target === $("#editor")) {
    requestClose();
    return;
  }
  const target = event.target.closest("[data-action]");
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  if (action === "section") {
    section = target.dataset.section;
    renderTabs();
    renderContent();
    document.getElementById(`tab-${section}`).focus();
  } else if (action === "home") {
    section = "business";
    renderTabs();
    renderContent();
  } else if (action === "locale") {
    locale = locale === "en" ? "ar" : "en";
    renderShell();
  } else if (action === "unavailable") toast(t("onlyProfile"));
  else if (action === "edit-block") openEditor("block", target.dataset.block, target.id);
  else if (action === "edit-offering") openEditor("offering", target.dataset.id, target.id);
  else if (action === "add-offering") openEditor("offering", null, "add-offering");
  else if (action === "close-modal") requestClose();
  else if (action === "keep-editing") keepEditing();
  else if (action === "confirm-discard") closeEditor();
  else if (action === "archive") confirm("archive");
  else if (action === "confirm-archive") void persist("archive");
  else if (action === "load-latest") confirm("reload");
  else if (action === "confirm-reload") {
    const { kind, id, focusId } = modal;
    openEditor(kind, id, focusId);
  } else if (action === "next" || action === "previous") {
    page += action === "next" ? 1 : -1;
    renderRows();
  } else if (action === "clear-filters") {
    query = "";
    kindFilter = "all";
    statusFilter = "all";
    page = 1;
    renderCatalog();
  } else if (action === "retry") {
    mode = "populated";
    renderShell();
  } else if (action === "reset") {
    query = "";
    kindFilter = "all";
    statusFilter = "all";
    profileVersion = 1;
    nextSave = "success";
    setMode("populated");
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "catalog-search") {
    query = event.target.value;
    page = 1;
    renderRows();
  }
});
document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.id === "preview-mode") setMode(target.value);
  else if (target.id === "preview-save") nextSave = target.value;
  else if (target.id === "kind-filter") {
    kindFilter = target.value;
    page = 1;
    renderRows();
  } else if (target.id === "status-filter") {
    statusFilter = target.value;
    page = 1;
    renderRows();
  } else if (target.id === "field-priceType") {
    const form = currentForm();
    $("#price-fields").innerHTML = priceFields(target.value, form.amount ?? form.minimum ?? "", form.maximum ?? "");
  }
});
document.addEventListener("submit", (event) => {
  if (event.target.id === "edit-form") {
    event.preventDefault();
    void persist();
  }
});
$("#editor").addEventListener("cancel", (event) => {
  event.preventDefault();
  requestClose();
});
$("#editor").addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const controls = [
    ...$("#editor").querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary")
  ].filter((control) => control.getClientRects().length > 0);
  const first = controls[0],
    last = controls.at(-1);
  if (!first) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (modal && (modal.saving || dirty())) {
    event.preventDefault();
    event.returnValue = "";
  }
});
renderShell();
