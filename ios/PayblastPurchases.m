#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PayblastPurchases, NSObject)

RCT_EXTERN_METHOD(purchase:(NSString *)productId
                  appUserId:(NSString *)appUserId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(restore:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
