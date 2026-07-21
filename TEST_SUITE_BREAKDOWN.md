# SMART SEARCH Automation Test Suite - Updated Breakdown
**Last Updated:** July 12, 2026

## Summary Statistics
- **Total Test Cases:** 66+ (search.spec.ts) + 4 regression groups (regression.spec.ts)
- **Total Queries (estimated):** ~550+ queries (search) + multi-country variations (regression)
- **Test Suites:** 10 describe blocks (search.spec.ts) + 4 describe blocks (regression.spec.ts)
- **Supported Countries:** AU, IN, JP, KR, SG, TH, TR (for multi-country evaluation)
- **New Additions:** Regression tests, Multi-Country Evaluation, Multi-Country Facet Evaluation, Negative facet suite, expanded facet coverage, scenario reporting groups

---

## Regression Test Suites (regression.spec.ts)

### 11. Smart Regression Evaluation (SRE)

Comprehensive regression testing loading queries from description text.

| S/N | Test | Query Source | Details |
|-----|------|--------------|---------|
| 11.1 | Smart Regression Evaluation | Description-based | Loads regression queries from regression.description.txt |

| | **Subtotal** | | **1 test** |

---

### 12. Intermittent Issues Check (IIC)

Repeated query testing to identify intermittent failures.

| S/N | Test | Query Source | Details |
|-----|------|--------------|---------|
| 12.1 | Intermittent Issues Check | Intermittency-queries.json | Repeated execution for stability analysis |

| | **Subtotal** | | **1 test** |

---

### 13. Multi Country Evaluation (MCE)

Multi-country regression testing across supported markets.

| S/N | Test | Countries | Details |
|-----|------|-----------|---------|
| 13.1-13.7 | Multi Country Evaluation | AU, IN, JP, KR, SG, TH, TR | Regression queries per country with language mapping |

| | **Subtotal** | | **7 tests (1 per country)** |

---

### 14. Multi Country Facet Evaluation (MCFE)

Dedicated facet evaluation across supported countries with dynamic facet loading.

| S/N | Test | Countries | Details |
|-----|------|-----------|---------|
| 14.1-14.7 | Multi Country Facet Evaluation | AU, IN, JP, KR, SG, TH, TR | Facet-specific testing per country (default: motorization, configurable via MCFE_TARGET_FACET) |

| | **Subtotal** | | **7 tests (1 per country)** |

---

## Test Suite Breakdown

### 1. AI Smart Search - Sanity (3 tests)

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 1.1 | By Fixed Query | Fixed only | 35 | Baseline queries from fixed-queries JSON |
| 1.2 | Recommendation Model | 20 fixed + 8 AI | 28 | Tests AI recommendation model |
| 1.3 | By Filter Facets (complete) | API + AI | Variable | Dynamic based on available facets |
| | **Subtotal** | | **63+** | |

---

### 2. AI Smart Search - Vehicles MB (22 tests)

#### Facet Coverage
| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 2.1 | By Filter Facets (bodyType) | API + AI | Variable | Dynamic facet loading |
| 2.2 | By Filter Facets (modelIdentifier) | API + AI | Variable | Dynamic facet loading |
| 2.3 | By Filter Facets (fuelType) | API + AI | Variable | Dynamic facet loading |
| 2.4 | By Filter Facets (motorization) | API + AI | Variable | Dynamic facet loading |
| 2.5 | By Filter Facets (price) | API + AI | Variable | Dynamic facet loading |
| 2.6 | By Filter Facets (mileage) | API + AI | Variable | Dynamic facet loading |
| 2.7 | By Filter Facets (enginePowerHP) | API + AI | Variable | Dynamic facet loading |
| 2.8 | By Filter Facets (enginePowerKW) | API + AI | Variable | Dynamic facet loading |
| 2.9 | By Filter Facets (color) | API + AI | Variable | Dynamic facet loading |
| 2.10 | By Filter Facets (colorPolish) | API + AI | Variable | Dynamic facet loading |
| 2.11 | By Filter Facets (upholstery) | API + AI | Variable | Dynamic facet loading |
| 2.12 | By Filter Facets (upholsteryPolish) | API + AI | Variable | Dynamic facet loading |
| 2.13 | By Filter Facets (packages) | API + AI | Variable | Dynamic facet loading |
| 2.14 | By Filter Facets (lines) | API + AI | Variable | Dynamic facet loading |
| 2.15 | By Filter Facets (equipment) | API + AI | Variable | Dynamic facet loading |
| 2.16 | By Filter Facets (campaigns) | API + AI | Variable | Dynamic facet loading |

#### Facet Combination Behavior
| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 2.17 | By Filter Facets (AND/OR) | 5 fixed | 5 | Contradictory/combined filters |
| 2.18 | By Filter Facets (matrix) | Dynamic | Variable | Facet matrix combinations |

#### Mercedes Query Intent
| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 2.19 | By Brand/Model | 2 fixed + 80 AI | 82 | Random 10 vehicle selections |
| 2.20 | By Specs | 2 fixed + 8 AI | 10 | Specification-based queries |
| 2.21 | No Brand/Model | 2 fixed + 10 AI | 12 | Generic/brand-agnostic queries |
| 2.22 | Superlative | 2 fixed + 8 AI | 10 | Superlative queries (best, fastest, etc.) |

| | **Subtotal** | | **57+ (excluding variable facets)** | |

---

### 3. AI Smart Search - Vehicles MB - Range Facets (6 tests)

Dedicated test suite for numeric RANGE facet scenarios.

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 3.1 | By Filter Facets (price) | Dynamic | Variable | RANGE value generation |
| 3.2 | By Filter Facets (monthlyRate) | Dynamic | Variable | RANGE value generation |
| 3.3 | By Filter Facets (mileage) | Dynamic | Variable | RANGE value generation |
| 3.4 | By Filter Facets (enginePowerHP) | Dynamic | Variable | RANGE value generation |
| 3.5 | By Filter Facets (enginePowerKW) | Dynamic | Variable | RANGE value generation |
| 3.6 | By Filter Facets (modelYear) | Dynamic | Variable | RANGE value generation |

| | **Subtotal** | | **Variable (3+ each)** | |

---

### 4. AI Smart Search - Vehicles MB - Negative Facets (6 tests)

Dedicated test suite for negative/missing facet value scenarios

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 4.1 | By Filter Facets (bodyType)(-ve) | Dynamic | Variable | Missing bodyType values |
| 4.2 | By Filter Facets (modelIdentifier)(-ve) | Dynamic | Variable | Missing modelIdentifier values |
| 4.3 | By Filter Facets (fuelType)(-ve) | Dynamic | Variable | Missing fuelType values |
| 4.4 | By Filter Facets (motorization)(-ve) | Dynamic | Variable | Missing motorization values |
| 4.5 | By Filter Facets (color)(-ve) | Dynamic | Variable | Missing color values |
| 4.6 | By Filter Facets (upholstery)(-ve) | Dynamic | Variable | Missing upholstery values |

| | **Subtotal** | | **Variable (6+ each)** | |

---

### 5. AI Smart Search - Vehicles Non-MB (4 tests)

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 4.1 | By Brand/Model (Sentence\|Single) | 2 fixed + 10 AI | 12 | Single brand/model sentences |
| 4.2 | By Brand/Model (Keyword\|Single) | 2 fixed + 10 AI | 12 | Single keyword queries |
| 4.3 | By Brand/Model (Keyword\|Mix) | 2 fixed + 10 AI | 12 | Mixed keyword combinations |
| 4.4 | By Non-MB Features | Fixed only | 20 | Non-Mercedes brand features |

| | **Subtotal** | | **52** | |

---

### 6. AI Smart Search - Input Robustness (5 tests)

**Parsing, malformed input, language, and unit resilience**

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 5.1 | Edge Case Queries | Hardcoded | 17 | Special characters, SQL injection, Unicode, etc. |
| 5.2 | Random Numbers | Fixed only | 52 | Random numeric inputs |
| 5.3 | Misspelled/Fuzzy Queries | 3 fixed + 7 AI | 10 | Typos and fuzzy matching |
| 5.4 | Language/Localization | 3 fixed + 7 AI | 10 | Multi-language support |
| 5.5 | Unusual Units Queries | Fixed only | 6 | Queries with unusual measurement units |

| | **Subtotal** | | **95** | |

---

### 7. AI Smart Search - Constraint Handling (5 tests)

**Search constraints, contradictions, conflicts, and empty-result handling**

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 7.1 | Date Range/Numeric Filters | 2 fixed + 8 AI | 10 | Date and numeric value queries |
| 7.2 | Negative/Contradictory Queries | 2 fixed + 8 AI | 10 | Contradictory requirements |
| 7.3 | Conflicting Filter Facets | 5 fixed + 8 AI | 13 | Conflicting filter combinations |
| 7.4 | Conflicting Brands | 5 fixed + 8 AI | 13 | Conflicting brand queries |
| 7.5 | No Results Scenario | 2 fixed + 8 AI | 10 | Queries returning no results |

| | **Subtotal** | | **56** | |

---

### 8. AI Smart Search - Conversational Behavior (9 tests)

**Higher-level assistant behavior for user intent and preference handling**

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 8.1 | Multi-Intent Queries | Fixed only | 6 | Queries with multiple intents |
| 8.2 | Clarification Queries | Fixed only | 6 | Clarification-seeking queries |
| 8.3 | Price Negotiation Queries | Fixed only | 8 | Price-related negotiations |
| 8.4 | Sales | Fixed only | 20 | Sales, finance, warranty, and dealer handoff questions |
| 8.5 | Joke/Humor Queries | Fixed only | 3 | Humorous/joke queries |
| 8.6 | Repeat/Looping Queries | Fixed only | 3 | Repetitive query patterns |
| 8.7 | Brand Loyalty/Switching Queries | Fixed only | 3 | Brand preference queries |
| 8.8 | Accessibility Needs Queries | Fixed only | 3 | Accessibility-focused queries |
| 8.9 | Environmental Concerns Queries | Fixed only | 3 | Environment-related queries |

| | **Subtotal** | | **55** | |

---

### 9. AI Smart Search - Safety / Policy / Abuse (5 tests)

**Off-topic, sensitive, unsafe, and manipulative input handling**

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 9.1 | Personal Data | 6 fixed + 8 AI | 14 | Personal data handling |
| 9.2 | NSFW | 5 fixed + 8 AI | 13 | NSFW content filtering |
| 9.3 | Code and Scripts | 5 fixed + 8 AI | 13 | Code injection attempts |
| 9.4 | Bias and Manipulation | 5 fixed + 8 AI | 13 | Bias detection and manipulation tests |
| 9.5 | Random Topics | 2 fixed + 8 AI | 10 | Off-topic/unrelated queries |

| | **Subtotal** | | **63** | |

---

### 10. AI Smart Search - Reliability (1 test)

**Repeated-query stability**

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 10.1 | Response Consistency | 14 fixed + 8 AI | 22 | Repeated queries for consistency check |

| | **Subtotal** | | **22** | |

---

## Overall Statistics

| S/N | Category | Count |
|-----|----------|-------|
| 1 | **Total Test Cases (search.spec.ts)** | 66 |
| 2 | **Total Test Cases (regression.spec.ts)** | 16 (4 groups + multi-country iterations) |
| 3 | **Reporting Groups** | 14 (10 search + 4 regression) |
| 4 | **Total Fixed Queries** | ~240 |
| 5 | **Total AI-Generated Queries** | ~150 |
| 6 | **Edge Case Queries** | 17 |
| 7 | **Supported Markets (MCE/MCFE)** | 7 (AU, IN, JP, KR, SG, TH, TR) |
| 6 | **Dynamic/Variable Queries** | Variable (facet-dependent) |
| 7 | **Estimated Total Queries** | **550+** |

---

## Key Changes from Previous Breakdown

### Additions
✅ **Range Facet Suite** - 6 tests for MB vehicles covering numeric RANGE facets
✅ **Negative Facet Suite** - 6 tests for MB vehicles covering missing facet values
✅ **Expanded Facet Coverage** - 16 individual facet tests for MB vehicles
✅ **Matrix Facet Tests** - New facet matrix combinations test  
✅ **Scenario reporting groups** - Input Robustness, Constraint Handling, Conversational Behavior, Safety / Policy / Abuse, and Reliability

### Changes
- **Vehicles MB tests increased** from ~10 to 22 tests (due to individual facet tests)
- **Other/Special scenario results** reorganized into five reporting groups
- **Dynamic facet loading** enabled across most tests for real-time API-based query generation

---

## Query Execution Notes

### Conditional Execution Flags
- `shouldRunUiTests()` - UI-based test execution
- `shouldRunApiTests()` - API-based test execution
- `isFixedQueriesOnly()` - Option to run only fixed queries (skip AI generation)

### Data Sources
- **Fixed Queries:** `tests/data/fixed-queries-*.json`
- **AI Prompts:** `tests/data/ai-query-prompts.json`
- **Evaluation Rules:** `tests/data/ai-evaluation-rules.json`
- **EMH API:** Dynamic facet data from `fetchEmhApiResponse()`
- **Vehicle Data:** `tests/data/vehicle-brands-and-models.json`

### Test Results Output
- HTML Reports: `results/html/`
- JSON Results: `results/json/YYYY-MM-DD_ENVIRONMENT/`
- Screenshots: `results/screenshots/YYYY-MM-DD_ENVIRONMENT/`
