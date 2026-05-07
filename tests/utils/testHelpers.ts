import fs from "fs/promises";

export const ENVIRONMENT = process.env.ENVIRONMENT || "PROD";
export const COUNTRY = process.env.COUNTRY || "AU";
export const LANGUAGE = process.env.LANGUAGE || "EN";
export const PRODUCT = process.env.PRODUCT || "EMH";
export const VEHICLE_CATEGORY = process.env.VEHICLE_CATEGORY || "PASSENGER-CARS";

export const testDataVehicles = "./tests/data/vehicles-make-model.json";

export async function logTestContext({
  describeName,
  testInfo,
  browserType,
  env,
  country,
  product,
  vehicleCategory,
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
  vehicleCategory?: string;
  project?: string;
  timestamp?: string;
  language?: string;
}) {
  console.log(`\n--------------- Test Execution ---------------`);
  console.log(`• Describe:          ${describeName}`);
  console.log(`• Title:             ${testInfo.title}`);
  console.log(`• Browser:           ${browserType}`);
  console.log(`• Environment:       ${env || ENVIRONMENT}`);
  console.log(`• Country:           ${country || COUNTRY}`);
  console.log(`• Language:          ${language || LANGUAGE}`);
  console.log(`• Product:           ${product || PRODUCT}`);
  console.log(`• Vehicle Category:  ${vehicleCategory || VEHICLE_CATEGORY}`);
  console.log(`• Project:           ${project}`);
  console.log(`• Timestamp:         ${timestamp}`);
  console.log(`-----------------------------------------------\n`);
}

export async function getRandomVehicleCombinationsNonMB(
  count: number,
  minLen: number = 2,
  maxLen: number = 5
): Promise<string[]> {
  const file = await fs.readFile(testDataVehicles, "utf-8");
  const vehicleArray: { mb: string[]; "non-mb": string[] } = JSON.parse(file);
  const combos: string[] = [];
  while (combos.length < count) {
    const len = Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen;
    const shuffled = vehicleArray["non-mb"].slice().sort(() => 0.5 - Math.random());
    const combo = shuffled.slice(0, len).join(" ");
    if (!combos.includes(combo)) combos.push(combo);
  }
  return combos;
}
