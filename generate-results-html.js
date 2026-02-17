const fs = require('fs');
const path = require('path');

// Find all search-results*.json files in ./results/json or provided path
// Usage: node generate-results-html.js [path-to-json-dir]
const inputPath = process.argv[2];
const resultsJsonDir = inputPath 
  ? (path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath))
  : path.join(__dirname, 'results', 'json');
const files = fs.readdirSync(resultsJsonDir).filter(f => f.includes('search-results') && f.endsWith('.json'));
let allResults = [];
files.forEach(file => {
  const data = JSON.parse(fs.readFileSync(path.join(resultsJsonDir, file), 'utf8'));
  allResults = allResults.concat(data);
});

// Function to escape script tags in strings
function escapeScriptTags(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<script>/gi, '&lt;script&gt;').replace(/<\/script>/gi, '&lt;/script&gt;');
}

// Normalize results to handle both UI and API formats
allResults = allResults.map(r => {
  // Check if this is an API result (has testMode: 'api')
  if (r.testMode === 'api') {
    // For API results, treat "no_results" scenarios as successful responses (not errors)
    // Also treat expected status code matches as successful
    const isExpectedStatusCode = r.openaiEvaluation && r.openaiEvaluation.includes('Expected status code') && r.openaiEvaluation.includes('received as expected');
    const isActualError = r.hasError && !isExpectedStatusCode;
    const hasValidMessage = r.apiResults?.data?.smartSearch?.message || r.apiResults?.message || isExpectedStatusCode;
    
    const resultText = r.apiResults?.data?.smartSearch?.message || 
                      r.apiResults?.message || 
                      'No message available';
    
    return {
      ...r,
      query: escapeScriptTags(r.query),
      resultText: escapeScriptTags(resultText),
      openaiEvaluation: escapeScriptTags(r.openaiEvaluation),
      passed: !isActualError && !!hasValidMessage,
      icon: (isActualError || !hasValidMessage) ? '❌' : '✅'
    };
  }
  // UI result - escape script tags in relevant fields
  return {
    ...r,
    query: escapeScriptTags(r.query),
    resultText: escapeScriptTags(r.resultText),
    openaiEvaluation: escapeScriptTags(r.openaiEvaluation)
  };
});

const describeSet = [...new Set(allResults.map(r => r.testDescribe))].filter(Boolean);
const titleSet = [...new Set(allResults.map(r => r.testTitle))].filter(Boolean);
const statusSet = [...new Set(allResults.map(r => r.passed ? '✅' : '❌'))];
const timestamp = new Date().toLocaleString();

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const chartData = describeSet.map(describe => {
  const filtered = allResults.filter(r => r.testDescribe === describe);
  const total = filtered.length;
  const pass = filtered.filter(r => r.passed).length;
  const fail = filtered.filter(r => !r.passed).length;
  return {
    describe,
    passPercent: total ? Math.round((pass / total) * 100) : 0,
    failPercent: total ? Math.round((fail / total) * 100) : 0,
    total
  };
});
const chartDataByTitle = titleSet.map(title => {
  const filtered = allResults.filter(r => r.testTitle === title);
  const pass = filtered.filter(r => r.passed).length;
  const fail = filtered.filter(r => !r.passed).length;
  return { title, pass, fail };
});

let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AI Smart Search Test Results</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { background: #f8f9fa; }
    .timestamp { color: #666; font-size: 0.95em; margin-bottom: 1em; }
    .result-text { max-width: 400px; overflow-wrap: break-word; width: 30%; }
    .query-text { width: 30%; }
    .pass { color: #28a745; font-weight: bold; }
    .fail { color: #dc3545; font-weight: bold; }
    .card { margin-bottom: 2em; }
    .table-responsive { margin-top: 1em; }
    thead th { position: sticky; top: 0; background: #e9ecef; z-index: 2; }
    tbody tr:hover { background: #ffeeba; }
    .badge-pass { background-color: #28a745; }
    .badge-fail { background-color: #dc3545; }
    #chart-container, #chart-title-container { min-height: 350px; }
    #describeChart, #titleChart { min-height: 320px; max-height: 400px; width: 100%; display: block; }
    .query-text { width: 30%; word-break: break-word; }
    .result-text { max-width: 400px; overflow-wrap: break-word; width: 50%; }
  </style>
</head>
<body>
  <div class="container py-4">
    <h1 class="mb-3">AI Smart Search Results</h1>
    <div class="timestamp">Generated: ${timestamp}</div>
    <div id="chart-container" class="card shadow-sm mb-4">
      <div class="card-body">
        <canvas id="describeChart"></canvas>
        <div id="chartFallback" style="display:none;color:#dc3545;">Chart could not be rendered.</div>
      </div>
    </div>
    <div id="chart-title-container" class="card shadow-sm mb-4">
      <div class="card-body">
        <canvas id="titleChart"></canvas>
        <div id="titleChartFallback" style="display:none;color:#dc3545;">Chart could not be rendered.</div>
      </div>
    </div>
    <form class="row g-3 align-items-center mb-4">
      <div class="col-auto">
        <label for="describeFilter" class="form-label mb-0">Test Category:</label>
        <select id="describeFilter" class="form-select">
          <option value="">All</option>
          ${describeSet.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}
        </select>
      </div>
      <div class="col-auto">
        <label for="titleFilter" class="form-label mb-0">Test Title:</label>
        <select id="titleFilter" class="form-select">
          <option value="">All</option>
          ${titleSet.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
        </select>
      </div>
      <div class="col-auto">
        <label class="form-label mb-0">Status:</label>
        <div id="statusToggle" class="btn-group" role="group" aria-label="Status toggle">
          <button type="button" class="btn btn-outline-secondary active" data-status="">All</button>
          <button type="button" class="btn btn-outline-success" data-status="✅">Pass</button>
          <button type="button" class="btn btn-outline-danger" data-status="❌">Fail</button>
        </div>
      </div>
      <div class="col-auto">
        <label class="form-label mb-0">Mode:</label>
        <div id="modeToggle" class="btn-group" role="group" aria-label="Mode toggle">
          <button type="button" class="btn btn-outline-secondary active" data-mode="">All</button>
          <button type="button" class="btn btn-outline-info" data-mode="API">API</button>
          <button type="button" class="btn btn-outline-secondary" data-mode="UI">UI</button>
        </div>
      </div>
      <div class="col-auto">
        <button id="resetBtn" type="button" class="btn btn-secondary">Reset</button>
      </div>
      <div class="col-auto">
        <input id="searchBox" type="text" class="form-control" placeholder="Search query or result text">
      </div>
      <div class="col-auto">
        <button id="exportBtn" type="button" class="btn btn-primary">Export CSV</button>
      </div>
    </form>
    <div class="table-responsive">
      <table class="table table-bordered table-hover align-middle bg-white">
        <thead class="table-light">
          <tr>
            <th>Test Category</th>
            <th>Test Title</th>
            <th>Mode</th>
            <th class="query-text">User Search Query</th>
            <th class="result-text">Response Text</th>
            <th>AI Evaluation</th>
            <th>Status</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody id="resultsBody">
          ${allResults.map(r => {
            const mode = r.testMode === 'api' ? 'API' : 'UI';
            const statusInfo = r.testMode === 'api' 
              ? `${r.statusCode} (${r.responseTime}ms)` 
              : 'UI Test';
            return `
            <tr data-describe="${escapeHtml(r.testDescribe || '')}" data-title="${escapeHtml(r.testTitle || '')}" data-status="${r.passed ? '✅' : '❌'}" data-mode="${mode}">
              <td>${escapeHtml(r.testDescribe || '')}</td>
              <td>${escapeHtml(r.testTitle || '')}</td>
              <td><span class="badge ${mode === 'API' ? 'bg-info' : 'bg-secondary'}">${mode}</span></td>
              <td class="query-text">${escapeHtml(r.query || '')}</td>
              <td class="result-text">${escapeHtml(r.resultText || '')}</td>
              <td>${escapeHtml(r.openaiEvaluation || '')}</td>
              <td><small class="text-muted">${statusInfo}</small></td>
              <td><span class="badge ${r.passed ? 'badge-pass' : 'badge-fail'}">${escapeHtml(r.icon || '')}</span></td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>
<script>
const allResults = ${JSON.stringify(allResults)};
const chartData = ${JSON.stringify(chartData)};
const chartDataByTitle = ${JSON.stringify(chartDataByTitle)};
const describeFilter = document.getElementById("describeFilter");
const titleFilter = document.getElementById("titleFilter");
const statusToggle = document.getElementById("statusToggle");
const modeToggle = document.getElementById("modeToggle");
const resetBtn = document.getElementById("resetBtn");
const searchBox = document.getElementById("searchBox");
const exportBtn = document.getElementById("exportBtn");
let statusVal = "";
let modeVal = "";
let searchVal = "";

function renderChart() {
  try {
    const ctx = document.getElementById('describeChart').getContext('2d');
    if (window.describeChartInstance) {
      window.describeChartInstance.destroy();
    }
    window.describeChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartData.map(d => d.describe),
        datasets: [
          {
            label: 'Pass (%)',
            data: chartData.map(d => d.passPercent),
            backgroundColor: 'rgba(40,167,69,0.7)'
          },
          {
            label: 'Fail (%)',
            data: chartData.map(d => d.failPercent),
            backgroundColor: 'rgba(220,53,69,0.7)'
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          title: { display: true, text: 'Pass/Fail Percentage by Test Category' },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + context.parsed.x + '%';
              }
            }
          }
        },
        scales: {
          x: { stacked: true, beginAtZero: true, max: 100, title: { display: true, text: 'Percentage (%)' } },
          y: { stacked: true }
        }
      }
    });
    document.getElementById('chartFallback').style.display = 'none';
  } catch (e) {
    document.getElementById('chartFallback').style.display = 'block';
  }
  // Render chart by testTitle
  try {
    const ctxTitle = document.getElementById('titleChart').getContext('2d');
    if (window.titleChartInstance) {
      window.titleChartInstance.destroy();
    }
    window.titleChartInstance = new Chart(ctxTitle, {
      type: 'bar',
      data: {
        labels: chartDataByTitle.map(d => d.title),
        datasets: [
          {
            label: 'Pass',
            data: chartDataByTitle.map(d => d.pass),
            backgroundColor: 'rgba(40,167,69,0.7)'
          },
          {
            label: 'Fail',
            data: chartDataByTitle.map(d => d.fail),
            backgroundColor: 'rgba(220,53,69,0.7)'
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          title: { display: true, text: 'Pass/Fail Count by Test Title' }
        },
        scales: {
          x: { stacked: true, beginAtZero: true },
          y: { stacked: true }
        }
      }
    });
    document.getElementById('titleChartFallback').style.display = 'none';
  } catch (e) {
    document.getElementById('titleChartFallback').style.display = 'block';
  }
}
function updateDropdowns() {
  var describeVal = describeFilter.value;
  var titleVal = titleFilter.value;
  var filtered = allResults;
  if (describeVal) filtered = filtered.filter(function(r){return r.testDescribe === describeVal;});
  if (titleVal) filtered = filtered.filter(function(r){return r.testTitle === titleVal;});
  if (statusVal) filtered = filtered.filter(function(r){return (r.passed ? '✅' : '❌') === statusVal;});
  if (searchVal) {
    const q = searchVal.toLowerCase();
    filtered = filtered.filter(function(r){
      return (r.query && r.query.toLowerCase().includes(q)) || (r.resultText && r.resultText.toLowerCase().includes(q));
    });
  }
  var describeOptions = [""];
  filtered.forEach(function(r){if(r.testDescribe && describeOptions.indexOf(r.testDescribe)===-1) describeOptions.push(r.testDescribe);});
  describeFilter.innerHTML = describeOptions.map(function(d){return '<option value="'+d+'">'+(d||'All')+'</option>';}).join('');
  describeFilter.value = describeVal;
  var titleOptions = [""];
  filtered.forEach(function(r){if(r.testTitle && titleOptions.indexOf(r.testTitle)===-1) titleOptions.push(r.testTitle);});
  titleFilter.innerHTML = titleOptions.map(function(t){return '<option value="'+t+'">'+(t||'All')+'</option>';}).join('');
  titleFilter.value = titleVal;
}

function filterTable() {
  var describeVal = describeFilter.value;
  var titleVal = titleFilter.value;
  document.querySelectorAll("#resultsBody tr").forEach(function(tr){
    var describe = tr.getAttribute('data-describe');
    var title = tr.getAttribute('data-title');
    var status = tr.getAttribute('data-status');
    var mode = tr.getAttribute('data-mode');
    var query = tr.querySelector('.query-text').textContent.toLowerCase();
    var resultText = tr.querySelector('.result-text').textContent.toLowerCase();
    var show = true;
    if (describeVal && describe !== describeVal) show = false;
    if (titleVal && title !== titleVal) show = false;
    if (statusVal && status !== statusVal) show = false;
    if (modeVal && mode !== modeVal) show = false;
    if (searchVal && !(query.includes(searchVal.toLowerCase()) || resultText.includes(searchVal.toLowerCase()))) show = false;
    tr.style.display = show ? "" : "none";
  });
  updateDropdowns();
}

describeFilter.addEventListener("change", filterTable);
titleFilter.addEventListener("change", filterTable);
statusToggle.querySelectorAll('button').forEach(function(btn){
  btn.addEventListener('click', function(){
    statusToggle.querySelectorAll('button').forEach(function(b){b.classList.remove('active');});
    btn.classList.add('active');
    statusVal = btn.getAttribute('data-status');
    filterTable();
  });
});
modeToggle.querySelectorAll('button').forEach(function(btn){
  btn.addEventListener('click', function(){
    modeToggle.querySelectorAll('button').forEach(function(b){b.classList.remove('active');});
    btn.classList.add('active');
    modeVal = btn.getAttribute('data-mode');
    filterTable();
  });
});
searchBox.addEventListener("input", function(){
  searchVal = searchBox.value;
  filterTable();
});
window.addEventListener("DOMContentLoaded", function() {
  renderChart();
  updateDropdowns();
});
resetBtn.addEventListener("click", function() {
  describeFilter.value = "";
  titleFilter.value = "";
  statusVal = "";
  modeVal = "";
  searchVal = "";
  searchBox.value = "";
  statusToggle.querySelectorAll('button').forEach(function(b){b.classList.remove('active');});
  statusToggle.querySelector('button[data-status=""]').classList.add('active');
  modeToggle.querySelectorAll('button').forEach(function(b){b.classList.remove('active');});
  modeToggle.querySelector('button[data-mode=""]').classList.add('active');
  filterTable();
});
exportBtn.addEventListener("click", function() {
  var rows = Array.from(document.querySelectorAll("#resultsBody tr")).filter(function(tr){return tr.style.display !== "none";});
  var csv = ["Describe,Test Title,Query,Result Text,AI Evaluation,Status"];
  rows.forEach(function(tr){
    var cells = Array.from(tr.children).map(function(td){return '"'+td.textContent.replace(/"/g,'""')+'"';});
    csv.push(cells.join(","));
  });
  var blob = new Blob([csv.join("\\n")], {type: 'text/csv'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'filtered-results.csv';
  a.click();
});
</script>
</body>
</html>
`;

// Extract metadata from the path or filenames
let country = 'UNKNOWN';
let product = 'UNKNOWN';
let dateStr = new Date().toISOString().slice(0, 10);
let env = 'UNKNOWN';

// Try to extract from directory path (e.g., results/json/2026-02-03_INT)
const dirParts = resultsJsonDir.split(path.sep);
const lastDir = dirParts[dirParts.length - 1];
const dirMatch = lastDir.match(/^(\d{4}-\d{2}-\d{2})_(\w+)$/);
if (dirMatch) {
  dateStr = dirMatch[1];
  env = dirMatch[2];
}

// Try to extract country and product from the first JSON filename
// Expected format: TR_NCOS_search-results_...
if (files.length > 0) {
  const firstFile = files[0];
  const fileMatch = firstFile.match(/^([A-Z]{2})_([A-Z]+)_/);
  if (fileMatch) {
    country = fileMatch[1];
    product = fileMatch[2];
  }
}

const outputDir = path.join(__dirname, 'results', 'html');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
const outputFile = path.join(outputDir, `search-results-all_${country}_${product}_${dateStr}_${env}.html`);
fs.writeFileSync(outputFile, html, 'utf8');

console.log(`Results written to ${outputFile}`);
