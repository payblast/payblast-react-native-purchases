import { PURCHASES_ERROR_CODE, PurchasesError, createClient } from "./purchases.js";

const client = createClient();

const Purchases = {
  PURCHASES_ERROR_CODE,
  configure(configuration, appUserID) {
    return client.configure(configuration, appUserID);
  },
  getOfferings() {
    return client.getOfferings();
  },
  purchasePackage(aPackage) {
    return client.purchasePackage(aPackage);
  },
  purchase(aPackage) {
    return client.purchasePackage(aPackage);
  },
  getCustomerInfo() {
    return client.getCustomerInfo();
  },
  restorePurchases() {
    return client.restorePurchases();
  },
  logIn(appUserID) {
    return client.logIn(appUserID);
  },
  logOut() {
    return client.logOut();
  },
  getAppUserID() {
    return client.getAppUserID();
  },
  addCustomerInfoUpdateListener(listener) {
    return client.addCustomerInfoUpdateListener(listener);
  },
  removeCustomerInfoUpdateListener(listener) {
    return client.removeCustomerInfoUpdateListener(listener);
  },
  presentPaywall(document, packages) {
    return client.presentPaywall(document, packages);
  },
};

export { PURCHASES_ERROR_CODE, PurchasesError, createClient };
export default Purchases;
