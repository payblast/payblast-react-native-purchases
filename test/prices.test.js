import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "../src/purchases.js";
import {
  currencyMinorDigits,
  decimalAmount,
  periodPrices,
  pricePerMonth,
  pricePerWeek,
  pricePerYear,
} from "../src/prices.js";

test("currency minor units follow ISO 4217", () => {
  assert.equal(currencyMinorDigits("USD"), 2);
  assert.equal(currencyMinorDigits("EUR"), 2);
  assert.equal(currencyMinorDigits("JPY"), 0);
  assert.equal(currencyMinorDigits("KRW"), 0);
  assert.equal(currencyMinorDigits("KWD"), 3);
});

test("web micros become decimal currency units", () => {
  const monthly = periodPrices({
    priceMicros: 9_990_000,
    currencyCode: "USD",
    billedPeriod: "month",
    locale: "en-US",
  });
  assert.equal(monthly.price, 9.99);
  assert.equal(monthly.pricePerMonth, 9.99);
  assert.equal(monthly.pricePerWeek, 2.3);
  assert.equal(monthly.pricePerYear, 119.88);
  assert.equal(monthly.priceString, "$9.99");
  assert.equal(monthly.pricePerMonthString, "$9.99");
});

test("Stripe minor units become decimal currency units", () => {
  assert.equal(decimalAmount({ unitAmount: 999, currencyCode: "USD" }), 9.99);
  assert.equal(decimalAmount({ unitAmount: 1200, currencyCode: "JPY" }), 1200);
});

test("yearly USD prices do not round per-month amounts up", () => {
  assert.equal(pricePerMonth(83.99, "year", "USD"), 6.99);
  assert.equal(pricePerMonth(59.99, "year", "USD"), 4.99);
  assert.equal(pricePerMonth(119.99, "year", "USD"), 9.99);
  const priced = periodPrices({
    price: 83.99,
    currencyCode: "USD",
    billedPeriod: "year",
    locale: "en-US",
  });
  assert.equal(priced.pricePerMonthString, "$6.99");
  assert.notEqual(priced.pricePerMonthString, "$7.00");
  assert.notEqual(priced.pricePerMonthString, "$7");
});

test("weekly, monthly, and yearly USD helpers stay in major units", () => {
  const weekly = periodPrices({ price: 4.99, currencyCode: "USD", billedPeriod: "week", locale: "en-US" });
  assert.equal(weekly.pricePerWeek, 4.99);
  assert.equal(weekly.pricePerMonth, 21.62);
  assert.equal(weekly.pricePerYear, 259.48);
  assert.equal(pricePerWeek(4.99, "week", "USD"), 4.99);
  assert.equal(pricePerYear(9.99, "month", "USD"), 119.88);

  const monthly = periodPrices({ price: 9.99, currencyCode: "USD", billedPeriod: "month", locale: "en-US" });
  assert.equal(monthly.pricePerMonth, 9.99);
  assert.equal(monthly.pricePerDay, 0.32);
  assert.equal(monthly.priceString, monthly.pricePerMonthString);
});

test("JPY and KRW stay on zero fractional digits", () => {
  const jpy = periodPrices({ price: 1200, currencyCode: "JPY", billedPeriod: "month", locale: "en-US" });
  assert.equal(jpy.price, 1200);
  assert.equal(jpy.pricePerMonth, 1200);
  assert.equal(jpy.pricePerYear, 14400);
  assert.equal(pricePerMonth(10000, "year", "JPY"), 833);
  assert.equal(/\.\d/.test(jpy.priceString), false);
  assert.equal(/\.\d/.test(jpy.pricePerMonthString), false);

  const krw = periodPrices({ price: 11999, currencyCode: "KRW", billedPeriod: "year", locale: "en-US" });
  assert.equal(krw.pricePerMonth, 999);
  assert.equal(/\.\d/.test(krw.pricePerMonthString), false);
});

test("EUR uses two minor digits", () => {
  const eur = periodPrices({ price: 9.99, currencyCode: "EUR", billedPeriod: "month", locale: "de-DE" });
  assert.equal(eur.pricePerMonth, 9.99);
  assert.equal(eur.pricePerYear, 119.88);
  assert.match(eur.priceString, /9,99/);
  assert.equal(fractionStyle(eur.priceString), fractionStyle(eur.pricePerMonthString));
});

test("per-period strings use the same formatter as the billed price", () => {
  const usdFrench = periodPrices({
    price: 44.99,
    currencyCode: "USD",
    billedPeriod: "year",
    locale: "fr-FR",
  });
  const usdEnglish = periodPrices({
    price: 44.99,
    currencyCode: "USD",
    billedPeriod: "year",
    locale: "en-US",
  });

  assert.equal(currencyToken(usdFrench.priceString), currencyToken(usdFrench.pricePerMonthString));
  assert.equal(fractionStyle(usdFrench.priceString), fractionStyle(usdFrench.pricePerMonthString));
  assert.equal(usdFrench.pricePerMonth, 3.74);
  assert.equal(usdEnglish.priceString, "$44.99");
  assert.equal(usdEnglish.pricePerMonthString, "$3.74");
  assert.notEqual(usdFrench.pricePerMonthString, usdEnglish.pricePerMonthString);
});

test("getOfferings attaches period prices from decimal amounts", async () => {
  const purchases = createClient({
    fetchImpl: async () =>
      json({
        current_offering_id: "off_1",
        offerings: [
          {
            id: "off_1",
            lookup_key: "default",
            is_current: true,
            packages: [
              {
                lookup_key: "yearly",
                products: { ios: "pro_yearly" },
                price: 83.99,
                currency_code: "USD",
              },
              {
                lookup_key: "monthly",
                products: { ios: "pro_monthly" },
                price_micros: 9_990_000,
                currency_code: "USD",
              },
            ],
          },
        ],
      }),
    platform: "ios",
    locale: "en-US",
  });
  await purchases.configure({ apiKey: "pk_test", appUserID: "user-1" });
  const offerings = await purchases.getOfferings();
  const yearly = offerings.current.availablePackages[0].product;
  const monthly = offerings.current.availablePackages[1].product;
  assert.equal(yearly.price, 83.99);
  assert.equal(yearly.pricePerMonth, 6.99);
  assert.equal(yearly.pricePerMonthString, "$6.99");
  assert.equal(yearly.priceString, "$83.99");
  assert.equal(monthly.price, 9.99);
  assert.equal(monthly.pricePerMonthString, monthly.priceString);
});

test("lifetime packages keep a decimal price without period amounts", () => {
  const lifetime = periodPrices({ price: 99.99, currencyCode: "USD", packageType: "LIFETIME", locale: "en-US" });
  assert.equal(lifetime.price, 99.99);
  assert.equal(lifetime.priceString, "$99.99");
  assert.equal(lifetime.pricePerMonth, null);
  assert.equal(lifetime.pricePerMonthString, "");
});

function currencyToken(formatted) {
  return formatted.replace(/[\d\s.,\u00a0\u202f]/g, "");
}

function fractionStyle(formatted) {
  if (/\d,\d/.test(formatted)) return "comma";
  if (/\d\.\d/.test(formatted)) return "dot";
  return "none";
}

function json(body) {
  return { ok: true, status: 200, json: async () => body };
}
