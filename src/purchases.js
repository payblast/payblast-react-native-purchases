import { withTimeout } from "./async.js";
import { loadNativePurchases, storeFromNative } from "./native.js";
import { pricingFromPackage } from "./prices.js";

export const PURCHASES_ERROR_CODE = {
  PURCHASE_CANCELLED_ERROR: "PURCHASE_CANCELLED_ERROR",
  PURCHASE_NOT_ALLOWED_ERROR: "PURCHASE_NOT_ALLOWED_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  STORE_PROBLEM_ERROR: "STORE_PROBLEM_ERROR",
  PRESENTATION_ERROR: "PRESENTATION_ERROR",
};

const DEFAULT_BASE_URL = "https://payblastfs.com";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class PurchasesError extends Error {
  constructor(message, code = PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR) {
    super(message);
    this.name = "PurchasesError";
    this.code = code;
    this.userCancelled = code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
  }
}

export function createPurchases(native) {
  const listeners = new Set();

  return {
    configure(apiKey, appUserId) {
      return Promise.resolve(native.configure(apiKey, appUserId));
    },
    logIn(appUserId) {
      return Promise.resolve(native.logIn(appUserId));
    },
    logOut() {
      return Promise.resolve(native.logOut());
    },
    getOfferings() {
      return Promise.resolve(native.getOfferings());
    },
    async getCurrentOfferingForPlacement(placementIdentifier) {
      if (typeof native.getCurrentOfferingForPlacement === "function") {
        try {
          return await native.getCurrentOfferingForPlacement(placementIdentifier);
        } catch (error) {
          if (error instanceof PurchasesError) throw error;
          throw new PurchasesError(
            error?.message || "Placement lookup failed",
            PURCHASES_ERROR_CODE.NETWORK_ERROR,
          );
        }
      }
      const offerings = await this.getOfferings();
      return offeringForPlacement(offerings, placementIdentifier);
    },
    async purchase(pkg) {
      const result = await native.purchase(pkg);
      const customer = result.customer || result.customerInfo;
      for (const listener of listeners) listener(customer);
      return { ...result, customer, customerInfo: customer };
    },
    subscribe(pkg) {
      return this.purchase(pkg);
    },
    restore() {
      return Promise.resolve(native.restore());
    },
    restorePurchases() {
      return Promise.resolve(native.restore());
    },
    getCustomer() {
      return Promise.resolve(native.getCustomer ? native.getCustomer() : native.getCustomerInfo());
    },
    getCustomerInfo() {
      return this.getCustomer();
    },
    presentPaywall(_document, packages) {
      return (packages || []).map((pkg) => pkg.lookup_key || pkg.identifier).join(" ");
    },
    addCustomerUpdateListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    addCustomerInfoUpdateListener(listener) {
      return this.addCustomerUpdateListener(listener);
    },
  };
}

export function createClient({
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_BASE_URL,
  platform = detectPlatform(),
  purchaseStoreProduct = null,
  restoreStore = null,
  nativeModule,
  presentPaywall: presentPaywallImpl = null,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  presentTimeoutMs = 15_000,
  nativeTimeoutMs = 0,
  locale,
} = {}) {
  let apiKey = null;
  let appUserId = null;
  const listeners = new Set();

  function notify(customer) {
    for (const listener of listeners) listener(customer);
  }

  async function request(path, options = {}) {
    if (!apiKey) {
      throw new PurchasesError(
        'Configure Payblast before calling the API: Purchases.configure({ apiKey: "pk_..." })',
        PURCHASES_ERROR_CODE.CONFIGURATION_ERROR,
      );
    }

    let response;

    try {
      response = await withTimeout(
        fetchImpl(`${baseUrl}${path}`, {
          ...options,
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            ...(options.headers || {}),
          },
        }),
        requestTimeoutMs,
        () => new PurchasesError("Payblast request timed out", PURCHASES_ERROR_CODE.NETWORK_ERROR),
      );
    } catch (error) {
      if (error instanceof PurchasesError) throw error;
      throw new PurchasesError(error.message || "Network request failed", PURCHASES_ERROR_CODE.NETWORK_ERROR);
    }

    if (!response.ok) {
      throw new PurchasesError(
        `Payblast request failed: ${response.status}`,
        response.status >= 500 ? PURCHASES_ERROR_CODE.NETWORK_ERROR : PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR,
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new PurchasesError(error.message || "Payblast returned invalid JSON", PURCHASES_ERROR_CODE.NETWORK_ERROR);
    }
  }

  async function fetchCustomer() {
    const body = await request(`/v1/customers/${encodeURIComponent(appUserId)}`);
    return toCustomer(body);
  }

  function settleNative(result, message) {
    return withTimeout(result, nativeTimeoutMs, () => new PurchasesError(message, PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR));
  }

  function resolveStore() {
    if (purchaseStoreProduct) {
      return {
        purchaseStoreProduct: (args) =>
          settleNative(purchaseStoreProduct(args), "The store purchase did not finish."),
        restoreStore: restoreStore
          ? (args) => settleNative(restoreStore(args), "Restore did not finish.")
          : null,
      };
    }
    const linked = nativeModule === undefined ? loadNativePurchases() : nativeModule;
    const store = storeFromNative(linked);
    if (!store) return null;
    return {
      purchaseStoreProduct: (args) =>
        settleNative(store.purchaseStoreProduct(args), "The store purchase did not finish."),
      restoreStore: store.restoreStore
        ? (args) => settleNative(store.restoreStore(args), "Restore did not finish.")
        : null,
    };
  }

  return {
    async configure(configuration, legacyAppUserId) {
      const config = normalizeConfiguration(configuration, legacyAppUserId);
      apiKey = config.apiKey;
      appUserId = config.appUserID || anonymousId();
      if (config.baseUrl) baseUrl = config.baseUrl.replace(/\/$/, "");
      if (config.platform) platform = config.platform;
      if (config.purchaseStoreProduct) purchaseStoreProduct = config.purchaseStoreProduct;
      if (config.restoreStore) restoreStore = config.restoreStore;
      if (config.presentPaywall) presentPaywallImpl = config.presentPaywall;
      if (config.locale) locale = config.locale;
      if (config.requestTimeoutMs != null) requestTimeoutMs = config.requestTimeoutMs;
      if (config.presentTimeoutMs != null) presentTimeoutMs = config.presentTimeoutMs;
      if (config.nativeTimeoutMs != null) nativeTimeoutMs = config.nativeTimeoutMs;
    },
    async logIn(nextAppUserId) {
      if (!nextAppUserId || typeof nextAppUserId !== "string") {
        throw new PurchasesError("appUserID needs to be a string", PURCHASES_ERROR_CODE.CONFIGURATION_ERROR);
      }

      const body = await request(`/v1/customers/${encodeURIComponent(appUserId)}/login`, {
        method: "POST",
        body: JSON.stringify({ new_app_user_id: nextAppUserId }),
      });
      const created = appUserId.startsWith("$payblastAnon");
      appUserId = nextAppUserId;
      const customer = toCustomer(body);
      notify(customer);
      return { customer, created };
    },
    async logOut() {
      appUserId = anonymousId();
      const customer = await fetchCustomer();
      notify(customer);
      return customer;
    },
    async getOfferings() {
      const body = await request("/v1/offerings");
      return toOfferings(body, platform, locale);
    },
    async getCurrentOfferingForPlacement(placementIdentifier) {
      if (!placementIdentifier || typeof placementIdentifier !== "string") {
        throw new PurchasesError(
          "placementIdentifier needs to be a string",
          PURCHASES_ERROR_CODE.CONFIGURATION_ERROR,
        );
      }

      const body = await request(`/v1/offerings?placement=${encodeURIComponent(placementIdentifier)}`);
      const offerings = toOfferings(body, platform, locale);
      return offeringForPlacement(offerings, placementIdentifier);
    },
    async purchase(aPackage) {
      const productIdentifier = productIdFor(aPackage, platform);

      if (!productIdentifier) {
        throw new PurchasesError(
          `Package ${aPackage?.identifier || aPackage?.lookup_key || ""} has no ${platform} product`,
          PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR,
        );
      }

      let transaction = null;

      if (platform === "web") {
        const session = await request("/v1/checkout", {
          method: "POST",
          body: JSON.stringify({ product_identifier: productIdentifier, app_user_id: appUserId }),
        });
        transaction = { transactionIdentifier: session.id, checkoutUrl: session.url };
      } else {
        const store = resolveStore();
        if (!store?.purchaseStoreProduct) {
          throw new PurchasesError(
            "Rebuild the iOS and Android app after installing payblast-react-native-purchases. That compiles the package's StoreKit and Play Billing code. Expo Go cannot make store purchases.",
            PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR,
          );
        }

        try {
          const storeResult = await store.purchaseStoreProduct({ productIdentifier, package: aPackage, appUserId });
          if (storeResult?.userCancelled) {
            throw new PurchasesError("Purchase was cancelled.", PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR);
          }
          transaction = { transactionIdentifier: storeResult?.transactionIdentifier || productIdentifier };
        } catch (error) {
          if (error instanceof PurchasesError) throw error;
          if (
            error?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
            error?.code === "cancelled" ||
            error?.userCancelled
          ) {
            throw new PurchasesError(error.message || "Purchase was cancelled.", PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR);
          }
          throw new PurchasesError(error.message || "Store purchase failed", PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR);
        }
      }

      const customer = await fetchCustomer();
      notify(customer);
      return { customer, customerInfo: customer, productIdentifier, transaction };
    },
    subscribe(aPackage) {
      return this.purchase(aPackage);
    },
    purchasePackage(aPackage) {
      return this.purchase(aPackage);
    },
    async restorePurchases() {
      const store = resolveStore();
      if (store?.restoreStore) await store.restoreStore({ appUserId });
      const customer = await fetchCustomer();
      notify(customer);
      return customer;
    },
    restore() {
      return this.restorePurchases();
    },
    getCustomer() {
      return fetchCustomer();
    },
    getCustomerInfo() {
      return this.getCustomer();
    },
    presentPaywall(document, packages) {
      if (typeof presentPaywallImpl === "function") {
        return Promise.resolve()
          .then(() =>
            withTimeout(
              Promise.resolve(presentPaywallImpl(document, packages)),
              presentTimeoutMs,
              () =>
                new PurchasesError(
                  "Paywall could not be presented.",
                  PURCHASES_ERROR_CODE.PRESENTATION_ERROR,
                ),
            ),
          )
          .catch((error) => {
            if (error instanceof PurchasesError) throw error;
            throw new PurchasesError(
              error?.message || "Paywall could not be presented.",
              PURCHASES_ERROR_CODE.PRESENTATION_ERROR,
            );
          });
      }

      const keys = (packages || []).map((pkg) => pkg.lookup_key || pkg.identifier).join(" ");
      const title = textFrom(document);
      return title ? `${title} ${keys}`.trim() : keys;
    },
    addCustomerUpdateListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    removeCustomerUpdateListener(listener) {
      listeners.delete(listener);
    },
    addCustomerInfoUpdateListener(listener) {
      return this.addCustomerUpdateListener(listener);
    },
    removeCustomerInfoUpdateListener(listener) {
      return this.removeCustomerInfoUpdateListener(listener);
    },
    getAppUserID() {
      return appUserId;
    },
  };
}

export function toOfferings(body, platform, locale) {
  const offerings = (body?.offerings || []).map((offering) => toOffering(offering, platform, locale));
  const current =
    offerings.find((offering) => offering.payblastId === body?.current_offering_id) ||
    offerings.find((offering) => offering.isCurrent) ||
    null;
  const all = Object.fromEntries(offerings.map((offering) => [offering.identifier, offering]));
  return { all, current };
}

function toOffering(offering, platform, locale) {
  const availablePackages = (offering.packages || []).map((pkg) =>
    toPackage(pkg, offering.lookup_key, platform, locale),
  );
  return {
    identifier: offering.lookup_key,
    serverDescription: offering.lookup_key,
    availablePackages,
    isCurrent: Boolean(offering.is_current),
    payblastId: offering.id,
  };
}

function toPackage(pkg, offeringIdentifier, platform, locale) {
  const products = pkg.products || {};
  const identifier = products[platform] || products.ios || products.android || products.web || pkg.lookup_key;
  const type = packageType(pkg.lookup_key);
  const pricing = pricingFromPackage(pkg, type, locale);
  return {
    identifier: pkg.lookup_key,
    packageType: type,
    offeringIdentifier,
    products,
    product: {
      identifier,
      title: pkg.lookup_key,
      description: pkg.description || "",
      productCategory: type === "LIFETIME" ? "NON_SUBSCRIPTION" : "SUBSCRIPTION",
      ...pricing,
    },
  };
}

export function toCustomer(body) {
  const raw = body?.entitlements || {};
  const all = {};

  for (const [lookupKey, entitlement] of Object.entries(raw)) {
    const isActive = Boolean(entitlement?.is_active ?? entitlement?.isActive);
    all[lookupKey] = {
      identifier: lookupKey,
      isActive,
      expirationDate: entitlement?.expires_at || entitlement?.expirationDate || null,
      productIdentifier:
        entitlement?.product_identifier || entitlement?.product || entitlement?.productIdentifier || null,
    };
  }

  const active = Object.fromEntries(Object.entries(all).filter(([, entitlement]) => entitlement.isActive));
  const activeSubscriptions = stringList(body?.active_subscriptions ?? body?.activeSubscriptions);
  const purchased = stringList(
    body?.all_purchased_product_identifiers ?? body?.allPurchasedProductIdentifiers,
  );
  const derived = uniqueStrings(Object.values(all).map((entitlement) => entitlement.productIdentifier));
  const activeDerived = uniqueStrings(Object.values(active).map((entitlement) => entitlement.productIdentifier));

  return {
    originalAppUserId: body?.app_user_id || body?.originalAppUserId || null,
    entitlements: { all, active },
    activeSubscriptions: activeSubscriptions.length ? activeSubscriptions : activeDerived.length ? activeDerived : Object.keys(active),
    allPurchasedProductIdentifiers: purchased.length ? purchased : derived.length ? derived : Object.keys(active),
  };
}

export function offeringForPlacement(offerings, placementIdentifier) {
  if (!offerings) return null;
  if (placementIdentifier && offerings.all?.[placementIdentifier]) return offerings.all[placementIdentifier];
  return offerings.current ?? null;
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.length > 0) : [];
}

function uniqueStrings(values) {
  return [...new Set(values.filter((item) => typeof item === "string" && item.length > 0))];
}

function productIdFor(aPackage, platform) {
  return aPackage?.products?.[platform] || aPackage?.product?.identifier || null;
}

function packageType(lookupKey) {
  const key = String(lookupKey || "").toLowerCase();
  if (key.includes("lifetime")) return "LIFETIME";
  if (key.includes("annual") || key.includes("yearly") || key === "year") return "ANNUAL";
  if (key.includes("month")) return "MONTHLY";
  if (key.includes("week")) return "WEEKLY";
  return "CUSTOM";
}

function textFrom(document) {
  const blocks = document?.blocks || [];
  return blocks
    .flatMap((block) => {
      if (block.type === "text") return [block.text];
      if (block.type === "stack") {
        return (block.children || []).filter((child) => child.type === "text").map((child) => child.text);
      }
      return [];
    })
    .join(" ");
}

function normalizeConfiguration(configuration, legacyAppUserId) {
  if (typeof configuration === "string") {
    return { apiKey: configuration, appUserID: legacyAppUserId || null };
  }

  if (!configuration || typeof configuration.apiKey !== "string" || configuration.apiKey.length === 0) {
    throw new PurchasesError(
      'Invalid API key. Call Purchases.configure({ apiKey: "pk_..." })',
      PURCHASES_ERROR_CODE.CONFIGURATION_ERROR,
    );
  }

  if (configuration.appUserID != null && typeof configuration.appUserID !== "string") {
    throw new PurchasesError("appUserID needs to be a string", PURCHASES_ERROR_CODE.CONFIGURATION_ERROR);
  }

  return configuration;
}

function anonymousId() {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `$payblastAnon${random}`;
}

function detectPlatform() {
  try {
    const { Platform } = require("react-native");
    if (Platform?.OS === "ios" || Platform?.OS === "android") return Platform.OS;
  } catch {
    // Node tests and web builds have no react-native module.
  }
  return "web";
}
