export interface LocalizedCurrencyFormats {
  primary: string;
  variants: string[];
}

function formatLocalizedInteger(value: unknown, locale: string): string {
  const numericValue = Math.round(Number(value));
  if (!Number.isFinite(numericValue)) {
    return String(value);
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    numericValue,
  );
}

export function getLocalizedCurrencyFormats(
  value: unknown,
  countryCode: string = process.env.COUNTRY || "AU",
): LocalizedCurrencyFormats {
  const country = countryCode.toUpperCase();

  switch (country) {
    case "TR": {
      const formattedValue = formatLocalizedInteger(value, "tr-TR");
      const primary = `₺${formattedValue}`;
      return { primary, variants: [primary, `${formattedValue} lira`] };
    }
    case "AU": {
      const formattedValue = formatLocalizedInteger(value, "en-AU");
      const primary = `A$ ${formattedValue}`;
      return { primary, variants: [primary, `AUD ${formattedValue}`] };
    }
    case "IN": {
      const formattedValue = formatLocalizedInteger(value, "en-IN");
      const primary = `₹ ${formattedValue}`;
      return {
        primary,
        variants: [primary, `${formattedValue} rupees`, `INR ${formattedValue}`],
      };
    }
    case "SG": {
      const formattedValue = formatLocalizedInteger(value, "en-SG");
      const primary = `${formattedValue} SGD`;
      return {
        primary,
        variants: [primary, `SGD ${formattedValue}`, `S$${formattedValue}`],
      };
    }
    case "KR": {
      const formattedValue = formatLocalizedInteger(value, "ko-KR");
      const primary = `${formattedValue} 원`;
      return { primary, variants: [primary, `KRW ${formattedValue}`] };
    }
    case "TH": {
      const formattedValue = formatLocalizedInteger(value, "en-TH");
      const primary = `THB ${formattedValue}`;
      return {
        primary,
        variants: [primary, `${formattedValue} baht`, `฿${formattedValue}`],
      };
    }
    case "JP": {
      const formattedValue = formatLocalizedInteger(value, "ja-JP");
      const primary = `¥${formattedValue}`;
      return {
        primary,
        variants: [primary, `${formattedValue} yen`, `${formattedValue}円`],
      };
    }
    default: {
      const primary = formatLocalizedInteger(value, "en-US");
      return { primary, variants: [] };
    }
  }
}
