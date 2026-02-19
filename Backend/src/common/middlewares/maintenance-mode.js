const { prisma } = require("../../config/prisma");
const { verifyAccessToken } = require("../auth/jwt");

const CACHE_TTL_MS = 15000;
let cacheState = {
  loadedAt: 0,
  enabled: false,
  message: ""
};

const BYPASS_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/admin/settings",
  "/api/admin/settings/history"
]);

async function loadMaintenanceConfig() {
  const now = Date.now();
  if ((now - cacheState.loadedAt) < CACHE_TTL_MS) {
    return cacheState;
  }

  const rows = await prisma.systemSetting.findMany({
    where: {
      key: { in: ["maintenance_mode_enabled", "maintenance_message"] }
    },
    select: {
      key: true,
      value: true
    }
  });

  const enabledRow = rows.find((row) => row.key === "maintenance_mode_enabled");
  const messageRow = rows.find((row) => row.key === "maintenance_message");
  cacheState = {
    loadedAt: now,
    enabled: String(enabledRow ? enabledRow.value : "").toLowerCase() === "true",
    message: String(messageRow ? messageRow.value : "").trim()
  };
  return cacheState;
}

function getPathOnly(req) {
  return String(req.originalUrl || "").split("?")[0] || "";
}

function isBypassPath(pathOnly) {
  if (BYPASS_PATHS.has(pathOnly)) return true;
  if (pathOnly.startsWith("/uploads/")) return true;
  return false;
}

async function isAdminRequest(req) {
  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length);
  if (!token) return false;

  try {
    const payload = verifyAccessToken(token);
    const userId = payload && payload.sub ? String(payload.sub) : "";
    if (!userId) return false;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true }
    });
    return !!(user && user.isActive && user.role === "admin");
  } catch (_err) {
    return false;
  }
}

async function maintenanceMode(req, res, next) {
  try {
    const pathOnly = getPathOnly(req);
    if (!pathOnly.startsWith("/api/")) return next();
    if (isBypassPath(pathOnly)) return next();

    const state = await loadMaintenanceConfig();
    if (!state.enabled) return next();

    const adminRequest = await isAdminRequest(req);
    if (adminRequest) return next();

    return res.status(503).json({
      ok: false,
      error: "MAINTENANCE_MODE",
      message: state.message || "Sistem bakim modunda. Lutfen daha sonra tekrar deneyin."
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { maintenanceMode };
