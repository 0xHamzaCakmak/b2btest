const jwt = require("jsonwebtoken");
const { env } = require("../../config/env");

function ensureSecret(name, value) {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
}

function signAccessToken(payload) {
  ensureSecret("JWT_ACCESS_SECRET", env.JWT_ACCESS_SECRET);
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

function signRefreshToken(payload) {
  ensureSecret("JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET);
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

function verifyAccessToken(token) {
  ensureSecret("JWT_ACCESS_SECRET", env.JWT_ACCESS_SECRET);
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  ensureSecret("JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET);
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
