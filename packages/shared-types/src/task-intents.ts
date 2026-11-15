export const taskIntents = ["GENERAL", "CONTENT", "CAMPAIGN", "STRATEGY"] as const;
export type TaskIntent = (typeof taskIntents)[number];
export const taskIntroductions = {
  GENERAL: {
    title: ["What shall we create?", "ماذا سنُبدع اليوم؟"],
    detail: [
      "Tell me your idea. I’ll use what I know about your business and work out the next step.",
      "أخبرني بفكرتك. سأستخدم ما أعرفه عن نشاطك لتحديد الخطوة التالية."
    ]
  },
  CONTENT: {
    title: ["What would you like to share?", "ماذا تودّ أن تشارك؟"],
    detail: [
      "An idea is enough. I’ll suggest the format, prepare the copy and visual, and keep it ready for your review.",
      "الفكرة تكفي. سأقترح التنسيق وأعدّ النص والتصميم لتراجعهما."
    ]
  },
  CAMPAIGN: {
    title: ["What are we planning for?", "لِمَ نخطّط؟"],
    detail: [
      "Tell me about the event, offer or goal. I’ll bring together the audience, timing and content plan.",
      "أخبرني بالفعالية أو العرض أو الهدف. سأجمع الجمهور والتوقيت وخطة المحتوى."
    ]
  },
  STRATEGY: {
    title: ["Where do you want to take your business?", "إلى أين تريد أن تصل بنشاطك؟"],
    detail: [
      "Start with the outcome. I’ll use your business knowledge and preferences to shape a practical direction.",
      "ابدأ بالنتيجة التي تريدها. سأستخدم معرفة نشاطك وتفضيلاتك لصياغة توجّه عملي."
    ]
  }
} as const;
export const taskSuggestions = {
  GENERAL: [
    ["Build a strategy", "بناء استراتيجية", "Create an Instagram marketing strategy for my business.", "أنشئ استراتيجية تسويق على إنستغرام لنشاطي."],
    ["Create content", "إنشاء محتوى", "Help me create an Instagram post.", "ساعدني في إنشاء منشور لإنستغرام."],
    ["Plan a campaign", "تخطيط حملة", "Help me plan a campaign for an upcoming event or offer.", "ساعدني في تخطيط حملة لفعالية أو عرض قادم."]
  ],
  CONTENT: [
    [
      "Introduce my business",
      "التعريف بنشاطي",
      "Create content introducing my business and what makes it useful to customers. Suggest the best format.",
      "أنشئ محتوى يعرّف بنشاطي وفائدته للعملاء واقترح التنسيق الأنسب."
    ],
    [
      "Share an offer",
      "مشاركة عرض",
      "Help me create content for an offer. Ask me only for the offer details you don’t already know.",
      "ساعدني في إعداد محتوى لعرض. اسألني فقط عن تفاصيل العرض التي لا تعرفها."
    ]
  ],
  CAMPAIGN: [
    [
      "An upcoming event",
      "فعالية قادمة",
      "Help me plan an Instagram campaign for an upcoming event. Let’s work out the essential details.",
      "ساعدني في تخطيط حملة إنستغرام لفعالية قادمة. لنحدّد التفاصيل الأساسية."
    ],
    [
      "More customer enquiries",
      "المزيد من استفسارات العملاء",
      "Plan a campaign to attract more customer enquiries, using what you know about my business.",
      "خطّط حملة لجذب المزيد من استفسارات العملاء باستخدام ما تعرفه عن نشاطي."
    ]
  ],
  STRATEGY: [
    [
      "Attract more customers",
      "جذب المزيد من العملاء",
      "Build a practical Instagram strategy to attract more customers to my business.",
      "ابنِ استراتيجية إنستغرام عملية لجذب المزيد من العملاء إلى نشاطي."
    ],
    [
      "Make my content consistent",
      "تنظيم محتواي",
      "Help me build a consistent content direction for my business, using our audience, offerings and voice.",
      "ساعدني في بناء توجّه محتوى متناسق لنشاطي باستخدام جمهورنا وعروضنا وأسلوبنا."
    ]
  ]
} as const;
