export const SUPPORTED_COUNTRIES = ["AU", "IN", "JP", "KR", "SG", "TH", "TR"];

const LANGUAGE_BY_COUNTRY: Record<string, string> = {
  JP: "JA",
  KR: "KO",
  TH: "TH",
  TR: "TR",
};

export function getLanguageForCountry(country: string): string {
  return LANGUAGE_BY_COUNTRY[country.toUpperCase()] || "EN";
}

export function setCountryAndLanguage(country: string): void {
  process.env.COUNTRY = country;
  process.env.LANGUAGE = getLanguageForCountry(country);
}

export function restoreCountryAndLanguage(
  originalCountry: string | undefined,
  originalLanguage: string | undefined,
): void {
  if (originalCountry) {
    process.env.COUNTRY = originalCountry;
  } else {
    delete process.env.COUNTRY;
  }

  if (originalLanguage) {
    process.env.LANGUAGE = originalLanguage;
  } else {
    delete process.env.LANGUAGE;
  }
}
