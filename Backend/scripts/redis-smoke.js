const { env } = require("../src/config/env");

async function run() {
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL bos. Once environment degiskenini ayarlayin.");
  }

  let Redis;
  try {
    // eslint-disable-next-line global-require
    Redis = require("ioredis");
  } catch (err) {
    throw new Error("ioredis kurulu degil. `npm i ioredis` komutunu calistirin.");
  }

  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  const key = `${env.RATE_LIMIT_PREFIX || "rl"}:smoke:${Date.now()}`;
  try {
    await redis.connect();
    await redis.set(key, "1", "EX", 30);
    const value = await redis.get(key);
    if (value !== "1") {
      throw new Error("Redis SET/GET dogrulamasi basarisiz.");
    }
    const count = await redis.incr(`${key}:incr`);
    if (typeof count !== "number" || count < 1) {
      throw new Error("Redis INCR dogrulamasi basarisiz.");
    }
    console.log("PASS redis-smoke");
  } finally {
    await redis.quit().catch(() => {});
  }
}

run()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error("FAIL redis-smoke");
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  });
