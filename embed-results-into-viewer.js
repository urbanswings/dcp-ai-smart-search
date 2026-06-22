const fs = require("fs");
const path = require("path");

const workspaceRoot = __dirname;
const viewerTemplatePath = path.join(workspaceRoot, "results", "html", "test-results-viewer.html");

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

function buildEmbeddedPayload(sourcePath) {
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
      files.push({
        path: normalizePath(path.relative(absoluteSourcePath, fullPath)),
        content: loadJsonOrText(fullPath),
      });
    }

    return {
      rootLabel: path.basename(absoluteSourcePath),
      files,
    };
  }

  files.push({
    path: path.basename(absoluteSourcePath),
    content: loadJsonOrText(absoluteSourcePath),
  });

  return {
    rootLabel: path.basename(path.dirname(absoluteSourcePath)) || "embedded-results",
    files,
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
  const outputHtml = injectEmbeddedPayload(templateHtml, payload);

  const absoluteOutPath = path.isAbsolute(outArg) ? outArg : path.join(workspaceRoot, outArg);
  fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  fs.writeFileSync(absoluteOutPath, outputHtml, "utf8");

  console.log("Embedded viewer created:", absoluteOutPath);
  console.log("Files embedded:", payload.files.length);
  console.log("Root label:", payload.rootLabel);
}

main();
