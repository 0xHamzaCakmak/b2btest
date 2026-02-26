const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 4000),
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "",
  ACCESS_TOKEN_MINUTES: Number(process.env.ACCESS_TOKEN_MINUTES || 15),
  CORS_ORIGINS: process.env.CORS_ORIGINS || [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4000",
    "http://127.0.0.1:4000",
    "https://subesiparis.com",
    "https://www.subesiparis.com"
  ].join(","),
  CSP_REPORT_ONLY: String(process.env.CSP_REPORT_ONLY || "false").toLowerCase() === "true",
  RATE_LIMIT_STRATEGY: String(process.env.RATE_LIMIT_STRATEGY || "memory").toLowerCase(),
  REDIS_URL: process.env.REDIS_URL || "",
  RATE_LIMIT_PREFIX: process.env.RATE_LIMIT_PREFIX || "rl",
  COOKIE_SECURE: String(process.env.COOKIE_SECURE || "false").toLowerCase() === "true",
  COOKIE_SAMESITE: process.env.COOKIE_SAMESITE || "lax",
  ACCESS_COOKIE_NAME: process.env.ACCESS_COOKIE_NAME || "access_token",
  REFRESH_COOKIE_NAME: process.env.REFRESH_COOKIE_NAME || "refresh_token",
  REFRESH_TOKEN_DAYS: Number(process.env.REFRESH_TOKEN_DAYS || 7)
};

module.exports = { env };
