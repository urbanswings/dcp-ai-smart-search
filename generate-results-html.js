const fs = require('fs');
const path = require('path');

// Function to recursively find all JSON files in subdirectories
function findJsonFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Recursively search subdirectories
      findJsonFiles(fullPath, fileList);
    } else if (entry.isFile() && entry.name.includes('search-results') && entry.name.endsWith('.json')) {
      // Found a matching JSON file
      fileList.push(fullPath);
    }
  }
  
  return fileList;
}

// Find the latest date subdirectory
function findLatestSubdirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const subdirs = entries
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}_\w+$/.test(entry.name))
    .map(entry => ({
      name: entry.name,
      fullPath: path.join(dir, entry.name),
      dateMatch: entry.name.match(/^(\d{4}-\d{2}-\d{2})_(\w+)$/)
    }))
    .sort((a, b) => {
      // Sort by date descending (newest first)
      const dateCompare = b.dateMatch[1].localeCompare(a.dateMatch[1]);
      if (dateCompare !== 0) return dateCompare;
      return b.name.localeCompare(a.name);
    });
  
  return subdirs.length > 0 ? subdirs[0] : null;
}

// Find all search-results*.json files in ./results/json or provided path
// Usage: node generate-results-html.js [path-to-json-dir]
const inputPath = process.argv[2];
const resultsJsonDir = inputPath 
  ? (path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath))
  : path.join(__dirname, 'results', 'json');

// Find the latest subdirectory and process only files from there
const latestSubdir = findLatestSubdirectory(resultsJsonDir);
if (!latestSubdir) {
  console.error('No date subdirectories found in the format YYYY-MM-DD_ENV');
  process.exit(1);
}

console.log(`Processing latest directory: ${latestSubdir.name}`);
const files = findJsonFiles(latestSubdir.fullPath);
console.log(`Found ${files.length} JSON files in ${latestSubdir.name}`);

let allResults = [];
files.forEach(file => {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    allResults = allResults.concat(data);
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
  }
});

// Function to normalize text for matching
function normalizeForMatch(text) {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[^\w]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// Function to find screenshots for a result
function findScreenshot(result, screenshotDir, resultIndex) {
  if (!fs.existsSync(screenshotDir)) return null;
  
  try {
    // Get all timestamp directories
    const timestampDirs = fs.readdirSync(screenshotDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
      .reverse(); // Most recent first
    
    // Look through each timestamp directory
    for (const timestampDir of timestampDirs) {
      const fullPath = path.join(screenshotDir, timestampDir);
      const screenshots = fs.readdirSync(fullPath)
        .filter(file => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'));
      
      // Get query text from result
      let queryText = '';
      if (typeof result.query === 'object') {
        // Get the first non-English value if available (original language)
        queryText = result.query.tr || result.query.hi || result.query.en || Object.values(result.query)[0] || '';
      } else {
        queryText = result.query || '';
      }
      
      if (!queryText) continue;
      
      const normalizedQuery = normalizeForMatch(queryText);
      
      // Try different matching strategies
      for (const screenshot of screenshots) {
        const screenshotLower = screenshot.toLowerCase();
        
        // Strategy 1: Match by query number (e.g., "query-1", "query-2")
        const queryNumMatch = screenshot.match(/query[_-](\d+)/i);
        if (queryNumMatch && parseInt(queryNumMatch[1]) === resultIndex + 1) {
          return path.join(timestampDir, screenshot);
        }
        
        // Strategy 2: Match by normalized query text (at least 10 chars match)
        if (normalizedQuery.length >= 10) {
          const normalizedScreenshot = normalizeForMatch(screenshot);
          const matchLength = Math.min(normalizedQuery.length, 30);
          const querySubstring = normalizedQuery.substring(0, matchLength);
          
          if (normalizedScreenshot.includes(querySubstring)) {
            return path.join(timestampDir, screenshot);
          }
        }
        
        // Strategy 3: Fuzzy match - check if most words in query appear in filename
        const queryWords = normalizedQuery.split('_').filter(w => w.length > 3);
        if (queryWords.length > 0) {
          const normalizedScreenshot = normalizeForMatch(screenshot);
          const matchedWords = queryWords.filter(word => normalizedScreenshot.includes(word));
          if (matchedWords.length >= Math.max(2, queryWords.length * 0.6)) {
            return path.join(timestampDir, screenshot);
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error finding screenshot: ${err.message}`);
  }
  
  return null;
}

// Function to escape script tags in strings
function escapeScriptTags(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<script>/gi, '&lt;script&gt;').replace(/<\/script>/gi, '&lt;/script&gt;');
}

// Function to detect language of text
function detectLanguage(text) {
  if (!text) return 'unknown';
  // Check for Devanagari script (Hindi, Marathi, etc.)
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  // Check for Arabic/Urdu script
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  // Check for Turkish specific characters
  if (/[ğĞıİöÖşŞüÜçÇ]/.test(text)) return 'tr';
  // Check for Chinese characters
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  // Check for Korean characters
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  // Check for Japanese Hiragana/Katakana
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';
  // Default to English
  return 'en';
}

// Function to get flag emoji for language
function getFlagEmoji(langCode) {
  const flags = {
    'en': '🇬🇧',
    'hi': '🇮🇳',
    'tr': '🇹🇷',
    'ar': '🇦🇪',
    'zh': '🇨🇳',
    'ko': '🇰🇷',
    'ja': '🇯🇵',
    'es': '🇪🇸',
    'de': '🇩🇪',
    'fr': '🇫🇷'
  };
  return flags[langCode] || '🌐';
}

// Function to format multi-language text
function formatMultiLanguageText(textObj) {
  if (typeof textObj === 'string') {
    const detectedLang = detectLanguage(textObj);
    const flag = getFlagEmoji(detectedLang);
    return `${flag} ${escapeScriptTags(textObj)}`;
  }
  if (typeof textObj === 'object' && textObj !== null) {
    const parts = [];
    // Process all language keys in the object
    for (const [key, value] of Object.entries(textObj)) {
      if (value && typeof value === 'string') {
        const detectedLang = detectLanguage(value);
        const flag = getFlagEmoji(detectedLang);
        parts.push(`${flag} ${escapeScriptTags(value)}`);
      }
    }
    return parts.join('\n\n');
  }
  return '';
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
      query: formatMultiLanguageText(r.query),
      resultText: escapeScriptTags(resultText),
      openaiEvaluation: escapeScriptTags(r.openaiEvaluation),
      passed: !isActualError && !!hasValidMessage,
      icon: (isActualError || !hasValidMessage) ? '❌' : '✅'
    };
  }
  // UI result - handle multi-language query and response
  const queryText = formatMultiLanguageText(r.query);
  const responseText = formatMultiLanguageText(r.response || r.resultText);
  
  return {
    ...r,
    query: queryText,
    resultText: responseText,
    openaiEvaluation: escapeScriptTags(r.openaiEvaluation)
  };
});

// Find and attach screenshots to results
const screenshotDir = path.join(__dirname, 'results', 'screenshots', latestSubdir.name);
console.log(`Looking for screenshots in: ${screenshotDir}`);

allResults = allResults.map((r, index) => {
  const screenshotPath = findScreenshot(r, screenshotDir, index);
  return {
    ...r,
    screenshot: screenshotPath
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
    .pass { color: #28a745; font-weight: bold; }
    .fail { color: #dc3545; font-weight: bold; }
    .card { margin-bottom: 2em; }
    .table-responsive { margin-top: 1em; }
    thead th { position: sticky; top: 0; background: #e9ecef; z-index: 2; }
    tbody tr:hover { background: #ffeeba; }
    tbody tr:hover td.screenshot-cell { background-color: white !important; }
    .badge-pass { background-color: #28a745; }
    .badge-fail { background-color: #dc3545; }
    #chart-container, #chart-title-container { min-height: 350px; }
    #describeChart, #titleChart { min-height: 320px; max-height: 400px; width: 100%; display: block; }
    .query-text { 
      min-width: 200px;
      max-width: 350px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }
    .result-text { 
      min-width: 250px;
      max-width: 450px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }
    .screenshot-cell {
      position: relative;
      text-align: center;
      width: 120px;
    }
    .screenshot-thumbnail {
      width: 100px;
      height: 60px;
      object-fit: cover;
      cursor: pointer;
      border: 2px solid #ddd;
      border-radius: 4px;
      transition: all 0.3s ease;
    }
    .screenshot-thumbnail:hover {
      border-color: #007bff;
      transform: scale(1.05);
    }
    .screenshot-preview {
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      max-width: 90vw;
      max-height: 90vh;
      z-index: 9999;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      border: 3px solid #007bff;
      border-radius: 8px;
      background: white;
      padding: 5px;
    }
    .screenshot-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      z-index: 9998;
    }
    .screenshot-overlay.active,
    .screenshot-preview.active {
      display: block;
    }
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
            <th>Screenshot</th>
          </tr>
        </thead>
        <tbody id="resultsBody">
          ${allResults.map(r => {
            const mode = r.testMode === 'api' ? 'API' : 'UI';
            const statusInfo = r.testMode === 'api' 
              ? `${r.statusCode} (${r.responseTime}ms)` 
              : 'UI Test';
            const screenshotCell = r.screenshot 
              ? `<img src="../screenshots/${latestSubdir.name}/${r.screenshot}" class="screenshot-thumbnail" alt="Screenshot" onclick="showScreenshot(this.src)">` 
              : '<span class="text-muted">-</span>';
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
              <td class="screenshot-cell">${screenshotCell}</td>
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

// Screenshot preview functionality
function showScreenshot(src) {
  // Create overlay if it doesn't exist
  let overlay = document.getElementById('screenshot-overlay');
  let preview = document.getElementById('screenshot-preview');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'screenshot-overlay';
    overlay.className = 'screenshot-overlay';
    overlay.onclick = hideScreenshot;
    document.body.appendChild(overlay);
  }
  
  if (!preview) {
    preview = document.createElement('img');
    preview.id = 'screenshot-preview';
    preview.className = 'screenshot-preview';
    preview.onclick = hideScreenshot;
    document.body.appendChild(preview);
  }
  
  preview.src = src;
  overlay.classList.add('active');
  preview.classList.add('active');
}

function hideScreenshot() {
  const overlay = document.getElementById('screenshot-overlay');
  const preview = document.getElementById('screenshot-preview');
  if (overlay) overlay.classList.remove('active');
  if (preview) preview.classList.remove('active');
}

// Close screenshot on ESC key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    hideScreenshot();
  }
});
</script>
</body>
</html>
`;

// Extract metadata from the subdirectory and filenames
let country = 'UNKNOWN';
let product = 'UNKNOWN';
let dateStr = latestSubdir.dateMatch[1];
let env = latestSubdir.dateMatch[2];

// Try to extract country and product from the first filename
if (files.length > 0) {
  const fileName = path.basename(files[0]);
  const fileMatch = fileName.match(/^([A-Z]{2})_([A-Z]+)_/);
  if (fileMatch) {
    country = fileMatch[1];
    product = fileMatch[2];
  }
}

console.log(`Generating HTML for: ${country}_${product} (${dateStr}_${env})`);

const outputDir = path.join(__dirname, 'results', 'html');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
const outputFile = path.join(outputDir, `search-results-all_${country}_${product}_${dateStr}_${env}.html`);
fs.writeFileSync(outputFile, html, 'utf8');

console.log(`Results written to ${outputFile}`);
