const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { env } = require("./config/env");
const { authRouter } = require("./modules/auth/auth.routes");
const { requireAuth } = require("./common/middlewares/require-auth");
const { productsRouter } = require("./modules/products/products.routes");
const { branchesRouter } = require("./modules/branches/branches.routes");
const { ordersRouter } = require("./modules/orders/orders.routes");
const { profileRouter } = require("./modules/profile/profile.routes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "b2b-borek-backend",
    message: "Backend is running. Use frontend login page for UI.",
    endpoints: ["/health", "/api/auth/login", "/api/me", "/api/products", "/api/branches", "/api/orders", "/api/profile/me"]
  });
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

app.get("/api/me", requireAuth, (req, res) => {
  res.status(200).json({
    ok: true,
    data: {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.displayName || null,
      role: req.user.role,
      branchId: req.user.branchId,
      branchName: req.user.branch ? req.user.branch.name : null,
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
  console.error("[UnhandledError]", err);
  res.status(500).json({
    ok: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "Unexpected server error"
  });
});

module.exports = { app };
