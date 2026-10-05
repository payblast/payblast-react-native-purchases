# payblast-react-native-purchases

React Native client for [Payblast](https://payblast.bitscorp.co). `purchase` and `subscribe` buy the package through the store code shipped in this package. The app does not implement StoreKit or Play Billing. This package does not include RevenueCat source.

## Install

```bash
npm install github:payblast/payblast-react-native-purchases
cd ios && pod install
```

Rebuild the iOS and Android apps after installing. React Native compiles `ios/` (StoreKit 2) and `android/` (Play Billing) into the binary. A JavaScript reload is not enough, and Expo Go cannot load this module. Use a development build.

iOS 15 or newer. Play Billing Library 8.0.0. The product identifiers in the Payblast offering must exist in App Store Connect and Play Console.

## Integrate

```js
import Purchases from "payblast-react-native-purchases";

const ENTITLEMENT_ID = "pro";

await Purchases.configure({
  apiKey: "pk_live_...",
  appUserID: "user_42",
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

`purchase` and `subscribe` do the same thing: show the App Store or Google Play purchase sheet for the package's product, then return `{ customer }`. Use `subscribe` when the package is a subscription.

A cancelled purchase throws `Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR`.

Payblast marks the entitlement active when the App Store Server Notification or Play Real-time developer notification arrives. The customer returned by `purchase` can still be empty for a moment. Call `getCustomer` again after that notification.

On web, `purchase` and `subscribe` create a Stripe Checkout session on the app maker's connected account and return `transaction.checkoutUrl`. The entitlement becomes active after the Stripe webhook.

`offerings.current.availablePackages[].product.identifier` is the store product id for the running platform. Package lookup keys such as `monthly`, `yearly`, and `lifetime` set `packageType`.

`purchaseStoreProduct` on `configure` replaces the built-in store client. Tests use it. Application code can leave it unset.

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

The default API host is `https://payblast.bitscorp.co`. Set `baseUrl` for a local server. `platform` defaults to `ios` or `android` from React Native, and to `web` everywhere else.

```bash
npm test
```

A short example of the same calls is in `examples/integration.js`.

Store purchase uses [`Product.purchase()`](https://developer.apple.com/documentation/storekit/product/purchase(options:)) and [`BillingClient.launchBillingFlow()`](https://developer.android.com/google/play/billing/integrate). The native module is `NativeModules.PayblastPurchases`, linked by [React Native autolinking](https://reactnative.dev/docs/linking-libraries-ios).
