import assert from "node:assert/strict";
import test from "node:test";
import {
  PURCHASES_ERROR_CODE,
  PurchasesError,
  createClient,
  createPurchases,
} from "../src/purchases.js";

test("purchase notifies the customer info observer", async () => {
  const native = {
    configure() {},
    logIn() {},
    logOut() {},
    getOfferings: async () => ({ packages: [{ lookup_key: "monthly" }] }),
    purchase: async () => ({ customerInfo: { entitlements: { pro: { isActive: true } } } }),
    restore() {},
    getCustomerInfo: async () => ({ entitlements: { pro: { isActive: true } } }),
  };
  const purchases = createPurchases(native);
  const seen = [];
  purchases.addCustomerInfoUpdateListener((info) => seen.push(info));
  await purchases.configure("pk_test", "user-1");
  await purchases.purchase({ lookup_key: "monthly" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].entitlements.pro.isActive, true);
  assert.match(purchases.presentPaywall({}, [{ lookup_key: "monthly" }, { lookup_key: "annual" }]), /monthly/);
  assert.match(purchases.presentPaywall({}, [{ lookup_key: "monthly" }, { lookup_key: "annual" }]), /annual/);
});

test("getOfferings and purchasePackage follow the React Native integration", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, body: options.body });
    if (url.endsWith("/v1/offerings")) {
      return json({
        current_offering_id: "off_1",
        offerings: [
          {
            id: "off_1",
            lookup_key: "default",
            is_current: true,
            packages: [
              { lookup_key: "monthly", products: { ios: "verbs_monthly", android: "verbs_monthly_play" } },
              { lookup_key: "lifetime", products: { ios: "verbs_lifetime", android: "verbs_lifetime_play" } },
            ],
          },
        ],
      });
    }
    if (url.includes("/login")) {
      return json({ app_user_id: "account-1", entitlements: {} });
    }
    return json({
      app_user_id: "user-1",
      entitlements: { pro: { is_active: true, expires_at: "2027-10-05T00:00:00Z" } },
    });
  };

  const purchased = [];
  const purchases = createClient({
    fetchImpl,
    baseUrl: "https://payblast.bitscorp.co",
    platform: "ios",
    purchaseStoreProduct: async ({ productIdentifier }) => {
      purchased.push(productIdentifier);
      return { transactionIdentifier: "store-tx" };
    },
  });

  await purchases.configure({ apiKey: "pk_test", appUserID: "user-1" });
  const offerings = await purchases.getOfferings();
  assert.equal(offerings.current.identifier, "default");
  assert.equal(offerings.current.availablePackages[0].product.identifier, "verbs_monthly");
  assert.equal(offerings.current.availablePackages[1].packageType, "LIFETIME");

  const seen = [];
  purchases.addCustomerInfoUpdateListener((info) => seen.push(info));
  const { customerInfo, productIdentifier } = await purchases.purchasePackage(
    offerings.current.availablePackages[0],
  );
  assert.equal(productIdentifier, "verbs_monthly");
  assert.deepEqual(purchased, ["verbs_monthly"]);
  assert.equal(typeof customerInfo.entitlements.active.pro !== "undefined", true);
  assert.equal(customerInfo.entitlements.active.pro.isActive, true);
  assert.equal(seen.length, 1);
  assert.equal(calls[0].url, "https://payblast.bitscorp.co/v1/offerings");

  const restored = await purchases.restorePurchases();
  assert.equal(restored.entitlements.active.pro.expirationDate, "2027-10-05T00:00:00Z");

  const loggedIn = await purchases.logIn("account-1");
  assert.equal(loggedIn.customerInfo.originalAppUserId, "account-1");
  assert.match(calls.find((call) => call.url.includes("/login")).body, /account-1/);
});

test("a cancelled store purchase uses the same error code as the sample apps", async () => {
  const purchases = createClient({
    fetchImpl: async () => json({ offerings: [] }),
    platform: "android",
    purchaseStoreProduct: async () => {
      throw Object.assign(new Error("cancelled"), { code: PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR });
    },
  });
  await purchases.configure({ apiKey: "pk_test", appUserID: "user-1" });

  await assert.rejects(
    () => purchases.purchasePackage({ identifier: "monthly", products: { android: "play_monthly" } }),
    (error) => error instanceof PurchasesError && error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR,
  );
});

test("web purchasePackage opens Stripe Checkout", async () => {
  const purchases = createClient({
    fetchImpl: async (url) => {
      if (url.endsWith("/v1/checkout")) return json({ id: "cs_test", url: "https://checkout.stripe.test/pay" });
      if (url.endsWith("/v1/offerings")) {
        return json({
          current_offering_id: "off_1",
          offerings: [
            {
              id: "off_1",
              lookup_key: "default",
              is_current: true,
              packages: [{ lookup_key: "yearly", products: { web: "price_yearly" } }],
            },
          ],
        });
      }
      return json({ app_user_id: "user-1", entitlements: {} });
    },
    platform: "web",
  });
  await purchases.configure("pk_test", "user-1");
  const offerings = await purchases.getOfferings();
  const result = await purchases.purchasePackage(offerings.current.availablePackages[0]);
  assert.equal(result.transaction.checkoutUrl, "https://checkout.stripe.test/pay");
  assert.equal(result.productIdentifier, "price_yearly");
});

test("configure rejects a missing api key", async () => {
  const purchases = createClient({ fetchImpl: async () => json({}) });
  await assert.rejects(
    () => purchases.configure({}),
    (error) => error.code === PURCHASES_ERROR_CODE.CONFIGURATION_ERROR,
  );
});

function json(body) {
  return { ok: true, status: 200, json: async () => body };
}
