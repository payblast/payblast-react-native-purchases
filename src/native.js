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
      return nativeModule.purchase(productIdentifier, appUserId || "");
    },
    restoreStore() {
      if (typeof nativeModule.restore !== "function") return null;
      return nativeModule.restore();
    },
  };
}
