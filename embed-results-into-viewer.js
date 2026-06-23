const fs = require("fs");
const path = require("path");

const workspaceRoot = __dirname;
const viewerTemplatePath = path.join(workspaceRoot, "results", "html", "test-results-viewer.html");
const echartsBundlePath = path.join(workspaceRoot, "node_modules", "echarts", "dist", "echarts.min.js");

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
}

function listJsonFilesRecursively(inputPath) {
  const entries = fs.readdirSync(inputPath, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    const fullPath = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsonFilesRecursively(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      out.push(fullPath);
    }
  }

  return out;
}

function loadJsonOrText(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function listImageFilesRecursively(inputPath) {
  if (!fs.existsSync(inputPath)) {
    return [];
  }

  const entries = fs.readdirSync(inputPath, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    const fullPath = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...listImageFilesRecursively(fullPath));
      continue;
    }
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
        out.push(fullPath);
      }
    }
  }

  return out;
}

function findScreenshotFiles(sourcePath, dateEnv) {
  const screenshots = new Map();
  const screenshotsDir = path.join(path.dirname(sourcePath), "..", "screenshots", dateEnv);
  
  if (!fs.existsSync(screenshotsDir)) {
    return screenshots;
  }

  const imageFiles = listImageFilesRecursively(screenshotsDir);
  
  for (const filePath of imageFiles) {
    try {
      const fileContent = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = 
        ext === ".png" ? "image/png" :
        ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
        ext === ".gif" ? "image/gif" :
        ext === ".webp" ? "image/webp" :
        "image/png";
      
      const base64 = fileContent.toString("base64");
      const normalizedRelativePath = normalizePath(path.relative(screenshotsDir, filePath));
      screenshots.set(normalizedRelativePath, `data:${mimeType};base64,${base64}`);
    } catch (err) {
      console.warn(`Warning: could not read screenshot ${filePath}:`, err.message);
    }
  }
  
  return screenshots;
}

function buildEmbeddedPayload(sourcePath, dateEnv) {
  const absoluteSourcePath = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.join(workspaceRoot, sourcePath);

  if (!fs.existsSync(absoluteSourcePath)) {
    throw new Error("Source path does not exist: " + absoluteSourcePath);
  }

  const stats = fs.statSync(absoluteSourcePath);
  const files = [];

  if (stats.isDirectory()) {
    const jsonFiles = listJsonFilesRecursively(absoluteSourcePath).sort((a, b) => a.localeCompare(b));
    for (const fullPath of jsonFiles) {
      const content = loadJsonOrText(fullPath);
      files.push({
        path: normalizePath(path.relative(absoluteSourcePath, fullPath)),
        content,
      });
    }

    const resolvedDateEnv = dateEnv || path.basename(absoluteSourcePath);
    const screenshots = findScreenshotFiles(absoluteSourcePath, resolvedDateEnv);
    return {
      rootLabel: path.basename(absoluteSourcePath),
      files,
      screenshots: Object.fromEntries(screenshots),
    };
  }

  const content = loadJsonOrText(absoluteSourcePath);
  files.push({
    path: path.basename(absoluteSourcePath),
    content,
  });

  const resolvedDateEnv = dateEnv || path.basename(path.dirname(absoluteSourcePath));
  const screenshots = findScreenshotFiles(absoluteSourcePath, resolvedDateEnv);

  return {
    rootLabel: path.basename(path.dirname(absoluteSourcePath)) || "embedded-results",
    files,
    screenshots: Object.fromEntries(screenshots),
  };
}

function injectEmbeddedPayload(templateHtml, payload) {
  const scriptRegex = /<script id="embeddedResultsData" type="application\/json">[\s\S]*?<\/script>/;
  const serialized = JSON.stringify(payload, null, 2);
  const replacement = "<script id=\"embeddedResultsData\" type=\"application/json\">\n" + serialized + "\n  </script>";

  if (!scriptRegex.test(templateHtml)) {
    throw new Error("Template does not contain embeddedResultsData script tag.");
  }

  return templateHtml.replace(scriptRegex, replacement);
}

function injectEmbeddedEcharts(templateHtml) {
  const scriptRegex = /<script id="embeddedEchartsLib" type="text\/plain">[\s\S]*?<\/script>/;
  if (!scriptRegex.test(templateHtml)) {
    return templateHtml;
  }

  if (!fs.existsSync(echartsBundlePath)) {
    console.warn("ECharts bundle not found at:", echartsBundlePath);
    return templateHtml;
  }

  const echartsSource = fs.readFileSync(echartsBundlePath, "utf8");
  const replacement = "<script id=\"embeddedEchartsLib\" type=\"text/plain\">\n" + echartsSource + "\n</script>";
  return templateHtml.replace(scriptRegex, replacement);
}

function main() {
  const sourceArg = process.argv[2];
  const outArg = process.argv[3] || "results/html/test-results-viewer-standalone.html";

  if (!sourceArg) {
    console.error("Usage: node embed-results-into-viewer.js <results-json-file-or-folder> [output-html]");
    process.exit(1);
  }

  const payload = buildEmbeddedPayload(sourceArg);
  if (!payload.files.length) {
    console.error("No JSON files found in source: " + sourceArg);
    process.exit(1);
  }

  const templateHtml = fs.readFileSync(viewerTemplatePath, "utf8");
  const withPayload = injectEmbeddedPayload(templateHtml, payload);
  const outputHtml = injectEmbeddedEcharts(withPayload);

  const absoluteOutPath = path.isAbsolute(outArg) ? outArg : path.join(workspaceRoot, outArg);
  fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  fs.writeFileSync(absoluteOutPath, outputHtml, "utf8");

  console.log("Embedded viewer created:", absoluteOutPath);
  console.log("Files embedded:", payload.files.length);
  console.log("Screenshots embedded:", Object.keys(payload.screenshots).length);
  console.log("Root label:", payload.rootLabel);
}

main();
