const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const { env } = require("./config/env");
const { prisma } = require("./config/prisma");
const { authRouter } = require("./modules/auth/auth.routes");
const { requireAuth } = require("./common/middlewares/require-auth");
const { productsRouter } = require("./modules/products/products.routes");
const { branchesRouter } = require("./modules/branches/branches.routes");
const { ordersRouter } = require("./modules/orders/orders.routes");
const { profileRouter } = require("./modules/profile/profile.routes");
const { usersRouter } = require("./modules/users/users.routes");
const { centersRouter } = require("./modules/centers/centers.routes");
const { logsRouter } = require("./modules/logs/logs.routes");
const { settingsRouter } = require("./modules/settings/settings.routes");
const { maintenanceMode } = require("./common/middlewares/maintenance-mode");

const app = express();
const frontendRoot = path.join(__dirname, "../../Frontend");
const allowedOrigins = String(env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
function isDevLocalOrigin(origin) {
  if (!origin || env.NODE_ENV === "production") return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:") return false;
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch (_err) {
    return false;
  }
}

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'none'"],
      objectSrc: ["'none'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"]
    },
    reportOnly: env.CSP_REPORT_ONLY === true
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "no-referrer" }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin === "null" && env.NODE_ENV !== "production") return callback(null, true);
    if (isDevLocalOrigin(origin)) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS_NOT_ALLOWED"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "12mb" }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use(express.static(frontendRoot));

function buildAuditPayload(req, res, durationMs) {
  const pathOnly = String(req.originalUrl || "").split("?")[0] || "";
  if (!pathOnly.startsWith("/api/")) return null;
  if (pathOnly.startsWith("/api/admin/logs")) return null;
  if (req.skipAudit === true) return null;

  const parts = pathOnly.replace(/^\/api\//, "").split("/").filter(Boolean);
  const entity = parts[0] || "api";
  const maybeEntityId = parts[1] || null;
  const actionRaw = [req.method || "UNKNOWN", ...parts].join("_").toUpperCase();
  const action = actionRaw.slice(0, 120);
  const redactedBody = req.auditBody && typeof req.auditBody === "object"
    ? req.auditBody
    : sanitizeBody(req.body);
  const loginIdentifier = pathOnly === "/api/auth/login" && req.body
    ? String(req.body.emailOrPhone || req.body.email || "").toLowerCase().trim()
    : null;

  return {
    actorUserId: req.user && req.user.id ? String(req.user.id) : null,
    action,
    entity: entity.slice(0, 120),
    entityId: maybeEntityId ? String(maybeEntityId).slice(0, 120) : null,
    meta: JSON.stringify({
      method: req.method,
      path: pathOnly,
      statusCode: res.statusCode,
      durationMs,
      loginIdentifier,
      body: redactedBody
    })
  };
}

function sanitizeBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const hiddenKeys = new Set([
    "password",
    "currentPassword",
    "newPassword",
    "passwordHash",
    "tempPassword",
    "token",
    "accessToken",
    "refreshToken",
    "dataBase64"
  ]);
  const out = {};
  Object.keys(body).forEach((key) => {
    if (hiddenKeys.has(key)) return;
    const value = body[key];
    if (value === undefined) return;
    if (typeof value === "object" && value !== null) return;
    out[key] = value;
  });
  return Object.keys(out).length ? out : null;
}

app.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  const startedAt = Date.now();
  res.on("finish", () => {
    const payload = buildAuditPayload(req, res, Date.now() - startedAt);
    if (!payload) return;

    prisma.auditLog.create({ data: payload }).catch((err) => {
      console.error("[AuditLogCreateError]", err && err.message ? err.message : err);
    });
  });

  return next();
});

app.use(maintenanceMode);

app.get("/", (_req, res) => {
  res.redirect("/login.html");
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "b2b-borek-backend",
    env: env.NODE_ENV,
    time: new Date().toISOString()
  });
});

app.use("/api/auth", authRouter);
app.use("/api/products", productsRouter);
app.use("/api/branches", branchesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/profile", profileRouter);
app.use("/api/admin/users", usersRouter);
app.use("/api/admin/logs", logsRouter);
app.use("/api/admin/settings", settingsRouter);
app.use("/api/centers", centersRouter);

app.get("/api/me", requireAuth, (req, res) => {
  res.status(200).json({
    ok: true,
    data: {
      id: req.user.id,
      email: req.user.email,
      phone: req.user.phone || null,
      displayName: req.user.displayName || null,
      role: req.user.role,
      branchId: req.user.branchId,
      branchName: req.user.branch ? req.user.branch.name : null,
      centerId: req.user.centerId,
      centerName: req.user.center ? req.user.center.name : null,
      isActive: req.user.isActive
    }
  });
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "NOT_FOUND",
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

app.use((err, _req, res, _next) => {
  if (err && err.message === "CORS_NOT_ALLOWED") {
    return res.status(403).json({
      ok: false,
      error: "FORBIDDEN_ORIGIN",
      message: "Origin is not allowed by CORS policy"
    });
  }

  if (err && err.type === "entity.too.large") {
    return res.status(413).json({
      ok: false,
      error: "PAYLOAD_TOO_LARGE",
      message: "Gorsel boyutu cok buyuk. Daha kucuk bir dosya deneyin."
    });
  }

  console.error("[UnhandledError]", err);
  res.status(500).json({
    ok: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "Unexpected server error"
  });
});

module.exports = { app };
