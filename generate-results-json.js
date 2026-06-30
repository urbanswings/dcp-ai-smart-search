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
  'by-fixed-query':              { group: 'Sanity',             title: 'By Fixed Query' },
  'recommendation-model':        { group: 'Sanity',             title: 'Recommendation Model' },
  'sanity_by-fixed-query':       { group: 'Sanity',             title: 'By Fixed Query' },
  'sanity_recommendation-model': { group: 'Sanity',             title: 'Recommendation Model' },
  'sanity_by-filter-facets-complete': { group: 'Sanity',        title: 'By Filter Facets (complete)' },
  'sanity-test_by-fixed-query':   { group: 'Sanity',            title: 'By Fixed Query' },
  'sanity-test_recommendation-model': { group: 'Sanity',        title: 'Recommendation Model' },
  'sanity-test_by-filter-facets-complete': { group: 'Sanity',   title: 'By Filter Facets (complete)' },
  'regression_smart-regression-evaluation-sre': { group: 'Regression', title: 'Smart Regression Evaluation (SRE)' },
  'regression_intermittent-issues-check-iic': { group: 'Regression', title: 'Intermittent Issues Check (IIC)' },
  'multi-country-evaluation':    { group: 'Regression',        title: 'Multi Country Evaluation (MCE)' },
  'multi-country-facet-evaluation': { group: 'Regression',     title: 'Multi Country Facet Evaluation (MCFE)' },
  'regression-tests_smart-regression-evaluation-sre': { group: 'Regression', title: 'Smart Regression Evaluation (SRE)' },
  'regression-tests_intermittent-issues-check-iic': { group: 'Regression', title: 'Intermittent Issues Check (IIC)' },
  'sentence-by-brand-model':     { group: 'Vehicles MB',        title: 'By Brand/Model' },
  'buyer-sentence-by-specs':     { group: 'Vehicles MB',        title: 'By Specs' },
  'sentence-by-filter-options':  null, // shared — resolved by testTitle in records
  'by-filter-equipment':         { group: 'Vehicles MB',        title: "By Filter Facets ('Equipment')" },
  'sentence-generic':            { group: 'Vehicles MB',        title: 'No Brand/Model' },
  'vehicles-mb_by-filter-facets-bodytype': { group: 'Vehicles MB', title: "By Filter Facets ('bodyType')" },
  'vehicles-mb_by-filter-facets-modelidentifier': { group: 'Vehicles MB', title: "By Filter Facets ('modelIdentifier')" },
  'vehicles-mb_by-filter-facets-fueltype': { group: 'Vehicles MB', title: "By Filter Facets ('fuelType')" },
  'vehicles-mb_by-filter-facets-motorization': { group: 'Vehicles MB', title: "By Filter Facets ('motorization')" },
  'vehicles-mb_by-filter-facets-price': { group: 'Vehicles MB', title: "By Filter Facets ('price')" },
  'vehicles-mb_by-filter-facets-mileage': { group: 'Vehicles MB', title: "By Filter Facets ('mileage')" },
  'vehicles-mb_by-filter-facets-enginepowerhp': { group: 'Vehicles MB', title: "By Filter Facets ('enginePowerHP')" },
  'vehicles-mb_by-filter-facets-enginepowerkw': { group: 'Vehicles MB', title: "By Filter Facets ('enginePowerKW')" },
  'vehicles-mb_by-filter-facets-color': { group: 'Vehicles MB', title: "By Filter Facets ('color')" },
  'vehicles-mb_by-filter-facets-colorpolish': { group: 'Vehicles MB', title: "By Filter Facets ('colorPolish')" },
  'vehicles-mb_by-filter-facets-upholstery': { group: 'Vehicles MB', title: "By Filter Facets ('upholstery')" },
  'vehicles-mb_by-filter-facets-upholsterypolish': { group: 'Vehicles MB', title: "By Filter Facets ('upholsteryPolish')" },
  'vehicles-mb_by-filter-facets-packages': { group: 'Vehicles MB', title: "By Filter Facets ('packages')" },
  'vehicles-mb_by-filter-facets-lines': { group: 'Vehicles MB', title: "By Filter Facets ('lines')" },
  'vehicles-mb_by-filter-facets-equipment': { group: 'Vehicles MB', title: "By Filter Facets ('equipment')" },
  'vehicles-mb_by-filter-facets-campaigns': { group: 'Vehicles MB', title: "By Filter Facets ('campaigns')" },
  'vehicles-mb_by-filter-facets-and-or': { group: 'Vehicles MB', title: 'By Filter Facets (AND/OR)' },
  'vehicles-mb_by-filter-facets-punctuated': { group: 'Vehicles MB', title: 'By Filter Facets (punctuated)' },
  'vehicles-mb_by-filter-facets-unavailable-available': { group: 'Vehicles MB', title: 'By Filter Facets (unavailable + available)' },
  'vehicles-mb_by-filter-facets-matrix': { group: 'Vehicles MB', title: 'By Filter Facets (matrix)' },
  'vehicles-mb_by-brand-model':  { group: 'Vehicles MB',        title: 'By Brand/Model' },
  'vehicles-mb_by-specs':        { group: 'Vehicles MB',        title: 'By Specs' },
  'vehicles-mb_no-brand-model':  { group: 'Vehicles MB',        title: 'No Brand/Model' },
  'vehicles-mb_superlative':     { group: 'Vehicles MB',        title: 'Superlative' },
  'vehicles-mb-range-facets_by-filter-facets-price': { group: 'Vehicles MB - Range Facets', title: "By Filter Facets ('price')" },
  'vehicles-mb-range-facets_by-filter-facets-monthlyrate': { group: 'Vehicles MB - Range Facets', title: "By Filter Facets ('monthlyRate')" },
  'vehicles-mb-range-facets_by-filter-facets-mileage': { group: 'Vehicles MB - Range Facets', title: "By Filter Facets ('mileage')" },
  'vehicles-mb-range-facets_by-filter-facets-enginepowerhp': { group: 'Vehicles MB - Range Facets', title: "By Filter Facets ('enginePowerHP')" },
  'vehicles-mb-range-facets_by-filter-facets-enginepowerkw': { group: 'Vehicles MB - Range Facets', title: "By Filter Facets ('enginePowerKW')" },
  'vehicles-mb-range-facets_by-filter-facets-modelyear': { group: 'Vehicles MB - Range Facets', title: "By Filter Facets ('modelYear')" },
  'vehicles-mb-negative-facets_by-filter-facets-bodytype-ve': { group: 'Vehicles MB - Negative Facets', title: "By Filter Facets ('bodyType')(-ve)" },
  'vehicles-mb-negative-facets_by-filter-facets-modelidentifier-ve': { group: 'Vehicles MB - Negative Facets', title: "By Filter Facets ('modelIdentifier')(-ve)" },
  'vehicles-mb-negative-facets_by-filter-facets-fueltype-ve': { group: 'Vehicles MB - Negative Facets', title: "By Filter Facets ('fuelType')(-ve)" },
  'vehicles-mb-negative-facets_by-filter-facets-motorization-ve': { group: 'Vehicles MB - Negative Facets', title: "By Filter Facets ('motorization')(-ve)" },
  'vehicles-mb-negative-facets_by-filter-facets-color-ve': { group: 'Vehicles MB - Negative Facets', title: "By Filter Facets ('color')(-ve)" },
  'vehicles-mb-negative-facets_by-filter-facets-upholstery-ve': { group: 'Vehicles MB - Negative Facets', title: "By Filter Facets ('upholstery')(-ve)" },
  'vehicles-mb-ve_by-filter-facets-bodytype-ve': { group: 'Vehicles MB - Negative Facets', title: "By Filter Facets ('bodyType')(-ve)" },
  'vehicles-mb-ve_by-filter-facets-modelidentifier-ve': { group: 'Vehicles MB - Negative Facets', title: "By Filter Facets ('modelIdentifier')(-ve)" },
  'vehicles-mb-ve_by-filter-facets-fueltype-ve': { group: 'Vehicles MB - Negative Facets', title: "By Filter Facets ('fuelType')(-ve)" },
  'vehicles-mb-ve_by-filter-facets-motorization-ve': { group: 'Vehicles MB - Negative Facets', title: "By Filter Facets ('motorization')(-ve)" },
  'vehicles-mb-ve_by-filter-facets-color-ve': { group: 'Vehicles MB - Negative Facets', title: "By Filter Facets ('color')(-ve)" },
  'vehicles-mb-ve_by-filter-facets-upholstery-ve': { group: 'Vehicles MB - Negative Facets', title: "By Filter Facets ('upholstery')(-ve)" },
  'sentence-single':             { group: 'Vehicles Non-MB',    title: 'By Brand/Model (Sentence|Single)' },
  'keyword-mix':                 { group: 'Vehicles Non-MB',    title: 'By Brand/Model (Keyword|Mix)' },
  'keyword-single':              { group: 'Vehicles Non-MB',    title: 'By Brand/Model (Keyword|Single)' },
  'non-mb-features':             { group: 'Vehicles Non-MB',    title: 'By Non-MB Features' },
  'vehicles-non-mb_by-brand-model-sentence-single': { group: 'Vehicles Non-MB', title: 'By Brand/Model (Sentence|Single)' },
  'vehicles-non-mb_by-brand-model-keyword-single': { group: 'Vehicles Non-MB', title: 'By Brand/Model (Keyword|Single)' },
  'vehicles-non-mb_by-brand-model-keyword-mix': { group: 'Vehicles Non-MB', title: 'By Brand/Model (Keyword|Mix)' },
  'vehicles-non-mb_by-non-mb-features': { group: 'Vehicles Non-MB', title: 'By Non-MB Features' },
  'input-robustness_edge-case-queries':                  { group: 'Input Robustness',          title: 'Edge Case Queries' },
  'input-robustness_random-numbers':                     { group: 'Input Robustness',          title: 'Random Numbers' },
  'input-robustness_misspelled-fuzzy-queries':           { group: 'Input Robustness',          title: 'Misspelled/Fuzzy Queries' },
  'input-robustness_language-localization':              { group: 'Input Robustness',          title: 'Language/Localization' },
  'input-robustness_unusual-units-queries':              { group: 'Input Robustness',          title: 'Unusual Units Queries' },
  'constraint-handling_date-range-numeric-filters':      { group: 'Constraint Handling',       title: 'Date Range/Numeric Filters' },
  'constraint-handling_numeric-unit-variations':         { group: 'Constraint Handling',       title: 'Numeric Unit Variations' },
  'constraint-handling_negative-contradictory-queries':  { group: 'Constraint Handling',       title: 'Negative/Contradictory Queries' },
  'constraint-handling_conflicting-filter-facets':       { group: 'Constraint Handling',       title: 'Conflicting Filter Facets' },
  'constraint-handling_conflicting-brands':              { group: 'Constraint Handling',       title: 'Conflicting Brands' },
  'constraint-handling_no-results-scenario':             { group: 'Constraint Handling',       title: 'No Results Scenario' },
  'conversational-behavior_multi-intent-queries':        { group: 'Conversational Behavior',   title: 'Multi-Intent Queries' },
  'conversational-behavior_clarification-queries':       { group: 'Conversational Behavior',   title: 'Clarification Queries' },
  'conversational-behavior_price-negotiation-queries':   { group: 'Conversational Behavior',   title: 'Price Negotiation Queries' },
  'conversational-behavior_sales':                       { group: 'Conversational Behavior',   title: 'Sales' },
  'conversational-behavior_joke-humor-queries':          { group: 'Conversational Behavior',   title: 'Joke/Humor Queries' },
  'conversational-behavior_repeat-looping-queries':      { group: 'Conversational Behavior',   title: 'Repeat/Looping Queries' },
  'conversational-behavior_brand-loyalty-switching-queries': { group: 'Conversational Behavior', title: 'Brand Loyalty/Switching Queries' },
  'conversational-behavior_accessibility-needs-queries': { group: 'Conversational Behavior',   title: 'Accessibility Needs Queries' },
  'conversational-behavior_environmental-concerns-queries': { group: 'Conversational Behavior', title: 'Environmental Concerns Queries' },
  'safety-policy-abuse_personal-data':                   { group: 'Safety / Policy / Abuse',  title: 'Personal Data' },
  'safety-policy-abuse_nsfw':                            { group: 'Safety / Policy / Abuse',  title: 'NSFW' },
  'safety-policy-abuse_code-and-scripts':                { group: 'Safety / Policy / Abuse',  title: 'Code and Scripts' },
  'safety-policy-abuse_bias-and-manipulation':           { group: 'Safety / Policy / Abuse',  title: 'Bias and Manipulation' },
  'safety-policy-abuse_random-topics':                   { group: 'Safety / Policy / Abuse',  title: 'Random Topics' },
  'reliability_response-consistency':                    { group: 'Reliability',              title: 'Response Consistency' },

  // Legacy filename segments from earlier Other/Special scenario grouping.
  'sentence-nonrelated':         { group: 'Safety / Policy / Abuse',  title: 'Random Topics' },
  'edge-cases':                  { group: 'Input Robustness',         title: 'Edge Case Queries' },
  'negative-contradictory':      { group: 'Constraint Handling',      title: 'Negative/Contradictory Queries' },
  'localization':                { group: 'Input Robustness',         title: 'Language/Localization' },
  'misspelled-fuzzy':            { group: 'Input Robustness',         title: 'Misspelled/Fuzzy Queries' },
  'date-numeric':                { group: 'Constraint Handling',      title: 'Date Range/Numeric Filters' },
  'numeric-unit-variations':     { group: 'Constraint Handling',      title: 'Numeric Unit Variations' },
  'no-results':                  { group: 'Constraint Handling',      title: 'No Results Scenario' },
  'response-consistency':        { group: 'Reliability',              title: 'Response Consistency' },
  'personal-data':               { group: 'Safety / Policy / Abuse',  title: 'Personal Data' },
  'nsfw':                        { group: 'Safety / Policy / Abuse',  title: 'NSFW' },
  'code-and-scripts':            { group: 'Safety / Policy / Abuse',  title: 'Code and Scripts' },
  'bias-and-manipulation':       { group: 'Safety / Policy / Abuse',  title: 'Bias and Manipulation' },
  'conflicting-filter-facets':   { group: 'Constraint Handling',      title: 'Conflicting Filter Facets' },
  'conflicting-brands':          { group: 'Constraint Handling',      title: 'Conflicting Brands' },
  'random-numbers':              { group: 'Input Robustness',         title: 'Random Numbers' },
  'multi-intent':                { group: 'Conversational Behavior',  title: 'Multi-Intent Queries' },
  'clarification':               { group: 'Conversational Behavior',  title: 'Clarification Queries' },
  'price-negotiation':           { group: 'Conversational Behavior',  title: 'Price Negotiation Queries' },
  'sales':                       { group: 'Conversational Behavior',  title: 'Sales' },
  'unusual-units':               { group: 'Input Robustness',         title: 'Unusual Units Queries' },
  'joke-humor':                  { group: 'Conversational Behavior',  title: 'Joke/Humor Queries' },
  'repeat-looping':              { group: 'Conversational Behavior',  title: 'Repeat/Looping Queries' },
  'brand-loyalty-switching':     { group: 'Conversational Behavior',  title: 'Brand Loyalty/Switching Queries' },
  'accessibility-needs':         { group: 'Conversational Behavior',  title: 'Accessibility Needs Queries' },
  'environmental-concerns':      { group: 'Conversational Behavior',  title: 'Environmental Concerns Queries' },
};

// sentence-by-filter-options is shared by "By Filter Facets (random)" and
// "By Filter Facets (complete)"; By Filter Facets (AND/OR) reuses negative-contradictory.
const FILTER_TITLE_TO_TYPE = {
  'By Filter Facets (random)':   'sentence-by-filter-options',
  'By Filter Facets (complete)': 'sentence-by-filter-options',
  'By Filter Facets (AND/OR)':   'negative-contradictory',
  'By Filter Facets (punctuated)': 'negative-contradictory',
  'By Filter Facets (unavailable + available)': 'negative-contradictory',
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
