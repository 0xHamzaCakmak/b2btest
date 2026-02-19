const express = require("express");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { requireRole } = require("../../common/middlewares/require-role");

const logsRouter = express.Router();

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  action: z.string().min(1).max(120).optional(),
  entity: z.string().min(1).max(120).optional(),
  actorEmail: z.string().min(1).max(200).optional(),
  q: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(300).optional()
});

function parseDateStrict(dateText, mode) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText || "")) return null;
  const parts = String(dateText).split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return null;

  const parsed = mode === "end"
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== (month - 1) ||
    parsed.getDate() !== day
  ) return null;
  return parsed;
}

function mapLog(log) {
  return {
    id: log.id,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId || null,
    before: log.before || null,
    after: log.after || null,
    meta: log.meta || null,
    createdAt: log.createdAt,
    actor: log.actorUser ? {
      id: log.actorUser.id,
      email: log.actorUser.email,
      displayName: log.actorUser.displayName || "",
      role: log.actorUser.role
    } : null
  };
}

logsRouter.get("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid logs query",
        details: parsed.error.flatten()
      });
    }

    const q = parsed.data;
    const where = {};
    if (q.from || q.to) {
      const fromDate = q.from ? parseDateStrict(q.from, "start") : null;
      const toDate = q.to ? parseDateStrict(q.to, "end") : null;
      if ((q.from && !fromDate) || (q.to && !toDate)) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          message: "Invalid from/to query. Expected YYYY-MM-DD"
        });
      }
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }
    if (q.action) where.action = { contains: q.action.trim() };
    if (q.entity) where.entity = { contains: q.entity.trim() };
    if (q.actorEmail) where.actorUser = { email: { contains: q.actorEmail.trim() } };
    if (q.q) {
      const text = q.q.trim();
      where.OR = [
        { action: { contains: text } },
        { entity: { contains: text } },
        { entityId: { contains: text } },
        { meta: { contains: text } }
      ];
    }

    const limit = q.limit || 120;
    const logs = await prisma.auditLog.findMany({
      where,
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
      data: logs.map(mapLog)
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { logsRouter };
