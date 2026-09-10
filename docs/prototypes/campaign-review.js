/* Design prototype: fictional immutable plans and in-memory content records. No API calls. */
"use strict";

const copy = {
  campaigns: ["Campaigns", "الحملات"],
  overviewNav: ["Overview", "نظرة عامة"],
  create: ["Create", "إنشاء"],
  calendar: ["Calendar", "التقويم"],
  insights: ["Insights", "التحليلات"],
  profile: ["Business profile", "ملف النشاط"],
  prototype: ["Design prototype · Sample data", "نموذج تصميم · بيانات تجريبية"],
  tools: ["Preview tools", "أدوات المعاينة"],
  language: ["Language", "اللغة"],
  appearance: ["Appearance", "المظهر"],
  light: ["Light", "فاتح"],
  dark: ["Dark", "داكن"],
  pageState: ["Page state", "حالة الصفحة"],
  populated: ["Populated", "بيانات مكتملة"],
  empty: ["Empty", "فارغة"],
  loading: ["Loading", "جارٍ التحميل"],
  error: ["Load failure", "فشل التحميل"],
  nextAction: ["Next draft action", "إجراء المسودة التالي"],
  success: ["Successful", "ناجح"],
  fail: ["Connection failure", "فشل الاتصال"],
  reset: ["Reset sample data", "إعادة البيانات التجريبية"],
  toolsNote: ["No API requests. Sample draft changes reset on refresh.", "لا توجد طلبات إلى النظام. تُعاد تغييرات المسودات التجريبية عند تحديث الصفحة."],
  newCampaign: ["New campaign", "حملة جديدة"],
  search: ["Find a campaign", "ابحث عن حملة"],
  openCampaign: ["Open campaign", "فتح الحملة"],
  close: ["Close campaign", "إغلاق الحملة"],
  days: ["days", "أيام"],
  planned: ["Planned posts", "منشورات مخططة"],
  ideas: ["Ideas", "أفكار"],
  drafts: ["Draft", "مسودة"],
  ready: ["Ready", "جاهز"],
  scheduled: ["Scheduled", "مجدول"],
  published: ["Published", "منشور"],
  failed: ["Needs attention", "يحتاج إلى انتباه"],
  idea: ["Idea", "فكرة"],
  draft: ["Draft", "مسودة"],
  POST: ["Post", "منشور"],
  CAROUSEL: ["Carousel", "منشور متعدد"],
  REEL: ["Reel", "ريل"],
  STORY: ["Story", "قصة"],
  longFixture: ["90-day sample · Review layout only", "نموذج ٩٠ يومًا · لتصميم المراجعة فقط"],
  longNote: [
    "This longer sample tests navigation. Campaign generation still supports 3, 7, or 14 days.",
    "يختبر هذا النموذج الطويل التنقل فقط. يظل إنشاء الحملات متاحًا لمدة ٣ أو ٧ أو ١٤ يومًا."
  ],
  indexNote: [
    "Ideas have no content record yet. Draft and Ready counts come from linked content; reading a plan changes none of them.",
    "الأفكار ليست سجلات محتوى بعد. تُحسب المسودات والمنشورات الجاهزة من المحتوى المرتبط؛ قراءة الخطة لا تغيّر حالتها."
  ],
  overview: ["Overview", "نظرة عامة"],
  week: ["Week", "أسبوع"],
  month: ["Month", "شهر"],
  weeks: ["Weeks", "الأسابيع"],
  months: ["Months", "الأشهر"],
  objective: ["Campaign objective", "هدف الحملة"],
  plan: ["The plan", "الخطة"],
  selectedPost: ["Selected post", "المنشور المحدد"],
  returnPost: ["Return to post", "العودة للمنشور"],
  day: ["Day", "يوم"],
  posts: ["posts", "منشورات"],
  postCount: ["post", "منشور"],
  previousPeriod: ["Previous period", "الفترة السابقة"],
  nextPeriod: ["Next period", "الفترة التالية"],
  previousPost: ["Previous", "السابق"],
  nextPost: ["Next", "التالي"],
  backToPlan: ["Back to plan", "العودة للخطة"],
  brief: ["Post brief", "فكرة المنشور"],
  goal: ["Goal", "الهدف"],
  pillar: ["Content pillar", "ركيزة المحتوى"],
  noMedia: ["No media attached", "لم تُرفق وسائط"],
  noMediaNote: ["Add or generate media in Create when you work on this post.", "أضف الوسائط أو أنشئها في صفحة إنشاء عند العمل على هذا المنشور."],
  sampleMedia: ["Sample media", "وسائط تجريبية"],
  illustration: ["Illustration only · not a published asset", "رسم توضيحي فقط · ليس ملفًا منشورًا"],
  createDraft: ["Create draft", "إنشاء مسودة"],
  openDraft: ["Open draft", "فتح المسودة"],
  openContent: ["Open in Create", "فتح في صفحة إنشاء"],
  createNote: ["Create a draft from this idea. Writing and media are prepared in Create.", "أنشئ مسودة من هذه الفكرة. تُجهّز الكتابة والوسائط في صفحة إنشاء."],
  existingNote: ["Continue with the linked content. Its current status is kept.", "تابع العمل على المحتوى المرتبط مع الحفاظ على حالته الحالية."],
  draftCreated: [
    "Sample draft created. Open draft represents the handoff to Create; no real record was saved.",
    "أُنشئت مسودة تجريبية. يمثّل زر فتح المسودة الانتقال إلى صفحة إنشاء؛ لم يُحفظ سجل فعلي."
  ],
  draftOpened: [
    "Prototype only: this action opens the same linked record in Create. No real navigation or record change was made.",
    "في النموذج فقط: يفتح هذا الإجراء السجل المرتبط نفسه في صفحة إنشاء. لم يحدث انتقال أو تغيير فعلي."
  ],
  actionFailed: ["Could not create the sample draft. The idea is unchanged. Try again.", "تعذّر إنشاء المسودة التجريبية. لم تتغيّر الفكرة. حاول مجددًا."],
  emptyIndex: ["No campaigns yet", "لا توجد حملات بعد"],
  emptyIndexBody: ["A campaign brings its objective, dates, and post ideas together here.", "تجمع الحملة هدفها وتواريخها وأفكار منشوراتها هنا."],
  noResults: ["No matching campaigns", "لا توجد حملات مطابقة"],
  clearSearch: ["Clear search", "مسح البحث"],
  emptyPlan: ["No post ideas in this plan", "لا توجد أفكار منشورات في هذه الخطة"],
  emptyPlanBody: [
    "There is nothing to turn into a draft yet. You can close this campaign and choose another.",
    "لا توجد أفكار لتحويلها إلى مسودات بعد. يمكنك إغلاق هذه الحملة واختيار أخرى."
  ],
  loadingTitle: ["Loading the plan…", "جارٍ تحميل الخطة…"],
  loadingBody: ["Your place will be kept while the campaign loads.", "سيُحفظ موضعك أثناء تحميل الحملة."],
  loadFailed: ["Could not load the campaign", "تعذّر تحميل الحملة"],
  loadFailedBody: ["Your selection is kept. Try again or close this view.", "لم يتغيّر اختيارك. حاول مجددًا أو أغلق هذه النافذة."],
  retry: ["Try again", "المحاولة مجددًا"],
  showSamples: ["Show sample campaigns", "عرض الحملات التجريبية"],
  finishLoading: ["Show loaded sample", "عرض النموذج بعد التحميل"],
  viewingNote: ["Viewing does not approve ideas or create drafts.", "عرض الأفكار لا يعتمدها ولا ينشئ مسودات."],
  generatorNote: [
    "This prototype explores review. The existing generator keeps its 3-, 7-, and 14-day choices.",
    "يستكشف هذا النموذج المراجعة فقط. يحتفظ منشئ الحملات بخيارات ٣ و٧ و١٤ يومًا."
  ],
  outside: ["This destination is outside the Campaign review prototype.", "هذه الوجهة خارج نموذج مراجعة الحملات."],
  progress: ["of", "من"]
};

const templates = [
  {
    title: ["Meet your new morning favourite", "تعرّف على نكهتك الصباحية الجديدة"],
    description: [
      "Introduce the orange-cardamom knot with a close look at the glaze and flaky layers. Keep the invitation simple: make it part of the next coffee break.",
      "قدّم عقدة البرتقال والهيل بلقطة قريبة للتغطية والطبقات الهشّة، مع دعوة بسيطة لتجربتها في استراحة القهوة القادمة."
    ],
    goal: ["Introduce the seasonal menu", "التعريف بالقائمة الموسمية"],
    pillar: ["Seasonal flavours", "نكهات موسمية"],
    type: "POST"
  },
  {
    title: ["From dough to the first bite", "من العجين إلى أول قضمة"],
    description: [
      "Follow one batch from shaping to the oven. Focus on hands, texture, and the small details behind the bake. End on the finished knot.",
      "تابع دفعة واحدة من تشكيل العجين إلى الفرن. ركّز على الأيدي والقوام والتفاصيل الصغيرة، واختم بالقطعة الجاهزة."
    ],
    goal: ["Show the care behind the product", "إظهار العناية بالمنتج"],
    pillar: ["Behind the bake", "كواليس الخَبز"],
    type: "REEL"
  },
  {
    title: ["Which flavour belongs in your box?", "أي نكهة تختار لعلبتك؟"],
    description: [
      "Show two seasonal options and invite followers to share their preference. Use a clear question and leave space around the product.",
      "اعرض خيارين موسميين وادعُ المتابعين لمشاركة تفضيلهم. استخدم سؤالًا واضحًا واترك مساحة حول المنتج."
    ],
    goal: ["Start a useful conversation", "بدء حوار مفيد"],
    pillar: ["Sharing & gifting", "المشاركة والإهداء"],
    type: "STORY"
  },
  {
    title: ["A little guide to a better coffee break", "دليل صغير لاستراحة قهوة ألذ"],
    description: [
      "Pair each featured bake with a coffee moment across three slides. Keep the product names consistent and finish with the ordering information.",
      "اربط كل مخبوزة بلحظة قهوة عبر ثلاث صور. حافظ على أسماء المنتجات واختم بمعلومات الطلب."
    ],
    goal: ["Help customers choose", "مساعدة العملاء على الاختيار"],
    pillar: ["Everyday favourites", "مفضلات كل يوم"],
    type: "CAROUSEL"
  },
  {
    title: ["Something thoughtful to share", "شيء مميز للمشاركة"],
    description: [
      "Present a sharing box as part of a small gathering. Describe who it is for without inventing a discount, limited stock, or unconfirmed price.",
      "قدّم علبة المشاركة ضمن جلسة صغيرة. وضّح لمن تناسب دون اختلاق خصم أو كمية محدودة أو سعر غير مؤكّد."
    ],
    goal: ["Make the sharing range easier to discover", "تسهيل اكتشاف خيارات المشاركة"],
    pillar: ["Sharing & gifting", "المشاركة والإهداء"],
    type: "POST"
  },
  {
    title: ["The details you can almost taste", "تفاصيل تكاد تتذوقها"],
    description: [
      "Capture citrus zest, glaze, and a fresh cross-section. Let the texture tell the story and use a short caption grounded in the confirmed ingredients.",
      "صوّر بشر الحمضيات والتغطية ومقطعًا من المخبوزة. دع القوام يحكي القصة واستخدم نصًا قصيرًا مبنيًا على المكوّنات المؤكدة."
    ],
    goal: ["Build interest in the flavour", "إثارة الاهتمام بالنكهة"],
    pillar: ["Seasonal flavours", "نكهات موسمية"],
    type: "REEL"
  },
  {
    title: ["Your weekend, freshly baked", "عطلة نهاية أسبوع بمخبوزات طازجة"],
    description: [
      "Make a simple weekend invitation around the current menu. Include the confirmed ordering channel and keep timing flexible unless it is already agreed.",
      "قدّم دعوة بسيطة لعطلة نهاية الأسبوع حول القائمة الحالية. أضف وسيلة الطلب المؤكدة ولا تحدّد موعدًا غير متفق عليه."
    ],
    goal: ["Encourage repeat orders", "تشجيع الطلبات المتكررة"],
    pillar: ["Everyday favourites", "مفضلات كل يوم"],
    type: "STORY"
  }
];

const seeds = [
  {
    id: "autumn",
    durationDays: 14,
    perDay: 2,
    startsAt: "2026-09-14",
    title: ["A fresh taste of autumn", "نكهة جديدة للخريف"],
    objective: [
      "Introduce the autumn bakes and make SnackLab part of the weekly coffee routine.",
      "التعريف بمخبوزات الخريف وجعل سناك لاب جزءًا من روتين القهوة الأسبوعي."
    ],
    focus: [
      ["Introduce the favourites", "التعريف بالأصناف المفضلة"],
      ["Make room for a new routine", "بناء عادة جديدة"]
    ]
  },
  {
    id: "weekend",
    durationDays: 3,
    perDay: 1,
    startsAt: "2026-09-11",
    title: ["A sweeter weekend", "عطلة نهاية أسبوع أحلى"],
    objective: [
      "Give local customers a simple reason to bring fresh bakes to their weekend table.",
      "امنح العملاء المحليين سببًا بسيطًا لإضافة المخبوزات الطازجة إلى مائدة عطلتهم."
    ],
    focus: [["Three days, one invitation", "ثلاثة أيام ودعوة واحدة"]]
  },
  {
    id: "season",
    durationDays: 90,
    perDay: 1,
    startsAt: "2026-10-01",
    title: ["A season of small celebrations", "موسم من الاحتفالات الصغيرة"],
    objective: [
      "Explore a longer plan that balances seasonal discovery, familiar favourites, and thoughtful gifting.",
      "استكشاف خطة أطول توازن بين النكهات الموسمية والأصناف المفضلة والإهداء."
    ],
    focus: [
      ["Seasonal discovery", "اكتشاف الموسم"],
      ["Everyday rituals", "عادات يومية"],
      ["Thoughtful gatherings", "تجمّعات مميزة"]
    ]
  }
];

const campaigns = seeds.map((seed) => {
  const weeks = [];
  for (let day = 1; day <= seed.durationDays; day++) {
    const weekIndex = Math.floor((day - 1) / 7);
    if (!weeks[weekIndex]) weeks.push({ week: weekIndex + 1, focus: seed.focus[weekIndex % seed.focus.length], days: [] });
    const week = weeks[weekIndex];
    const posts = Array.from({ length: seed.perDay }, (_, index) => {
      const template = templates[((day - 1) * seed.perDay + index) % templates.length];
      const actionIndex = week.days.length * seed.perDay + index;
      return { ...template, day, week: week.week, actionIndex, key: `${seed.id}:${week.week}:${actionIndex}` };
    });
    week.days.push({ day, posts });
  }
  return { ...seed, weeks, posts: weeks.flatMap((week) => week.days.flatMap((day) => day.posts)) };
});

const params = new URLSearchParams(location.search);
let locale = params.get("locale") === "ar" ? "ar" : "en";
let theme = params.get("theme") === "dark" ? "dark" : "light";
let indexState = ["empty", "loading", "error"].includes(params.get("state")) ? params.get("state") : "populated";
let reviewState = "populated";
let nextAction = "success";
let query = "";
let activeCampaignId = null;
let lastCampaignId = null;
let indexScroll = 0;
let actionNotice = null;
let toastTimer;
const selections = new Map();
const records = new Map();
const reviewer = document.getElementById("reviewer");
const stateNames = { DRAFT: "draft", READY: "ready", SCHEDULED: "scheduled", PUBLISHED: "published", FAILED: "failed" };
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const t = (key) => copy[key]?.[locale === "ar" ? 1 : 0] ?? key;
const local = (value) => (Array.isArray(value) ? value[locale === "ar" ? 1 : 0] : value);
const number = (value) => new Intl.NumberFormat(locale === "ar" ? "ar-BH" : "en-GB").format(value);
function countLabel(value, noun) {
  if (locale !== "ar") return `${number(value)} ${noun === "days" ? (value === 1 ? "day" : "days") : value === 1 ? "post" : "posts"}`;
  const forms =
    noun === "days"
      ? { zero: "أيام", one: "يوم واحد", two: "يومان", few: "أيام", many: "يومًا", other: "يوم" }
      : { zero: "منشورات", one: "منشور واحد", two: "منشوران", few: "منشورات", many: "منشورًا", other: "منشور" };
  const category = new Intl.PluralRules("ar").select(value);
  return category === "one" || category === "two" ? forms[category] : `${number(value)} ${forms[category]}`;
}
const icon = (name, directional = false) =>
  `<svg aria-hidden="true"${directional ? ' class="directional"' : ""}><use href="business-profile-icons.svg#${name}"></use></svg>`;
// Lucide v0.562.0 (ISC), matching Create's format icons. See business-profile-icons.LICENSE.txt.
const formatIconPaths = {
  POST: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  CAROUSEL:
    '<path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16"/><path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2"/><circle cx="13" cy="7" r="1" fill="currentColor"/><rect x="8" y="2" width="14" height="14" rx="2"/>',
  REEL: '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  STORY: '<rect width="12" height="20" x="6" y="2" rx="2"/>'
};
const formatIcon = (type) => `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" data-format="${type}">${formatIconPaths[type]}</svg>`;
const button = (label, action, extra = "", style = "", symbol = "") =>
  `<button type="button" class="button ${style}" data-action="${action}" ${extra}>${symbol ? icon(symbol, symbol.startsWith("chevron")) : ""}<span>${esc(label)}</span></button>`;
const campaignById = (id) => campaigns.find((campaign) => campaign.id === id);
const currentCampaign = () => campaignById(activeCampaignId);
const dateFor = (campaign, day) => new Date(`${campaign.startsAt}T12:00:00Z`).getTime() + (day - 1) * 86400000;
const dateLabel = (time, options = { day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-GB", { ...options, timeZone: "UTC" }).format(new Date(time));
const rangeLabel = (campaign, first = 1, last = campaign.durationDays) => `${dateLabel(dateFor(campaign, first))} – ${dateLabel(dateFor(campaign, last))}`;
const statusFor = (post) => records.get(post.key)?.status ?? "IDEA";
const statusBadge = (post) => {
  const status = statusFor(post);
  return `<span class="status status-${status.toLowerCase()}">${t(statusNames(status))}</span>`;
};
const statusNames = (status) => stateNames[status] ?? "idea";

function seedRecords() {
  records.clear();
  const statuses = ["DRAFT", "READY", null, null, "DRAFT", "SCHEDULED", null, "PUBLISHED", null, null, "READY", null];
  for (const campaign of campaigns)
    campaign.posts.forEach((post, index) => {
      const status = statuses[index % statuses.length];
      if (status) records.set(post.key, { id: `sample-${campaign.id}-${index + 1}`, status, media: status !== "DRAFT" || index % 4 === 0 });
    });
}

function selectionFor(campaign) {
  if (!selections.has(campaign.id))
    selections.set(campaign.id, { zoom: campaign.durationDays <= 14 ? "week" : "overview", day: 1, postKey: null, screen: "plan" });
  return selections.get(campaign.id);
}

function monthGroups(campaign) {
  const groups = [];
  for (let day = 1; day <= campaign.durationDays; day++) {
    const date = new Date(dateFor(campaign, day));
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    let group = groups.find((entry) => entry.key === key);
    if (!group) {
      group = { key, first: day, last: day, year: date.getUTCFullYear(), month: date.getUTCMonth() };
      groups.push(group);
    }
    group.last = day;
  }
  return groups;
}

function countsMarkup(posts, total = false) {
  const counts = Object.fromEntries(
    ["IDEA", "DRAFT", "READY", "SCHEDULED", "PUBLISHED", "FAILED"].map((status) => [status, posts.filter((post) => statusFor(post) === status).length])
  );
  const entries = [
    ...(total ? [["planned", posts.length]] : []),
    ["ideas", counts.IDEA],
    ["drafts", counts.DRAFT],
    ["ready", counts.READY],
    ...["SCHEDULED", "PUBLISHED", "FAILED"].filter((status) => counts[status]).map((status) => [stateNames[status], counts[status]])
  ];
  return `<div class="counts">${entries.map(([label, value]) => `<span class="count"><strong>${number(value)}</strong>${t(label)}</span>`).join("")}</div>`;
}

function toolsMarkup(context) {
  const state = context === "index" ? indexState : reviewState;
  const options = (values, selected) => values.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${t(value)}</option>`).join("");
  return `<details class="tools"><summary class="button" aria-label="${t("tools")}">${icon("sliders")}<span>${t("tools")}</span></summary><div class="tools-popover"><p class="meta">${t("toolsNote")}</p>
    <label for="${context}-locale">${t("language")}</label><select id="${context}-locale" data-setting="locale"><option value="en" ${locale === "en" ? "selected" : ""}>English</option><option value="ar" ${locale === "ar" ? "selected" : ""}>العربية</option></select>
    <label for="${context}-theme">${t("appearance")}</label><select id="${context}-theme" data-setting="theme">${options(["light", "dark"], theme)}</select>
    <label for="${context}-state">${t("pageState")}</label><select id="${context}-state" data-setting="state" data-context="${context}">${options(["populated", "empty", "loading", "error"], state)}</select>
    <label for="${context}-action">${t("nextAction")}</label><select id="${context}-action" data-setting="action">${options(["success", "fail"], nextAction)}</select>
    ${button(t("reset"), "reset", "", "", "rotate")}</div></details>`;
}

function renderIndex() {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  document.documentElement.dataset.theme = theme;
  document.title = `${t("campaigns")} · MARKOS UI prototype`;
  document.querySelector(".skip-link").textContent = locale === "ar" ? "الانتقال للحملات" : "Skip to campaigns";
  document.getElementById("app").innerHTML =
    `<aside class="app-sidebar"><div class="brand"><span class="brand-icon">${icon("wand")}</span><span>MARKOS AI</span></div><nav aria-label="${locale === "ar" ? "التنقل" : "Navigation"}">${[
      ["overviewNav", "home"],
      ["campaigns", "target"],
      ["create", "palette"],
      ["calendar", "calendar"],
      ["insights", "chart"],
      ["profile", "brain"]
    ]
      .map(
        ([key, symbol]) =>
          `<button type="button" class="nav-item ${key === "campaigns" ? "active" : ""}" data-action="${key === "campaigns" ? "index" : "outside"}" ${key === "campaigns" ? 'aria-current="page"' : ""}>${icon(symbol)}${t(key)}</button>`
      )
      .join(
        ""
      )}</nav><div class="workspace"><strong>SnackLab</strong><p class="meta">${locale === "ar" ? "نشاط تجريبي · البحرين" : "Sample business · Bahrain"}</p></div></aside>
    <main class="index-main" id="campaign-index" tabindex="-1"><header class="page-heading"><div><h1>${t("campaigns")}</h1><p class="prototype-label meta">${icon("flask")}${t("prototype")}</p></div>${toolsMarkup("index")}</header><div class="index-toolbar"><label class="search-box">${icon("search")}<input id="campaign-search" type="search" placeholder="${t("search")}" aria-label="${t("search")}" value="${esc(query)}" /></label>${button(t("newCampaign"), "new", "", "primary", "plus")}</div><div id="campaign-list"></div><p class="index-footnote">${t("indexNote")}</p></main>`;
  renderCampaignList();
}

function emptyMarkup(kind, context) {
  const title = kind === "loading" ? "loadingTitle" : kind === "error" ? "loadFailed" : context === "index" ? "emptyIndex" : "emptyPlan";
  const body = kind === "loading" ? "loadingBody" : kind === "error" ? "loadFailedBody" : context === "index" ? "emptyIndexBody" : "emptyPlanBody";
  return `<section class="empty-state" ${kind === "error" ? 'role="alert"' : kind === "loading" ? 'role="status" aria-busy="true"' : ""}>${kind === "loading" ? '<span class="spinner" aria-hidden="true"></span>' : icon(kind === "error" ? "cloud-off" : "calendar")}<h2>${t(title)}</h2><p>${t(body)}</p>${button(t(kind === "error" ? "retry" : kind === "loading" ? "finishLoading" : "showSamples"), "recover", `data-context="${context}"`, "", "rotate")}</section>`;
}

function renderCampaignList() {
  const target = document.getElementById("campaign-list");
  if (indexState !== "populated") {
    target.innerHTML = emptyMarkup(indexState, "index");
    return;
  }
  const filtered = campaigns.filter((campaign) =>
    `${local(campaign.title)} ${local(campaign.objective)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  target.innerHTML = filtered.length
    ? `<div class="campaign-list">${filtered.map((campaign) => `<article class="campaign-card ${lastCampaignId === campaign.id ? "last-open" : ""}"><div class="card-heading"><div><h2>${esc(local(campaign.title))}</h2><div class="date-line"><span>${icon("calendar")}${rangeLabel(campaign)}</span><span>${countLabel(campaign.durationDays, "days")}</span></div></div>${campaign.durationDays === 90 ? `<span class="sample-warning">${t("longFixture")}</span>` : ""}</div><p class="campaign-objective">${esc(local(campaign.objective))}</p><div class="card-bottom">${countsMarkup(campaign.posts, true)}${button(t("openCampaign"), "open-campaign", `id="open-${campaign.id}" data-id="${campaign.id}"`, "", "chevron-right")}</div></article>`).join("")}</div>`
    : `<section class="empty-state">${icon("search")}<h2>${t("noResults")}</h2>${button(t("clearSearch"), "clear-search")}</section>`;
}

function periodRail(campaign, selection) {
  const useMonths = selection.zoom === "month" || (selection.zoom === "overview" && campaign.durationDays > 31);
  const periods = useMonths
    ? monthGroups(campaign).map((month, index) => ({
        index,
        first: month.first,
        last: month.last,
        label: dateLabel(dateFor(campaign, month.first), { month: "long", year: "numeric" })
      }))
    : campaign.weeks.map((week, index) => ({ index, first: week.days[0].day, last: week.days.at(-1).day, label: `${t("week")} ${number(week.week)}` }));
  const selectedPost = campaign.posts.find((post) => post.key === selection.postKey);
  return `<aside class="period-rail" aria-label="${t("plan")}">${button(t("overview"), "zoom", 'data-zoom="overview" id="rail-overview"', "quiet rail-overview", "target")}<p class="rail-title">${t(useMonths ? "months" : "weeks")}</p><div class="period-list">${periods.map((period) => `<button type="button" class="period-button" id="period-${period.index}" data-action="period" data-day="${period.first}" data-zoom="${useMonths ? "month" : "week"}" aria-current="${selection.day >= period.first && selection.day <= period.last}">${esc(period.label)}<span>${rangeLabel(campaign, period.first, period.last)}</span></button>`).join("")}</div>${selectedPost && selection.screen !== "post" ? `<div class="rail-selection"><p class="meta">${t("selectedPost")}</p><strong>${esc(local(selectedPost.title))}</strong>${button(t("returnPost"), "post", `data-key="${selectedPost.key}"`, "quiet")}</div>` : ""}</aside>`;
}

function renderReviewer({ focusId = null, resetScroll = false } = {}) {
  const campaign = currentCampaign();
  if (!campaign) return;
  const selection = selectionFor(campaign);
  const priorFocus = reviewer.contains(document.activeElement) ? document.activeElement.id : null;
  const priorScroll = reviewer.querySelector(".review-work")?.scrollTop ?? 0;
  const railScroll = reviewer.querySelector(".period-rail")?.scrollTop ?? 0;
  const work =
    reviewState !== "populated"
      ? emptyMarkup(reviewState, "review")
      : selection.screen === "post"
        ? renderPost(campaign, selection)
        : selection.zoom === "overview"
          ? renderOverview(campaign)
          : selection.zoom === "month"
            ? renderMonth(campaign, selection)
            : renderWeek(campaign, selection);
  reviewer.innerHTML = `<header class="review-heading"><div><h1 id="review-title">${esc(local(campaign.title))}</h1><div class="date-line"><span>${rangeLabel(campaign)}</span><span>${countLabel(campaign.durationDays, "days")}</span>${campaign.durationDays === 90 ? `<span class="sample-warning">${t("longFixture")}</span>` : ""}</div></div><div class="review-heading-actions">${toolsMarkup("review")}${button(t("close"), "close", 'id="close-review"', "review-close", "x")}</div></header>
    <div class="review-body">${periodRail(campaign, selection)}<section id="review-work" class="review-work" aria-label="${t("plan")}"><div class="work-toolbar"><div class="zoom-control" role="group" aria-label="${locale === "ar" ? "نطاق العرض" : "Plan scale"}">${["overview", "week", "month"].map((zoom) => `<button type="button" id="zoom-${zoom}" data-action="zoom" data-zoom="${zoom}" aria-pressed="${selection.zoom === zoom}">${t(zoom)}</button>`).join("")}</div><span class="meta">${t("prototype")}</span></div>${work}</section></div>
    <footer class="review-footer"><span>${t("viewingNote")}</span>${reviewState === "populated" ? countsMarkup(campaign.posts) : ""}</footer>`;
  reviewer.querySelector(".review-work").scrollTop = resetScroll ? 0 : priorScroll;
  reviewer.querySelector(".period-rail").scrollTop = railScroll;
  const target = document.getElementById(focusId || priorFocus);
  if (reviewer.open && target && reviewer.contains(target)) target.focus({ preventScroll: true });
}

function renderOverview(campaign) {
  const periods =
    campaign.durationDays > 31
      ? monthGroups(campaign).map((month) => ({
          first: month.first,
          last: month.last,
          label: dateLabel(dateFor(campaign, month.first), { month: "long" }),
          focus: campaign.focus[Math.min(Math.floor((month.first - 1) / 30), campaign.focus.length - 1)],
          zoom: "month"
        }))
      : campaign.weeks.map((week) => ({
          first: week.days[0].day,
          last: week.days.at(-1).day,
          label: `${t("week")} ${number(week.week)}`,
          focus: week.focus,
          zoom: "week"
        }));
  return `<section class="overview-intro"><h2>${t("objective")}</h2><p>${esc(local(campaign.objective))}</p><div class="pillars">${[templates[0].pillar, templates[1].pillar, templates[2].pillar].map((pillar) => `<span class="pillar">${esc(local(pillar))}</span>`).join("")}</div>${campaign.durationDays === 90 ? `<p class="meta" style="margin-bottom:0">${t("longNote")}</p>` : ""}</section><div class="section-heading"><h2>${t("plan")}</h2><span class="meta">${countLabel(campaign.posts.length, "posts")}</span></div><div class="overview-grid">${periods.map((period) => `<button type="button" class="overview-period" data-action="period" data-day="${period.first}" data-zoom="${period.zoom}"><p class="meta">${esc(period.label)} · ${rangeLabel(campaign, period.first, period.last)}</p><h3>${esc(local(period.focus))}</h3><span class="meta">${countLabel(campaign.posts.filter((post) => post.day >= period.first && post.day <= period.last).length, "posts")}</span>${countsMarkup(campaign.posts.filter((post) => post.day >= period.first && post.day <= period.last))}</button>`).join("")}</div>`;
}

function periodHeading(label, sublabel, previous, next, zoom) {
  return `<header class="period-heading"><div><h2>${esc(label)}</h2><p class="meta">${esc(sublabel)}</p></div><div class="period-buttons">${button(t("previousPeriod"), "period", `id="previous-period" data-day="${previous ?? 1}" data-zoom="${zoom}" ${previous === null ? "disabled" : ""} aria-label="${t("previousPeriod")}"`, "icon-only", "chevron-left").replace(`<span>${t("previousPeriod")}</span>`, "")}${button(t("nextPeriod"), "period", `id="next-period" data-day="${next ?? 1}" data-zoom="${zoom}" ${next === null ? "disabled" : ""} aria-label="${t("nextPeriod")}"`, "icon-only", "chevron-right").replace(`<span>${t("nextPeriod")}</span>`, "")}</div></header>`;
}

function postRow(post, selection) {
  return `<button type="button" class="post-row ${selection.postKey === post.key ? "selected" : ""}" id="post-${post.week}-${post.actionIndex}" data-action="post" data-key="${post.key}"><span class="post-marker">${formatIcon(post.type)}</span><span><h3>${esc(local(post.title))}</h3><p>${t(post.type)} · ${esc(local(post.pillar))}</p></span>${statusBadge(post)}</button>`;
}

function renderWeek(campaign, selection) {
  const index = Math.floor((selection.day - 1) / 7);
  const week = campaign.weeks[index];
  return `${periodHeading(`${t("week")} ${number(week.week)} · ${local(week.focus)}`, rangeLabel(campaign, week.days[0].day, week.days.at(-1).day), campaign.weeks[index - 1]?.days[0].day ?? null, campaign.weeks[index + 1]?.days[0].day ?? null, "week")}<div class="week-list">${week.days.map((day) => `<section class="day-section ${day.day === selection.day ? "selected" : ""}"><button type="button" class="day-heading" id="day-${day.day}" data-action="day" data-day="${day.day}" aria-expanded="${day.day === selection.day}"><span><strong>${dateLabel(dateFor(campaign, day.day), { weekday: "long", day: "numeric", month: "short" })}</strong><span class="meta">${t("day")} ${number(day.day)}</span></span><span class="day-count">${countLabel(day.posts.length, "posts")}${icon("chevron-right", true)}</span></button>${day.day === selection.day ? `<div class="post-list">${day.posts.map((post) => postRow(post, selection)).join("")}</div>` : ""}</section>`).join("")}</div>`;
}

function renderMonth(campaign, selection) {
  const months = monthGroups(campaign);
  const index = months.findIndex((month) => selection.day >= month.first && selection.day <= month.last);
  const month = months[index];
  const firstWeekday = new Date(Date.UTC(month.year, month.month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const weekdays = locale === "ar" ? ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let cells =
    weekdays.map((day) => `<span class="weekday">${day}</span>`).join("") + '<span class="month-blank" aria-hidden="true"></span>'.repeat(firstWeekday);
  for (let date = 1; date <= daysInMonth; date++) {
    const day = Math.round((Date.UTC(month.year, month.month, date, 12) - dateFor(campaign, 1)) / 86400000) + 1;
    const posts = campaign.posts.filter((post) => post.day === day);
    cells += posts.length
      ? `<button type="button" class="month-cell" id="month-day-${day}" data-action="day" data-day="${day}" aria-pressed="${day === selection.day}" aria-label="${dateLabel(dateFor(campaign, day), { day: "numeric", month: "long" })}, ${countLabel(posts.length, "posts")}"><strong>${number(date)}</strong><span>${countLabel(posts.length, "posts")}</span></button>`
      : `<span class="month-cell muted" aria-hidden="true"><strong>${number(date)}</strong></span>`;
  }
  const dayPosts = campaign.posts.filter((post) => post.day === selection.day);
  return `${periodHeading(dateLabel(dateFor(campaign, month.first), { month: "long", year: "numeric" }), rangeLabel(campaign, month.first, month.last), months[index - 1]?.first ?? null, months[index + 1]?.first ?? null, "month")}<div class="month-grid">${cells}</div><section class="month-day"><div class="section-heading"><h3 id="selected-day-title" tabindex="-1">${dateLabel(dateFor(campaign, selection.day), { weekday: "long", day: "numeric", month: "short" })}</h3><span class="meta">${countLabel(dayPosts.length, "posts")}</span></div><div class="post-list">${dayPosts.map((post) => postRow(post, selection)).join("")}</div></section>`;
}

function renderPost(campaign, selection) {
  const post = campaign.posts.find((candidate) => candidate.key === selection.postKey);
  if (!post) return renderWeek(campaign, selection);
  const index = campaign.posts.indexOf(post);
  const record = records.get(post.key);
  const notice = actionNotice?.key === post.key ? actionNotice : null;
  return `<article class="post-detail">${button(t("backToPlan"), "back-plan", 'id="back-to-plan"', "quiet post-back", "chevron-left")}<div class="post-meta"><span>${dateLabel(dateFor(campaign, post.day), { weekday: "long", day: "numeric", month: "short" })}</span><span>${t(post.type)}</span>${statusBadge(post)}</div><h2 id="post-title" tabindex="-1">${esc(local(post.title))}</h2><div class="post-detail-grid"><section class="brief-card"><h3>${t("brief")}</h3><p>${esc(local(post.description))}</p><dl><div><dt>${t("goal")}</dt><dd>${esc(local(post.goal))}</dd></div><div><dt>${t("pillar")}</dt><dd>${esc(local(post.pillar))}</dd></div></dl></section><aside class="media-card ${record?.media ? "sample-media" : ""}">${record?.media ? `<div class="media-illustration">${icon("croissant")}</div><strong>${t("sampleMedia")}</strong><p>${t("illustration")}</p>` : `${icon("package")}<h3>${t("noMedia")}</h3><p>${t("noMediaNote")}</p>`}</aside></div><div class="post-action"><p>${t(record ? "existingNote" : "createNote")}</p>${button(t(!record ? "createDraft" : record.status === "DRAFT" ? "openDraft" : "openContent"), "draft-action", `id="draft-action" data-key="${post.key}"`, "primary", record ? "pencil" : "plus")}</div>${notice ? `<div class="action-notice ${notice.kind === "error" ? "error" : ""}" role="${notice.kind === "error" ? "alert" : "status"}"><p>${t(notice.message)}</p></div>` : ""}<footer class="post-footer">${button(t("previousPost"), "adjacent-post", `id="previous-post" data-index="${index - 1}" ${index === 0 ? "disabled" : ""}`, "", "chevron-left")}<span class="meta">${number(index + 1)} ${t("progress")} ${number(campaign.posts.length)}</span>${button(t("nextPost"), "adjacent-post", `id="next-post" data-index="${index + 1}" ${index === campaign.posts.length - 1 ? "disabled" : ""}`, "", "chevron-right")}</footer></article>`;
}

function openCampaign(id) {
  if (!campaignById(id)) return;
  indexScroll = window.scrollY;
  activeCampaignId = id;
  lastCampaignId = id;
  reviewState = "populated";
  actionNotice = null;
  renderReviewer({ resetScroll: true });
  document.body.classList.add("modal-open");
  reviewer.showModal();
  document.getElementById("close-review").focus();
}

function closeCampaign() {
  reviewer.close();
  document.body.classList.remove("modal-open");
  renderIndex();
  document.getElementById(`open-${lastCampaignId}`)?.focus({ preventScroll: true });
  window.scrollTo(0, indexScroll);
  activeCampaignId = null;
}

function selectPost(key) {
  const campaign = currentCampaign();
  const post = campaign.posts.find((entry) => entry.key === key);
  if (!post) return;
  Object.assign(selectionFor(campaign), { postKey: key, day: post.day, screen: "post" });
  actionNotice = null;
  renderReviewer({ focusId: "post-title", resetScroll: true });
}

function toast(message) {
  const notice = document.getElementById("prototype-notice");
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    notice.hidden = true;
  }, 5000);
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  if (action === "open-campaign") return openCampaign(target.dataset.id);
  if (action === "close") return closeCampaign();
  if (action === "outside") return toast(t("outside"));
  if (action === "new") return toast(t("generatorNote"));
  if (action === "index") return window.scrollTo(0, 0);
  if (action === "clear-search") {
    query = "";
    renderIndex();
    document.getElementById("campaign-search").focus();
    return;
  }
  if (action === "reset") {
    seedRecords();
    selections.clear();
    actionNotice = null;
    nextAction = "success";
    indexState = reviewState = "populated";
    query = "";
    renderIndex();
    if (reviewer.open) renderReviewer({ focusId: "close-review", resetScroll: true });
    return;
  }
  if (action === "recover") {
    if (target.dataset.context === "index") {
      indexState = "populated";
      renderIndex();
      document.getElementById("campaign-search").focus();
    } else {
      reviewState = "populated";
      renderReviewer({ focusId: `zoom-${selectionFor(currentCampaign()).zoom}` });
    }
    return;
  }
  const campaign = currentCampaign();
  if (!campaign) return;
  const selection = selectionFor(campaign);
  if (action === "zoom") {
    selection.zoom = target.dataset.zoom;
    selection.screen = "plan";
    renderReviewer({ focusId: `zoom-${selection.zoom}`, resetScroll: true });
  } else if (action === "period") {
    selection.day = Number(target.dataset.day);
    selection.zoom = target.dataset.zoom;
    selection.screen = "plan";
    selection.postKey = null;
    renderReviewer({ focusId: target.id || `zoom-${selection.zoom}`, resetScroll: true });
  } else if (action === "day") {
    selection.day = Number(target.dataset.day);
    selection.screen = "plan";
    renderReviewer({ focusId: selection.zoom === "month" ? "selected-day-title" : target.id });
    if (selection.zoom === "month") document.querySelector(".month-day")?.scrollIntoView({ block: "nearest", behavior: "auto" });
  } else if (action === "post") selectPost(target.dataset.key);
  else if (action === "back-plan") {
    selection.screen = "plan";
    renderReviewer({
      focusId: `post-${campaign.posts.find((post) => post.key === selection.postKey).week}-${campaign.posts.find((post) => post.key === selection.postKey).actionIndex}`,
      resetScroll: true
    });
  } else if (action === "adjacent-post") {
    const post = campaign.posts[Number(target.dataset.index)];
    if (post) selectPost(post.key);
  } else if (action === "draft-action") {
    const key = target.dataset.key;
    if (records.has(key)) actionNotice = { key, kind: "success", message: "draftOpened" };
    else if (nextAction === "fail") {
      nextAction = "success";
      actionNotice = { key, kind: "error", message: "actionFailed" };
    } else {
      records.set(key, { id: `sample-${key}`, status: "DRAFT", media: false });
      actionNotice = { key, kind: "success", message: "draftCreated" };
    }
    renderReviewer({ focusId: "draft-action" });
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "campaign-search") {
    query = event.target.value;
    renderCampaignList();
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  const setting = target.dataset.setting;
  if (!setting) return;
  if (setting === "locale") locale = target.value === "ar" ? "ar" : "en";
  if (setting === "theme") theme = target.value === "dark" ? "dark" : "light";
  if (setting === "action") nextAction = target.value;
  if (setting === "state") {
    if (target.dataset.context === "index") indexState = target.value;
    else reviewState = target.value;
  }
  const focusId = target.id;
  renderIndex();
  if (reviewer.open) renderReviewer();
  const replacement = document.getElementById(focusId);
  if (replacement) {
    replacement.closest("details").open = true;
    replacement.focus({ preventScroll: true });
  }
});

reviewer.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeCampaign();
});
reviewer.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const controls = [...reviewer.querySelectorAll('button:not(:disabled), select, summary, a[href], [tabindex="0"]')].filter(
    (element) => element.getClientRects().length
  );
  const first = controls[0],
    last = controls.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === reviewer)) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
});

seedRecords();
renderIndex();
if (campaignById(params.get("campaign"))) openCampaign(params.get("campaign"));
