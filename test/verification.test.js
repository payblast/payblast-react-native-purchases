import assert from "node:assert/strict";
import test from "node:test";
import { applyEntitlementVerificationMode } from "../src/native.js";
import {
  ENTITLEMENT_VERIFICATION_MODE,
  PURCHASES_ERROR_CODE,
  createClient,
} from "../src/purchases.js";

test("entitlement verification defaults to ENFORCED, not DISABLED", async () => {
  const nativeCalls = [];
  const purchases = createClient({
    fetchImpl: async () => json({}),
    nativeModule: {
      purchase: async () => ({}),
      restore: async () => ({}),
      setEntitlementVerificationMode: (mode) => nativeCalls.push(mode),
    },
  });

  await purchases.configure({ apiKey: "pk_test", appUserID: "user-1" });

  assert.equal(ENTITLEMENT_VERIFICATION_MODE.ENFORCED, "ENFORCED");
  assert.notEqual(ENTITLEMENT_VERIFICATION_MODE.ENFORCED, ENTITLEMENT_VERIFICATION_MODE.DISABLED);
  assert.equal(purchases.getEntitlementVerificationMode(), ENTITLEMENT_VERIFICATION_MODE.ENFORCED);
  assert.deepEqual(nativeCalls, []);
});

test("configure does not send a verification mode unless the app sets one", async () => {
  const nativeCalls = [];
  const nativeModule = {
    purchase: async () => ({}),
    restore: async () => ({}),
    setEntitlementVerificationMode: (mode) => nativeCalls.push(mode),
  };

  assert.equal(
    applyEntitlementVerificationMode(nativeModule, ENTITLEMENT_VERIFICATION_MODE.DISABLED, {
      explicit: false,
    }),
    false,
  );
  assert.deepEqual(nativeCalls, []);

  const purchases = createClient({
    fetchImpl: async () => json({}),
    nativeModule,
  });
  await purchases.configure("pk_test", "user-1");
  await purchases.configure({ apiKey: "pk_test", appUserID: "user-1" });
  assert.deepEqual(nativeCalls, []);
});

test("an explicit verification mode is forwarded to native", async () => {
  const nativeCalls = [];
  const purchases = createClient({
    fetchImpl: async () => json({}),
    nativeModule: {
      purchase: async () => ({}),
      restore: async () => ({}),
      setEntitlementVerificationMode: (mode) => nativeCalls.push(mode),
    },
  });

  await purchases.configure({
    apiKey: "pk_test",
    appUserID: "user-1",
    entitlementVerificationMode: ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
  });
  assert.deepEqual(nativeCalls, [ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL]);
  assert.equal(purchases.getEntitlementVerificationMode(), ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL);

  await purchases.configure({
    apiKey: "pk_test",
    entitlementVerificationMode: ENTITLEMENT_VERIFICATION_MODE.DISABLED,
  });
  assert.deepEqual(nativeCalls, [
    ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
    ENTITLEMENT_VERIFICATION_MODE.DISABLED,
  ]);
});

test("an invalid verification mode is rejected", async () => {
  const purchases = createClient({ fetchImpl: async () => json({}) });
  await assert.rejects(
    () =>
      purchases.configure({
        apiKey: "pk_test",
        entitlementVerificationMode: "OFF",
      }),
    (error) => error.code === PURCHASES_ERROR_CODE.CONFIGURATION_ERROR,
  );
});

function json(body) {
  return { ok: true, status: 200, json: async () => body };
}
