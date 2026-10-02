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
      for (const listener of listeners) listener(result.customerInfo);
      return result;
    },
    restore() {
      return native.restore();
    },
    getCustomerInfo() {
      return native.getCustomerInfo();
    },
    presentPaywall(_document, packages) {
      return (packages || []).map((pkg) => pkg.lookup_key).join(" ");
    },
    addCustomerInfoUpdateListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
