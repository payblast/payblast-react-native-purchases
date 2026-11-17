import assert from "node:assert/strict";
import test from "node:test";
import { PURCHASES_ERROR_CODE, PurchasesError, createClient } from "../src/purchases.js";
import { createRefetchController } from "../src/refetch.js";

test("failed fetches are retried with exponential backoff and not stacked", async () => {
  let pending = null;
  let attempts = 0;
  let succeed = false;
  const controller = createRefetchController({
    backoffMs: 1_000,
    maxBackoffMs: 8_000,
    schedule(fn, ms) {
      pending = { fn, ms };
      return pending;
    },
    cancel() {
      pending = null;
    },
    shouldRetry: (error) => error?.retry === true,
    refreshTask: async () => {
      attempts += 1;
      if (!succeed) throw Object.assign(new Error("offline"), { retry: true });
      return "ok";
    },
  });

  await assert.rejects(() => controller.run(), (error) => error.retry === true);
  assert.equal(pending?.ms, 1_000);
  const firstRetry = pending;

  assert.equal(await firstRetry.fn(), null);
  assert.equal(attempts, 2);
  assert.notEqual(pending, firstRetry);
  assert.equal(pending?.ms, 2_000);

  succeed = true;
  assert.equal(await pending.fn(), "ok");
  assert.equal(attempts, 3);
  assert.equal(controller.needsRefetch, false);
  assert.equal(controller.nextBackoffMs, 1_000);
});

test("background refresh is skipped until a fetch has failed and the interval has elapsed", async () => {
  let clock = 0;
  const scheduled = [];
  let attempts = 0;
  const controller = createRefetchController({
    backoffMs: 1_000,
    minIntervalMs: 2_000,
    now: () => clock,
    schedule(fn, ms) {
      scheduled.push({ fn, ms });
      return scheduled.length;
    },
    cancel() {
      scheduled.length = 0;
    },
    shouldRetry: () => true,
    refreshTask: async () => {
      attempts += 1;
      throw new Error("offline");
    },
  });

  assert.equal(controller.requestBackgroundRefresh(), null);

  await assert.rejects(() => controller.run());
  assert.equal(attempts, 1);
  clock += 100;
  assert.equal(controller.requestBackgroundRefresh(), null);
  assert.equal(attempts, 1);

  clock += 2_000;
  const pending = controller.requestBackgroundRefresh();
  assert.ok(pending);
  await pending;
  assert.equal(attempts, 2);
});

test("getOfferings coalesces in-flight requests and retries after a network error", async () => {
  const scheduled = [];
  let fetches = 0;
  let online = false;
  let resolveFetch;
  let started;
  const startedGate = new Promise((resolve) => {
    started = resolve;
  });
  const fetchImpl = () => {
    fetches += 1;
    if (!online) {
      return Promise.reject(new Error("connect ECONNREFUSED"));
    }
    return new Promise((resolve) => {
      resolveFetch = () => resolve(json({ offerings: [] }));
      started();
    });
  };

  const purchases = createClient({
    fetchImpl,
    scheduleRetry(fn, ms) {
      scheduled.push({ fn, ms });
      return scheduled.length;
    },
    cancelRetry() {
      scheduled.length = 0;
    },
  });
  await purchases.configure({ apiKey: "pk_test", appUserID: "user-1" });

  await assert.rejects(
    () => purchases.getOfferings(),
    (error) => error instanceof PurchasesError && error.code === PURCHASES_ERROR_CODE.NETWORK_ERROR,
  );
  assert.equal(fetches, 1);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].ms, 1_000);

  online = true;
  const first = purchases.getOfferings();
  const second = purchases.getOfferings();
  await startedGate;
  resolveFetch();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(fetches, 2);
  assert.equal(a.current, null);
  assert.equal(b.current, null);
  assert.equal(scheduled.length, 0);
});

test("app foreground and online events refetch failed offerings without spamming", async () => {
  const reconnect = [];
  const scheduled = [];
  let clock = 10_000;
  let fetches = 0;
  let online = false;

  const purchases = createClient({
    fetchImpl: async () => {
      fetches += 1;
      if (!online) throw new Error("offline");
      return json({
        current_offering_id: "off_1",
        offerings: [{ id: "off_1", lookup_key: "default", is_current: true, packages: [] }],
      });
    },
    now: () => clock,
    minOfferingsRefetchMs: 2_000,
    scheduleRetry(fn, ms) {
      scheduled.push({ fn, ms });
      return scheduled.length;
    },
    cancelRetry() {
      scheduled.length = 0;
    },
    subscribeAppState(onActive) {
      reconnect.push({ kind: "app", onActive });
      return () => {};
    },
    subscribeOnline(onOnline) {
      reconnect.push({ kind: "online", onOnline });
      return () => {};
    },
  });
  await purchases.configure({ apiKey: "pk_test" });
  assert.equal(reconnect.length, 2);

  await assert.rejects(() => purchases.getOfferings());
  assert.equal(fetches, 1);

  reconnect.find((entry) => entry.kind === "app").onActive();
  assert.equal(fetches, 1);

  clock += 2_000;
  online = true;
  const fromForeground = reconnect.find((entry) => entry.kind === "app").onActive();
  const offerings = await fromForeground;
  assert.equal(offerings.current.identifier, "default");
  assert.equal(fetches, 2);

  reconnect.find((entry) => entry.kind === "online").onOnline();
  assert.equal(fetches, 2);
});

test("a 4xx offerings error is not retried", async () => {
  const scheduled = [];
  const purchases = createClient({
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    scheduleRetry(fn, ms) {
      scheduled.push({ fn, ms });
      return scheduled.length;
    },
    cancelRetry() {},
  });
  await purchases.configure({ apiKey: "pk_test" });
  await assert.rejects(
    () => purchases.getOfferings(),
    (error) => error.code === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR,
  );
  assert.equal(scheduled.length, 0);
});

test("placement network errors schedule a config retry and the next call fetches again", async () => {
  const scheduled = [];
  let offeringsCalls = 0;
  const purchases = createClient({
    fetchImpl: async (url) => {
      if (url.includes("placement=")) {
        throw new Error("offline");
      }
      offeringsCalls += 1;
      return json({
        current_offering_id: "off_1",
        offerings: [{ id: "off_1", lookup_key: "home", is_current: true, packages: [] }],
      });
    },
    scheduleRetry(fn, ms) {
      scheduled.push({ fn, ms });
      return scheduled.length;
    },
    cancelRetry() {
      scheduled.length = 0;
    },
  });
  await purchases.configure({ apiKey: "pk_test" });
  await assert.rejects(() => purchases.getCurrentOfferingForPlacement("home"));
  assert.equal(scheduled.length, 1);

  const recovered = await scheduled[0].fn();
  assert.equal(recovered.current.identifier, "home");
  assert.equal(offeringsCalls, 1);
});

function json(body) {
  return { ok: true, status: 200, json: async () => body };
}
