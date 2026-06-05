# SMART SEARCH Automation Test Suite - Updated Breakdown
**Last Updated:** June 5, 2026

## Summary Statistics
- **Total Test Cases:** 53
- **Total Queries (estimated):** ~550+ queries
- **Test Suites:** 6 describe blocks
- **New Additions:** Negative test suite, Expanded facet coverage, Special scenarios

---

## Test Suite Breakdown

### 1. AI Smart Search - Sanity Test (3 tests)

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 1.1 | By Fixed Query | Fixed only | 35 | Baseline queries from fixed-queries JSON |
| 1.2 | Recommendation Model | 20 fixed + 8 AI | 28 | Tests AI recommendation model |
| 1.3 | By Filter Facets (complete) | API + AI | Variable | Dynamic based on available facets |
| | **Subtotal** | | **63+** | |

---

### 2. AI Smart Search - Vehicles MB (18 tests)

#### Standard Facet Tests
| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 2.1 | By Brand/Model | 2 fixed + 8 AI | 10 | Random 10 vehicle selections |
| 2.2 | By Specs | 2 fixed + 8 AI | 10 | Specification-based queries |
| 2.3 | By Filter Facets (modelIdentifier) | API + AI | Variable | Dynamic facet loading |
| 2.4 | By Filter Facets (bodyType) | API + AI | Variable | Dynamic facet loading |
| 2.5 | By Filter Facets (fuelType) | API + AI | Variable | Dynamic facet loading |
| 2.6 | By Filter Facets (upholstery) | API + AI | Variable | Dynamic facet loading |
| 2.7 | By Filter Facets (upholsteryPolish) | API + AI | Variable | Dynamic facet loading |
| 2.8 | By Filter Facets (color) | API + AI | Variable | Dynamic facet loading |
| 2.9 | By Filter Facets (lines) | API + AI | Variable | Dynamic facet loading |
| 2.10 | By Filter Facets (packages) | API + AI | Variable | Dynamic facet loading |
| 2.11 | By Filter Facets (equipment) | API + AI | Variable | Dynamic facet loading |
| 2.12 | By Filter Facets (motorization) | API + AI | Variable | Dynamic facet loading |

#### Complex Facet Tests
| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 2.13 | By Filter Facets (AND/OR) | 5 fixed | 5 | Contradictory/combined filters |
| 2.14 | By Filter Facets (matrix) | Dynamic | Variable | Facet matrix combinations |
| 2.15 | No Brand/Model | 2 fixed + 10 AI | 12 | Generic/brand-agnostic queries |
| 2.16 | Superlative | 2 fixed + 8 AI | 10 | Superlative queries (best, fastest, etc.) |

| | **Subtotal** | | **57+ (excluding variable facets)** | |

---

### 3. AI Smart Search - Vehicles MB (-ve) [Negative Tests] (6 tests)

**NEW:** Dedicated test suite for negative/missing facet value scenarios

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 3.1 | By Filter Facets (bodyType)(-ve) | Dynamic | Variable | Missing bodyType values |
| 3.2 | By Filter Facets (fuelType)(-ve) | Dynamic | Variable | Missing fuelType values |
| 3.3 | By Filter Facets (upholstery)(-ve) | Dynamic | Variable | Missing upholstery values |
| 3.4 | By Filter Facets (color)(-ve) | Dynamic | Variable | Missing color values |
| 3.5 | By Filter Facets (modelIdentifier)(-ve) | Dynamic | Variable | Missing modelIdentifier values |
| 3.6 | By Filter Facets (motorization)(-ve) | Dynamic | Variable | Missing motorization values |

| | **Subtotal** | | **Variable (6+ each)** | |

---

### 4. AI Smart Search - Vehicles Non-MB (4 tests)

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 4.1 | By Brand/Model (Sentence\|Single) | 2 fixed + 10 AI | 12 | Single brand/model sentences |
| 4.2 | By Brand/Model (Keyword\|Mix) | 2 fixed + 8 AI | 10 | Mixed keyword combinations |
| 4.3 | By Brand/Model (Keyword\|Single) | 2 fixed + 8 AI | 10 | Single keyword queries |
| 4.4 | By Non-MB Features | Fixed only | 20 | Non-Mercedes brand features |

| | **Subtotal** | | **52** | |

---

### 5. AI Smart Search - Other Scenarios (15 tests)

**Comprehensive coverage of edge cases and special scenarios**

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 5.1 | Random Topics | 2 fixed + 8 AI | 10 | Off-topic/unrelated queries |
| 5.2 | Edge Case Queries | Hardcoded | 17 | Special characters, SQL injection, Unicode, etc. |
| 5.3 | Negative/Contradictory Queries | 2 fixed + 8 AI | 10 | Contradictory requirements |
| 5.4 | Language/Localization | 3 fixed + 7 AI | 10 | Multi-language support |
| 5.5 | Misspelled/Fuzzy Queries | 3 fixed + 7 AI | 10 | Typos and fuzzy matching |
| 5.6 | Date Range/Numeric Filters | 2 fixed + 8 AI | 10 | Date and numeric value queries |
| 5.7 | No Results Scenario | 2 fixed + 8 AI | 10 | Queries returning no results |
| 5.8 | Response Consistency | 8 AI | 8 | Repeated queries for consistency check |
| 5.9 | Personal Data | 6 fixed + 8 AI | 14 | Personal data handling |
| 5.10 | NSFW | 5 fixed + 8 AI | 13 | NSFW content filtering |
| 5.11 | Code and Scripts | 5 fixed + 8 AI | 13 | Code injection attempts |
| 5.12 | Bias and Manipulation | 5 fixed + 8 AI | 13 | Bias detection and manipulation tests |
| 5.13 | Conflicting Filter Facets | 5 fixed + 8 AI | 13 | Conflicting filter combinations |
| 5.14 | Conflicting Brands | 5 fixed + 8 AI | 13 | Conflicting brand queries |
| 5.15 | Random Numbers | Fixed only | 52 | Random numeric inputs |

| | **Subtotal** | | **213** | |

---

### 6. AI Smart Search - Special Scenarios (9 tests)

**Extended scenario coverage**

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 6.1 | Multi-Intent Queries | Fixed only | 6 | Queries with multiple intents |
| 6.2 | Clarification Queries | Fixed only | 6 | Clarification-seeking queries |
| 6.3 | Price Negotiation Queries | Fixed only | 8 | Price-related negotiations |
| 6.4 | Unusual Units Queries | Fixed only | 6 | Queries with unusual measurement units |
| 6.5 | Joke/Humor Queries | Fixed only | 3 | Humorous/joke queries |
| 6.6 | Repeat/Looping Queries | Fixed only | 3 | Repetitive query patterns |
| 6.7 | Brand Loyalty/Switching Queries | Fixed only | 3 | Brand preference queries |
| 6.8 | Accessibility Needs Queries | Fixed only | 3 | Accessibility-focused queries |
| 6.9 | Environmental Concerns Queries | Fixed only | 3 | Environment-related queries |

| | **Subtotal** | | **41** | |

---

## Overall Statistics

| S/N | Category | Count |
|-----|----------|-------|
| 1 | **Total Test Cases** | 53 |
| 2 | **Test Suites (describe blocks)** | 6 |
| 3 | **Total Fixed Queries** | ~240 |
| 4 | **Total AI-Generated Queries** | ~150 |
| 5 | **Edge Case Queries** | 17 |
| 6 | **Dynamic/Variable Queries** | Variable (facet-dependent) |
| 7 | **Estimated Total Queries** | **550+** |

---

## Key Changes from Previous Breakdown

### Additions
✅ **Negative Test Suite** - 6 new tests for MB vehicles (-ve) covering missing facet values  
✅ **Expanded Facet Coverage** - 12 individual facet tests for MB vehicles (modelIdentifier, bodyType, fuelType, upholstery, upholsteryPolish, color, lines, packages, equipment, motorization)  
✅ **Matrix Facet Tests** - New facet matrix combinations test  
✅ **Extended Special Scenarios** - 9 specialized scenario tests  

### Changes
- **Vehicles MB tests increased** from ~10 to 18 tests (due to individual facet tests)
- **Special Scenarios expanded** with dedicated test suite (previously part of "Other Scenarios")
- **Other Scenarios** reorganized with 15 comprehensive edge case tests
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
