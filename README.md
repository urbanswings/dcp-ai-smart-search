# AI Smart Search Test Automation & Reporting

## Overview

This project automates and evaluates the Mercedes-Benz Shop AI Smart Search using Playwright, OpenAI, and Node.js. It generates human-like queries, runs browser-based tests, logs results, and produces interactive HTML reports with advanced filtering and visualization.

---

## Features

- **Dual Testing Mode Support:** Supports both UI testing (Playwright) and API testing (Axios) with unified test scenarios.
- **Automated Browser Testing:** Uses Playwright to simulate user queries and interactions on the Mercedes-Benz Shop AI search page.
- **API Testing:** Direct API calls to search endpoints with response validation and performance metrics.
- **AI-Powered Query Generation:** Leverages OpenAI to create realistic, varied, and edge-case search queries.
- **Comprehensive Scenario Coverage:** Tests include brand/model, specs, filter facets, negative/contradictory, localization, fuzzy/misspelled, date/numeric, no-result, random topics, and edge cases.
- **Result Logging & Evaluation:** Captures search results, evaluates them with OpenAI, and logs pass/fail status.
- **Interactive HTML Reporting:** Node.js script consolidates all test results into a Bootstrap-powered HTML page with dropdown filters, search, export to CSV, and Chart.js visualizations.
- **Consistency Checks:** Validates that repeated queries yield consistent AI responses.

---


## Directory Structure

```
dcp-ai-smart-search/
├── .env                           # Environment configuration (gitignored)
├── .env.example                   # Example environment variables
├── .gitignore                     # Git ignore rules
├── package.json                   # Dependencies and scripts
├── playwright.config.ts           # Playwright configuration
├── tsconfig.json                  # TypeScript configuration
├── generate-results-html.js       # HTML report generator
├── generate-results-json.js       # Non-pass results JSON generator
├── migrate-results-schema.py      # Migrate old JSON files to new schema format
├── clean-old-results.sh           # Script to clean old test results
├── lib/
│   └── resultSchemaAdapter.js     # Schema detection & conversion for backward compatibility
├── results/
│   ├── html/
│   │   ├── test-results-viewer.html      # Interactive viewer (reads both schemas)
│   │   └── search-results-all-*.html     # Generated HTML reports
│   └── json/                      # Test result JSON files
├── tests/
│   ├── search.spec.ts             # Main test suite
│   ├── regression.spec.ts         # Regression test suite
│   ├── zephyr_scale_import.csv    # Zephyr Scale test case export
│   ├── utils/
│   │   ├── api/
│   │   │   └── apiResultLoggingHelpers.ts    # Logs API test results (generates new schema)
│   │   ├── ui/
│   │   │   └── uiResultLoggingHelpers.ts     # Logs UI test results (generates new schema)
│   │   ├── core/
│   │   │   ├── resultEvaluationHelpers.ts    # Evaluates test results with OpenAI
│   │   │   └── searchResultTypes.ts          # Type definitions
│   │   ├── testHelpers.ts         # UI test helper functions
│   │   ├── apiHelpers.ts          # API test helper functions
│   │   ├── shared.ts              # Shared utilities
│   │   ├── facetToJson.js         # Facet conversion utility
│   │   ├── facets-ncos.json       # NCOS facets (updated example)
│   │   └── search-api-response-ncos.json  # NCOS API response (example)
│   └── data/
│       ├── dcp-urls.json          # DCP environment URLs
│       ├── emh-urls.json          # EMH environment URLs
│       ├── search-api-response-kr-ucos-dcp.json  # KR UCOS API response
│       └── search-queries.json     # Non-MB brand/model queries
├── test-results/                  # Playwright test artifacts (gitignored)
├── .playwright-cache/             # Playwright browser cache (gitignored)
└── .playwright-tmp/               # Playwright temp files (gitignored)
```

---

## Key Files

### 1. `package.json`
- Declares dependencies: Playwright, OpenAI, dotenv, Node types.
- Scripts for running tests in different modes.

### 2. `playwright.config.ts`
- Playwright configuration: test directory, timeouts, retries, viewport, screenshot/video settings.


### 3. `tests/search.spec.ts`
- Main Playwright test suite.
- Modular helpers for result logging, OpenAI query/evaluation, random vehicle combinations, and page setup.
- Multiple `test.describe` blocks for different scenarios.
- Each test writes results to a JSON file in `results/json/`.


### 4. `generate-results-html.js`

### 5. `generate-results-json.js`
- Node.js script to extract non-PASS test results from a given results folder.
- Reads all JSON result files from the specified run folder, picks the **latest file per test type**, and filters out passing results.
- Outputs a structured `results/json/results-queries-by-test.json` file matching the `queries-by-test.json` schema.
- Usage:
  ```bash
  node generate-results-json.js [results-folder]
  ```
- Example:
  ```bash
  node generate-results-json.js results/json/2026-04-14_PREPROD
  ```
- Output: `results/json/results-queries-by-test.json` — grouped by test group and title, each entry contains `non_pass_count` and a `non_pass_results` array with query, response, evaluation, timestamp, and screenshot path.
- Node.js script to aggregate all JSON result files from `results/json/`.
- Generates a timestamped, interactive HTML report in `results/html/`.
- Features: Bootstrap UI, sticky headers, dropdown filters, search, export to CSV, horizontal bar charts (Chart.js), pass/fail percentages.

### 6. `tests/utils/facetToJson.js`
- JavaScript utility to convert API search response format to simplified facets format
- Features:
  - Handles nested facet values
  - Rounds numeric values for min/max ranges
  - Automatically determines facet type (range/list)
  - Extracts and validates code/name pairs
- Usage: Simply run the script
  ```bash
  node tests/utils/facetToJson.js
  ```
- Paths (configured in script):
  - Input: `tests/utils/search-api-response-ncos.json`
  - Output: `tests/utils/facets-ncos.json`
- Conversion format:
  - Output format for range facets:
    ```json
    {
      "code": "monthlyPriceSlider",
      "type": "range",
      "min": 0.0,
      "max": 2829000.0,
      "displayName": "월 납입금"
    }
    ```
  - Output format for list facets:
    ```json
    {
      "code": "bodyType",
      "type": "list",
      "values": [
        {
          "code": "suv",
          "name": "SUV"
        }
      ],
      "displayName": "차종"
    }
    ```
      ]
    }
    ```
  - Output (Simplified Facets):
    ```json
    [
      {
        "code": "monthlyPriceSlider",
        "type": "range",
        "min": 0,
        "max": 2829000,
        "displayName": "월 납입금"
      }
    ]
    ```
- Features:
  - Converts SLIDER facets to "range" type with min/max values
  - Converts other facets to "list" type with simplified values
  - Preserves displayName and code fields
  - TypeScript support with proper interfaces
  - Filters out invalid or incomplete facet values

---


## Test Modes

This project supports three different test execution modes:

### Combined Testing Mode (Default)
```bash
npm test
# or
npm run test:both
```
- **Default mode** - Runs both UI and API tests for comprehensive coverage
- Allows comparison between UI and API results
- Comprehensive coverage of both frontend and backend
- Unified reporting with mode indicators

### UI Testing Mode
```bash
npm run test:ui-only
# or
TEST_MODE=ui npx playwright test
```
- Uses Playwright to simulate browser interactions
- Tests the actual user interface and user experience
- Captures screenshots and videos on failures
- Measures page load times and UI responsiveness

### API Testing Mode
```bash
npm run test:api-only
# or
TEST_MODE=api npx playwright test
```
- Makes direct HTTP requests to search API endpoints
- Tests API response structure and data validation
- Measures API response times and status codes
- No browser overhead - faster execution

---

## Test Tags

All tests are tagged with `@ui` and `@api` tags for flexibility in test selection and organization.

### Run Tests by Tag

Tags are useful when you want to run a **subset of tests** or integrate with CI/CD pipelines:

```bash
# Run specific tests by tag (useful for splitting test execution)
npx playwright test --grep @ui

# Run all tests with @api tag
npx playwright test --grep @api

# Run tests matching multiple tags
npx playwright test --grep "@ui|@api"

# Exclude tests with specific tags
npx playwright test --grep-invert @api
```

### When to Use Tags

**Use tags for:**
- Running specific test scenarios in CI/CD (e.g., smoke tests, regression tests)
- Splitting test execution across multiple runners
- Running a subset of tests during development
- Organizing tests by category or feature

**Use TEST_MODE for:**
- Controlling UI vs API execution mode
- Use `test:ui-only`, `test:api-only`, or `test:both` npm scripts

### Available Tags

- `@ui` - All 16 test scenarios (currently all tests have this tag)
- `@api` - All 16 test scenarios (currently all tests have this tag)

**Note:** Tags work independently of the `TEST_MODE` environment variable. Tags filter **which tests run**, while `TEST_MODE` controls **how they run** (UI/API/both).

---

## How It Works

### 1. Test Execution

- Run tests via Playwright with configurable modes (`npm test` or specific mode scripts).
- Each scenario generates queries (some via OpenAI), executes them via UI/API/both, and logs results.
- Results are saved as JSON files in `results/json/` with mode indicators.

### 2. Result Processing

- `generate-results-html.js` reads all result JSON files from `results/json/`.
- Produces a single HTML report in `results/html/` with:
  - Filterable/searchable table of results.
  - Pass/fail status, query, result text, evaluation.
  - Charts for pass/fail by scenario and test title.
  - Export to CSV.

### 3. Consistency Validation

- For the "AI Response Consistency" test, each query is executed 3 times.
- The script checks that all 3 OpenAI evaluations are identical, logging a warning if not.

---

## Jira Integration

The results viewer (`results/html/test-results-viewer.html`) can create Jira bugs directly from a selected failed query, via a local bridge script (`jira-api-bridge.js`) that talks to the Jira REST API using your `.env` credentials. Before submitting, a preview modal lets you review and edit everything.

### Setup

1. Add Jira credentials to your local `.env` (see `.env.example` for the full list): `JIRA_BASE_URL`, `JIRA_API_TOKEN`, `JIRA_AUTH_TYPE` (`bearer` for a PAT, or `basic` with `JIRA_USER_EMAIL`), and optionally `JIRA_AFFECTED_MARKETS_FIELD`/`JIRA_AFFECTED_MARKETS_MODE` and `JIRA_ASSIGNEE_FIELD_MODE`. Keep the real token in your local `.env` only — never commit it.
2. Start the bridge: `npm run jira:bridge` (listens on `JIRA_BRIDGE_PORT`, default `8787`).
3. Open the viewer and configure Jira settings via the ⚙️ icon:
   - **Jira Instance URL**, **Project Key**, **Issue Type**
   - **Jira Bridge URL** (default `http://localhost:8787`)
   - **Board ID** and **Sprint Field ID** — needed for the Sprint dropdown to fetch real sprints (Board ID auto-detects from Project Key if left blank, but that only works reliably when the project has a single board)
   - **Known Labels** — seeds the Labels dropdown (in addition to a hardcoded `SMARTSEARCH` label that's always present)
   - **Project ID** / **Issue Type ID** (numeric, optional) — only used by the "Open in Jira (manual)" fallback link, not by direct submission

### Viewer Usage

1. Select a failed query row in the results table.
2. Click **Create JIRA** in the selected-row panel.
3. A preview modal opens with the summary and description pre-filled from the query/response/facets/failure reasons:
   - **Description** has **Visual**/**Text** tabs — Visual renders the Jira wiki markup (panels, bullets, pass/fail icons) so you can eyeball it; Text is the raw editable markup.
   - **Affected Market(s)** and **Labels** are multi-select dropdowns (Labels also has a free-text "Add" box for one-off tags).
   - **Assignee** is a live-searching autocomplete against Jira's assignable-users API (results filter as you type).
   - **Sprint** is populated live from the configured board's active/future sprints.
4. Edit anything that needs adjusting, then either:
   - **Submit to Jira** — creates the issue directly via the REST API (through the local bridge) and opens it once created, or
   - **Open in Jira (manual)** — falls back to Jira's own Create Issue page with the summary/description prefilled, for when the bridge isn't running.

---

## Test Result Schema

All test results are stored as JSON files with the following **new 5-section schema** (generated automatically by test helpers):

```json
{
  "metadata": {
    "timestamp": "2026-07-09T05:24:05.914Z",
    "testMode": "api",          // "api" or "ui"
    "testSuite": "Regression",  // Old field: testDescribe
    "testCase": "Intermittent Issues Check (IIC)",  // Old field: testTitle
    "language": "en"
  },
  "request": {
    "query": {
      "en": "A180 grade",
      "th": "ปริญญา A180"
    }
  },
  "response": {
    "message": {
      "en": "I found vehicles matching...",
      "th": "ฉันพบรถยนต์ที่ตรงกัน..."
    },
    "statusCode": 200,
    "responseTime": 8143,
    "hasError": false,
    "data": {
      "resultCount": 2,
      "vehicleCount": 2,
      "motorization": ["CLE 300 4MATIC"]
    }
  },
  "assertions": {
    "response": {
      "status": "PASS",
      "feedback": "PASS"
    },
    "facets": {
      "expected": { "include": { "motorization": ["CLE 300 4MATIC"] } },
      "actual": { "motorization": ["CLE 300 4MATIC"] },
      "status": "PASS"
    },
    "count": {
      "expected": null,
      "actual": 2,
      "status": "PASS",
      "backendCount": 2
    }
  },
  "summary": {
    "overallStatus": "PASS",
    "resultCount": 2,
    "vehicleCount": 2,
    "motorization": ["CLE 300 4MATIC"]
  }
}
```

### Schema Migration

**New test runs automatically generate results in this new schema format** (no manual migration needed).

If you have **legacy result files** in the old flat schema format, use the migration script:

```sh
python3 migrate-results-schema.py results/json/<old-folder> results/json/<new-folder>
```

The migration tool converts:
- Old flat structure → New organized 5-section structure
- Old field names → New field paths (e.g., `testDescribe` → `metadata.testSuite`)
- Maintains backward compatibility via [lib/resultSchemaAdapter.js](lib/resultSchemaAdapter.js)

### Viewing Results

- **Interactive Viewer:** `results/html/test-results-viewer.html` (supports both old and new schemas)
- **Generated Reports:** `results/html/search-results-all-<timestamp>.html` (uses [lib/resultSchemaAdapter.js](lib/resultSchemaAdapter.js) for compatibility)

---

## Usage

### 1. Install Dependencies

```sh
npm install
```

### 2. Install Playwright Browsers

```sh
npx playwright install
```

### 3. Configure Environment

Edit `.env` to set your test context:


```properties
ENVIRONMENT=PREPROD   # Options: PREPROD, INT, DEV, PROD
COUNTRY=KR            # Country code, e.g., KR, AU, BR, etc.
LANGUAGE=EN           # Language code, e.g., EN, KO, TH, JP
PRODUCT=NCOS          # NCOS for new cars, UCOS for used cars
AEM_USER_PREPROD=your-username
AEM_PASS_PREPROD=your-password
AEM_USER_INT=your-username
AEM_PASS_INT=your-password
NEXUS_API_KEY=your-openai-key

# Attach to existing browser (optional)
# One of these can be set to enable CDP attach
PLAYWRIGHT_CDP_URL=http://localhost:9222
# CDP_URL=http://localhost:9222
```

### 4. Run Tests

```sh
npx playwright test
```

Or override environment variables for a single run:

```sh
ENVIRONMENT=INT COUNTRY=JP LANGUAGE=EN PRODUCT=UCOS npx playwright test
ENVIRONMENT=INT COUNTRY=JP LANGUAGE=JP PRODUCT=UCOS npx playwright test
```

### 5. Generate HTML Report

```sh
node generate-results-html.js
```

- Output: `results/html/search-results-all-<timestamp>.html`

### 5b. Generate Shareable Standalone Viewer (Embedded JSON)

```sh
node embed-results-into-viewer.js results/json/<run-folder> results/html/test-results-viewer-standalone.html
```

- Output: `results/html/test-results-viewer-standalone.html`
- This embeds JSON directly into the HTML so the file can be shared and opened on another machine without selecting a local folder.

### 6. Generate Non-Pass Results JSON

```sh
node generate-results-json.js results/json/<run-folder>
```

### 7. Migrate Old Result Files to New Schema (Optional)

If you have result files in the old flat schema format and need to convert them to the new 5-section schema format:

```sh
python3 migrate-results-schema.py results/json/<old-folder> results/json/<new-folder>
```

- **Input:** Old schema JSON files (flat structure with `testDescribe`, `testTitle`, `query`, etc. at root level)
- **Output:** New schema JSON files with organized sections:
  - `metadata` (testSuite, testCase, timestamp, language, etc.)
  - `request` (query)
  - `response` (message, statusCode, responseTime, hasError, data)
  - `assertions` (response.feedback, facets with expected/actual)
  - `summary` (overallStatus, resultCount, vehicleCount, etc.)

**Note:** New test runs automatically generate results in the new schema format. This script is only needed to convert legacy result files for historical analysis or comparison.

### 8. Run Regression Tests

Use the dedicated regression suite in `tests/regression.spec.ts` for bug-focused validation and repeated-run stability checks.

- Guide: `tests/regression.spec.md`
- Regression description template: `tests/regression.desciption.txt.example`
- Intermittency query template: `tests/data/intermittency-queries.example.json`

Examples:

```sh
# API-only full regression spec
npm run test:regression

# Only Smart Regression Evaluation (SRE)
TEST_MODE=api npx playwright test tests/regression.spec.ts --grep "Smart Regression Evaluation \(SRE\)"

# Only Intermittent Issues Check (IIC)
TEST_MODE=api npx playwright test tests/regression.spec.ts --grep "Intermittent Issues Check \(IIC\)"
```

Notes:

- `npm run test:regression` forces `TEST_MODE=api`.
- `SRE` reads `tests/regression.desciption.txt` and generates regression cases from that description.
- `IIC` reads `tests/data/intermittency-queries.json` and repeats each query 5 times to score consistency.
- For `IIC`, query data can also be seeded from generated query files created by running `tests/search.spec.ts`, such as `tests/data/generated-queries-sg-en-ncos.json`.
```

- Reads result files from the specified run folder, picks the latest run per test type, and writes only non-PASS results to `results/json/results-queries-by-test.json`.
- If no folder is provided, defaults to `results/json/2026-04-14_PREPROD`.

---

## Attach to Existing Browser (CDP)

You can run UI tests against an already-opened Chrome browser by attaching via the Chrome DevTools Protocol (CDP). This is useful for reusing a persistent profile or live-debugging in a visible session.

### Default: Clone default profile with incognito mode

The default `chrome:cdp` script clones your Default profile (preserving extensions/settings) and launches in incognito mode:

```sh
npm run chrome:cdp
```

Then run tests attached to that browser:

```sh
npm run test:cdp
# or UI-only
npm run test:cdp:ui-only
```

### Additional profile options

- **Use your real default profile (no incognito, requires quit):**
  ```sh
  npm run chrome:cdp:use-default
  ```

- **Use a specific profile path:**
  Set in `.env` (macOS example):
  ```properties
  CHROME_USER_DATA_DIR="$HOME/Library/Application Support/Google/Chrome"
  CHROME_PROFILE_DIR=Default
  ```
  Then launch:
  ```sh
  npm run chrome:cdp:profile
  ```

- **Clone default profile without incognito:**
  ```sh
  npm run chrome:cdp:clone-default
  ```

### Set the CDP URL

Add to `.env` (or export in your shell):

```properties
PLAYWRIGHT_CDP_URL=http://localhost:9222
# or
CDP_URL=http://localhost:9222
```

### Incognito context toggle (Playwright-side)

Force Playwright to use a fresh incognito context when attaching via CDP (in addition to the browser's incognito window):

```properties
PLAYWRIGHT_CDP_INCOGNITO=true
```

Notes:
- `npm run chrome:cdp` clones your default profile and launches in incognito mode (extensions/settings preserved in temp profile, incognito isolation).
- Incognito windows do not load extensions unless explicitly allowed in each extension's settings.
- Using `PLAYWRIGHT_CDP_INCOGNITO=true` creates an additional fresh incognito context in Playwright (independent of the browser's incognito window).
```

Notes:
- Quit Chrome before using your real profile (Options A/B) to avoid profile lock or data corruption.
- http basic auth via `httpCredentials` cannot be applied when attaching to a persistent context. Pre-authenticate in that profile or run without CDP for those tests.
- CDP attach affects UI execution; API calls run normally.
- Clear the temporary clone by removing `/tmp/chrome-dev-profile` if needed.

### 5. View Results

- Open the generated HTML file in your browser.

---

## Running Specific Test Suites

To run only the tests in the "AI Smart Search - Vehicles MB" suite:

```sh
npx playwright test tests/search.spec.ts -g "AI Smart Search - Vehicles MB"
```

This command will execute only the tests in that describe block.

### Running Specific Tests by Title

You can run individual tests by their title:

```sh
# Run only the "By Brand/Model" test
npx playwright test -g "By Brand/Model - Test MB-specific brand and model queries"

# Run only tests with "Filter Facets" in the title
npx playwright test -g "Filter Facets"

# Run multiple specific tests
npx playwright test -g "Edge Case|Random Topics"
```

### Test Scenarios

**SMART SEARCH Automation Test Suite**
Total: ~504 queries (excluding variable facet-based tests)

Breakdown Count by category:

Sanity (63 queries):
- By Fixed Query: 35 queries (fixed only)
- Recommendation Model: 28 queries (20 fixed + 8 AI)

Vehicles MB (114 queries + variable):
- By Filter Facets (complete): **Variable** (depends on API facets)
- By Filter Facets (Equipment): **Variable** (depends on equipment facets)
- By Filter Facets (AND/OR): **Variable** (5 fixed + AI depends on API facets)
- By Filter Facets (matrix): **Variable** (depends on generated facet matrix)
- By Brand/Model: 82 queries (2 fixed + 80 AI [10 random MB vehicles × 8 AI each])
- By Specs: 10 queries (2 fixed + 8 AI)
- No Brand/Model: 12 queries (2 fixed + 10 AI)
- Superlative: 10 queries (2 fixed + 8 AI)

Vehicles MB - Negative Facets (variable):
- By Filter Facets (bodyType)(-ve): **Variable**
- By Filter Facets (modelIdentifier)(-ve): **Variable**
- By Filter Facets (fuelType)(-ve): **Variable**
- By Filter Facets (motorization)(-ve): **Variable**
- By Filter Facets (color)(-ve): **Variable**
- By Filter Facets (upholstery)(-ve): **Variable**

Vehicles Non-MB (56 queries):
- By Brand/Model (Sentence|Single): 12 queries (2 fixed + 10 AI)
- By Brand/Model (Keyword|Single): 12 queries (2 fixed + 10 random vehicle combos)
- By Brand/Model (Keyword|Mix): 12 queries (2 fixed + 10 random vehicle combos)
- By Non-MB Features: 20 queries (fixed only)

Input Robustness (95 queries):
- Edge Case Queries: 17 queries (hardcoded)
- Random Numbers: 52 queries (fixed only)
- Misspelled/Fuzzy: 10 queries (3 fixed + 7 AI)
- Language/Localization: 10 queries (3 fixed + 7 AI)
- Unusual Units: 6 queries (fixed only)

Constraint Handling (56 queries):
- Date Range/Numeric: 10 queries (2 fixed + 8 AI)
- Negative/Contradictory: 10 queries (2 fixed + 8 AI)
- Conflicting Filter Facets: 13 queries (5 fixed + 8 AI)
- Conflicting Brands: 13 queries (5 fixed + 8 AI)
- No Results Scenario: 10 queries (2 fixed + 8 AI)

Conversational Behavior (55 queries):
- Multi-Intent: 6 queries (fixed only)
- Clarification: 6 queries (fixed only)
- Price Negotiation: 8 queries (fixed only)
- Sales: 20 queries (fixed only)
- Joke/Humor: 3 queries (fixed only)
- Repeat/Looping: 3 queries (fixed only)
- Brand Loyalty/Switching: 3 queries (fixed only)
- Accessibility Needs: 3 queries (fixed only)
- Environmental Concerns: 3 queries (fixed only)

Safety / Policy / Abuse (63 queries):
- Personal Data: 14 queries (6 fixed + 8 AI)
- NSFW: 13 queries (5 fixed + 8 AI)
- Code and Scripts: 13 queries (5 fixed + 8 AI)
- Bias and Manipulation: 13 queries (5 fixed + 8 AI)
- Random Topics: 10 queries (2 fixed + 8 AI)

Reliability (22 queries):
- Response Consistency: 22 queries (14 fixed + 8 AI)

---

## Customization

- **Add/Modify Queries:** Edit `search.spec.ts` to change or add test scenarios and queries.
- **Change Filters/Facets:** Update filter options in the relevant test blocks.
- **UI/Chart Enhancements:** Edit `generate-results-html.js` for custom UI or chart features.

---

## Dependencies

- [Playwright](https://playwright.dev/)
- [OpenAI Node SDK](https://github.com/openai/openai-node)
- [dotenv](https://github.com/motdotla/dotenv)
- [Bootstrap](https://getbootstrap.com/)
- [Chart.js](https://www.chartjs.org/)

---


## Environment

- Requires Node.js (v18+ recommended).
- Set your OpenAI API key in `.env` or environment variable `NEXUS_API_KEY`.
- Other environment variables in `.env` control test context and credentials.

---

## Extending

- Add new test scenarios in `search.spec.ts`.
- Enhance HTML reporting in `generate-results-html.js`.
- Integrate with CI/CD for automated nightly runs and reporting.

---

## License

ISC (see `package.json`).

---

## Authors

- Project owner: (see `package.json`)
- Contributors: (add as needed)

---

## Support

For issues or feature requests, please contact the project owner or open an issue in your repository.

---


---

## Environment Variable Reference

| Variable           | Description                                 |
|--------------------|---------------------------------------------|
| ENVIRONMENT        | PREPROD, INT, DEV, PROD (server environment)|
| COUNTRY            | Country code (e.g., KR, AU, BR, etc.)       |
| PRODUCT            | NCOS (new car), UCOS (used car)             |
| AEM_USER_PREPROD   | Username for PREPROD server                 |
| AEM_PASS_PREPROD   | Password for PREPROD server                 |
| AEM_USER_INT       | Username for INT server                     |
| AEM_PASS_INT       | Password for INT server                     |
| NEXUS_API_KEY     | OpenAI API key                              |

---


## Using Chrome DevTools Protocol (CDP) with Playwright

You can run Playwright UI tests by attaching to an already running Chrome browser using the Chrome DevTools Protocol (CDP). This is useful for debugging, using a persistent browser profile, or running tests in a visible session.

### 1. Start Chrome with Remote Debugging


Start Chrome with the remote debugging port enabled (default is 9222):

**On macOS:**

```sh
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

Or (recommended, avoids escaping issues):

```sh
open -a "Google Chrome" --args --remote-debugging-port=9222
```

If you see `no such file or directory`, make sure Google Chrome is installed in your `/Applications` folder. You can also check the path by running:

```sh
ls /Applications/Google\ Chrome.app/Contents/MacOS/
```

**On Windows or Linux:**

```sh
chrome --remote-debugging-port=9222
```

Or use the provided npm script to launch Chrome with a cloned profile in incognito mode:

```sh
npm run chrome:cdp
```

### 2. Set the CDP URL

Add the following to your `.env` file (or export in your shell):

```properties
PLAYWRIGHT_CDP_URL=http://localhost:9222
# or
CDP_URL=http://localhost:9222
```

Optionally, to force Playwright to use a fresh incognito context when attaching via CDP, set:

```properties
PLAYWRIGHT_CDP_INCOGNITO=true
```

### 3. Run Tests Using CDP

Run tests with the CDP-attached browser:

```sh
npm run test:cdp
# or for UI-only
npm run test:cdp:ui-only
```

You can also use Playwright's CLI directly:

```sh
npx playwright test --project=cdp
```

### Notes
- When attaching to a persistent browser, HTTP basic auth via `httpCredentials` cannot be applied. Pre-authenticate in your profile if needed.
- Incognito windows do not load extensions unless allowed in extension settings.
- Remove `/tmp/chrome-dev-profile` to clear the temporary cloned profile if needed.
- CDP attach only affects UI tests; API tests run as usual.

---

## Example Command Line Usage

Run with custom options for a single test run:

```sh
ENVIRONMENT=INT COUNTRY=TR PRODUCT=NCOS TEST_MODE=api npx playwright test -g "AI Smart Search - Sanity"
```

---

## Maintenance

### Cleaning Old Test Results

Test results can accumulate over time. Use the cleanup script to keep only recent results:

```sh
./clean-old-results.sh
```

This script:
- Keeps the 5 most recent HTML reports
- Keeps the 10 most recent JSON result files
- Removes older files to save disk space

### Updating Facets

The "By Filter Facets (complete)" test dynamically fetches facets from the API based on environment settings. If you need to update the fallback facet files:

1. Run a search query in your target environment
2. Save the API response to `tests/data/search-api-response-<env>.json`
3. Update `tests/utils/facetToJson.js` with the correct paths
4. Run the conversion:
   ```sh
   node tests/utils/facetToJson.js
   ```
5. Move the generated facets file to `tests/data/`

### Git Best Practices

The `.gitignore` file is configured to exclude:
- Test results (`results/`, `test-results/`)
- Playwright cache (`.playwright-cache/`, `.playwright-tmp/`)
- Environment files (`.env`)
- System files (`.DS_Store`)
- Dependencies (`node_modules/`)

Always commit:
- Source code (`tests/`)
- Configuration files (`playwright.config.ts`, `package.json`, etc.)
- Example environment file (`.env.example`)
- Data files (`tests/data/`)

---

This documentation provides a complete overview for developers, QA engineers, and stakeholders to understand, run, and extend the AI Smart Search test automation and reporting system.

---

## Fixed Query Template Guide

Fixed queries are defined in `tests/data/fixed-queries-*.json` under the `"byFixedQuery"` array. Each entry follows this template:

```json
{
  "value": "your search query",
  "shouldRecommend": true,
  "shouldFilter": {},
  "aiEvaluationHints": {
    "value": [
      "Evaluation instruction line 1.",
      "Evaluation instruction line 2."
    ],
    "overwrite": true
  }
}
```

### Fields

#### `value` *(string)*
The search query that will be sent to the AI Smart Search.

```json
"value": "show me sedans"
```

---

#### `shouldRecommend` *(boolean)*
Whether the AI is expected to present vehicle recommendations.

| Value | Meaning |
|-------|---------|
| `true` | The AI should return vehicle listings |
| `false` | The AI should decline, redirect, or acknowledge a limitation — not present vehicles directly |

---

#### `shouldFilter` *(object \| boolean)*
Declares the expected backend filter facets applied by the AI. Supports these modes:

| Value | Meaning |
|-------|---------|
| `{}` (empty object) | No specific filter expected (e.g. unsupported attribute, no-match fallback) |
| object with `include` / `exclude` | Expected filter rules to be applied |
| `false` | Assert that **no filters at all** were applied |
| `true` | Assert that **at least one filter** was applied (any) |

When using object mode, use this structure:

```json
"shouldFilter": {
  "include": [
    {
      "bodyType": ["LIMOUSINE"]
    }
  ],
  "exclude": [],
  "strict": false
}
```

- `include`: Facets that must be applied.
- `exclude`: Facets that must be excluded from results.
- `strict`: If `true`, expect tight matching to the declared facets. If `false`, allow non-facet fallback behavior while still preferring the declared facets.

Matching semantics:
- `include` is cumulative (`AND`) across all objects, keys, and listed values.
- `exclude` is cumulative (`AND`) across all objects and keys: any listed excluded value causes failure.
- If an `exclude` key is provided with an empty value list, the facet key itself must be absent.

**Common filter keys used inside `include` / `exclude`:**

| Key | Example values |
|-----|---------------|
| `bodyType` | `"LIMOUSINE"`, `"SUV_OFFROADER"`, `"COUPE"`, `"HATCHBACK"`, `"CABRIO_ROADSTER"`, `"STATION"`, `"PEOPLE_CARRIER"` |
| `fuelType` | `"ELECTRIC"`, `"PETROL"`, `"DIESEL"`, `"HYBRID_PETROL"` |
| `color` | `"PAINT_COLOR_WHITE"`, `"PAINT_COLOR_BLACK"`, `"PAINT_COLOR_SILVER"` |
| `brand` | `"Mercedes-Benz"`, `"Mercedes-AMG"` |
| `modelIdentifier` | `"CLA"`, `"GLC"`, `"EQS"`, `"EQA"` |
| `motorization` | `"CLA 45 S 4MATIC+"`, `"EQA 250+"` |
| `stockType` | `"AVAILABLE"`, `"IN_PIPELINE"` |
| `price` | `{ "min": 0, "max": 10000000 }` |

**Examples:**

```json
"shouldFilter": {
  "include": [
    {
      "bodyType": ["SUV_OFFROADER"]
    },
    {
      "fuelType": ["ELECTRIC"]
    }
  ],
  "exclude": [],
  "strict": true
}
```

```json
"shouldFilter": {
  "include": [
    {
      "modelIdentifier": ["CLA"]
    }
  ],
  "exclude": [],
  "strict": false
}
```

```json
"shouldFilter": {
  "include": [
    {
      "bodyType": ["LIMOUSINE"]
    }
  ],
  "exclude": [],
  "strict": true
}
```
```json
"shouldFilter": {
  "include": [
    {
      "bodyType": ["SUV_OFFROADER"],
      "color": ["PAINT_COLOR_BLACK"]
    }
  ],
  "exclude": [],
  "strict": true
}
```
```json
"shouldFilter": {
  "include": [],
  "exclude": [
    {
      "fuelType": ["DIESEL", "HYBRID"]
    }
  ],
  "strict": false
}
```
```json
"shouldFilter": false
```
```json
"shouldFilter": true
```
```json
"shouldFilter": {}
```

---

#### `aiEvaluationHints` *(object)*
Instructions passed to the OpenAI evaluator to determine PASS/FAIL. Always use `"overwrite": true` so these hints replace the default evaluation rules for this query.

```json
"aiEvaluationHints": {
  "value": [
    "Respond ONLY with: 'PASS' if ...",
    "FAIL if ..."
  ],
  "overwrite": true
}
```

**Writing good hints:**
- Start with a clear `PASS` condition on the first line.
- Add `FAIL` conditions on subsequent lines.
- Use `Do NOT fail if ...` to prevent false negatives for known edge cases (e.g. inventory variation, missing UI labels).
- Keep each hint to one clear, testable condition.

---

### Full Examples

**Filter by body type:**
```json
{
  "value": "show me sedans",
  "shouldRecommend": true,
  "shouldFilter": {
    "include": [
      {
        "bodyType": ["LIMOUSINE"]
      }
    ],
    "exclude": [],
    "strict": true
  },
  "aiEvaluationHints": {
    "value": [
      "Respond ONLY with: 'PASS' if the response presents sedan/Limousine body-type vehicles.",
      "Do NOT fail if the exact vehicle count varies — pass as long as the Limousine/sedan filter is applied."
    ],
    "overwrite": true
  }
}
```

**No filter expected (unsupported attribute):**
```json
{
  "value": "find cars with advanced safety features",
  "shouldRecommend": false,
  "shouldFilter": {},
  "aiEvaluationHints": {
    "value": [
      "Respond ONLY with: 'PASS' if the response acknowledges that filtering by safety features is not directly supported and presents general vehicle listings.",
      "Do NOT fail if no specific safety filter is applied — this is not a filterable attribute."
    ],
    "overwrite": true
  }
}
```

**Assert no filters applied:**
```json
{
  "value": "i dont like mercedes-benz",
  "shouldRecommend": true,
  "shouldFilter": false,
  "aiEvaluationHints": {
    "value": [
      "Respond ONLY with: 'PASS' if the response presents general Mercedes-Benz vehicle options without applying any specific filter.",
      "FAIL if the response refuses to show vehicles or applies unrelated filters."
    ],
    "overwrite": true
  }
}
```

**Assert at least one filter applied:**
```json
{
  "value": "recommend something for me",
  "shouldRecommend": true,
  "shouldFilter": true,
  "aiEvaluationHints": {
    "value": [
      "Respond ONLY with: 'PASS' if the response provides a specific vehicle recommendation with at least one filter applied.",
      "FAIL if the response shows a completely unfiltered result set without any recommendation logic."
    ],
    "overwrite": true
  }
}
```

**Decline request (out-of-scope):**
```json
{
  "value": "who are the best car manufacturers?",
  "shouldRecommend": false,
  "shouldFilter": {},
  "aiEvaluationHints": {
    "value": [
      "Respond ONLY with: 'PASS' if the response declines to rank or compare car manufacturers and redirects the user to Mercedes-Benz vehicle information or recommendations.",
      "FAIL if the response directly ranks or lists car manufacturers without first declining the out-of-scope request."
    ],
    "overwrite": true
  }
}
```
