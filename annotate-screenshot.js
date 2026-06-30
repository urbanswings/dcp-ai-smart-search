const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");

/**
 * Annotate a single screenshot with English translations immediately after capture
 * @param {string} screenshotPath - Path to the screenshot file
 * @param {object} entry - Test result entry containing query and response
 */
async function annotateSingleScreenshot(screenshotPath, entry) {
  try {
    // Check if screenshot exists
    if (!fs.existsSync(screenshotPath)) {
      console.warn(`Screenshot not found: ${screenshotPath}`);
      return;
    }

    // Check if entry has required data
    if (!entry || !entry.query || !entry.response) {
      return; // Skip if no translation data available
    }

    // Get English translations
    let queryEn, responseEn;

    if (typeof entry.query === "object") {
      queryEn = entry.query.en || Object.values(entry.query)[0];
    } else {
      queryEn = entry.query;
    }

    if (typeof entry.response === "object") {
      responseEn = entry.response.en || Object.values(entry.response)[0];
    } else {
      responseEn = entry.response;
    }

    if (!queryEn || !responseEn) {
      return; // No English translations available
    }

    // Load original image
    const image = await loadImage(screenshotPath);
    const imgWidth = image.width;
    const imgHeight = image.height;

    // Check if already annotated (height > 1200)
    if (imgHeight > 1200) {
      return; // Already annotated
    }

    // Calculate caption height
    const captionHeight = 200;
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
      ctx.fillText(line, padding, yPosition);
      yPosition += lineHeight;
    });

    // Add metadata
    ctx.font = "18px Arial";
    ctx.fillStyle = "#666666";
    const resultCount = entry.resultCount || entry.uiVehicleCount || 0;
    const responseTime = entry.responseTime || 0;
    const hasError = entry.hasError ? "❌ Has Error" : "✓ Success";
    const metadata = `Result Count: ${resultCount} | Response Time: ${responseTime}ms | ${hasError}`;
    ctx.fillText(metadata, padding, imgHeight + captionHeight - 10);

    // Save annotated image (overwrite original)
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(screenshotPath, buffer);
  } catch (error) {
    console.error(
      `Failed to annotate screenshot: ${path.basename(screenshotPath)}`,
      error.message,
    );
  }
}

module.exports = { annotateSingleScreenshot };
