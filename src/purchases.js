import { loadNativePurchases, storeFromNative } from "./native.js";

export const PURCHASES_ERROR_CODE = {
  PURCHASE_CANCELLED_ERROR: "PURCHASE_CANCELLED_ERROR",
  PURCHASE_NOT_ALLOWED_ERROR: "PURCHASE_NOT_ALLOWED_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  STORE_PROBLEM_ERROR: "STORE_PROBLEM_ERROR",
};

const DEFAULT_BASE_URL = "https://payblast.bitscorp.co";

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
      return native.configure(apiKey, appUserId);
    },
    logIn(appUserId) {
      return native.logIn(appUserId);
    },
    logOut() {
      return native.logOut();
    },
    getOfferings() {
      return native.getOfferings();
    },
    async purchase(pkg) {
      const result = await native.purchase(pkg);
      const customer = result.customer || result.customerInfo;
      for (const listener of listeners) listener(customer);
      return { ...result, customer };
    },
    subscribe(pkg) {
      return this.purchase(pkg);
    },
    restore() {
      return native.restore();
    },
    restorePurchases() {
      return native.restore();
    },
    getCustomer() {
      return native.getCustomer ? native.getCustomer() : native.getCustomerInfo();
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
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...options,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(options.headers || {}),
        },
      });
    } catch (error) {
      throw new PurchasesError(error.message || "Network request failed", PURCHASES_ERROR_CODE.NETWORK_ERROR);
    }

    if (!response.ok) {
      throw new PurchasesError(
        `Payblast request failed: ${response.status}`,
        response.status >= 500 ? PURCHASES_ERROR_CODE.NETWORK_ERROR : PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR,
      );
    }

    return response.json();
  }

  async function fetchCustomer() {
    const body = await request(`/v1/customers/${encodeURIComponent(appUserId)}`);
    return toCustomer(body);
  }

  function resolveStore() {
    if (purchaseStoreProduct) return { purchaseStoreProduct, restoreStore };
    const linked = nativeModule === undefined ? loadNativePurchases() : nativeModule;
    return storeFromNative(linked);
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
      return toOfferings(body, platform);
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
      return { customer, productIdentifier, transaction };
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
      return this.removeCustomerUpdateListener(listener);
    },
    getAppUserID() {
      return appUserId;
    },
  };
}

export function toOfferings(body, platform) {
  const offerings = (body?.offerings || []).map((offering) => toOffering(offering, platform));
  const current =
    offerings.find((offering) => offering.payblastId === body?.current_offering_id) ||
    offerings.find((offering) => offering.isCurrent) ||
    null;
  const all = Object.fromEntries(offerings.map((offering) => [offering.identifier, offering]));
  return { all, current };
}

function toOffering(offering, platform) {
  const availablePackages = (offering.packages || []).map((pkg) => toPackage(pkg, offering.lookup_key, platform));
  return {
    identifier: offering.lookup_key,
    serverDescription: offering.lookup_key,
    availablePackages,
    isCurrent: Boolean(offering.is_current),
    payblastId: offering.id,
  };
}

function toPackage(pkg, offeringIdentifier, platform) {
  const products = pkg.products || {};
  const identifier = products[platform] || products.ios || products.android || products.web || pkg.lookup_key;
  return {
    identifier: pkg.lookup_key,
    packageType: packageType(pkg.lookup_key),
    offeringIdentifier,
    products,
    product: {
      identifier,
      title: pkg.lookup_key,
      description: "",
      priceString: "",
      productCategory: packageType(pkg.lookup_key) === "LIFETIME" ? "NON_SUBSCRIPTION" : "SUBSCRIPTION",
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
      productIdentifier: entitlement?.product || entitlement?.productIdentifier || null,
    };
  }

  const active = Object.fromEntries(Object.entries(all).filter(([, entitlement]) => entitlement.isActive));

  return {
    originalAppUserId: body?.app_user_id || null,
    entitlements: { all, active },
  };
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
