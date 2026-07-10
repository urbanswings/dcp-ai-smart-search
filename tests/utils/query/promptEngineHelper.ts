import { AzureOpenAI } from "openai";

const OPENAI_CHAT_MODEL = process.env.NEXUS_GPT_MODEL || "gpt-4o-mini";
const OPENAI_DEFAULT_MAX_TOKENS = 200; // Increased from 40 to support query generation with gpt-5-mini
const OPENAI_DEFAULT_TEMPERATURE = 0.7;

/**
 * PromptEngineHelper
 * Encapsulates query generation with diversification, style hints, fallback templates,
 * and sliding-window opening-signature tracking to enforce varied output.
 */

const COMPLETE_QUERY_STYLE_HINTS = [
  "Use exact form '<facet name> <filter value>'",
  "Use a direct command without opening words style e.g. 'show me', 'filter', 'Mercedes-Benz'",
  "Use a feature-led style",
  "Use a shortlist style",
  "Use a conversational ask style",
  "Use an explore/discover style",
  "Use a minimal keyword style",
  "Use a preference-led style",
];

const REPETITIVE_COMPLETE_QUERY_PREFIXES = [
  "looking for",
  "searching for",
  "show me",
  "i want",
  "i need",
  "recommend",
];

const REPETITIVE_COMPLETE_QUERY_PATTERNS = [
  /\bmodels?\s+only\.?$/i,
  /\bvehicles?\s+only\.?$/i,
  /\bmodels?\s+available(\s+for\s+(purchase|review|sale))?\.?$/i,
  /\bmodels?\s+available\s+now\.?$/i,
  /\bmodels?\.?$/i,
];

const OPENING_WINDOW_SIZE = 8;

// Types
interface PromptContext {
  styleCursor: number;
  templateCursor: number;
  recentOpenings: string[];
}

interface GenerationOptions {
  language?: string;
  fallbackFn?: (
    facetKey: string,
    formattedValue: string,
    rawValue: unknown,
  ) => string;
  filterTextFn?: (
    facetKey: string,
    formattedValue: string,
    rawValue: unknown,
  ) => string;
  maxTokens?: number;
}

const LOCALIZED_FACET_LABELS: Record<string, Record<string, string>> = {
  campaigns: {
    tr: "kampanyalar",
    th: "แคมเปญ",
    ko: "캠페인",
    ja: "キャンペーン",
    hi: "अभियान",
    ta: "பிரச்சாரங்கள்",
    te: "క్యాంపెయిన్‌లు",
    bn: "ক্যাম্পেইন",
    gu: "કૅમ્પેઇન",
    kn: "ಪ್ರಚಾರಗಳು",
    ml: "ക്യാമ്പെയ്‌നുകൾ",
    mr: "मोहीम",
  },
  bodyType: {
    tr: "gövde tipi",
    th: "ประเภทรถ",
    ko: "바디 타입",
    ja: "ボディタイプ",
    hi: "बॉडी टाइप",
    ta: "பாடி வகை",
    te: "బాడీ టైప్",
    bn: "বডি টাইপ",
    gu: "બોડી પ્રકાર",
    kn: "ಬಾಡಿ ಟೈಪ್",
    ml: "ബോഡി ടൈപ്പ്",
    mr: "बॉडी टाइप",
  },
  fuelType: {
    tr: "yakıt tipi",
    th: "ประเภทเชื้อเพลิง",
    ko: "연료 타입",
    ja: "燃料タイプ",
    hi: "फ्यूल टाइप",
    ta: "எரிபொருள் வகை",
    te: "ఇంధన రకం",
    bn: "জ্বালানির ধরন",
    gu: "ઇંધણ પ્રકાર",
    kn: "ಇಂಧನ ಪ್ರಕಾರ",
    ml: "ഇന്ധന തരം",
    mr: "इंधन प्रकार",
  },
  color: {
    tr: "renk",
    th: "สี",
    ko: "색상",
    ja: "色",
    hi: "रंग",
    ta: "நிறம்",
    te: "రంగు",
    bn: "রং",
    gu: "રંગ",
    kn: "ಬಣ್ಣ",
    ml: "നിറം",
    mr: "रंग",
  },
  upholstery: {
    tr: "döşeme",
    th: "สีภายใน",
    ko: "내장 색상",
    ja: "内装色",
    hi: "आंतरिक रंग",
    ta: "உட்புற நிறं",
    te: "లోపలి రంగు",
    bn: "অভ্যন্তরীণ রঙ",
    gu: "અંદરનો રંગ",
    kn: "ಆಂತರಿಕ ಬಣ್ಣ",
    ml: "ഉൾനിറം",
    mr: "अंतर्गत रंग",
  },
  upholsteryPolish: {
    tr: "döşeme malzemesi",
    th: "วัสดุบุผิว",
    ko: "시트 마감재",
    ja: "内装表皮材",
    hi: "अपहोल्स्ट्री मटेरियल",
    ta: "அப்ஹோல்ஸ்டரி துணி",
    te: "అప్హోల్స్టరీ మెటీరియల్",
    bn: "আপহোলস্টারি সামগ্রী",
    gu: "અપહોલ્સ્ટરી મટીરીયલ",
    kn: "ಅಪ್ಹೋಲ್ಸ್ಟರಿ ಮೆಟೀರಿಯಲ್",
    ml: "അപ്ഹോൾസ്റ്ററി മെറ്റീരിയൽ",
    mr: "अपहोल्स्ट्री मटेरियल",
  },
  stockType: {
    tr: "stok tipi",
    th: "ประเภทสต็อก",
    ko: "재고 유형",
    ja: "在庫タイプ",
    hi: "स्टॉक टाइप",
    ta: "ஸ்டாக் வகை",
    te: "స్టాక్ రకం",
    bn: "স্টক টাইপ",
    gu: "સ્ટોક પ્રકાર",
    kn: "ಸ್ಟಾಕ್ ಪ್ರಕಾರ",
    ml: "സ്റ്റോക്ക് തരം",
    mr: "स्टॉक प्रकार",
  },
  brand: {
    tr: "marka",
    th: "แบรนด์",
    ko: "브랜드",
    ja: "ブランド",
    hi: "ब्रांड",
    ta: "பிராண்ட்",
    te: "బ్రాండ్",
    bn: "ব্র্যান্ড",
    gu: "બ્રાન્ડ",
    kn: "ಬ್ರ್ಯಾಂಡ್",
    ml: "ബ്രാൻഡ്",
    mr: "ब्रँड",
  },
  price: {
    tr: "fiyat",
    th: "ราคา",
    ko: "가격",
    ja: "価格",
    hi: "कीमत",
    ta: "விலை",
    te: "ధర",
    bn: "দাম",
    gu: "કિંમત",
    kn: "ಬೆಲೆ",
    ml: "വില",
    mr: "किंमत",
  },
  monthlyRate: {
    tr: "aylık taksit",
    th: "ค่างวดรายเดือน",
    ko: "월 납입금",
    ja: "月額支払",
    hi: "मासिक किस्त",
    ta: "மாத தவணை",
    te: "నెలవారీ చెల్లింపు",
    bn: "মাসিক কিস্তি",
    gu: "માસિક હપ્તો",
    kn: "ಮಾಸಿಕ ಕಂತು",
    ml: "മാസതവണ",
    mr: "मासिक हप्ता",
  },
  seats: {
    tr: "koltuk sayısı",
    th: "จำนวนที่นั่ง",
    ko: "좌석 수",
    ja: "座席数",
    hi: "सीटों की संख्या",
    ta: "இருப்பிட எண்ணிக்கை",
    te: "సీట్ల సంఖ్య",
    bn: "আসনের সংখ্যা",
    gu: "સીટોની સંખ્યા",
    kn: "ಸೀಟುಗಳ ಸಂಖ್ಯೆ",
    ml: "സീറ്റുകളുടെ എണ്ണം",
    mr: "सीट संख्या",
  },
  modelIdentifier: {
    tr: "model",
    th: "รุ่น",
    ko: "모델",
    ja: "モデル",
    hi: "मॉडल",
    ta: "மாடல்",
    te: "మోడల్",
    bn: "মডেল",
    gu: "મોડેલ",
    kn: "ಮಾದರಿ",
    ml: "മോഡൽ",
    mr: "मॉडेल",
  },
  motorization: {
    tr: "varyant",
    th: "รุ่นย่อย",
    ko: "세부 모델",
    ja: "グレード",
    hi: "वैरिएंट",
    ta: "வேரியன்ட்",
    te: "వేరియంట్",
    bn: "ভ্যারিয়েন্ট",
    gu: "વેરિઅન્ટ",
    kn: "ವೆರಿಯಂಟ್",
    ml: "വേരിയന്റ്",
    mr: "व्हेरियंट",
  },
  modelYear: {
    tr: "model yılı",
    th: "ปีรุ่น",
    ko: "연식",
    ja: "年式",
    hi: "मॉडल वर्ष",
    ta: "மாடல் ஆண்டு",
    te: "మోడల్ సంవత్సరం",
    bn: "মডেল বছর",
    gu: "મોડેલ વર્ષ",
    kn: "ಮಾದರಿ ವರ್ಷ",
    ml: "മോഡൽ വർഷം",
    mr: "मॉडेल वर्ष",
  },
  mileage: {
    tr: "kilometre",
    th: "ระยะทาง",
    ko: "주행거리",
    ja: "走行距離",
    hi: "माइलेज",
    ta: "மைலேஜ்",
    te: "మైలేజ్",
    bn: "মাইলেজ",
    gu: "માઇલેજ",
    kn: "ಮೈಲೇಜ್",
    ml: "മൈലേജ്",
    mr: "मायलेज",
  },
  equipment: {
    tr: "donanım",
    th: "อุปกรณ์",
    ko: "옵션사양",
    ja: "装備",
    hi: "उपकरण",
    ta: "உபகரணங்கள்",
    te: "పరికరాలు",
    bn: "উপকরণ",
    gu: "ઉપકરણો",
    kn: "ಉಪಕರಣಗಳು",
    ml: "ഉപകരണങ്ങൾ",
    mr: "उपकरणे",
  },
  gearbox: {
    tr: "şanzıman",
    th: "เกียร์",
    ko: "변속기",
    ja: "トランスミッション",
    hi: "गियरबॉक्स",
    ta: "கியர்பாக்ஸ்",
    te: "గేర్‌బాక్స్",
    bn: "গিয়ারবক্স",
    gu: "ગિયરબોક્સ",
    kn: "ಗಿಯರ್‌ಬಾಕ್ಸ್",
    ml: "ഗിയർബോക്സ്",
    mr: "गिअरबॉक्स",
  },
  packages: {
    ko: "패키지",
    tr: "donanım paketi",
  },
  lines: {
    ko: "라인",
    tr: "tasarım konsepti",
  },
  colorPolish: {
    ko: "외장 페인트",
    ja: "外装ペイント",
    th: "สีภายนอก", 
    tr: "dış renk",
    hi: "बाहरी रंग",
    ta: "வெளிப்புற நிறம்",
    te: "బయటి రంగు",
    bn: "বাহ্যিক রঙ",
    gu: "બહારનો રંગ",
    kn: "ಬಾಹ್ಯ ಬಣ್ಣ",
    ml: "പുറംനിറം",
    mr: "बाह्य रंग",
  },
  enginePowerHP: {
    tr: "motor gücü",
    th: "กำลังเครื่องยนต์",
    ko: "최고 출력",
    ja: "最高出力",
    hi: "इंजन की शक्ति",
    ta: "இன்ஜின் சக்தி",
    te: "ఇంజిన్ పవర్",
    bn: "ইঞ্জিনের ক্ষমতা",
    gu: "એન્જિન પાવર",
    kn: "ಎಂಜಿನ್ ಶಕ್ತಿ",
    ml: "എഞ്ചിൻ പവർ",
    mr: "इंजिन पॉवर",
  },
  enginePowerKW: {
    tr: "motor gücü",
    th: "กำลังเครื่องยนต์",
    ko: "최고 출력",
    ja: "最高出力",
    hi: "इंजन की शक्ति",
    ta: "இன்ஜின் சக்தி",
    te: "ఇంజిన్ పవర్",
    bn: "ইঞ্জিনের ক্ষমতা",
    gu: "એન્જિન પાવર",
    kn: "ಎಂಜಿನ್ ಶಕ್ತಿ",
    ml: "എഞ്ചിൻ പവർ",
    mr: "इंजिन पॉवर",
  },
};

/**
 * Normalize whitespace in a string
 */
function normalizeWhitespace(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLanguageCode(language: string): string {
  return normalizeWhitespace(language).toLowerCase().split(/[-_]/)[0] || "en";
}

function isEnglishLanguage(language: string): boolean {
  return normalizeLanguageCode(language) === "en";
}

function getLocalizedSentenceTemplate(
  language: string,
  styleHint: string,
  keyLabel: string,
  valueLabel: string,
): string {
  const normalizedLanguage = normalizeLanguageCode(language);

  const styleKey = styleHint.includes("'<facet name> <filter value>'")
    ? "exact"
    : styleHint.includes("direct command")
      ? "direct"
      : styleHint.includes("feature-led")
        ? "feature"
        : styleHint.includes("shortlist")
          ? "shortlist"
          : styleHint.includes("conversational ask")
            ? "ask"
            : styleHint.includes("explore/discover")
              ? "explore"
              : styleHint.includes("minimal keyword")
                ? "minimal"
                : styleHint.includes("preference-led")
                  ? "preference"
                  : "default";

  if (normalizedLanguage === "ko") {
    if (styleHint.includes("'<facet name> <filter value>'")) {
      return `${keyLabel} ${valueLabel}`;
    }
    if (styleHint.includes("direct command")) {
      return `${keyLabel} ${valueLabel}로 보여줘.`;
    }
    if (styleHint.includes("feature-led")) {
      return `${keyLabel} 기준으로 ${valueLabel} 차량을 추천해줘.`;
    }
    if (styleHint.includes("shortlist")) {
      return `${valueLabel} ${keyLabel} 중심으로 후보를 추려줘.`;
    }
    if (styleHint.includes("conversational ask")) {
      return `${valueLabel} ${keyLabel} 차량을 찾아줄 수 있을까?`;
    }
    if (styleHint.includes("explore/discover")) {
      return `${valueLabel} ${keyLabel} 옵션을 살펴보고 싶어.`;
    }
    if (styleHint.includes("minimal keyword")) {
      return `${keyLabel} ${valueLabel}`;
    }
    if (styleHint.includes("preference-led")) {
      return `${valueLabel} ${keyLabel}를 선호해.`;
    }
    return `${valueLabel} ${keyLabel} 차량 보여줘.`;
  }

  if (normalizedLanguage === "ja") {
    if (styleHint.includes("'<facet name> <filter value>'")) {
      return `${keyLabel} ${valueLabel}`;
    }
    if (styleHint.includes("direct command")) {
      return `${keyLabel}が${valueLabel}の車を見せてください。`;
    }
    if (styleHint.includes("feature-led")) {
      return `${keyLabel}を基準に${valueLabel}の車を提案してください。`;
    }
    if (styleHint.includes("shortlist")) {
      return `${valueLabel}の${keyLabel}で候補を絞ってください。`;
    }
    if (styleHint.includes("conversational ask")) {
      return `${valueLabel}の${keyLabel}の車を探せますか？`;
    }
    if (styleHint.includes("explore/discover")) {
      return `${valueLabel}の${keyLabel}オプションを見たいです。`;
    }
    if (styleHint.includes("minimal keyword")) {
      return `${keyLabel} ${valueLabel}`;
    }
    if (styleHint.includes("preference-led")) {
      return `${valueLabel}の${keyLabel}を希望します。`;
    }
    return `${valueLabel}の${keyLabel}の車を表示してください。`;
  }

  if (normalizedLanguage === "th") {
    const templates: Record<string, string> = {
      exact: `${keyLabel} ${valueLabel}`,
      direct: `แสดงรถที่ ${keyLabel}เป็น${valueLabel}`,
      feature: `ช่วยแนะนำรถตาม ${keyLabel} ${valueLabel}`,
      shortlist: `ช่วยคัดตัวเลือก ${valueLabel}ใน${keyLabel}`,
      ask: `ช่วยค้นหารถที่ ${keyLabel}เป็น${valueLabel}ได้ไหม`,
      explore: `อยากดูตัวเลือก ${valueLabel}สำหรับ${keyLabel}`,
      minimal: `${valueLabel} ${keyLabel}`,
      preference: `ฉันต้องการ ${keyLabel}แบบ${valueLabel}`,
      default: `ขอดูรถที่ ${keyLabel}เป็น${valueLabel}`,
    };
    return templates[styleKey] || templates.default;
  }

  if (normalizedLanguage === "tr") {
    const templates: Record<string, string> = {
      exact: `${keyLabel} ${valueLabel}`,
      direct: `${keyLabel} ${valueLabel} olan araclari goster.`,
      feature: `${keyLabel} kriterinde ${valueLabel} araclari oner.`,
      shortlist: `${valueLabel} ${keyLabel} icin kisa liste hazirla.`,
      ask: `${keyLabel} ${valueLabel} olan arac bulabilir misin?`,
      explore: `${valueLabel} ${keyLabel} seceneklerini kesfetmek istiyorum.`,
      minimal: `${valueLabel} ${keyLabel}`,
      preference: `${valueLabel} ${keyLabel} tercih ediyorum.`,
      default: `${valueLabel} ${keyLabel} araclari gormek istiyorum.`,
    };
    return templates[styleKey] || templates.default;
  }

  if (normalizedLanguage === "hi") {
    const templates: Record<string, string> = {
      exact: `${keyLabel} ${valueLabel}`,
      direct: `${keyLabel} ${valueLabel} wali gadiyan dikhao.`,
      feature: `${keyLabel} ${valueLabel} ke adhar par gadiyan suggest karo.`,
      shortlist: `${valueLabel} ${keyLabel} ke liye shortlist banao.`,
      ask: `kya aap ${keyLabel} ${valueLabel} wali gadi dhoondh sakte hain?`,
      explore: `main ${valueLabel} ${keyLabel} options explore karna chahta hoon.`,
      minimal: `${valueLabel} ${keyLabel}`,
      preference: `mujhe ${valueLabel} ${keyLabel} pasand hai.`,
      default: `mujhe ${valueLabel} ${keyLabel} wali gadiyan dikhaiye.`,
    };
    return templates[styleKey] || templates.default;
  }

  // Safe non-English default sentence form for remaining locales.
  if (styleKey === "exact" || styleKey === "minimal") {
    return `${keyLabel} ${valueLabel}`;
  }
  if (styleKey === "ask") {
    return `${keyLabel} ${valueLabel} ?`;
  }
  return `${keyLabel} ${valueLabel} options`;
}

function getLocalizedFacetLabel(
  facetKey: string,
  facetDisplayNameFn: (key: string) => string,
  language: string,
): string {
  const normalizedLanguage = normalizeLanguageCode(language);
  const localizedLabel = LOCALIZED_FACET_LABELS[facetKey]?.[normalizedLanguage];
  return normalizeWhitespace(
    localizedLabel || facetDisplayNameFn(facetKey) || facetKey,
  );
}

/**
 * Extract first-two-word signature (lowercased) from a query
 * Used for detecting repetition across recent queries
 */
function getOpeningSignature(value: unknown): string {
  const words = normalizeWhitespace(value)
    .toLowerCase()
    .split(" ")
    .filter(Boolean);
  return words.slice(0, 2).join(" ");
}

/**
 * Create a new prompt engine context
 * Manages style hint rotation, fallback template rotation, and opening signature history
 */
function createPromptContext(): PromptContext {
  return {
    styleCursor: 0,
    templateCursor: 0,
    recentOpenings: [],
  };
}

/**
 * Pick next style hint from the rotation
 */
function pickNextCompleteStyle(context: PromptContext): string {
  const idx = context.styleCursor % COMPLETE_QUERY_STYLE_HINTS.length;
  context.styleCursor += 1;
  return COMPLETE_QUERY_STYLE_HINTS[idx];
}

function buildFacetFirstQuery(
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
  facetDisplayNameFn: (key: string) => string,
  language: string,
): string {
  const valueLabel = normalizeWhitespace(formattedValue || rawValue);
  const keyLabel = getLocalizedFacetLabel(
    facetKey,
    facetDisplayNameFn,
    language,
  );
  return normalizeWhitespace(`${valueLabel} ${keyLabel}`);
}

function buildStyleHintFallbackQuery(
  styleHint: string,
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
  facetDisplayNameFn: (key: string) => string,
  language: string,
): string {
  const valueLabel = normalizeWhitespace(formattedValue || rawValue);
  const keyLabel = getLocalizedFacetLabel(
    facetKey,
    facetDisplayNameFn,
    language,
  );

  // For non-English locales, avoid generating hard-coded English wrappers.
  if (!isEnglishLanguage(language)) {
    return normalizeWhitespace(
      getLocalizedSentenceTemplate(language, styleHint, keyLabel, valueLabel),
    );
  }

  if (styleHint.includes("'<facet name> <filter value>'")) {
    return normalizeWhitespace(`${valueLabel} ${keyLabel}`);
  }
  if (styleHint.includes("direct command")) {
    return normalizeWhitespace(`filter ${keyLabel} ${valueLabel}`);
  }
  if (styleHint.includes("feature-led")) {
    return normalizeWhitespace(`${keyLabel}: ${valueLabel}`);
  }
  if (styleHint.includes("shortlist")) {
    return normalizeWhitespace(`shortlist ${valueLabel} ${keyLabel}`);
  }
  if (styleHint.includes("conversational ask")) {
    return normalizeWhitespace(`can you find ${keyLabel} ${valueLabel}`);
  }
  if (styleHint.includes("explore/discover")) {
    return normalizeWhitespace(`explore ${valueLabel} ${keyLabel} options`);
  }
  if (styleHint.includes("minimal keyword")) {
    return normalizeWhitespace(`${valueLabel} ${keyLabel}`);
  }
  if (styleHint.includes("preference-led")) {
    return normalizeWhitespace(`prefer ${valueLabel} ${keyLabel}`);
  }

  return normalizeWhitespace(`${valueLabel} ${keyLabel}`);
}

/**
 * Build varied fallback phrase by rotating through templates
 */
function buildVariedFallbackPhrase(
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
  facetDisplayNameFn: (key: string) => string,
  language: string,
  context: PromptContext,
): string {
  const valueLabel = normalizeWhitespace(formattedValue || rawValue);
  const keyLabel = getLocalizedFacetLabel(
    facetKey,
    facetDisplayNameFn,
    language,
  );

  if (!isEnglishLanguage(language)) {
    const localeSentenceTemplates = [
      getLocalizedSentenceTemplate(
        language,
        "Use exact form '<facet name> <filter value>'",
        keyLabel,
        valueLabel,
      ),
      getLocalizedSentenceTemplate(
        language,
        "Use a direct command without opening words style e.g. 'show me', 'filter', 'Mercedes-Benz'",
        keyLabel,
        valueLabel,
      ),
      getLocalizedSentenceTemplate(
        language,
        "Use a feature-led style",
        keyLabel,
        valueLabel,
      ),
      getLocalizedSentenceTemplate(
        language,
        "Use a shortlist style",
        keyLabel,
        valueLabel,
      ),
      getLocalizedSentenceTemplate(
        language,
        "Use a conversational ask style",
        keyLabel,
        valueLabel,
      ),
      getLocalizedSentenceTemplate(
        language,
        "Use an explore/discover style",
        keyLabel,
        valueLabel,
      ),
      getLocalizedSentenceTemplate(
        language,
        "Use a minimal keyword style",
        keyLabel,
        valueLabel,
      ),
      getLocalizedSentenceTemplate(
        language,
        "Use a preference-led style",
        keyLabel,
        valueLabel,
      ),
    ];
    const idx = context.templateCursor % localeSentenceTemplates.length;
    context.templateCursor += 1;
    return normalizeWhitespace(localeSentenceTemplates[idx]);
  }

  const templates = [
    `${valueLabel} ${keyLabel} options`,
    `vehicles with ${valueLabel} ${keyLabel}`,
    `${keyLabel} ${valueLabel}`,
    `find ${keyLabel} ${valueLabel}`,
    `${keyLabel} only in ${valueLabel}`,
    `with ${valueLabel} ${keyLabel} lineup`,
    `show ${valueLabel} ${keyLabel}`,
    `${valueLabel} ${keyLabel} recommendations`,
  ];
  const idx = context.templateCursor % templates.length;
  context.templateCursor += 1;
  return normalizeWhitespace(templates[idx]);
}

/**
 * Track opening signature in sliding window
 */
function recordOpening(context: PromptContext, opening: string): void {
  context.recentOpenings.push(opening);
  if (context.recentOpenings.length > OPENING_WINDOW_SIZE) {
    context.recentOpenings.shift();
  }
}

/**
 * Enforce variation in generated queries by detecting repetitive patterns,
 * checking opening-signature history, and falling back to diverse templates
 */
function enforceCompleteQueryVariation(
  generated: string,
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
  facetDisplayNameFn: (key: string) => string,
  language: string,
  context: PromptContext,
): string {
  const normalized = normalizeWhitespace(generated);
  if (!normalized) {
    const fallback = buildVariedFallbackPhrase(
      facetKey,
      formattedValue,
      rawValue,
      facetDisplayNameFn,
      language,
      context,
    );
    recordOpening(context, getOpeningSignature(fallback));
    return fallback;
  }

  const lower = normalized.toLowerCase();
  const startsRepetitive = context.recentOpenings.some((prefix) =>
    lower.startsWith(prefix),
  );
  const matchesRepetitivePattern = REPETITIVE_COMPLETE_QUERY_PATTERNS.some(
    (pattern) => pattern.test(normalized),
  );
  const opening = getOpeningSignature(normalized);
  const seenRecently = context.recentOpenings.includes(opening);

  if (startsRepetitive || matchesRepetitivePattern || seenRecently) {
    const fallback = buildVariedFallbackPhrase(
      facetKey,
      formattedValue,
      rawValue,
      facetDisplayNameFn,
      language,
      context,
    );
    recordOpening(context, getOpeningSignature(fallback));
    return fallback;
  }

  recordOpening(context, opening);
  return normalized;
}

/**
 * Generate OpenAI query with system and user prompts
 */
async function generateOpenAiQuery(
  client: AzureOpenAI,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = OPENAI_DEFAULT_MAX_TOKENS,
): Promise<string> {
  console.log("[prompt-engine] Generating query with AI...");
  console.log(`[prompt-engine] System prompt: ${systemPrompt}`);
  console.log(`[prompt-engine] User prompt: ${userPrompt}`);
  const completion = await client.chat.completions.create({
    model: OPENAI_CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],    
    max_completion_tokens: maxTokens,
  });
  return completion?.choices?.[0]?.message?.content?.trim() || "";
}

/**
 * Generate a complete query with diversification and variation enforcement
 * Accepts custom systemPrompt and userPrompt for flexibility
 *
 * @param client - Azure OpenAI client
 * @param facetKey - The facet being queried
 * @param formattedValue - Display value
 * @param rawValue - Raw/internal value
 * @param systemPrompt - System prompt (replaces {LANGUAGE} placeholder)
 * @param userPromptTemplate - User prompt template (replaces {LANGUAGE}, {filterText}, {styleHint} placeholders)
 * @param facetDisplayNameFn - Function to get display name for facet
 * @param context - Prompt context (from createPromptContext)
 * @param options - Generation options
 * @returns Generated query
 */
async function generateQueryWithVariation(
  client: AzureOpenAI | null,
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
  systemPrompt: string | undefined,
  userPromptTemplate: string | undefined,
  facetDisplayNameFn: (key: string) => string,
  context: PromptContext,
  options: GenerationOptions = {},
): Promise<string> {
  const { language = "en", fallbackFn, filterTextFn, maxTokens = 32 } = options;
  const exactQuery = buildFacetFirstQuery(
    facetKey,
    formattedValue,
    rawValue,
    facetDisplayNameFn,
    language,
  );
  const fallback = fallbackFn
    ? fallbackFn(facetKey, formattedValue, rawValue)
    : exactQuery;
  const styleHint = pickNextCompleteStyle(context);
  const styledFallback = buildStyleHintFallbackQuery(
    styleHint,
    facetKey,
    formattedValue,
    rawValue,
    facetDisplayNameFn,
    language,
  );

  if (styleHint.includes("'<facet name> <filter value>'"))
    return normalizeWhitespace(exactQuery);  

  if (!client || !systemPrompt || !userPromptTemplate) {
    return enforceCompleteQueryVariation(
      styledFallback || fallback,
      facetKey,
      formattedValue,
      rawValue,
      facetDisplayNameFn,
      language,
      context,
    );
  }

  try {
    const filterText = filterTextFn
      ? filterTextFn(facetKey, formattedValue, rawValue)
      : `${getLocalizedFacetLabel(facetKey, facetDisplayNameFn, language)} ${formattedValue}`;

    const resolvedSystemPrompt = String(systemPrompt).replace(
      /\{LANGUAGE\}/g,
      language,
    );
    const resolvedUserPromptBase = String(userPromptTemplate)
      .replace(/\{LANGUAGE\}/g, language)
      .replace(/\{filterText\}/g, filterText)
      .replace(/\{styleHint\}/g, styleHint);
    const resolvedUserPrompt = `${resolvedUserPromptBase}\nStyle requirement: ${styleHint}.`;

    const generated = await generateOpenAiQuery(
      client,
      resolvedSystemPrompt,
      resolvedUserPrompt,
      maxTokens,
    );
    const generatedVariation = enforceCompleteQueryVariation(
      generated || fallback,
      facetKey,
      formattedValue,
      rawValue,
      facetDisplayNameFn,
      language,
      context,
    );
    return generatedVariation;
  } catch (error) {
    console.error(
      `[prompt-engine] Error generating query: ${error instanceof Error ? error.message : error}`,
    );
    return enforceCompleteQueryVariation(
      styledFallback || fallback,
      facetKey,
      formattedValue,
      rawValue,
      facetDisplayNameFn,
      language,
      context,
    );
  }
}

export {
  buildFacetFirstQuery,
  buildVariedFallbackPhrase,
  // Constants
  COMPLETE_QUERY_STYLE_HINTS,
  // Context management
  createPromptContext,
  // Enforcement
  enforceCompleteQueryVariation,
  // API
  generateOpenAiQuery,
  // Main orchestrator
  generateQueryWithVariation,
  GenerationOptions,
  getOpeningSignature,
  // Utilities
  normalizeWhitespace,
  OPENING_WINDOW_SIZE,
  // Diversification
  pickNextCompleteStyle,
  // Types
  PromptContext,
  recordOpening,
  REPETITIVE_COMPLETE_QUERY_PATTERNS,
  REPETITIVE_COMPLETE_QUERY_PREFIXES,
};
