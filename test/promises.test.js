import assert from "node:assert/strict";
import test from "node:test";
import { PURCHASES_ERROR_CODE, PurchasesError, createClient, createPurchases } from "../src/purchases.js";

test("getOfferings rejects on network errors instead of returning undefined", async () => {
  const purchases = createClient({
    fetchImpl: async () => {
      throw new Error("connect ECONNREFUSED");
    },
  });
  await purchases.configure({ apiKey: "pk_test", appUserID: "user-1" });
  await assert.rejects(
    () => purchases.getOfferings(),
    (error) =>
      error instanceof PurchasesError &&
      error.code === PURCHASES_ERROR_CODE.NETWORK_ERROR &&
      error !== undefined,
  );
});

test("placement lookup rejects on network errors", async () => {
  const purchases = createClient({
    fetchImpl: async () => {
      throw new Error("connect ECONNREFUSED");
    },
  });
  await purchases.configure({ apiKey: "pk_test", appUserID: "user-1" });
  await assert.rejects(
    () => purchases.getCurrentOfferingForPlacement("home"),
    (error) => error instanceof PurchasesError && error.code === PURCHASES_ERROR_CODE.NETWORK_ERROR,
  );
});

test("placement lookup returns the named offering and not undefined", async () => {
  const purchases = createClient({
    fetchImpl: async () =>
      json({
        current_offering_id: "off_home",
        offerings: [
          { id: "off_home", lookup_key: "home", is_current: true, packages: [] },
          { id: "off_onboarding", lookup_key: "onboarding", packages: [] },
        ],
      }),
  });
  await purchases.configure({ apiKey: "pk_test", appUserID: "user-1" });
  const home = await purchases.getCurrentOfferingForPlacement("home");
  const onboarding = await purchases.getCurrentOfferingForPlacement("onboarding");
  assert.equal(home.identifier, "home");
  assert.equal(onboarding.identifier, "onboarding");
  assert.notEqual(home, undefined);
});

test("getOfferings rejects when the request never completes", async () => {
  const purchases = createClient({
    fetchImpl: () => new Promise(() => {}),
    requestTimeoutMs: 20,
  });
  await purchases.configure({ apiKey: "pk_test", appUserID: "user-1" });
  await assert.rejects(
    () => purchases.getOfferings(),
    (error) => error instanceof PurchasesError && error.code === PURCHASES_ERROR_CODE.NETWORK_ERROR,
  );
});

test("presentPaywall rejects when native UI cannot present", async () => {
  const purchases = createClient({
    presentPaywall: async () => {
      throw new Error("Attempt to present on a view controller that is already presenting");
    },
  });
  await purchases.configure({ apiKey: "pk_test" });
  await assert.rejects(
    () => purchases.presentPaywall({}, [{ lookup_key: "monthly" }]),
    (error) => error instanceof PurchasesError && error.code === PURCHASES_ERROR_CODE.PRESENTATION_ERROR,
  );
});

test("presentPaywall rejects when presentation never settles", async () => {
  const purchases = createClient({
    presentPaywall: () => new Promise(() => {}),
    presentTimeoutMs: 20,
  });
  await purchases.configure({ apiKey: "pk_test" });
  await assert.rejects(
    () => purchases.presentPaywall({}, []),
    (error) => error instanceof PurchasesError && error.code === PURCHASES_ERROR_CODE.PRESENTATION_ERROR,
  );
});

test("presentPaywall without a presenter still settles", async () => {
  const purchases = createClient({ fetchImpl: async () => json({}) });
  const result = await purchases.presentPaywall({}, [{ lookup_key: "monthly" }]);
  assert.equal(result, "monthly");
});

test("native restore rejects when the store never finishes", async () => {
  const purchases = createClient({
    fetchImpl: async () => json({ entitlements: {} }),
    platform: "ios",
    nativeTimeoutMs: 20,
    nativeModule: {
      purchase: async () => ({ transactionIdentifier: "1" }),
      restore: () => new Promise(() => {}),
    },
  });
  await purchases.configure({ apiKey: "pk_test", appUserID: "user-1" });
  await assert.rejects(
    () => purchases.restorePurchases(),
    (error) => error instanceof PurchasesError && error.code === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR,
  );
});

test("createPurchases placement lookup rejects native errors", async () => {
  const purchases = createPurchases({
    configure() {},
    getOfferings: async () => ({ all: {}, current: null }),
    getCurrentOfferingForPlacement: async () => {
      throw new Error("network down");
    },
    purchase: async () => ({}),
    restore() {},
    getCustomerInfo: async () => ({}),
  });
  await assert.rejects(
    () => purchases.getCurrentOfferingForPlacement("home"),
    (error) => error instanceof PurchasesError && error.code === PURCHASES_ERROR_CODE.NETWORK_ERROR,
  );
});

function json(body) {
  return { ok: true, status: 200, json: async () => body };
}
