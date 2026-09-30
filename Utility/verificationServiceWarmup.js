// The verification service runs as its own Render free-tier web service,
// which Render spins down after 15 minutes without inbound traffic; the next
// request then pays a 20-60s cold boot. Nothing in this file can stop that
// (and Render's 750 free hours/month per workspace means two services can't
// both be kept awake 24/7 anyway) - what it does instead is make sure the
// service is already booting by the time anyone needs it, and that
// verification itself waits for it instead of failing.

const getBaseUrl = () => (process.env.ML_VERIFICATION_SERVICE_URL || "").replace(/\/$/, "");

const isEnabled = () => Boolean(getBaseUrl()) && process.env.VERIFICATION_ENABLED !== "false";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One GET /health. Never throws - "not up yet" (502/503 from Render's edge,
// a refused connection, a timeout) and "up" are both just a boolean.
const pingOnce = async (timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${getBaseUrl()}/health`, { signal: controller.signal });
    return response.ok;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

// Fire-and-forget wake-up, safe to call from anywhere (including on every
// API request): at most one ping per WAKE_DEBOUNCE_MS, well under Render's
// 15-minute spin-down window, so the service stays warm for as long as the
// app is actually being used and is left to sleep once nobody is.
const WAKE_DEBOUNCE_MS = 4 * 60 * 1000;
let lastWakeAt = 0;

const wakeVerificationService = () => {
  try {
    if (!isEnabled()) return;
    const now = Date.now();
    if (now - lastWakeAt < WAKE_DEBOUNCE_MS) return;
    lastWakeAt = now;
    pingOnce(90000).then((ok) => {
      if (!ok) {
        // Let the next request retry sooner instead of waiting out the debounce.
        lastWakeAt = 0;
      }
    });
  } catch (error) {
    // A warm-up helper must never be able to break a real request.
  }
};

// Awaitable version for the moment verification is actually about to call
// the service: keeps polling /health until it answers (or the budget is
// spent), so a cold-booting service is waited for rather than failed on.
// Never throws; resolves true if the service answered, false if it never did
// (the caller still goes ahead and lets its own error handling decide).
const waitUntilVerificationServiceReady = async ({
  budgetMs = 100000,
  attemptTimeoutMs = 15000,
  retryDelayMs = 3000,
} = {}) => {
  if (!getBaseUrl()) return false;
  const startedAt = Date.now();
  while (Date.now() - startedAt < budgetMs) {
    if (await pingOnce(attemptTimeoutMs)) {
      lastWakeAt = Date.now();
      return true;
    }
    await sleep(retryDelayMs);
  }
  return false;
};

module.exports = { wakeVerificationService, waitUntilVerificationServiceReady };
