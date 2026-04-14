/**
 * generate-results-by-test.js
 *
 * Reads all result JSON files from a given RESULTS_DIR,
 * picks the latest run per test type, filters for non-PASS results,
 * and outputs a structured file matching the queries-by-test.json schema.
 *
 * Usage:
 *   node generate-results-by-test.js [results-folder]
 *
 * Example:
 *   node generate-results-by-test.js results/json/2026-04-14_PREPROD
 *
 * Output:
 *   results/json/generate-results-json.json
 */

require('dotenv/config');
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = process.argv[2] || 'results/json/2026-04-14_PREPROD';
const QUERIES_FILE = 'tests/data/queries-by-test.json';
const OUT_FILE = 'results/json/generate-results-json.json';

// Map from testType filename segment → { group, title }
// Matches the testType values used in search.spec.ts runTestsAndSaveResults calls.
const TEST_TYPE_MAP = {
  'by-fixed-query':              { group: 'Sanity Test',        title: 'By Fixed Query' },
  'recommendation-model':        { group: 'Sanity Test',        title: 'Recommendation Model' },
  'sentence-by-brand-model':     { group: 'Vehicles MB',        title: 'By Brand/Model' },
  'buyer-sentence-by-specs':     { group: 'Vehicles MB',        title: 'By Specs' },
  'sentence-by-filter-options':  null, // shared — resolved by testTitle in records
  'by-filter-equipment':         { group: 'Vehicles MB',        title: "By Filter Facets ('Equipment')" },
  'sentence-generic':            { group: 'Vehicles MB',        title: 'No Brand/Model' },
  'sentence-single':             { group: 'Vehicles Non-MB',    title: 'By Brand/Model (Sentence|Single)' },
  'keyword-mix':                 { group: 'Vehicles Non-MB',    title: 'By Brand/Model (Keyword|Mix)' },
  'keyword-single':              { group: 'Vehicles Non-MB',    title: 'By Brand/Model (Keyword|Single)' },
  'non-mb-features':             { group: 'Vehicles Non-MB',    title: 'By Non-MB Features' },
  'sentence-nonrelated':         { group: 'Other Scenarios',    title: 'Random Topics' },
  'edge-cases':                  { group: 'Other Scenarios',    title: 'Edge Case Queries' },
  'negative-contradictory':      { group: 'Other Scenarios',    title: 'Negative/Contradictory Queries' },
  'localization':                { group: 'Other Scenarios',    title: 'Language/Localization' },
  'misspelled-fuzzy':            { group: 'Other Scenarios',    title: 'Misspelled/Fuzzy Queries' },
  'date-numeric':                { group: 'Other Scenarios',    title: 'Date Range/Numeric Filters' },
  'no-results':                  { group: 'Other Scenarios',    title: 'No Results Scenario' },
  'response-consistency':        { group: 'Other Scenarios',    title: 'Response Consistency' },
  'personal-data':               { group: 'Other Scenarios',    title: 'Personal Data' },
  'nsfw':                        { group: 'Other Scenarios',    title: 'NSFW' },
  'code-and-scripts':            { group: 'Other Scenarios',    title: 'Code and Scripts' },
  'bias-and-manipulation':       { group: 'Other Scenarios',    title: 'Bias and Manipulation' },
  'conflicting-filter-facets':   { group: 'Other Scenarios',    title: 'Conflicting Filter Facets' },
  'conflicting-brands':          { group: 'Other Scenarios',    title: 'Conflicting Brands' },
  'random-numbers':              { group: 'Other Scenarios',    title: 'Random Numbers' },
  'multi-intent':                { group: 'Special Scenarios',  title: 'Multi-Intent Queries' },
  'clarification':               { group: 'Special Scenarios',  title: 'Clarification Queries' },
  'price-negotiation':           { group: 'Special Scenarios',  title: 'Price Negotiation Queries' },
  'unusual-units':               { group: 'Special Scenarios',  title: 'Unusual Units Queries' },
  'joke-humor':                  { group: 'Special Scenarios',  title: 'Joke/Humor Queries' },
  'repeat-looping':              { group: 'Special Scenarios',  title: 'Repeat/Looping Queries' },
  'brand-loyalty-switching':     { group: 'Special Scenarios',  title: 'Brand Loyalty/Switching Queries' },
  'accessibility-needs':         { group: 'Special Scenarios',  title: 'Accessibility Needs Queries' },
  'environmental-concerns':      { group: 'Special Scenarios',  title: 'Environmental Concerns Queries' },
};

// sentence-by-filter-options is shared by "By Filter Facets (random)" and
// "By Filter Facets (complete)"; By Filter Facets (AND/OR) reuses negative-contradictory.
const FILTER_TITLE_TO_TYPE = {
  'By Filter Facets (random)':   'sentence-by-filter-options',
  'By Filter Facets (complete)': 'sentence-by-filter-options',
  'By Filter Facets (AND/OR)':   'negative-contradictory',
};

// Extract testType segment from filename
// e.g. AU_NCOS_search-results_multi-intent-ui_2026-04-14T06:03:38.088Z.json → multi-intent
function getTestTypeFromFilename(filename) {
  const m = filename.match(/search-results_(.+)-(?:ui|api)_\d{4}-/);
  return m ? m[1] : null;
}

// ── Load all files, group by testType, pick latest per testType ──────────────
const allFiles = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json'));

const byTestType = {};
for (const fname of allFiles) {
  const testType = getTestTypeFromFilename(fname);
  if (!testType) continue;
  if (!byTestType[testType]) byTestType[testType] = [];
  byTestType[testType].push(fname);
}

// ISO timestamps in filenames sort lexicographically — take last after sort
const latestByTestType = {};
for (const [testType, files] of Object.entries(byTestType)) {
  const sorted = [...files].sort();
  latestByTestType[testType] = sorted[sorted.length - 1];
}

console.log('Latest files selected per testType:');
Object.entries(latestByTestType).forEach(([t, f]) => console.log('  ' + t + ' → ' + f));

// ── Load queries-by-test.json ─────────────────────────────────────────────────
const queriesByTest = JSON.parse(fs.readFileSync(QUERIES_FILE, 'utf-8'));

// ── Build output ──────────────────────────────────────────────────────────────
const output = {};

for (const [group, tests] of Object.entries(queriesByTest)) {
  output[group] = {};

  for (const [testTitle, v] of Object.entries(tests)) {
    // Skip pool arrays (MB/non-MB vehicle lists)
    if (Array.isArray(v)) continue;

    let nonPassResults = [];

    const filterType = FILTER_TITLE_TO_TYPE[testTitle];
    if (filterType) {
      // Shared testType — filter records by testTitle
      const latestFile = latestByTestType[filterType];
      if (latestFile) {
        const records = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, latestFile), 'utf-8'));
        nonPassResults = records.filter(r =>
          r.testTitle === testTitle && r.openaiEvaluation !== 'PASS'
        );
      }
    } else {
      // Find all testTypes mapping to this group + title
      const matchingTypes = Object.entries(TEST_TYPE_MAP)
        .filter(([, meta]) => meta && meta.group === group && meta.title === testTitle)
        .map(([testType]) => testType);

      for (const testType of matchingTypes) {
        const latestFile = latestByTestType[testType];
        if (!latestFile) continue;
        const records = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, latestFile), 'utf-8'));
        nonPassResults.push(...records.filter(r => r.openaiEvaluation !== 'PASS'));
      }
    }

    output[group][testTitle] = {
      total_fixed: v.total_fixed,
      total_ai: v.total_ai,
      non_pass_count: nonPassResults.length,
      non_pass_results: nonPassResults.map(r => ({
        query: r.query?.en ?? r.query,
        response: r.response?.en ?? r.response,
        evaluation: r.openaiEvaluation,
        timestamp: r.timestamp,
        hasError: r.hasError,
        screenshotPath: r.screenshotPath ?? null,
      })),
    };
  }
}

fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
console.log('\nWritten:', OUT_FILE);

// ── Print summary ─────────────────────────────────────────────────────────────
let totalNonPass = 0;
Object.entries(output).forEach(([group, tests]) => {
  const groupNonPass = Object.values(tests).reduce((s, v) => s + (v.non_pass_count || 0), 0);
  if (groupNonPass > 0) {
    console.log('\n' + group + ' (' + groupNonPass + ' non-pass):');
    Object.entries(tests).forEach(([title, v]) => {
      if (v.non_pass_count > 0) {
        console.log('  ' + title + ': ' + v.non_pass_count);
      }
    });
  }
  totalNonPass += groupNonPass;
});
console.log('\nTOTAL non-pass:', totalNonPass);
