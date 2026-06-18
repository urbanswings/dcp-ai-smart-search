# SMART SEARCH Automation Test Suite - Updated Breakdown
**Last Updated:** June 19, 2026

## Summary Statistics
- **Total Test Cases:** 60
- **Total Queries (estimated):** ~550+ queries
- **Test Suites:** 9 describe blocks
- **New Additions:** Negative facet suite, expanded facet coverage, scenario reporting groups

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

### 3. AI Smart Search - Vehicles MB - Negative Facets (6 tests)

Dedicated test suite for negative/missing facet value scenarios

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 3.1 | By Filter Facets (bodyType)(-ve) | Dynamic | Variable | Missing bodyType values |
| 3.2 | By Filter Facets (modelIdentifier)(-ve) | Dynamic | Variable | Missing modelIdentifier values |
| 3.3 | By Filter Facets (fuelType)(-ve) | Dynamic | Variable | Missing fuelType values |
| 3.4 | By Filter Facets (motorization)(-ve) | Dynamic | Variable | Missing motorization values |
| 3.5 | By Filter Facets (color)(-ve) | Dynamic | Variable | Missing color values |
| 3.6 | By Filter Facets (upholstery)(-ve) | Dynamic | Variable | Missing upholstery values |

| | **Subtotal** | | **Variable (6+ each)** | |

---

### 4. AI Smart Search - Vehicles Non-MB (4 tests)

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 4.1 | By Brand/Model (Sentence\|Single) | 2 fixed + 10 AI | 12 | Single brand/model sentences |
| 4.2 | By Brand/Model (Keyword\|Single) | 2 fixed + 10 AI | 12 | Single keyword queries |
| 4.3 | By Brand/Model (Keyword\|Mix) | 2 fixed + 10 AI | 12 | Mixed keyword combinations |
| 4.4 | By Non-MB Features | Fixed only | 20 | Non-Mercedes brand features |

| | **Subtotal** | | **52** | |

---

### 5. AI Smart Search - Input Robustness (5 tests)

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

### 6. AI Smart Search - Constraint Handling (5 tests)

**Search constraints, contradictions, conflicts, and empty-result handling**

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 6.1 | Date Range/Numeric Filters | 2 fixed + 8 AI | 10 | Date and numeric value queries |
| 6.2 | Negative/Contradictory Queries | 2 fixed + 8 AI | 10 | Contradictory requirements |
| 6.3 | Conflicting Filter Facets | 5 fixed + 8 AI | 13 | Conflicting filter combinations |
| 6.4 | Conflicting Brands | 5 fixed + 8 AI | 13 | Conflicting brand queries |
| 6.5 | No Results Scenario | 2 fixed + 8 AI | 10 | Queries returning no results |

| | **Subtotal** | | **56** | |

---

### 7. AI Smart Search - Conversational Behavior (9 tests)

**Higher-level assistant behavior for user intent and preference handling**

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 7.1 | Multi-Intent Queries | Fixed only | 6 | Queries with multiple intents |
| 7.2 | Clarification Queries | Fixed only | 6 | Clarification-seeking queries |
| 7.3 | Price Negotiation Queries | Fixed only | 8 | Price-related negotiations |
| 7.4 | Sales | Fixed only | 20 | Sales, finance, warranty, and dealer handoff questions |
| 7.5 | Joke/Humor Queries | Fixed only | 3 | Humorous/joke queries |
| 7.6 | Repeat/Looping Queries | Fixed only | 3 | Repetitive query patterns |
| 7.7 | Brand Loyalty/Switching Queries | Fixed only | 3 | Brand preference queries |
| 7.8 | Accessibility Needs Queries | Fixed only | 3 | Accessibility-focused queries |
| 7.9 | Environmental Concerns Queries | Fixed only | 3 | Environment-related queries |

| | **Subtotal** | | **55** | |

---

### 8. AI Smart Search - Safety / Policy / Abuse (5 tests)

**Off-topic, sensitive, unsafe, and manipulative input handling**

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 8.1 | Personal Data | 6 fixed + 8 AI | 14 | Personal data handling |
| 8.2 | NSFW | 5 fixed + 8 AI | 13 | NSFW content filtering |
| 8.3 | Code and Scripts | 5 fixed + 8 AI | 13 | Code injection attempts |
| 8.4 | Bias and Manipulation | 5 fixed + 8 AI | 13 | Bias detection and manipulation tests |
| 8.5 | Random Topics | 2 fixed + 8 AI | 10 | Off-topic/unrelated queries |

| | **Subtotal** | | **63** | |

---

### 9. AI Smart Search - Reliability (1 test)

**Repeated-query stability**

| S/N | Test | Query Source | Estimated Count | Notes |
|-----|------|--------------|-----------------|-------|
| 9.1 | Response Consistency | 14 fixed + 8 AI | 22 | Repeated queries for consistency check |

| | **Subtotal** | | **22** | |

---

## Overall Statistics

| S/N | Category | Count |
|-----|----------|-------|
| 1 | **Total Test Cases** | 60 |
| 2 | **Reporting Groups** | 9 |
| 3 | **Total Fixed Queries** | ~240 |
| 4 | **Total AI-Generated Queries** | ~150 |
| 5 | **Edge Case Queries** | 17 |
| 6 | **Dynamic/Variable Queries** | Variable (facet-dependent) |
| 7 | **Estimated Total Queries** | **550+** |

---

## Key Changes from Previous Breakdown

### Additions
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
