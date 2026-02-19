const express = require("express");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { requireRole } = require("../../common/middlewares/require-role");
const { createSimpleRateLimiter } = require("../../common/middlewares/rate-limit");

const settingsRouter = express.Router();
const settingsMutationRateLimiter = createSimpleRateLimiter({
  max: 40,
  windowMs: 5 * 60 * 1000,
  message: "Cok fazla ayar degisikligi istegi. Lutfen kisa sure sonra tekrar deneyin.",
  keyFn(req) {
    return `${req.user && req.user.id ? req.user.id : req.ip || "ip"}:settings-mutation`;
  }
});

const defaultSettings = {
  defaultDeliveryTime: "07:00",
  orderCutoffTime: "23:30",
  currency: "TRY",
  timezone: "Europe/Istanbul",
  accessTokenMinutes: 15,
  refreshTokenDays: 7,
  minPasswordLength: 6,
  strongPasswordRequired: false,
  maintenanceModeEnabled: false,
  maintenanceMessage: "",
  orderSummaryEmailEnabled: false
};

const settingToDbKey = {
  defaultDeliveryTime: "default_delivery_time",
  orderCutoffTime: "order_cutoff_time",
  currency: "currency",
  timezone: "timezone",
  accessTokenMinutes: "access_token_minutes",
  refreshTokenDays: "refresh_token_days",
  minPasswordLength: "min_password_length",
  strongPasswordRequired: "strong_password_required",
  maintenanceModeEnabled: "maintenance_mode_enabled",
  maintenanceMessage: "maintenance_message",
  orderSummaryEmailEnabled: "order_summary_email_enabled"
};

const dbKeyToSetting = Object.keys(settingToDbKey).reduce((acc, key) => {
  acc[settingToDbKey[key]] = key;
  return acc;
}, {});

const updateSchema = z.object({
  defaultDeliveryTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  orderCutoffTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  currency: z.string().min(3).max(8).optional(),
  timezone: z.string().min(3).max(64).optional(),
  accessTokenMinutes: z.number().int().min(5).max(1440).optional(),
  refreshTokenDays: z.number().int().min(1).max(90).optional(),
  minPasswordLength: z.number().int().min(6).max(32).optional(),
  strongPasswordRequired: z.boolean().optional(),
  maintenanceModeEnabled: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional(),
  orderSummaryEmailEnabled: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one setting is required"
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional()
});

function mergeSettings(rows) {
  const merged = Object.assign({}, defaultSettings);
  (rows || []).forEach((row) => {
    const settingKey = dbKeyToSetting[row.key];
    if (!settingKey) return;
    const def = defaultSettings[settingKey];
    if (typeof def === "number") {
      const parsed = Number(row.value);
      if (!Number.isNaN(parsed)) merged[settingKey] = parsed;
      return;
    }
    if (typeof def === "boolean") {
      merged[settingKey] = String(row.value).toLowerCase() === "true";
      return;
    }
    merged[settingKey] = String(row.value || "");
  });
  return merged;
}

function toDbValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function getChangedSettingEntries(currentSettings, nextSettings) {
  const changed = [];
  Object.keys(nextSettings).forEach((key) => {
    const currentValue = currentSettings[key];
    const nextValue = nextSettings[key];
    if (currentValue === nextValue) return;
    changed.push({
      key,
      before: currentValue,
      after: nextValue
    });
  });
  return changed;
}

function parseMeta(metaText) {
  if (!metaText) return null;
  try {
    const parsed = JSON.parse(metaText);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_err) {
    return null;
  }
}

function summarizeValue(value) {
  if (typeof value === "boolean") return value ? "Aktif" : "Pasif";
  if (typeof value === "number") return String(value);
  const text = String(value || "").trim();
  if (!text) return "(bos)";
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function mapHistoryRow(log) {
  const meta = parseMeta(log.meta);
  const body = meta && meta.body && typeof meta.body === "object" ? meta.body : {};
  const changes = Array.isArray(body.changes) ? body.changes : [];
  const changedKeys = changes.map((item) => String(item.key || "")).filter(Boolean);
  const changedFields = changes.map((item) => ({
    key: String(item.key || ""),
    before: summarizeValue(item.before),
    after: summarizeValue(item.after)
  })).filter((item) => !!item.key);

  return {
    id: log.id,
    changedAt: log.createdAt,
    actor: log.actorUser ? {
      id: log.actorUser.id,
      email: log.actorUser.email,
      displayName: log.actorUser.displayName || "",
      role: log.actorUser.role
    } : null,
    action: log.action,
    changedKeys,
    changedFields
  };
}

settingsRouter.get("/", requireAuth, requireRole("admin"), async (_req, res, next) => {
  try {
    const rows = await prisma.systemSetting.findMany();
    return res.status(200).json({
      ok: true,
      data: mergeSettings(rows)
    });
  } catch (err) {
    return next(err);
  }
});

settingsRouter.get("/history", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = historyQuerySchema.safeParse(req.query || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid history query",
        details: parsed.error.flatten()
      });
    }

    const limit = parsed.data.limit || 30;
    const logs = await prisma.auditLog.findMany({
      where: {
        action: { startsWith: "PUT_ADMIN_SETTINGS" }
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      include: {
        actorUser: {
          select: { id: true, email: true, displayName: true, role: true }
        }
      }
    });

    return res.status(200).json({
      ok: true,
      data: logs.map(mapHistoryRow)
    });
  } catch (err) {
    return next(err);
  }
});

settingsRouter.put("/", requireAuth, requireRole("admin"), settingsMutationRateLimiter, async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid settings payload",
        details: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const existingRows = await prisma.systemSetting.findMany();
    const currentSettings = mergeSettings(existingRows);
    const changed = getChangedSettingEntries(currentSettings, payload);

    if (!changed.length) {
      req.skipAudit = true;
      return res.status(200).json({
        ok: true,
        data: Object.assign({}, currentSettings, { __noChanges: true }),
        message: "Degisiklik bulunamadi."
      });
    }

    await prisma.$transaction(changed.map((item) => {
      const settingKey = item.key;
      const dbKey = settingToDbKey[settingKey];
      return prisma.systemSetting.upsert({
        where: { key: dbKey },
        create: {
          key: dbKey,
          value: toDbValue(item.after),
          updatedBy: req.user.id
        },
        update: {
          value: toDbValue(item.after),
          updatedBy: req.user.id
        }
      });
    }));

    req.auditBody = {
      changes: changed.map((item) => ({
        key: item.key,
        before: item.before,
        after: item.after
      }))
    };

    const rows = await prisma.systemSetting.findMany();
    return res.status(200).json({
      ok: true,
      data: mergeSettings(rows)
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = {
  settingsRouter,
  defaultSettings,
  mergeSettings
};
