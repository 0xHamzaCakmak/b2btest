const { getRateLimitStore } = require("../../config/rate-limit");

function createSimpleRateLimiter(config) {
  const max = Number(config && config.max ? config.max : 10);
  const windowMs = Number(config && config.windowMs ? config.windowMs : 60 * 1000);
  const message = String((config && config.message) || "Too many requests");
  const keyFn = typeof (config && config.keyFn) === "function"
    ? config.keyFn
    : ((req) => req.ip || "unknown");

  const store = (config && config.store) || getRateLimitStore();

  return async function simpleRateLimiter(req, res, next) {
    try {
      const now = Date.now();
      const key = String(keyFn(req) || "unknown");
      const current = await store.increment(key, windowMs);

      if (current.count > max) {
        const retryAfterSec = Math.max(1, Math.ceil((current.expiresAt - now) / 1000));
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({
          ok: false,
          error: "TOO_MANY_REQUESTS",
          message
        });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { createSimpleRateLimiter };
