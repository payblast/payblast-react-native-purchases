import assert from "node:assert/strict";
import test from "node:test";
import { createPurchases } from "../src/purchases.js";

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
