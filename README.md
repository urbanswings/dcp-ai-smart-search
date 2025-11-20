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
├── clean-old-results.sh           # Script to clean old test results
├── tests/
│   ├── search.spec.ts             # Main test suite
│   ├── zephyr_scale_import.csv    # Zephyr Scale test case export
│   ├── utils/
│   │   ├── testHelpers.ts         # UI test helper functions
│   │   ├── apiHelpers.ts          # API test helper functions
│   │   ├── shared.ts              # Shared utilities
│   │   ├── facetToJson.js         # Facet conversion utility
│   │   ├── facets-ncos.json       # NCOS facets (example)
│   │   └── search-api-response-ncos.json  # NCOS API response (example)
│   └── data/
│       ├── dcp-urls.json          # DCP environment URLs
│       ├── emh-urls.json          # EMH environment URLs
│       ├── facets-kr-ucos-dcp.json  # KR UCOS DCP facets
│       ├── search-api-response-kr-ucos-dcp.json  # KR UCOS API response
│       └── search-queries.json     # Non-MB brand/model queries
├── results/                       # Test results (gitignored)
│   ├── json/                      # JSON result files
│   └── html/                      # HTML reports
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
- Node.js script to aggregate all JSON result files from `results/json/`.
- Generates a timestamped, interactive HTML report in `results/html/`.
- Features: Bootstrap UI, sticky headers, dropdown filters, search, export to CSV, horizontal bar charts (Chart.js), pass/fail percentages.

### 5. `tests/utils/facetToJson.js`
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


## Usage

### 1. Install Dependencies

```sh
npm install
```

### 2. Configure Environment

Edit `.env` to set your test context:

```properties
ENVIRONMENT=PREPROD   # Options: PREPROD, INT, DEV, PROD
COUNTRY=KR            # Country code, e.g., KR, AU, BR, etc.
PRODUCT=NCOS          # NCOS for new cars, UCOS for used cars
AEM_USER_PREPROD=your-username
AEM_PASS_PREPROD=your-password
AEM_USER_INT=your-username
AEM_PASS_INT=your-password
OPENAI_API_KEY=your-openai-key
```

### 3. Run Tests

```sh
npx playwright test
```

Or override environment variables for a single run:

```sh
ENVIRONMENT=INT COUNTRY=JP PRODUCT=UCOS npx playwright test
```

### 4. Generate HTML Report

```sh
node generate-results-html.js
```

- Output: `results/html/search-results-all-<timestamp>.html`

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

All 16 test scenarios are tagged with both `@ui` and `@api`:

**Vehicles MB (5 tests):**
1. By Brand/Model - Test MB-specific brand and model queries
2. By Specs - Test specification-based queries without brand/model
3. By Filter Facets (random)
4. By Filter Facets (complete)
5. No Brand/Model

**Vehicles Non-MB (3 tests):**
6. By Brand/Model (Sentence|Single)
7. By Brand/Model (Keyword|Mix)
8. By Brand/Model (Keyword|Single)

**Other Scenarios (8 tests):**
9. Random Topics
10. Edge Case Queries
11. Negative/Contradictory Queries
12. Language/Localization
13. Misspelled/Fuzzy Queries
14. By Filter Facets (Date Range/Numeric Filters)
15. No Results Scenario
16. AI Response Consistency

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
- Set your OpenAI API key in `.env` or environment variable `OPENAI_API_KEY`.
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
| OPENAI_API_KEY     | OpenAI API key                              |

---

## Example Command Line Usage

Run with custom environment for a single test run:

```sh
ENVIRONMENT=INT COUNTRY=JP PRODUCT=UCOS npx playwright test
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
