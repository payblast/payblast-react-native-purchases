// The store client is compiled into the app by React Native autolinking.
// Source: https://reactnative.dev/docs/linking-libraries-ios
export function loadNativePurchases() {
  try {
    const reactNative = require("react-native");
    return reactNative?.NativeModules?.PayblastPurchases ?? null;
  } catch {
    return null;
  }
}

export function storeFromNative(nativeModule) {
  if (!nativeModule || typeof nativeModule.purchase !== "function") return null;

  return {
    purchaseStoreProduct({ productIdentifier, appUserId }) {
      return Promise.resolve(nativeModule.purchase(productIdentifier, appUserId || ""));
    },
    restoreStore() {
      if (typeof nativeModule.restore !== "function") return Promise.resolve(null);
      return Promise.resolve(nativeModule.restore());
    },
  };
}

// Only forward a verification mode the app actually set. Sending a JS default
// would override the native ENFORCED default (RevenueCat RN issue #2127).
export function applyEntitlementVerificationMode(nativeModule, mode, { explicit } = {}) {
  if (!explicit) return false;
  if (!nativeModule || typeof nativeModule.setEntitlementVerificationMode !== "function") {
    return false;
  }
  nativeModule.setEntitlementVerificationMode(mode);
  return true;
}
