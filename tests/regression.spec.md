# Regression Test Usage Guide

This file explains how to use the two tests defined in `tests/regression.spec.ts`:

- `Smart Regression Evaluation (SRE)`
- `Intermittent Issues Check (IIC)`

## What Each Test Does

### Smart Regression Evaluation (SRE)

`SRE` is used to validate a known regression scenario from a plain-text bug description.

How it works:

1. Reads the scenario from `tests/regression.desciption.txt`.
2. Fetches the EMH GraphQL facet catalog during `beforeAll` and writes it to `tests/data/emh-api-response.json`.
3. Uses AI to generate regression queries from the description.
4. Saves the generated test cases to `tests/data/regression.testdata.json`.
5. Executes the generated queries against UI, API, or both, depending on `TEST_MODE`.
6. Writes result JSON under `results/json/...`.
7. Appends AI analysis and run findings back into `tests/regression.desciption.txt`.
8. Saves the summarized run result to `tests/data/regression.run-summary.json`.

Use `SRE` when you want to validate whether a specific bug or search behavior has been fixed.

### Intermittent Issues Check (IIC)

`IIC` is used to detect unstable or inconsistent responses for a fixed list of queries.

How it works:

1. Loads queries from `tests/data/intermittency-queries.json`.
2. Repeats each query 5 times.
3. Compares responses and facets across repeated runs.
4. Computes a consistency rating for each query.
5. Writes the flattened run results to `results/json/...`.

Use `IIC` when you want to check whether the same query produces different answers or different facets over repeated runs.

## Prerequisites

1. Install dependencies:

```bash
npm install
```

2. Ensure your `.env` contains the environment values required by the test helpers and AI/API integrations.

3. If you want browser-based execution, use the default Playwright browser or connect Chrome over CDP.

Optional CDP flow:

```bash
npm run chrome:cdp
```

Then run tests with `PLAYWRIGHT_CDP_URL=http://localhost:9222`.

## Inputs You Need To Maintain

### For SRE

Edit `tests/regression.desciption.txt` with the regression scenario you want to validate.

Starter template:

- `tests/regression.desciption.txt.example`

Recommended content:

- Original query or user wording
- Expected recommendation behavior
- Expected filters or facets
- Observed wrong behavior
- Scope notes such as languages, colors, body types, or model classes to cover

### For IIC

Edit `tests/data/intermittency-queries.json`.

Starter template:

- `tests/data/intermittency-queries.example.json`

You can also source IIC data from the generated query files produced by executing `tests/search.spec.ts`.

Typical filename pattern:

- `tests/data/generated-queries-<country>-<language>-ncos.json`

Example:

- `tests/data/generated-queries-sg-en-ncos.json`

If you use generated queries as the source, copy the relevant entries from that file into `tests/data/intermittency-queries.json`. This is useful when you want IIC to repeatedly validate already generated facet/filter query coverage.

Supported formats:

```json
[
  "black suv",
  {
    "value": "Beige/Black upholstery",
    "shouldRecommend": true
  }
]
```

## How To Run

### Run the entire regression spec in API mode

This project already has a script for that:

```bash
npm run test:regression
```

Important: this script forces `TEST_MODE=api`, so it does not run UI checks.

### Run only SRE

API only:

```bash
TEST_MODE=api npx playwright test tests/regression.spec.ts --grep "Smart Regression Evaluation \(SRE\)"
```

UI only:

```bash
TEST_MODE=ui npx playwright test tests/regression.spec.ts --grep "Smart Regression Evaluation \(SRE\)"
```

UI + API:

```bash
TEST_MODE=both npx playwright test tests/regression.spec.ts --grep "Smart Regression Evaluation \(SRE\)"
```

### Run only IIC

API only:

```bash
TEST_MODE=api npx playwright test tests/regression.spec.ts --grep "Intermittent Issues Check \(IIC\)"
```

UI only:

```bash
TEST_MODE=ui npx playwright test tests/regression.spec.ts --grep "Intermittent Issues Check \(IIC\)"
```

UI + API:

```bash
TEST_MODE=both npx playwright test tests/regression.spec.ts --grep "Intermittent Issues Check \(IIC\)"
```

### Run the spec through a shared Chrome session

```bash
PLAYWRIGHT_CDP_URL=http://localhost:9222 TEST_MODE=both npx playwright test tests/regression.spec.ts
```

## Output Files

### SRE outputs

- `tests/data/emh-api-response.json`
- `tests/data/regression.testdata.json`
- `tests/data/regression.run-summary.json`
- `results/json/<date_env>/...smart-regression-evaluation-...json`
- `results/screenshots/...` for UI runs

Also updated in place:

- `tests/regression.desciption.txt`

### IIC outputs

- `results/json/<date_env>/...intermittency-check-...json`

If UI mode is enabled, the individual UI/API entries also include consistency ratings in the saved JSON.

## When To Use Which Test

- Use `SRE` for validating a specific bug fix or regression scenario from a written description.
- Use `IIC` for proving instability, nondeterminism, or inconsistent filtering/answers across repeated runs.

## Common Workflow

### Validate a new regression bug

1. Update `tests/regression.desciption.txt`.
2. Run `SRE` in API mode first for a faster pass.
3. If needed, rerun in UI mode or both.
4. Review `tests/data/regression.run-summary.json` and the latest JSON result file.

### Investigate flaky search behavior

1. Add the suspect queries to `tests/data/intermittency-queries.json`.
2. If useful, seed that file from generated queries created by running `tests/search.spec.ts`, for example `tests/data/generated-queries-sg-en-ncos.json`.
3. Run `IIC` in API mode or both.
4. Review the console consistency summary and saved result JSON.

## View The Report

After a run, generate or open the HTML report with:

```bash
npm run report
```

This opens the latest file from `results/html/`.