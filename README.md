# payblast-react-native-purchases

React Native client for [Payblast](https://payblastfs.com). `purchase` and `subscribe` buy the package through the store code shipped in this package. The app does not implement StoreKit or Play Billing. This package does not include RevenueCat source.

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
  const aPackage = offerings.current.availablePackages[0];
  aPackage.product.priceString;
  aPackage.product.pricePerMonthString;
  const { customer } = await Purchases.purchase(aPackage);
  await Purchases.subscribe(aPackage);
  if (typeof customer.entitlements.active[ENTITLEMENT_ID] !== "undefined") {
    // unlock
  }
}

const customer = await Purchases.getCustomer();
await Purchases.restorePurchases();
await Purchases.logIn("account-id");
```

`purchase` and `subscribe` do the same thing: show the App Store or Google Play purchase sheet for the package's product, then return `{ customer, customerInfo }`. `customerInfo` is the same object as `customer`. `purchasePackage` calls `purchase`. Use `subscribe` when the package is a subscription.

`customer.activeSubscriptions` lists store product ids that currently grant access. `customer.allPurchasedProductIdentifiers` lists store product ids the customer has bought. `customer.entitlements.active.pro.isActive` is the entitlement check. `getCustomerInfo` calls `getCustomer`.

A cancelled purchase throws `Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR`.

Payblast marks the entitlement active when the App Store Server Notification or Play Real-time developer notification arrives. The customer returned by `purchase` can still be empty for a moment. Call `getCustomer` again after that notification.

On web, `purchase` and `subscribe` create a Stripe Checkout session on the app maker's connected account and return `transaction.checkoutUrl`. The entitlement becomes active after the Stripe webhook.

`offerings.current.availablePackages[].product.identifier` is the store product id for the running platform. Package lookup keys such as `monthly`, `yearly`, and `lifetime` set `packageType`.

`purchaseStoreProduct` on `configure` replaces the built-in store client. Tests use it. Application code can leave it unset.

## Prices

`product.price` is a decimal currency amount (`9.99`), never micros (`9990000`). The same billed amount is also accepted as `price_micros` (divide by 1,000,000) or Stripe `unit_amount` (minor units) on the offering payload.

Per-period helpers use the currency's ISO 4217 minor-unit digits and truncate toward zero, so an `$83.99` yearly plan is `$6.99` / month, not `$7`. JPY and KRW stay whole numbers. `priceString` and `pricePerDayString` / `pricePerWeekString` / `pricePerMonthString` / `pricePerYearString` share one `Intl.NumberFormat` for the product currency and locale, including when the device locale and storefront currency differ.

```js
import Purchases, { periodPrices, pricePerMonth } from "payblast-react-native-purchases";

const product = offerings.current.availablePackages[0].product;
product.price;
product.currencyCode;
product.priceString;
product.pricePerDay;
product.pricePerWeek;
product.pricePerMonth;
product.pricePerYear;
product.pricePerMonthString;

pricePerMonth(83.99, "year", "USD"); // 6.99
periodPrices({ price: 9.99, currencyCode: "EUR", billedPeriod: "month", locale: "de-DE" });
```

Pass `locale` to `configure` to format every price string the same way. Lifetime packages have a billed `price` and no per-period amounts.

`getCurrentOfferingForPlacement(id)` loads offerings for that placement. Network failures reject; a missing placement resolves `null`. `presentPaywall` always settles: it rejects with `PRESENTATION_ERROR` when a presenter cannot show UI or times out.

## API

```text
configure({ apiKey, appUserID, platform, baseUrl, locale, purchaseStoreProduct, restoreStore, requestTimeoutMs, nativeTimeoutMs })
getOfferings()
getCurrentOfferingForPlacement(placementIdentifier)
purchase(package)
subscribe(package)
getCustomer()
restorePurchases()
logIn(appUserID) / logOut()
addCustomerUpdateListener(listener)
presentPaywall(document, packages)
periodPrices({ price, priceMicros, unitAmount, currencyCode, billedPeriod, locale })
pricePerDay / pricePerWeek / pricePerMonth / pricePerYear
```

The default API host is `https://payblastfs.com`. Set `baseUrl` for a local server. `platform` defaults to `ios` or `android` from React Native, and to `web` everywhere else. Requests time out after 30 seconds.

```bash
npm test
```

A short example of the same calls is in `examples/integration.js`.

Store purchase uses [`Product.purchase()`](https://developer.apple.com/documentation/storekit/product/purchase(options:)) and [`BillingClient.launchBillingFlow()`](https://developer.android.com/google/play/billing/integrate). The native module is `NativeModules.PayblastPurchases`, linked by [React Native autolinking](https://reactnative.dev/docs/linking-libraries-ios).
