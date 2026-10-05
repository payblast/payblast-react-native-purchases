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
  purchase(aPackage) {
    return client.purchase(aPackage);
  },
  subscribe(aPackage) {
    return client.subscribe(aPackage);
  },
  purchasePackage(aPackage) {
    return client.purchase(aPackage);
  },
  getCustomer() {
    return client.getCustomer();
  },
  getCustomerInfo() {
    return client.getCustomer();
  },
  restorePurchases() {
    return client.restorePurchases();
  },
  restore() {
    return client.restore();
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
  addCustomerUpdateListener(listener) {
    return client.addCustomerUpdateListener(listener);
  },
  removeCustomerUpdateListener(listener) {
    return client.removeCustomerUpdateListener(listener);
  },
  addCustomerInfoUpdateListener(listener) {
    return client.addCustomerUpdateListener(listener);
  },
  removeCustomerInfoUpdateListener(listener) {
    return client.removeCustomerUpdateListener(listener);
  },
  presentPaywall(document, packages) {
    return client.presentPaywall(document, packages);
  },
};

export { PURCHASES_ERROR_CODE, PurchasesError, createClient };
export default Purchases;
