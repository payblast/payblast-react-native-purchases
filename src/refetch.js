export const DEFAULT_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 60_000;
export const MIN_REFETCH_INTERVAL_MS = 2_000;

export function createRefetchController(options = {}) {
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const maxBackoffMs = options.maxBackoffMs ?? MAX_BACKOFF_MS;
  const minIntervalMs = options.minIntervalMs ?? MIN_REFETCH_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? defaultSchedule;
  const cancel = options.cancel ?? ((timer) => clearTimeout(timer));
  const shouldRetry = options.shouldRetry ?? (() => true);

  let inFlight = null;
  let timer = null;
  let delay = backoffMs;
  let lastAttemptAt = 0;
  let needsRefetch = false;
  let refreshTask = options.refreshTask ?? null;

  function clearTimer() {
    if (timer == null) return;
    cancel(timer);
    timer = null;
  }

  function notifySuccess() {
    needsRefetch = false;
    delay = backoffMs;
    clearTimer();
  }

  function scheduleRetry() {
    if (timer != null) return;
    const wait = delay;
    delay = Math.min(delay * 2, maxBackoffMs);
    timer = schedule(() => {
      timer = null;
      if (!refreshTask) return Promise.resolve(null);
      return run(refreshTask).catch(() => null);
    }, wait);
  }

  function notifyFailure(error) {
    needsRefetch = true;
    if (shouldRetry(error)) {
      scheduleRetry();
      return;
    }
    delay = backoffMs;
    clearTimer();
  }

  function run(task) {
    if (typeof task === "function") refreshTask = task;
    if (inFlight) return inFlight;
    lastAttemptAt = now();
    inFlight = Promise.resolve()
      .then(refreshTask)
      .then((value) => {
        notifySuccess();
        return value;
      })
      .catch((error) => {
        notifyFailure(error);
        throw error;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  function requestBackgroundRefresh(task) {
    if (typeof task === "function") refreshTask = task;
    if (!needsRefetch || !refreshTask) return null;
    if (inFlight) return inFlight;
    if (now() - lastAttemptAt < minIntervalMs) return null;
    return run(refreshTask).catch(() => null);
  }

  function dispose() {
    clearTimer();
    needsRefetch = false;
    inFlight = null;
  }

  return {
    run,
    requestBackgroundRefresh,
    notifySuccess,
    notifyFailure,
    dispose,
    get needsRefetch() {
      return needsRefetch;
    },
    get nextBackoffMs() {
      return delay;
    },
    get inFlight() {
      return inFlight;
    },
  };
}

export function defaultSchedule(fn, ms) {
  const timer = setTimeout(fn, ms);
  if (typeof timer?.unref === "function") timer.unref();
  return timer;
}

export function subscribeAppState(onActive) {
  try {
    const { AppState } = require("react-native");
    if (!AppState?.addEventListener) return () => {};
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") onActive();
    });
    return () => {
      if (typeof subscription?.remove === "function") subscription.remove();
    };
  } catch {
    return () => {};
  }
}

export function subscribeOnline(onOnline) {
  const target = globalThis;
  if (typeof target.addEventListener !== "function") return () => {};
  target.addEventListener("online", onOnline);
  return () => {
    if (typeof target.removeEventListener === "function") {
      target.removeEventListener("online", onOnline);
    }
  };
}

export function watchReconnect({
  subscribeAppState: subscribeApp = subscribeAppState,
  subscribeOnline: subscribeNet = subscribeOnline,
  onReconnect,
} = {}) {
  if (typeof onReconnect !== "function") return () => {};
  const stopApp = subscribeApp(onReconnect);
  const stopOnline = subscribeNet(onReconnect);
  return () => {
    if (typeof stopApp === "function") stopApp();
    if (typeof stopOnline === "function") stopOnline();
  };
}
