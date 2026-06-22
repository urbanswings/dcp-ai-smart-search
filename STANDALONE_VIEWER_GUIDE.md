# Standalone Test Results Viewer with Embedded Screenshots

## Overview
The test results viewer now supports complete **self-contained HTML files** with embedded JSON data AND screenshot images as base64 data URIs. Share a single HTML file with anyone - no external files, dependencies, or folder access required.

## Features

✅ **Embedded JSON Results** - All test data embedded in the HTML  
✅ **Embedded Screenshots** - All screenshot images encoded as base64 and embedded  
✅ **Interactive Charts** - Quick summary with 4 metric cards:
  - Pass Rate (with percentage bar)
  - Queries Ran (total count)
  - Evaluation Split (PASS/FAIL/OTHER breakdown)
  - Response Time Buckets (distribution across time ranges)

✅ **Full Functionality** - No external JS files needed, pure client-side processing  
✅ **Shareable** - Single HTML file, no external dependencies

## How to Generate

```bash
npm run viewer:embed -- <path/to/json/folder> [output/path.html]
```

### Examples

Generate standalone viewer for 2026-06-17_PREPROD results:
```bash
npm run viewer:embed -- results/json/2026-06-17_PREPROD
# Output: results/html/test-results-viewer-standalone.html (default)
```

Generate with custom output path:
```bash
npm run viewer:embed -- results/json/2026-06-17_PREPROD results/html/my-custom-viewer.html
```

## What Gets Embedded

1. **JSON Files**: All result files from the specified folder
2. **Screenshots**: All images from `results/screenshots/<folder-name>/` (automatically discovered)
3. **Viewer Code**: Complete HTML + CSS + JavaScript

### Example Output

When running the embed script, you'll see:
```
Embedded viewer created: /path/to/test-results-viewer-standalone.html
Files embedded: 7
Screenshots embedded: 56
Root label: 2026-06-17_PREPROD
```

## File Structure

The script looks for:
- **JSON Results**: `results/json/<date_env>/*.json` (recursive)
- **Screenshots**: `results/screenshots/<date_env>/**/*.{png,jpg,jpeg,gif,webp}`

### Example
```
results/
├── json/
│   └── 2026-06-17_PREPROD/
│       ├── KR_NCOS_search-results_sanity-test_recommendation-model_api_2026-06-17T12:37:07.148Z.json
│       └── ...
└── screenshots/
    └── 2026-06-17_PREPROD/
        ├── 2026-06-17T07:09:39.089Z/
        │   ├── query-1.png
        │   ├── query-2.png
        │   └── ...
        └── 2026-06-17T07:23:37.299Z/
            └── ...
```

## Screenshot Path Resolution

For screenshots to display in the viewer, result rows must include a `screenshotPath` field:

```json
{
  "query": "example query",
  "response": "example response",
  "screenshotPath": "2026-06-17T07:09:39.089Z/query-1.png",
  ...
}
```

If JSON rows don't include `screenshotPath`, the screenshot section will display "No screenshot path is available for this row" even though screenshots are embedded.

## Viewer Usage

1. **Open the standalone HTML file** in any modern browser
2. **Embedded Mode**: Data loads automatically with embedded results
3. **Interact with the data**:
   - Filter by country/folder/testDescribe/testTitle
   - View summary charts
   - Click rows to see detailed query/response/evaluation data
   - (When `screenshotPath` is present) View embedded screenshots
4. **No external resources needed** - Everything is self-contained

## File Size

Embedded files are typically:
- **JSON-only**: 50-500 KB
- **With screenshots**: 15-50 MB (depending on number and size of images)

The 56 embedded screenshots in the example result in a **31 MB** standalone HTML file, which is still easily shareable and fast-loading in modern browsers.

## Technical Details

### Embedding Process
1. Script scans `results/json/<date_env>/` for all JSON files
2. Script scans `results/screenshots/<date_env>/` for all image files
3. Screenshot images are read and converted to base64
4. Data injected into viewer template's `<script id="embeddedResultsData">` tag
5. Payload structure:
   ```javascript
   {
     rootLabel: "2026-06-17_PREPROD",
     files: [{path: "...", content: {...}}, ...],
     screenshots: {"path/to/image.png": "data:image/png;base64,...", ...}
   }
   ```

### Viewer Loading
1. Page opens and auto-detects embedded data
2. Parses JSON from `<script id="embeddedResultsData">` tag
3. Creates virtual File objects for JSON data
4. Creates data URIs from embedded screenshot base64 strings
5. Displays in interactive interface

## Notes

- **Browser Compatibility**: Works in all modern browsers (Chrome, Firefox, Safari, Edge)
- **Offline**: Completely offline - no internet required
- **Performance**: Initially loads all data into browser memory; filtering is instantaneous
- **Privacy**: All processing happens locally; no data sent to servers

## Dependencies

- **Node.js 14+** for generating standalone files
- **npm** for running build script
- No runtime dependencies - viewer uses vanilla JavaScript/CSS only
