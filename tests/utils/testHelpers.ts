import fs from "fs/promises";

export const ENVIRONMENT = process.env.ENVIRONMENT || "PROD";
export const COUNTRY = process.env.COUNTRY || "AU";
export const LANGUAGE = process.env.LANGUAGE || "EN";
export const PRODUCT = process.env.PRODUCT || "EMH";

export const testDataVehiclesNonMB = "./tests/data/vehicles-make-model.json";

export async function logTestContext({
  describeName,
  testInfo,
  browserType,
  env,
  country,
  product,
  project,
  timestamp,
  language,
}: {
  describeName: string;
  testInfo: any;
  browserType: string;
  env?: string;
  country?: string;
  product?: string;
  project?: string;
  timestamp?: string;
  language?: string;
}) {
  console.log(`\n--- Test Execution ---`);
  console.log(`• Describe: ${describeName}`);
  console.log(`• Title: ${testInfo.title}`);
  console.log(`• Browser: ${browserType}`);
  console.log(`• Environment: ${env || ENVIRONMENT}`);
  console.log(`• Country: ${country || COUNTRY}`);
  console.log(`• Language: ${language || LANGUAGE}`);
  console.log(`• Product: ${product || PRODUCT}`);
  console.log(`• Project: ${project}`);
  console.log(`• Timestamp: ${timestamp}`);
  console.log(`----------------------\n`);
}

export async function getRandomVehicleCombinations(
  count: number,
  minLen: number = 2,
  maxLen: number = 5
): Promise<string[]> {
  const file = await fs.readFile(testDataVehiclesNonMB, "utf-8");
  const vehicleArray: string[] = JSON.parse(file);
  const combos: string[] = [];
  while (combos.length < count) {
    const len = Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen;
    const shuffled = vehicleArray.slice().sort(() => 0.5 - Math.random());
    const combo = shuffled.slice(0, len).join(" ");
    if (!combos.includes(combo)) combos.push(combo);
  }
  return combos;
}
