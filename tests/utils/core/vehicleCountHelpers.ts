import { generateOpenAIQuery } from "../query/aiHelpers";

function parseCountToken(countText: string): number | null {
  const normalized = countText.trim().toLowerCase();
  const wordCounts: Record<string, number> = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    // Turkish
    bir: 1,
    iki: 2,
    uc: 3,
    "üç": 3,
    dort: 4,
    "dört": 4,
    bes: 5,
    "beş": 5,
    alti: 6,
    "altı": 6,
    yedi: 7,
    sekiz: 8,
    dokuz: 9,
    on: 10,
  };

  if (wordCounts[normalized] !== undefined) {
    return wordCounts[normalized];
  }

  const numericValue = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(numericValue) ? numericValue : null;
}

function parseVehicleTotalCountDetectionAnswer(answer: string): number | null {
  const normalized = (answer || "").trim();
  if (!normalized || /^none$/i.test(normalized)) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  return null;
}

function normalizeMessageForVehicleCountExtraction(message: string): string {
  return message
    .replace(/\b(\d+)\s*(?:dr|door)\b/giu, "$1-door")
    .replace(/\b(\d+)\s*(?:matic|matic\+)\b/giu, "$1MATIC");
}

function extractVehicleTotalCountFromMessageByPattern(
  message: string,
): number | null {
  const normalizedMessage = message.replace(/\s+/g, " ").trim();
  if (!normalizedMessage) {
    return null;
  }

  const numericCountToken =
    "(?<![\\d.,])(?:\\d{1,3}(?:[.,]\\d{3})+|\\d+)(?![\\d.,])(?![\\p{L}\\p{M}_-])";
  const wordCountToken =
    "(?:one|two|three|four|five|six|seven|eight|nine|ten|bir|iki|uc|üç|dort|dört|bes|beş|alti|altı|yedi|sekiz|dokuz|on)(?!-)";
  const countToken = `(${numericCountToken}|${wordCountToken})`;
  const localizedVehicleNouns = [
    "vehicles?",
    "cars?",
    "options?",
    "results?",
    "models?",
    "matches?",
    "sedans?",
    "suvs?",
    "hatchbacks?",
    "coupes?",
    "convertibles?",
    "cabriolets?",
    "roadsters?",
    "wagons?",
    "estates?",
    "limousines?",
    "vans?",
    "minivans?",
    "mpvs?",
    "trucks?",
    "pickups?",
    "araç(?:lar)?",
    "arac(?:lar)?",
    "seçenek(?:ler)?",
    "secenek(?:ler)?",
    "sonuç(?:lar)?",
    "sonuc(?:lar)?",
    "モデル",
    "車両",
    "車",
    "台",
    "オプション",
    "選択肢",
    "結果",
    "차량",
    "자동차",
    "옵션",
    "결과",
    "모델",
    "대",
    "รถ",
    "คัน",
    "ตัวเลือก",
    "รายการ",
    "ผลลัพธ์",
    "รุ่น",
    "वाहन",
    "कार",
    "विकल्प",
    "परिणाम",
    "मॉडल",
    "गाड़ी",
    "गाड़ियाँ",
    "গাড়ি",
    "যানবাহন",
    "বিকল্প",
    "ফলাফল",
    "মডেল",
    "વાહન",
    "કાર",
    "વિકલ્પ",
    "પરિણામ",
    "મોડેલ",
    "ವಾಹನ",
    "ಕಾರು",
    "ಆಯ್ಕೆ",
    "ಫಲಿತಾಂಶ",
    "ಮಾದರಿ",
    "വാഹനം",
    "കാർ",
    "ഓപ്ഷൻ",
    "ഫലം",
    "മോഡൽ",
    "वाहन",
    "कार",
    "पर्याय",
    "निकाल",
    "मॉडेल",
    "வாகன(?:ங்கள்)?",
    "கார்",
    "விருப்ப(?:ங்கள்)?",
    "முடிவு(?:கள்)?",
    "மாடல்(?:கள்)?",
    "వాహన(?:ాలు)?",
    "కారు",
    "ఎంపిక(?:లు)?",
    "ఫలిత(?:ాలు)?",
    "మోడల్(?:లు)?",
  ];
  const noun = `(?:${localizedVehicleNouns.join("|")})`;
  const compactLocalizedNoun =
    "(?:モデル|車両|車|台|オプション|選択肢|結果|차량|자동차|옵션|결과|모델|대|รถ|คัน|ตัวเลือก|รายการ|ผลลัพธ์|รุ่น|वाहन|कार|विकल्प|परिणाम|मॉडल|गाड़ी|गाड़ियाँ|গাড়ি|যানবাহন|বিকল্প|ফলাফল|মডেল|વાહન|કાર|વિકલ્પ|પરિણામ|મોડેલ|ವಾಹನ|ಕಾರು|ಆಯ್ಕೆ|ಫಲಿತಾಂಶ|ಮಾದರಿ|വാഹനം|കാർ|ഓപ്ഷൻ|ഫലം|മോഡൽ|पर्याय|निकाल|मॉडेल|வாகன(?:ங்கள்)?|கார்|விருப்ப(?:ங்கள்)?|முடிவு(?:கள்)?|மாடல்(?:கள்)?|వాహన(?:ాలు)?|కారు|ఎంపిక(?:లు)?|ఫలిత(?:ాలు)?|మోడల్(?:లు)?)";
  const availabilityContext =
    "(?:available|to\\s+(?:explore|consider|review)|for\\s+(?:you\\s+)?(?:review|consideration)|matching|that\\s+match|in\\s+our\\s+current\\s+inventory|mevcut|bulunuyor|inceley|değerlendir|deg\\w*|利用|確認|検討|見つか|있|가능|고려|확인|มี|พร้อม|ให้พิจารณา|พบ|उपलब्ध|मौजूद|देख|विचार|उपलब्ध|উপলব্ধ|বিবেচনা|देख|ઉપલબ્ધ|વિચાર|ಲಭ್ಯ|ಪರಿಗಣ|ലഭ್ಯ|പരിഗಣ|उपलब्ध|विचार|கிடைக்க|பரிசீல|అందుబాట|పరిగణ)";
  const countedNounPhrase = `(?:available\\s+|mevcut\\s+)?(?:[\\p{L}\\p{M}\\p{N}_À-ÿ-]+\\s+){0,4}${noun}`;
  const countPatterns = [
    new RegExp(`\\bfound\\s+(a|an)\\s+${noun}\\s+matching\\b`, "iu"),
    new RegExp(
      `\\b(?:total(?: of)?|currently(?:,)?\\s+we\\s+have|we\\s+(?:currently\\s+)?have|there\\s+(?:are|is)(?:\\s+currently)?|found|selection\\s+of)\\s+${countToken}\\s+${countedNounPhrase}\\b`,
      "iu",
    ),
    new RegExp(
      `\\b${countToken}\\s*${countedNounPhrase}\\s+${availabilityContext}`,
      "iu",
    ),
    new RegExp(`${countToken}\\s*${compactLocalizedNoun}`, "iu"),
    new RegExp(`\\bfound\\s+${countToken}\\s+${noun}\\s+matching\\b`, "iu"),
  ];

  for (const pattern of countPatterns) {
    const match = normalizedMessage.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const parsedCount = parseCountToken(match[1]);
    if (parsedCount !== null) {
      const matchedText = match[0] || "";
      if (
        /\b\d+\s*(?:-?\s*door|dr|matic)/iu.test(matchedText) ||
        /\b\d+\s+[\p{L}\p{M}]+\s+\d*MATIC\+?/iu.test(matchedText)
      ) {
        continue;
      }
      if (
        parsedCount >= 1900 &&
        parsedCount <= 2100 &&
        /\bmodels?\b/i.test(matchedText) &&
        !/\b(total|results?|matches?|options?|vehicles?|cars?)\b/i.test(
          matchedText,
        )
      ) {
        continue;
      }
      return parsedCount;
    }
  }

  return null;
}

function isLikelyVehicleDescriptorNumber(
  message: string,
  count: number,
): boolean {
  const escapedCount = String(count).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const compactDescriptorPattern = new RegExp(
    `\\b${escapedCount}\\s*(?:-?\\s*door|dr|matic)\\b`,
    "iu",
  );
  const trimDescriptorPattern = new RegExp(
    `\\b${escapedCount}\\s+[\\p{L}\\p{M}]+\\s+\\d*MATIC\\+?\\b`,
    "iu",
  );

  return (
    compactDescriptorPattern.test(message) ||
    trimDescriptorPattern.test(message)
  );
}

function hasExplicitCountMention(message: string, count: number): boolean {
  const escapedCount = String(count).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const digitPattern = new RegExp(
    `(?<![\\d.,])${escapedCount}(?![\\d.,])`,
    "iu",
  );
  if (digitPattern.test(message)) {
    return true;
  }

  if (count >= 1 && count <= 10) {
    const numberWordsByValue: Record<number, string[]> = {
      1: ["one", "bir"],
      2: ["two", "iki"],
      3: ["three", "uc", "üç"],
      4: ["four", "dort", "dört"],
      5: ["five", "bes", "beş"],
      6: ["six", "alti", "altı"],
      7: ["seven", "yedi"],
      8: ["eight", "sekiz"],
      9: ["nine", "dokuz"],
      10: ["ten", "on"],
    };
    const words = numberWordsByValue[count] || [];
    for (const word of words) {
      const wordPattern = new RegExp(`\\b${word}\\b`, "iu");
      if (wordPattern.test(message)) {
        return true;
      }
    }
  }

  return false;
}

export async function extractVehicleTotalCountFromMessage(
  message: string,
): Promise<number | null> {
  const normalizedMessage = normalizeMessageForVehicleCountExtraction(message)
    .replace(/\s+/g, " ")
    .trim();
  if (!normalizedMessage) {
    return null;
  }

  const detectedByPattern =
    extractVehicleTotalCountFromMessageByPattern(normalizedMessage);
  if (detectedByPattern !== null) {
    return detectedByPattern;
  }

  const answer = await generateOpenAIQuery(
    [
      "You extract total vehicle/result counts from Mercedes-Benz smart-search assistant responses.",
      "Return ONLY one integer or NONE.",
      "Return an integer only when the response explicitly states a total/count of returned vehicles, cars, options, results, matches, models, or body-type results.",
      "Examples that should return an integer: 'We have 189 sedans available' -> 189; 'There are 971 options available' -> 971; '3 vehicles were found' -> 3; 'we have two exciting options' -> 2.",
      "Return NONE for years, model years, prices, mileage, speed, range, horsepower, model names, trim names, or dates.",
      "Important: '2020 models' means model year 2020, not a total count, unless the wording clearly says there are 2020 total vehicles/options/results.",
      "Important: compact model/body descriptors such as '2dr', '2-door', '4MATIC', '4MATIC+', '53 4MATIC+', or similar trim text are not total result counts.",
      "Support non-English responses too.",
    ].join("\n"),
    `Response:\n${normalizedMessage}`,
    8,
    "NONE",
  );

  const detectedByAi = parseVehicleTotalCountDetectionAnswer(answer);
  if (detectedByAi !== null) {
    if (!hasExplicitCountMention(normalizedMessage, detectedByAi)) {
      return null;
    }
    if (isLikelyVehicleDescriptorNumber(normalizedMessage, detectedByAi)) {
      return null;
    }
    return detectedByAi;
  }

  if (/^none$/i.test((answer || "").trim())) {
    return detectedByPattern;
  }

  return detectedByPattern;
}
