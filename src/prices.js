const MICROS_PER_UNIT = 1_000_000;

const MONTHS_PER = {
  day: 12 / 365,
  week: 12 / 52,
  month: 1,
  year: 12,
};

const ZERO_DECIMAL = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "UYI",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function currencyMinorDigits(currencyCode) {
  const code = String(currencyCode || "USD").toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

export function decimalAmount(input = {}) {
  const currencyCode = currencyCodeOf(input);

  if (hasNumber(input.price)) return Number(input.price);

  const micros =
    input.priceMicros ?? input.price_micros ?? input.amountMicros ?? input.amount_micros ?? null;
  if (hasNumber(micros)) return Number(micros) / MICROS_PER_UNIT;

  const unitAmount = input.unitAmount ?? input.unit_amount ?? null;
  if (hasNumber(unitAmount)) return Number(unitAmount) / 10 ** currencyMinorDigits(currencyCode);

  return null;
}

export function billedMonths(period, packageType) {
  if (typeof period === "number" && Number.isFinite(period) && period > 0) return period;

  const isoMonths = parseIsoPeriod(period);
  if (isoMonths) return isoMonths;

  const normalized = normalizeBilledPeriod(period, packageType);
  return normalized ? MONTHS_PER[normalized] : null;
}

export function normalizeBilledPeriod(value, packageType) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "day" || raw === "daily" || raw === "p1d") return "day";
  if (raw === "week" || raw === "weekly" || raw === "p1w" || raw === "p7d") return "week";
  if (raw === "month" || raw === "monthly" || raw === "p1m") return "month";
  if (raw === "year" || raw === "yearly" || raw === "annual" || raw === "p1y" || raw === "p12m") {
    return "year";
  }
  if (packageType === "WEEKLY") return "week";
  if (packageType === "MONTHLY") return "month";
  if (packageType === "ANNUAL") return "year";
  return null;
}

export function formatPrice(amount, currencyCode, locale, formatter) {
  if (!Number.isFinite(Number(amount))) return "";
  const code = String(currencyCode || "USD").toUpperCase();
  const digits = currencyMinorDigits(code);
  const value = quantizeMinor(amount, code, "round");
  const numberFormat = formatter || priceFormatter(code, locale);
  try {
    return numberFormat.format(value);
  } catch {
    const fixed = digits === 0 ? `${Math.round(value)}` : value.toFixed(digits);
    return `${fixed} ${code}`.trim();
  }
}

export function priceFormatter(currencyCode, locale) {
  const code = String(currencyCode || "USD").toUpperCase();
  const digits = currencyMinorDigits(code);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function pricePerDay(price, period, currencyCode) {
  return convertPrice(price, period, "day", currencyCode);
}

export function pricePerWeek(price, period, currencyCode) {
  return convertPrice(price, period, "week", currencyCode);
}

export function pricePerMonth(price, period, currencyCode) {
  return convertPrice(price, period, "month", currencyCode);
}

export function pricePerYear(price, period, currencyCode) {
  return convertPrice(price, period, "year", currencyCode);
}

export function periodPrices(input = {}) {
  const currencyCode = currencyCodeOf(input);
  const locale = input.locale || undefined;
  const amount = decimalAmount(input);
  const months = billedMonths(
    input.billedPeriod ?? input.subscriptionPeriod ?? input.subscription_period ?? input.period,
    input.packageType,
  );
  const formatter = amount == null ? null : priceFormatter(currencyCode, locale);
  const priceString =
    amount == null
      ? String(input.priceString ?? input.price_string ?? "")
      : formatPrice(amount, currencyCode, locale, formatter);

  const periods = {
    pricePerDay: null,
    pricePerWeek: null,
    pricePerMonth: null,
    pricePerYear: null,
  };

  if (amount != null && months) {
    periods.pricePerDay = convertFromMonths(amount, months, MONTHS_PER.day, currencyCode);
    periods.pricePerWeek = convertFromMonths(amount, months, MONTHS_PER.week, currencyCode);
    periods.pricePerMonth = convertFromMonths(amount, months, MONTHS_PER.month, currencyCode);
    periods.pricePerYear = convertFromMonths(amount, months, MONTHS_PER.year, currencyCode);
  }

  return {
    price: amount,
    currencyCode,
    priceString,
    ...periods,
    pricePerDayString: formatMaybe(periods.pricePerDay, currencyCode, locale, formatter),
    pricePerWeekString: formatMaybe(periods.pricePerWeek, currencyCode, locale, formatter),
    pricePerMonthString: formatMaybe(periods.pricePerMonth, currencyCode, locale, formatter),
    pricePerYearString: formatMaybe(periods.pricePerYear, currencyCode, locale, formatter),
  };
}

export function pricingFromPackage(pkg, packageType, locale) {
  const product = pkg?.product && typeof pkg.product === "object" ? pkg.product : {};
  return periodPrices({
    price: pkg?.price ?? product.price,
    priceMicros: pkg?.price_micros ?? pkg?.priceMicros ?? product.priceMicros ?? product.price_micros,
    unitAmount: pkg?.unit_amount ?? pkg?.unitAmount ?? product.unitAmount ?? product.unit_amount,
    currencyCode:
      pkg?.currency_code ||
      pkg?.currencyCode ||
      pkg?.currency ||
      product.currencyCode ||
      product.currency_code ||
      product.currency,
    billedPeriod:
      pkg?.subscription_period ||
      pkg?.subscriptionPeriod ||
      pkg?.period ||
      product.subscriptionPeriod ||
      product.subscription_period,
    packageType,
    locale,
    priceString: pkg?.price_string ?? pkg?.priceString ?? product.priceString,
  });
}

function convertPrice(price, period, toPeriod, currencyCode) {
  const months = billedMonths(period);
  if (price == null || !months) return null;
  return convertFromMonths(price, months, MONTHS_PER[toPeriod], currencyCode);
}

function convertFromMonths(price, fromMonths, toMonths, currencyCode) {
  const digits = currencyMinorDigits(currencyCode);
  const factor = 10 ** digits;
  const billedMinor = Math.round(Number(price) * factor);
  if (!Number.isFinite(billedMinor) || !fromMonths) return null;
  const converted = billedMinor * (toMonths / fromMonths);
  const minor =
    converted >= 0 ? Math.floor(converted + 1e-9) : Math.ceil(converted - 1e-9);
  return minor / factor;
}

function quantizeMinor(amount, currencyCode, mode) {
  const digits = currencyMinorDigits(currencyCode);
  const factor = 10 ** digits;
  const scaled = Number(amount) * factor;
  const minor = mode === "round" ? Math.round(scaled) : Math.floor(scaled + 1e-9);
  return minor / factor;
}

function parseIsoPeriod(value) {
  const match = /^p(?:(\d+)y)?(?:(\d+)m)?(?:(\d+)w)?(?:(\d+)d)?$/i.exec(String(value || "").trim());
  if (!match) return null;
  const years = Number(match[1] || 0);
  const months = Number(match[2] || 0);
  const weeks = Number(match[3] || 0);
  const days = Number(match[4] || 0);
  const total = years * 12 + months + weeks * MONTHS_PER.week + days * MONTHS_PER.day;
  return total > 0 ? total : null;
}

function currencyCodeOf(input) {
  return String(input.currencyCode || input.currency_code || input.currency || "USD").toUpperCase();
}

function formatMaybe(amount, currencyCode, locale, formatter) {
  return amount == null ? "" : formatPrice(amount, currencyCode, locale, formatter);
}

function hasNumber(value) {
  return value != null && value !== "" && Number.isFinite(Number(value));
}
