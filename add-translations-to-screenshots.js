const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

/**
 * Add English translation captions to screenshots
 * Reads JSON results and adds query/response translations below the screenshot
 */
async function addTranslationsToScreenshot(
  jsonPath,
  screenshotPath,
  outputPath,
) {
  try {
    // Read JSON data
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

    // Find the entry matching the screenshot
    const screenshotName = path.basename(screenshotPath);

    // Try exact match first
    let entry = jsonData.find((item) => {
      if (item.screenshotPath) {
        const jsonScreenshotName = path.basename(item.screenshotPath);
        return jsonScreenshotName === screenshotName;
      }
      return false;
    });

    // If no exact match, try matching without timestamp (for consolidated filenames)
    // New format: TR_NCOS_testType_HHmm_query-X_...
    // Old format: TR_NCOS_testType_query-X_...
    if (!entry) {
      entry = jsonData.find((item) => {
        if (item.screenshotPath) {
          const jsonScreenshotName = path.basename(item.screenshotPath);
          // Remove timestamp pattern (_HHmm) from current filename for comparison
          const screenshotWithoutTimestamp = screenshotName.replace(
            /_\d{4}_query-/,
            "_query-",
          );
          return jsonScreenshotName === screenshotWithoutTimestamp;
        }
        return false;
      });
    }

    if (!entry) {
      // Silently skip if no match found
      return;
    }

    // Load original image
    const image = await loadImage(screenshotPath);
    const imgWidth = image.width;
    const imgHeight = image.height;

    // Check if screenshot is already annotated (has extra height for captions)
    // Original screenshots typically have standard heights; annotated ones have +200px
    const isAlreadyAnnotated =
      fs.existsSync(screenshotPath) && imgHeight > 1200; // reasonable threshold

    if (isAlreadyAnnotated) {
      // Skip already annotated screenshots
      return;
    }

    // Calculate caption height based on text length
    const queryEn = entry.query?.en || "[Translation not available]";
    const responseEn = entry.response?.en || "[Translation not available]";
    const queryText = `Query: ${queryEn}`;
    const responseText = `Response: ${responseEn}`;
    const captionHeight = 200; // Height for caption area
    const padding = 20;
    const lineHeight = 24;

    // Create canvas with extra space for caption
    const canvas = createCanvas(imgWidth, imgHeight + captionHeight);
    const ctx = canvas.getContext("2d");

    // Draw original screenshot
    ctx.drawImage(image, 0, 0);

    // Draw white background for caption
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, imgHeight, imgWidth, captionHeight);

    // Draw border line
    ctx.strokeStyle = "#CCCCCC";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, imgHeight);
    ctx.lineTo(imgWidth, imgHeight);
    ctx.stroke();

    // Set text style
    ctx.fillStyle = "#333333";
    ctx.font = "bold 16px Arial";

    // Helper function to wrap text
    function wrapText(text, maxWidth) {
      const words = text.split(" ");
      const lines = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine + word + " ";
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine !== "") {
          lines.push(currentLine.trim());
          currentLine = word + " ";
        } else {
          currentLine = testLine;
        }
      }
      lines.push(currentLine.trim());
      return lines;
    }

    // Draw query
    let yPosition = imgHeight + padding + lineHeight;
    ctx.font = "bold 24px Arial";
    ctx.fillText("English Query:", padding, yPosition);

    yPosition += lineHeight;
    ctx.font = "20px Arial";
    const queryLines = wrapText(queryEn, imgWidth - padding * 2);
    queryLines.forEach((line) => {
      ctx.fillText(line, padding, yPosition);
      yPosition += lineHeight;
    });

    // Draw response
    yPosition += 5;
    ctx.font = "bold 24px Arial";
    ctx.fillText("English Response:", padding, yPosition);

    yPosition += lineHeight;
    ctx.font = "20px Arial";
    const responseLines = wrapText(responseEn, imgWidth - padding * 2);
    responseLines.slice(0, 2).forEach((line) => {
      // Limit to 2 lines for response
      ctx.fillText(line, padding, yPosition);
      yPosition += lineHeight;
    });

    // Add metadata
    ctx.font = "18px Arial";
    ctx.fillStyle = "#666666";
    const metadata = `Result Count: ${entry.resultCount} | Response Time: ${entry.responseTime}ms | ${entry.hasError ? "❌ Has Error" : "✓ Success"}`;
    ctx.fillText(metadata, padding, imgHeight + captionHeight - 10);

    // Save image
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(outputPath, buffer);
    console.log(`✓ Created annotated screenshot: ${path.basename(outputPath)}`);
  } catch (error) {
    console.error(`Error processing ${screenshotPath}:`, error.message);
  }
}

/**
 * Process all screenshots in a date folder
 */
async function processDateFolder(dateFolder) {
  const jsonDir = path.join(__dirname, "results", "json", dateFolder);
  const screenshotDir = path.join(
    __dirname,
    "results",
    "screenshots",
    dateFolder,
  );
  const outputDir = path.join(__dirname, "results", "screenshots", dateFolder);

  if (!fs.existsSync(jsonDir)) {
    console.error(`JSON directory not found: ${jsonDir}`);
    return;
  }

  if (!fs.existsSync(screenshotDir)) {
    console.error(`Screenshot directory not found: ${screenshotDir}`);
    return;
  }

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Get all JSON files
  const jsonFiles = fs.readdirSync(jsonDir).filter((f) => f.endsWith(".json"));

  for (const jsonFile of jsonFiles) {
    const jsonPath = path.join(jsonDir, jsonFile);

    // Find corresponding screenshot subdirectories
    const screenshotSubdirs = fs.readdirSync(screenshotDir);

    for (const subdir of screenshotSubdirs) {
      const subdirPath = path.join(screenshotDir, subdir);
      if (fs.statSync(subdirPath).isDirectory()) {
        const screenshots = fs
          .readdirSync(subdirPath)
          .filter((f) => f.endsWith(".png"));

        for (const screenshot of screenshots) {
          const screenshotPath = path.join(subdirPath, screenshot);
          const outputSubdir = path.join(outputDir, subdir);
          fs.mkdirSync(outputSubdir, { recursive: true });
          const outputPath = path.join(outputSubdir, screenshot);

          await addTranslationsToScreenshot(
            jsonPath,
            screenshotPath,
            outputPath,
          );
        }
      }
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node add-translations-to-screenshots.js <date-folder>");
    console.log(
      "Example: node add-translations-to-screenshots.js 2026-04-09_PREPROD",
    );
    console.log("\nAvailable date folders:");
    const screenshotDirs = fs.readdirSync(
      path.join(__dirname, "results", "screenshots"),
    );
    screenshotDirs.forEach((dir) => console.log(`  - ${dir}`));
    return;
  }

  const dateFolder = args[0];
  console.log(`Processing screenshots for: ${dateFolder}\n`);

  await processDateFolder(dateFolder);

  console.log(
    "\n✓ Done! Annotated screenshots saved in results/screenshots/" +
      dateFolder,
  );
}

main().catch(console.error);
