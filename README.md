# react-native-purchases

Payblast React Native purchases SDK

Status: scaffold only. Implementation is phase 8 in the Payblast server spec. This repository does not vendor RevenueCat source. The public API shape is studied from [https://github.com/RevenueCat/react-native-purchases](https://github.com/RevenueCat/react-native-purchases) and reimplemented against Payblast.

## Contract

```text
configure(apiKey, appUserId)
logIn(appUserId) / logOut()
getOfferings()
purchase(package)
restore()
getCustomerInfo()
presentPaywall(offering?)
```

`getCustomerInfo` exposes `entitlements[lookupKey].isActive`. Packages carry the store product identifier for this SDK's platform. Purchases of digital goods inside the native app go through that store. Web purchases use Stripe Checkout on the app maker's connected account.

## Reference

- https://github.com/RevenueCat/react-native-purchases
