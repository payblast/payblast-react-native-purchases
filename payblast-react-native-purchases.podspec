require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "payblast-react-native-purchases"
  s.version      = package["version"]
  s.summary      = "Payblast purchases for React Native"
  s.homepage     = "https://github.com/payblast/payblast-react-native-purchases"
  s.license      = "MIT"
  s.authors      = "Payblast"
  s.platforms    = { :ios => "15.0" }
  s.source       = { :git => "https://github.com/payblast/payblast-react-native-purchases.git", :tag => "#{s.version}" }
  s.source_files = "ios/**/*.{h,m,swift}"
  s.frameworks   = "StoreKit"
  s.dependency "React-Core"
  s.swift_version = "5.9"
  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "SWIFT_OBJC_BRIDGING_HEADER" => "${PODS_TARGET_SRCROOT}/ios/PayblastPurchases-Bridging-Header.h"
  }
end
