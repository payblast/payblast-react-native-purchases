import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("podspec does not set a Swift bridging header", () => {
  const spec = readFileSync(new URL("../payblast-react-native-purchases.podspec", import.meta.url), "utf8");
  assert.equal(spec.includes("SWIFT_OBJC_BRIDGING_HEADER"), false);
  assert.match(spec, /install_modules_dependencies/);
  assert.match(spec, /DEFINES_MODULE/);
});

test("Android Gradle does not pin AGP or force Kotlin on AGP 9", () => {
  const gradle = readFileSync(new URL("../android/build.gradle", import.meta.url), "utf8");
  assert.equal(gradle.includes("com.android.tools.build:gradle:"), false);
  assert.match(gradle, /builtInKotlin/);
  assert.match(gradle, /compileSdk /);
});

test("Android purchase module uses getCurrentActivity and rejects when UI cannot proceed", () => {
  const source = readFileSync(
    new URL("../android/src/main/java/co/bitscorp/payblast/purchases/PayblastPurchasesModule.kt", import.meta.url),
    "utf8",
  );
  assert.match(source, /getCurrentActivity\(\)/);
  assert.equal(/\bcurrentActivity\b/.test(source), false);
  assert.match(source, /onHostDestroy/);
  assert.match(source, /BILLING_CONNECT_TIMEOUT_MS/);
  assert.match(source, /LifecycleEventListener/);
});

test("iOS native purchase methods always resolve or reject", () => {
  const source = readFileSync(new URL("../ios/PayblastPurchases.swift", import.meta.url), "utf8");
  assert.match(source, /reject\(error\.code, error\.message, nil\)/);
  assert.match(source, /reject\("store_problem"/);
  assert.equal(source.includes("RCTPromiseResolveBlock"), false);
});
