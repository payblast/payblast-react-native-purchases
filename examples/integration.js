import Purchases from "payblast-react-native-purchases";

const ENTITLEMENT_ID = "pro";

export async function setup(appUserID) {
  await Purchases.configure({
    apiKey: "pk_live_your_public_key",
    appUserID,
  });
}

export async function loadPackages() {
  const offerings = await Purchases.getOfferings();
  if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
    return offerings.current.availablePackages;
  }
  return [];
}

export async function buy(aPackage) {
  try {
    const { customer } = await Purchases.purchase(aPackage);
    return typeof customer.entitlements.active[ENTITLEMENT_ID] !== "undefined";
  } catch (error) {
    if (error.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return false;
    throw error;
  }
}

export async function subscribe(aPackage) {
  const { customer } = await Purchases.subscribe(aPackage);
  return customer;
}

export async function hasAccess() {
  const customer = await Purchases.getCustomer();
  return typeof customer.entitlements.active[ENTITLEMENT_ID] !== "undefined";
}
