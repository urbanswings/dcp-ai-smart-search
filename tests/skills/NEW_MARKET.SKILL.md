# Onboarding a New Market/Country to Smart Search Test Automation

## Overview
This skill provides comprehensive guidance for adding a new country to the Mercedes-Benz Smart Search Test Automation suite. The system supports multi-language, multi-country testing with localized queries, evaluation rules, and API responses.

## Supported Markets (Current)
- **AU** - Australia (English)
- **IN** - India (English, Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Tamil, Telugu)
- **JP** - Japan (Japanese)
- **KR** - Korea (Korean)
- **SG** - Singapore (English)
- **TH** - Thailand (Thai, English)
- **TR** - Turkey (Turkish)

## Key Configuration Areas

### 1. Environment Variables
**Location**: `.env` file or test execution environment

```bash
COUNTRY=AU          # Two-letter country code (uppercase)
LANGUAGE=EN         # Two-letter language code (EN, JA, KO, TH, TR)
ENVIRONMENT=INT     # INT (staging) or PROD (production)
PROJECT=EMH         # EMH or DCP (backend service)
PRODUCT=NCOS        # NCOS (new cars) or UCOS (used cars)
```

**Supported Country-Language Combinations**:
- `AU-EN`, `IN-EN`, `IN-HI`, `IN-BN`, `IN-GU`, `IN-KN`, `IN-ML`, `IN-MR`, `IN-TA`, `IN-TE`
- `JP-JA`, `KR-KO`, `SG-EN`, `TH-TH`, `TH-EN`, `TR-TR`

### 2. Test Data Files
**Location**: `tests/data/`

#### Required Files:
1. **`emh-api-response.json`** - Mock API response with facets and search results
   - Extract from live API using: `npm run fetch:emh-api-response`
   - Contains available facets, values, and result samples
   - Used for generating facet matrix tests

2. **`fixed-queries-{COUNTRY}-{LANGUAGE}-{PRODUCT}.json`** - Manual test queries
   ```json
   [
     {
       "value": "show me sedans",
       "shouldFilter": {
         "include": [{ "bodyType": ["LIMOUSINE"] }],
         "exclude": [],
         "strict": false
       }
     }
   ]
   ```

3. **`generated-queries-{COUNTRY}-{LANGUAGE}-{PRODUCT}.json`** - Auto-generated facet queries
   - Generated via `buildComplete()` or `buildMatrix()` functions

#### Optional Files:
- `facets-master-data.json` - Fallback facet definitions
- `ai-query-prompts.json` - OpenAI prompt templates (shared across markets)
- `ai-evaluation-rules.json` - AI evaluation criteria (shared across markets)

### 3. Language-Aware Query Generation
**Location**: `tests/utils/generation/generateFacetMatrix.ts`

The system automatically generates queries in the target language using these templates:

#### Localized Matrix Phrases
```typescript
const phrases = {
  en: { showMeOnly: "show me only", and: "and", or: "or", allVehiclesExcept: "all vehicles except" },
  tr: { showMeOnly: "bana sadece göster", and: "ve", or: "veya", allVehiclesExcept: "hariç tüm araçlar" },
  th: { showMeOnly: "แสดงให้ฉันดูเฉพาะ", and: "และ", or: "หรือ", allVehiclesExcept: "ยานพาหนะทั้งหมดยกเว้น" },
  ko: { showMeOnly: "다음만 보여주세요", and: "및", or: "또는", allVehiclesExcept: "다음을 제외한 모든 차량" },
  ja: { showMeOnly: "次のみを表示してください", and: "と", or: "または", allVehiclesExcept: "次以外のすべての車両" }
};
```

#### Localized Facet Names
**Location**: `LOCALIZED_FACET_NAMES_FOR_QUERY` in `generateFacetMatrix.ts`

Maps facet keys to localized display names:
- `bodyType` → "body type" (EN), "gövde tipi" (TR), "ประเภทรถ" (TH), etc.
- `fuelType` → "fuel type" (EN), "yakıt tipi" (TR), etc.
- `price`, `color`, `motorization`, etc.

To add a new language:
1. Add language code mappings in `getLanguageCode()` if needed
2. Add phrase templates in `getLocalizedMatrixPhrases()`
3. Add facet name mappings in `LOCALIZED_FACET_NAMES_FOR_QUERY`
4. Update `toQueryLabel()` and `toHintLabel()` functions for language-specific formatting

### 3b. Localized Conversational Sentence Templates
**Location**: `tests/utils/query/promptEngineHelper.ts` - `getLocalizedSentenceTemplate()` function

The system generates conversational multi-facet queries in different styles for natural language variation. Each language implementation maps style hints to sentence templates with consistent structure.

#### Supported Style Hints
- `exact` - Minimal format: just facet + value labels
- `direct` - Direct command form with imperative verb
- `feature` - Feature-led recommendation style
- `shortlist` - Shortlisting/filtering style
- `ask` - Conversational question format
- `explore` - Discovery/exploration style
- `minimal` - Minimal keywords only
- `preference` - Preference expression style
- `default` - Default sentence format

#### Existing Language Implementations

**Turkish (TR)** - Already Supported
```typescript
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
```

**Thai (TH)** - Already Supported
```typescript
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
```

#### Adding a New Language Implementation

To add sentence templates for a new language:

1. Add a new conditional block in `getLocalizedSentenceTemplate()`:
```typescript
if (normalizedLanguage === "xx") {
  const templates: Record<string, string> = {
    exact: `${keyLabel} ${valueLabel}`,
    direct: `[language-specific direct command with keyLabel and valueLabel]`,
    feature: `[language-specific feature recommendation style]`,
    shortlist: `[language-specific shortlist style]`,
    ask: `[language-specific conversational question]`,
    explore: `[language-specific exploration style]`,
    minimal: `${valueLabel} ${keyLabel}`,
    preference: `[language-specific preference expression]`,
    default: `[language-specific default style]`,
  };
  return templates[styleKey] || templates.default;
}
```

2. Ensure all templates use `${keyLabel}` and `${valueLabel}` placeholders consistently
3. Test with `npm run generate:facet-matrix` to verify output quality
4. Update this documentation with the new language code and example templates

### 4. AI Evaluation Rules
**Location**: `tests/data/ai-evaluation-rules.json`

Defines how OpenAI evaluates search responses. Key sections:
- `resultsEvaluation` - General response evaluation criteria (A-Z, AA-AC)
- `Vehicles MB` - Mercedes-Benz vehicle query evaluation
- `facetMatrix` - Facet filter evaluation rules
  - `genericHints` - Applies to all facets (value, range, exclusion, inclusion)
  - `bodyTypeHints` - Special rules for body type facet

**Important**: Update the `inclusion` rule to NOT require explicit mention of all filter values:
```json
"inclusion": [
  "Respond with \"PASS\" if the response stays in Mercedes-Benz automotive context and gives recommendations for this multi-value intent.",
  "Respond with \"PASS\" if the response indicates that matching vehicles are available; explicit mention of all requested {facetName} values ({aText}, {bText}) in the response message is optional because backend facet validation checks that the filter is correctly applied.",
  "..."
]
```

### 5. Locale-Specific Formatting
**Location**: `tests/utils/generation/generateFacetMatrix.ts`

#### Price Formatting
```typescript
function formatLocalizedPriceValue(value: unknown): string {
  switch (getCountryCode()) {
    case "TR": return `₺${formatLocalizedInteger(value, "tr-TR")}`;
    case "AU": return `A$ ${formatLocalizedInteger(value, "en-AU")}`;
    case "IN": return `₹ ${formatLocalizedInteger(value, "en-IN")}`;
    case "SG": return `${formatLocalizedInteger(value, "en-SG")} SGD`;
    case "KR": return `${formatLocalizedInteger(value, "ko-KR")} 원`;
    case "TH": return `THB ${formatLocalizedInteger(value, "en-TH")}`;
  }
}
```

To add a new country's price format, add a case to this switch statement.

#### Body Type Mappings
Map backend values to user-friendly labels:
```typescript
const bodyTypeMap = {
  LIMOUSINE: "sedans",        // Market-specific
  SUV_OFFROADER: "SUVs",
  HATCHBACK: "hatchbacks",
  COUPE: "coupes",
  CABRIO_ROADSTER: "cabriolets",
  PEOPLE_CARRIER: "people carriers",
  STATION: "estate cars"      // UK English
};
```

Update in `toQueryLabel()` and `toHintLabel()` functions if market needs different labels.

### 6. API Endpoints
**Location**: `tests/utils/api/apiHelpers.ts`

Configure endpoint URLs by environment:
```typescript
if (env === "PROD") {
  this.baseURL = "https://ap.api.oneweb.mercedes-benz.com/commerce/onesearch/graphql";
} else if (env === "INT") {
  this.baseURL = "https://test.api.oneweb.mercedes-benz.com/commerce/onesearch/int/graphql";
}
```

### 7. GraphQL Queries
**Location**: `tests/utils/api/graphqlQueries.ts`

Define market-specific GraphQL queries:
```typescript
const GET_SMARTSEARCH_RESULTS_COUNTRY_QUERIES = {
  "AU-NEW_VEHICLES": `query GetSmartSearchResults { ... }`,
  "IN-NEW_VEHICLES": `query GetSmartSearchResults { ... }`,
  // Add queries for new country
  "XX-NEW_VEHICLES": `query GetSmartSearchResults { ... }`,
};
```

## Step-by-Step Onboarding Checklist

### Phase 1: Data Collection
- [ ] Extract live API response for new market
- [ ] Document available facets and values
- [ ] Identify language-specific formatting needs
- [ ] Collect manual test queries (5-10 per facet type)
- [ ] Verify API endpoints work in target environment

### Phase 2: Configuration
- [ ] Create `.env` entry with new `COUNTRY-LANGUAGE` combination
- [ ] Add fixed query file: `fixed-queries-{COUNTRY}-{LANGUAGE}-{PRODUCT}.json`
- [ ] Update `getCountryCode()` and `getLanguageCode()` mappings if needed
- [ ] Update `RANGE_PHRASE_TEMPLATES` for localized range phrases
- [ ] Update `LOCALIZED_FACET_NAMES_FOR_QUERY` mappings
- [ ] Add localized sentence templates in `getLocalizedSentenceTemplate()` (promptEngineHelper.ts)
- [ ] Update price formatting in `formatLocalizedPriceValue()`
- [ ] Update body type/facet labels in `toQueryLabel()` and `toHintLabel()`

### Phase 3: Generation
- [ ] Run `npm run generate:facet-matrix` with new COUNTRY/LANGUAGE
- [ ] Verify generated queries in `generated-queries-{COUNTRY}-{LANGUAGE}-{PRODUCT}.json`
- [ ] Review for language correctness and cultural appropriateness

### Phase 4: Testing
- [ ] Run API tests: `npm run test:api -- --grep "new market"`
- [ ] Run full regression: `npm run test:regression -- --grep "new country"`
- [ ] Verify response evaluation passes (facets + message)
- [ ] Test in both INT and PROD environments
- [ ] Validate result counts match backend

### Phase 5: Documentation
- [ ] Document any market-specific quirks
- [ ] Add supported body types/facet values for reference
- [ ] Update this guide if market has unique needs
- [ ] Add regression test cases to `regression.spec.ts`

## Common Issues & Solutions

### Issue: Generated Queries Look Wrong
**Solution**: Check language code mapping in `getLanguageCode()` - ensure it returns correct 2-letter code.

### Issue: Price Formatting Incorrect
**Solution**: Add currency case to `formatLocalizedPriceValue()` function.

### Issue: Facet Values Not Translating
**Solution**: Verify `toHintLabel()` and `toQueryLabel()` handle the facet type and add aliases if needed.

### Issue: AI Evaluation Failing on Response Message
**Solution**: Ensure `ai-evaluation-rules.json` `inclusion` rule allows implicit filter application (doesn't require all values mentioned in response).

### Issue: API Calls Timeout or 401
**Solution**: Verify `X_API_KEY` environment variable is set and valid for target environment. Check endpoint URL is correct.

## Code Examples

### Adding Turkish Phrases to buildMatrix()
```typescript
// Already supported - phrases in getLocalizedMatrixPhrases()
const phrases = getLocalizedMatrixPhrases(); // Returns Turkish phrases when LANGUAGE=TR
const query = `${phrases.showMeOnly} ${left} ${phrases.or} ${right}`; // "bana sadece göster sedanlar veya hatchbacklar"
```

### Adding New Language to Facet Names
```typescript
// In LOCALIZED_FACET_NAMES_FOR_QUERY:
const newLanguage = {
  bodyType: "body type name in language",
  fuelType: "fuel type name in language",
  color: "color name in language",
  // ... other facets
};
```

### Adding New Country Price Format
```typescript
// In formatLocalizedPriceValue():
case "XX":
  return `${formatLocalizedInteger(value, "xx-XX")} CUR`;
```

## Testing the New Market

```bash
# Generate queries for new market
COUNTRY=XX LANGUAGE=XX npm run generate:facet-matrix

# Run tests for new market
COUNTRY=XX LANGUAGE=XX npm run test:api
COUNTRY=XX LANGUAGE=XX npm run test:regression

# Run full suite
npm run test:all -- --country XX --language XX
```

## Resources
- [ENV Configuration](../../.env.example)
- [Test Data Files](../data/)
- [GraphQL Queries](../utils/api/graphqlQueries.ts)
- [Generation Logic](../utils/generation/generateFacetMatrix.ts)
- [Evaluation Rules](../data/ai-evaluation-rules.json)
