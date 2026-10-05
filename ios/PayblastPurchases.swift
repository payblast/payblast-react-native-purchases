import Foundation
import StoreKit

private enum StorePurchaseError: Error {
  case cancelled
  case productUnavailable
  case unverified
  case pending

  var code: String {
    switch self {
    case .cancelled: return "cancelled"
    case .productUnavailable: return "product_unavailable"
    case .unverified: return "unverified"
    case .pending: return "pending"
    }
  }

  var message: String {
    switch self {
    case .cancelled: return "Purchase was cancelled."
    case .productUnavailable: return "This product is not available in the App Store."
    case .unverified: return "StoreKit could not verify the transaction."
    case .pending: return "The purchase is pending approval."
    }
  }
}

enum StorePurchase {
  // Product.products(for:) and Product.purchase()
  // https://developer.apple.com/documentation/storekit/product/purchase(options:)
  static func buy(productId: String, appUserId: String) async throws -> String {
    let trimmed = productId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw StorePurchaseError.productUnavailable }

    let products = try await Product.products(for: [trimmed])
    guard let product = products.first else { throw StorePurchaseError.productUnavailable }

    var options: Set<Product.PurchaseOption> = []
    if let account = UUID(uuidString: appUserId) {
      options.insert(.appAccountToken(account))
    }

    let result = try await product.purchase(options: options)
    switch result {
    case .success(let verification):
      switch verification {
      case .verified(let transaction):
        await transaction.finish()
        return String(transaction.id)
      case .unverified:
        throw StorePurchaseError.unverified
      }
    case .userCancelled:
      throw StorePurchaseError.cancelled
    case .pending:
      throw StorePurchaseError.pending
    @unknown default:
      throw StorePurchaseError.pending
    }
  }

  // AppStore.sync() replays the account's purchases.
  // https://developer.apple.com/documentation/storekit/appstore/sync()
  static func restore() async throws -> [String] {
    do {
      try await AppStore.sync()
    } catch StoreKitError.userCancelled {
      throw StorePurchaseError.cancelled
    }

    var productIds: [String] = []
    for await verification in Transaction.currentEntitlements {
      if case .verified(let transaction) = verification {
        productIds.append(transaction.productID)
      }
    }
    return productIds
  }
}

@objc(PayblastPurchases)
final class PayblastPurchases: NSObject {
  private let updates: Task<Void, Never>

  override init() {
    updates = Task {
      for await verification in Transaction.updates {
        if case .verified(let transaction) = verification {
          await transaction.finish()
        }
      }
    }
    super.init()
  }

  deinit {
    updates.cancel()
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(purchase:appUserId:resolver:rejecter:)
  func purchase(
    _ productId: String,
    appUserId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        let transactionId = try await StorePurchase.buy(productId: productId, appUserId: appUserId)
        resolve([
          "transactionIdentifier": transactionId,
          "productIdentifier": productId,
        ])
      } catch let error as StorePurchaseError {
        reject(error.code, error.message, nil)
      } catch {
        reject("store_problem", error.localizedDescription, error)
      }
    }
  }

  @objc(restore:rejecter:)
  func restore(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        let productIds = try await StorePurchase.restore()
        resolve(["productIdentifiers": productIds])
      } catch let error as StorePurchaseError {
        reject(error.code, error.message, nil)
      } catch {
        reject("store_problem", error.localizedDescription, error)
      }
    }
  }
}
