import Purchases from "payblast-react-native-purchases";

const ENTITLEMENT_ID = "pro";

export async function setup(appUserID) {
  await Purchases.configure({
    apiKey: "pk_live_your_public_key",
    appUserID,
    platform: "ios",
    purchaseStoreProduct: async ({ productIdentifier }) => {
      // Finish the StoreKit or Play Billing purchase here, then return.
      // Payblast grants the entitlement from the store notification, not from this return value.
      return { transactionIdentifier: productIdentifier };
    },
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
    const { customerInfo } = await Purchases.purchasePackage(aPackage);
    return typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
  } catch (error) {
    if (error.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return false;
    throw error;
  }
}

export async function hasAccess() {
  const customerInfo = await Purchases.getCustomerInfo();
  return typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
}
