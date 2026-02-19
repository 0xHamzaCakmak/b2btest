const jwt = require("jsonwebtoken");
const { env } = require("../../config/env");

function ensureSecret(name, value) {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
}

function signAccessToken(payload) {
  ensureSecret("JWT_ACCESS_SECRET", env.JWT_ACCESS_SECRET);
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: `${Math.max(1, Number(env.ACCESS_TOKEN_MINUTES || 15))}m`
  });
}

function signRefreshToken(payload, options) {
  ensureSecret("JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET);
  const signOptions = {
    expiresIn: `${Math.max(1, Number(env.REFRESH_TOKEN_DAYS || 7))}d`
  };
  if (options && options.jwtid) {
    signOptions.jwtid = String(options.jwtid);
  }
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, signOptions);
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
