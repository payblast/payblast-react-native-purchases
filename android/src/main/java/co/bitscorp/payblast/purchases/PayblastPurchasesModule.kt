package co.bitscorp.payblast.purchases

import android.app.Activity
import android.os.Handler
import android.os.Looper
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.atomic.AtomicBoolean

// BillingClient flow: https://developer.android.com/google/play/billing/integrate
class PayblastPurchasesModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext),
    PurchasesUpdatedListener,
    LifecycleEventListener {

    private val billingClient: BillingClient = BillingClient.newBuilder(reactContext)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build(),
        )
        .enableAutoServiceReconnection()
        .build()

    private val connecting = AtomicBoolean(false)
    private val readyWaiters = mutableListOf<(Boolean) -> Unit>()
    private var purchasePromise: Promise? = null
    private val handler = Handler(Looper.getMainLooper())

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = "PayblastPurchases"

    @ReactMethod
    fun purchase(productId: String, appUserId: String, promise: Promise) {
        if (productId.isBlank()) {
            promise.reject("product_unavailable", "This product is not available in Google Play.")
            return
        }

        ensureReady { ready ->
            if (!ready) {
                promise.reject("store_problem", "Google Play Billing is not available.")
                return@ensureReady
            }

            findProduct(productId) { details, error ->
                if (details == null) {
                    promise.reject(
                        if (error == null) "product_unavailable" else "store_problem",
                        error ?: "This product is not available in Google Play.",
                    )
                    return@findProduct
                }

                reactApplicationContext.runOnUiQueueThread {
                    val activity = getCurrentActivity()
                    if (activity == null) {
                        promise.reject("store_problem", "Open the app before starting a purchase.")
                        return@runOnUiQueueThread
                    }
                    launch(activity, details, appUserId, promise)
                }
            }
        }
    }

    @ReactMethod
    fun restore(promise: Promise) {
        ensureReady { ready ->
            if (!ready) {
                promise.reject("store_problem", "Google Play Billing is not available.")
                return@ensureReady
            }
            queryOwned(BillingClient.ProductType.SUBS) { subscriptions, subsError ->
                if (subsError != null) {
                    promise.reject("store_problem", subsError)
                    return@queryOwned
                }
                queryOwned(BillingClient.ProductType.INAPP) { oneTime, inappError ->
                    if (inappError != null) {
                        promise.reject("store_problem", inappError)
                        return@queryOwned
                    }
                    val ids = (subscriptions + oneTime).distinct()
                    val result = Arguments.createMap()
                    result.putArray("productIdentifiers", Arguments.fromList(ids))
                    promise.resolve(result)
                }
            }
        }
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: MutableList<Purchase>?) {
        val promise = takePromise() ?: return
        when (billingResult.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                val purchase = purchases?.firstOrNull()
                if (purchase == null) {
                    promise.reject("store_problem", "Google Play returned no purchase.")
                    return
                }
                if (purchase.purchaseState == Purchase.PurchaseState.PENDING) {
                    promise.reject("pending", "The purchase is pending.")
                    return
                }
                acknowledge(purchase) {
                    val result = Arguments.createMap()
                    result.putString("transactionIdentifier", purchase.orderId ?: purchase.purchaseToken)
                    result.putString("productIdentifier", purchase.products.firstOrNull())
                    promise.resolve(result)
                }
            }
            BillingClient.BillingResponseCode.USER_CANCELED ->
                promise.reject("cancelled", "Purchase was cancelled.")
            else ->
                promise.reject(
                    "store_problem",
                    billingResult.debugMessage.ifBlank { "Google Play purchase failed." },
                )
        }
    }

    override fun onHostResume() {}

    override fun onHostPause() {}

    override fun onHostDestroy() {
        takePromise()?.reject("store_problem", "The purchase sheet could not be presented.")
    }

    private fun launch(activity: Activity, details: ProductDetails, appUserId: String, promise: Promise) {
        synchronized(this) {
            purchasePromise?.reject("store_problem", "Another purchase is already in progress.")
            purchasePromise = promise
        }

        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
        offerToken(details)?.let { productParams.setOfferToken(it) }

        val flow = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams.build()))
            .apply {
                val account = appUserId.trim().take(64)
                if (account.isNotEmpty()) setObfuscatedAccountId(account)
            }
            .build()

        val launched = billingClient.launchBillingFlow(activity, flow)
        if (launched.responseCode != BillingClient.BillingResponseCode.OK) {
            takePromise()?.reject(
                "store_problem",
                launched.debugMessage.ifBlank { "Google Play could not open the purchase sheet." },
            )
        }
    }

    private fun findProduct(productId: String, done: (ProductDetails?, String?) -> Unit) {
        queryProduct(productId, BillingClient.ProductType.SUBS) { subscription, subsError ->
            if (subsError != null) {
                done(null, subsError)
            } else if (subscription != null) {
                done(subscription, null)
            } else {
                queryProduct(productId, BillingClient.ProductType.INAPP, done)
            }
        }
    }

    private fun queryProduct(productId: String, productType: String, done: (ProductDetails?, String?) -> Unit) {
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productId)
            .setProductType(productType)
            .build()
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(listOf(product))
            .build()

        billingClient.queryProductDetailsAsync(params) { billingResult, queryProductDetailsResult ->
            if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                done(null, billingResult.debugMessage.ifBlank { "Google Play product lookup failed." })
                return@queryProductDetailsAsync
            }
            done(queryProductDetailsResult.productDetailsList.firstOrNull(), null)
        }
    }

    private fun queryOwned(productType: String, done: (List<String>, String?) -> Unit) {
        val params = QueryPurchasesParams.newBuilder().setProductType(productType).build()
        billingClient.queryPurchasesAsync(params) { billingResult, purchases ->
            if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                done(emptyList(), billingResult.debugMessage.ifBlank { "Google Play restore failed." })
                return@queryPurchasesAsync
            }
            val purchased = purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
            if (purchased.isEmpty()) {
                done(emptyList(), null)
                return@queryPurchasesAsync
            }
            val ids = mutableListOf<String>()
            var remaining = purchased.size
            for (purchase in purchased) {
                acknowledge(purchase) {
                    val finished = synchronized(ids) {
                        ids.addAll(purchase.products)
                        remaining -= 1
                        remaining == 0
                    }
                    if (finished) done(ids.toList(), null)
                }
            }
        }
    }

    private fun acknowledge(purchase: Purchase, done: () -> Unit) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED || purchase.isAcknowledged) {
            done()
            return
        }
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()
        billingClient.acknowledgePurchase(params) { done() }
    }

    private fun offerToken(details: ProductDetails): String? {
        val subscription = details.subscriptionOfferDetails?.firstOrNull()?.offerToken
        if (!subscription.isNullOrBlank()) return subscription
        val listed = details.oneTimePurchaseOfferDetailsList?.firstOrNull()?.offerToken
        if (!listed.isNullOrBlank()) return listed
        @Suppress("DEPRECATION")
        return details.oneTimePurchaseOfferDetails?.offerToken?.takeIf { it.isNotBlank() }
    }

    private fun ensureReady(done: (Boolean) -> Unit) {
        if (billingClient.isReady) {
            done(true)
            return
        }
        val finished = AtomicBoolean(false)
        fun finish(ready: Boolean) {
            if (finished.compareAndSet(false, true)) done(ready)
        }
        synchronized(readyWaiters) { readyWaiters.add { ready -> finish(ready) } }
        handler.postDelayed({ finish(false) }, BILLING_CONNECT_TIMEOUT_MS)
        if (!connecting.compareAndSet(false, true)) return

        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                connecting.set(false)
                val ready = billingResult.responseCode == BillingClient.BillingResponseCode.OK
                val waiters = synchronized(readyWaiters) {
                    readyWaiters.toList().also { readyWaiters.clear() }
                }
                waiters.forEach { it(ready) }
            }

            override fun onBillingServiceDisconnected() {
                // enableAutoServiceReconnection() retries the next Play call.
            }
        })
    }

    @Synchronized
    private fun takePromise(): Promise? {
        val current = purchasePromise
        purchasePromise = null
        return current
    }

    companion object {
        private const val BILLING_CONNECT_TIMEOUT_MS = 15_000L
    }
}
