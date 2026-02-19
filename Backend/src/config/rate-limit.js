const { env } = require("./env");

class InMemoryRateLimitStore {
  constructor() {
    this.map = new Map();
  }

  cleanup(now) {
    for (const [key, value] of this.map.entries()) {
      if (!value || value.expiresAt <= now) this.map.delete(key);
    }
  }

  async increment(key, windowMs) {
    const now = Date.now();
    this.cleanup(now);
    const current = this.map.get(key);
    if (!current || current.expiresAt <= now) {
      const next = { count: 1, expiresAt: now + windowMs };
      this.map.set(key, next);
      return next;
    }
    current.count += 1;
    return current;
  }
}

class RedisRateLimitStore {
  constructor(redisClient, prefix) {
    this.redis = redisClient;
    this.prefix = prefix || "rl";
  }

  async increment(key, windowMs) {
    const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));
    const redisKey = `${this.prefix}:${key}`;

    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.expire(redisKey, ttlSec);
    }
    const ttl = await this.redis.ttl(redisKey);
    const expiresAt = Date.now() + Math.max(1, ttl) * 1000;
    return { count, expiresAt };
  }
}

class FailOpenRateLimitStore {
  constructor(primaryStore, fallbackStore) {
    this.primaryStore = primaryStore;
    this.fallbackStore = fallbackStore;
  }

  async increment(key, windowMs) {
    try {
      return await this.primaryStore.increment(key, windowMs);
    } catch (err) {
      console.warn("[rate-limit] Primary store failed, falling back to memory.", err && err.message ? err.message : err);
      return this.fallbackStore.increment(key, windowMs);
    }
  }
}

let storeSingleton = null;

function createRedisStoreOrNull() {
  if (env.RATE_LIMIT_STRATEGY !== "redis") return null;
  if (!env.REDIS_URL) {
    console.warn("[rate-limit] RATE_LIMIT_STRATEGY=redis but REDIS_URL is empty. Falling back to memory store.");
    return null;
  }

  try {
    // Optional dependency. Keep runtime safe when Redis is not used.
    // eslint-disable-next-line global-require
    const Redis = require("ioredis");
    const client = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    client.connect().catch((err) => {
      console.warn("[rate-limit] Redis connect failed. Falling back to memory store.", err && err.message ? err.message : err);
    });
    return new RedisRateLimitStore(client, env.RATE_LIMIT_PREFIX);
  } catch (err) {
    console.warn("[rate-limit] ioredis not installed. Falling back to memory store.");
    return null;
  }
}

function getRateLimitStore() {
  if (storeSingleton) return storeSingleton;
  const memoryStore = new InMemoryRateLimitStore();
  const redisStore = createRedisStoreOrNull();
  storeSingleton = redisStore ? new FailOpenRateLimitStore(redisStore, memoryStore) : memoryStore;
  return storeSingleton;
}

module.exports = { getRateLimitStore };
