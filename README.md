# payblast-react-native-purchases

React Native client for [Payblast](https://payblast.bitscorp.co). The call shape matches the integration in [RevenueCat's react-native-purchases](https://github.com/RevenueCat/react-native-purchases) sample (`configure`, `getOfferings`, `purchasePackage`, `getCustomerInfo`, `entitlements.active`). This package does not include RevenueCat source. It talks to the Payblast API.

## Install

```bash
npm install payblast-react-native-purchases
```

The package is plain JavaScript. StoreKit and Play Billing stay in your app. Pass that purchase function to `configure`. Payblast grants entitlements from App Store Server Notifications and Play Real-time developer notifications, not from the purchase screen.

## Integrate

```js
import Purchases from "payblast-react-native-purchases";

const ENTITLEMENT_ID = "pro";

await Purchases.configure({
  apiKey: "pk_live_...",
  appUserID: "user_42",
  platform: "ios", // "ios", "android", or "web"
  purchaseStoreProduct: async ({ productIdentifier }) => {
    // Complete the StoreKit or Play Billing purchase for productIdentifier.
    return { transactionIdentifier: "store-transaction-id" };
  },
});

const offerings = await Purchases.getOfferings();
if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
  const { customerInfo } = await Purchases.purchasePackage(offerings.current.availablePackages[0]);
  if (typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined") {
    // unlock
  }
}

const customerInfo = await Purchases.getCustomerInfo();
await Purchases.restorePurchases();
await Purchases.logIn("account-id");
```

A cancelled store purchase throws `Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR`.

On `platform: "web"`, `purchasePackage` creates a Stripe Checkout session on the app maker's connected account and returns `transaction.checkoutUrl`. The entitlement becomes active after the Stripe webhook, so read `getCustomerInfo` again when the customer returns.

`offerings.current.availablePackages[].product.identifier` is the store product id for the configured platform. Package lookup keys such as `monthly`, `yearly`, and `lifetime` set `packageType`.

## API

```text
configure({ apiKey, appUserID, platform, baseUrl, purchaseStoreProduct, restoreStore })
getOfferings()
purchasePackage(package)
getCustomerInfo()
restorePurchases()
logIn(appUserID) / logOut()
addCustomerInfoUpdateListener(listener)
```

The default API host is `https://payblast.bitscorp.co`. Set `baseUrl` for a local server.

```bash
npm test
```

A short example of the same calls is in `examples/integration.js`.
