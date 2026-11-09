import {
  PURCHASES_ERROR_CODE,
  PurchasesError,
  createClient,
  createPurchases,
  toCustomer,
  toOfferings,
} from "./purchases.js";
import {
  currencyMinorDigits,
  decimalAmount,
  formatPrice,
  periodPrices,
  pricePerDay,
  pricePerMonth,
  pricePerWeek,
  pricePerYear,
} from "./prices.js";

const client = createClient();

const Purchases = {
  PURCHASES_ERROR_CODE,
  configure(configuration, appUserID) {
    return client.configure(configuration, appUserID);
  },
  getOfferings() {
    return client.getOfferings();
  },
  getCurrentOfferingForPlacement(placementIdentifier) {
    return client.getCurrentOfferingForPlacement(placementIdentifier);
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
    return client.removeCustomerInfoUpdateListener(listener);
  },
  presentPaywall(document, packages) {
    return client.presentPaywall(document, packages);
  },
  periodPrices,
  pricePerDay,
  pricePerWeek,
  pricePerMonth,
  pricePerYear,
  formatPrice,
  currencyMinorDigits,
};

export {
  PURCHASES_ERROR_CODE,
  PurchasesError,
  createClient,
  createPurchases,
  currencyMinorDigits,
  decimalAmount,
  formatPrice,
  periodPrices,
  pricePerDay,
  pricePerMonth,
  pricePerWeek,
  pricePerYear,
  toCustomer,
  toOfferings,
};
export default Purchases;
