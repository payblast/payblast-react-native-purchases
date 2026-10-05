# payblast-react-native-purchases

React Native client for [Payblast](https://payblast.bitscorp.co). Offerings, purchases, and entitlements follow the same flow as a store SDK. The method names are Payblast's: `purchase`, `subscribe`, and `getCustomer`. This package does not include RevenueCat source.

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
  const { customer } = await Purchases.purchase(offerings.current.availablePackages[0]);
  await Purchases.subscribe(offerings.current.availablePackages[0]);
  if (typeof customer.entitlements.active[ENTITLEMENT_ID] !== "undefined") {
    // unlock
  }
}

const customer = await Purchases.getCustomer();
await Purchases.restorePurchases();
await Purchases.logIn("account-id");
```

`purchase` and `subscribe` do the same thing: buy the package on the configured store, then return `{ customer }`. Use `subscribe` when the package is a subscription.

A cancelled store purchase throws `Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR`.

On `platform: "web"`, `purchase` and `subscribe` create a Stripe Checkout session on the app maker's connected account and return `transaction.checkoutUrl`. The entitlement becomes active after the Stripe webhook, so call `getCustomer` again when the customer returns.

`offerings.current.availablePackages[].product.identifier` is the store product id for the configured platform. Package lookup keys such as `monthly`, `yearly`, and `lifetime` set `packageType`.

## API

```text
configure({ apiKey, appUserID, platform, baseUrl, purchaseStoreProduct, restoreStore })
getOfferings()
purchase(package)
subscribe(package)
getCustomer()
restorePurchases()
logIn(appUserID) / logOut()
addCustomerUpdateListener(listener)
```

The default API host is `https://payblast.bitscorp.co`. Set `baseUrl` for a local server.

```bash
npm test
```

A short example of the same calls is in `examples/integration.js`.
