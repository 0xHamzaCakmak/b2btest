const { env } = require("../../config/env");

function parseCookies(cookieHeader) {
  const out = {};
  const source = String(cookieHeader || "");
  if (!source) return out;
  source.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(value);
    } catch (_err) {
      out[key] = value;
    }
  });
  return out;
}

function accessCookieOptions() {
  const maxAge = Math.max(1, Number(env.ACCESS_TOKEN_MINUTES || 15)) * 60 * 1000;
  return {
    httpOnly: true,
    secure: !!env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE || "lax",
    path: "/",
    maxAge
  };
}

function refreshCookieOptions() {
  const maxAge = Math.max(1, Number(env.REFRESH_TOKEN_DAYS || 7)) * 24 * 60 * 60 * 1000;
  return {
    httpOnly: true,
    secure: !!env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE || "lax",
    path: "/api/auth",
    maxAge
  };
}

function setAccessTokenCookie(res, token) {
  res.cookie(env.ACCESS_COOKIE_NAME, token, accessCookieOptions());
}

function clearAccessTokenCookie(res) {
  res.clearCookie(env.ACCESS_COOKIE_NAME, accessCookieOptions());
}

function setRefreshTokenCookie(res, token) {
  res.cookie(env.REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

function clearRefreshTokenCookie(res) {
  res.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions());
}

function getRefreshTokenFromRequest(req) {
  const cookies = parseCookies(req && req.headers ? req.headers.cookie : "");
  return cookies[env.REFRESH_COOKIE_NAME] || "";
}

function getAccessTokenFromRequest(req) {
  const cookies = parseCookies(req && req.headers ? req.headers.cookie : "");
  return cookies[env.ACCESS_COOKIE_NAME] || "";
}

module.exports = {
  parseCookies,
  setAccessTokenCookie,
  clearAccessTokenCookie,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
  getAccessTokenFromRequest
};
