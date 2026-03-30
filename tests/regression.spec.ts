import "dotenv/config";
import { test, expect } from "@playwright/test";
import { runTestsAndSaveResults } from "./utils/shared";
import { performUISmartSearchAndGetResults, processAndLogUiResult, setupContextAndPage } from "./utils/uiHelpers";
import { performApiSmartSearchAndGetResults, processAndLogApiResult } from "./utils/apiHelpers";

test.describe("Regression Tests", () => {
  const describeName = "Regression Tests";
  test.beforeEach(() => {
    test.skip(!process.env.OPENAI_API_KEY, "OPENAI_API_KEY is required for evaluator regression checks.");
  });

  test("Evaluate Bug Fixes", { tag: ["@regression"] }, async ({ browser }) => {
    const queries = [
      "A compact car with a fuel-efficient hybrid engine and a sleek, modern exterior design.",
      "A sleek sedan with a turbocharged engine, leather interior, and a bold metallic blue exterior would be ideal for my daily commute.",
      "A sleek sedan with a turbocharged engine, leather interior, and a vibrant metallic blue exterior would be ideal for my daily commute.",
      "A sleek sedan with a turbocharged engine, leather interior, and advanced safety features would be ideal.",
      "A sleek sedan with a turbocharged engine, leather interior, and advanced safety features would be my ideal choice.",
      "A sleek sedan with a turbocharged engine, leather interior, and advanced safety features would be perfect for my daily commute.",
      "A sleek sedan with a turbocharged engine, leather interior, and metallic blue exterior would perfectly match my style and performance needs.",
      "BlueCruise",
      "Do you have cars suitable for wheelchair users?",
      "Do you have vehicles that can be used with hand controls?",
      "Do you have vehicles with e-POWER?",
      "Do you have vehicles with quattro all-wheel drive?",
      "e:HEV",
      "Find cars that come with EyeSight driver assist",
      "Find models with Hybrid Synergy Drive",
      "G-Vectoring Control",
      "i-MMD",
      "I'm interested in exploring the latest features of the Mercedes-Benz GLC Coupe.",
      "I'm looking for a family car",
      "I'm looking for cars that are easy for elderly people to get in and out of.",
      "I'm looking for cars that use SKYACTIV technology",
      "I'm looking for models with i-VTEC technology",
      "I'm really interested in checking out the new Mercedes-Benz GLC to see how it handles both city streets and off-road trails.",
      "I'm really interested in test driving the latest Mercedes-Benz GLC to see how it handles on both city streets and highways.",
      "I'm really interested in test driving the Mercedes-Benz GLC to see how it handles both city streets and highways.",
      "I'm really interested in test driving the Mercedes-Benz GLC to see how it handles in city traffic.",
      "I'm really interested in test-driving the Mercedes-Benz GLC to see how it handles both city streets and highways.",
      "I'm really interested in test-driving the Mercedes-Benz GLC to see how it handles on both city streets and highways.",
      "I want models that has VTEC engine",
      "I want to see only petrol and diesel vehicles",
      "I'm sorry, but I can't assist with that request.",
      "my budget is under AUD80,000",
      "ProPILOT",
      "S-AWC",
      "Seeking a sleek sedan with a fuel-efficient turbocharged engine, leather interior, and a bold metallic blue exterior.",
      "Seeking a sleek sedan with a turbocharged engine, leather interior, and a glossy black exterior finish.",
      "Seeking a sleek sedan with a turbocharged engine, leather interior, and advanced safety features for a comfortable daily commute.",
      "Seeking a sleek sedan with a turbocharged engine, leather interior, and a vibrant metallic blue exterior.",
      "SH-AWD",
      "Show cars with boxer engine",
      "Show cars with xDrive all-wheel drive",
      "Show me cars with Pilot Assist",
      "Show me sedans",
      "Show Mercedes-Benz S-Class sedans",
      "Super Cruise",
      "VC-Turbo",
      "We are considering a white Mercedes-Benz EQS",
      "a suitable car for Sally Jackson, a 35-year-old married woman",
      "can I schedule a test drive?",
      "can you give me a recommendation?",
      "do you offer financing options?",
      "what warranties do you provide for new vehicles?",
      "xMode",
      "मुझे बताओ कि भारत की सड़कों के लिए कौन सा मॉडल अच्छा है?"
    ];
    await runTestsAndSaveResults({
      queries: queries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "from-regression-list",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });
});
