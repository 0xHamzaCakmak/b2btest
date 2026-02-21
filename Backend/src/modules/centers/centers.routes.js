const express = require("express");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { requireRole } = require("../../common/middlewares/require-role");
const { createSimpleRateLimiter } = require("../../common/middlewares/rate-limit");
const { normalizePhone, isStrictTrPhone } = require("../../common/utils/phone");

const centersRouter = express.Router();
const centerMutationRateLimiter = createSimpleRateLimiter({
  max: 80,
  windowMs: 5 * 60 * 1000,
  message: "Cok fazla merkez degisikligi istegi. Lutfen kisa sure sonra tekrar deneyin.",
  keyFn(req) {
    return `${req.user && req.user.id ? req.user.id : req.ip || "ip"}:center-mutation`;
  }
});

const createCenterSchema = z.object({
  name: z.string().min(2).max(120),
  manager: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  isActive: z.boolean().optional()
});

const updateCenterSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  manager: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional()
});

const statusSchema = z.object({
  isActive: z.boolean()
});

function mapCenter(center) {
  return {
    id: center.id,
    name: center.name,
    manager: center.manager || "",
    phone: center.phone || "",
    email: center.email || "",
    address: center.address || "",
    isActive: center.isActive,
    userCount: (center._count && center._count.users) || 0,
    createdAt: center.createdAt,
    updatedAt: center.updatedAt
  };
}

async function checkCenterContactUniqueness(email, phone, excludeId) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedPhone = typeof phone === "string" ? normalizePhone(phone) : "";

  if (normalizedEmail) {
    const where = excludeId
      ? { email: normalizedEmail, id: { not: excludeId } }
      : { email: normalizedEmail };
    const owner = await prisma.center.findFirst({
      where,
      select: { id: true }
    });
    if (owner) {
      return {
        ok: false,
        error: "CENTER_EMAIL_IN_USE",
        message: "Bu e-posta baska bir merkezde kullaniliyor."
      };
    }
  }

  if (normalizedPhone) {
    const where = excludeId
      ? { phone: normalizedPhone, id: { not: excludeId } }
      : { phone: normalizedPhone };
    const owner = await prisma.center.findFirst({
      where,
      select: { id: true }
    });
    if (owner) {
      return {
        ok: false,
        error: "CENTER_PHONE_IN_USE",
        message: "Bu telefon numarasi baska bir merkezde kullaniliyor."
      };
    }
  }

  return { ok: true };
}

centersRouter.get("/", requireAuth, requireRole("admin"), async (_req, res, next) => {
  try {
    const centers = await prisma.center.findMany({
      orderBy: [{ createdAt: "asc" }],
      include: { _count: { select: { users: true } } }
    });
    return res.status(200).json({
      ok: true,
      data: centers.map(mapCenter)
    });
  } catch (err) {
    return next(err);
  }
});

centersRouter.post("/", requireAuth, requireRole("admin"), centerMutationRateLimiter, async (req, res, next) => {
  try {
    const parsed = createCenterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid center payload",
        details: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const normalizedEmail = payload.email ? payload.email.trim().toLowerCase() : "";
    const normalizedPhone = payload.phone ? normalizePhone(payload.phone) : "";
    if (normalizedPhone && !isStrictTrPhone(normalizedPhone)) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Telefon 90 ile baslamali ve 10 hane icermelidir."
      });
    }
    const uniqueCheck = await checkCenterContactUniqueness(normalizedEmail, normalizedPhone);
    if (!uniqueCheck.ok) {
      return res.status(409).json({
        ok: false,
        error: uniqueCheck.error,
        message: uniqueCheck.message
      });
    }
    const created = await prisma.center.create({
      data: {
        name: payload.name.trim(),
        manager: payload.manager ? payload.manager.trim() : null,
        phone: normalizedPhone || null,
        email: normalizedEmail || null,
        address: payload.address ? payload.address.trim() : null,
        isActive: payload.isActive !== false
      },
      include: { _count: { select: { users: true } } }
    });

    return res.status(201).json({
      ok: true,
      data: mapCenter(created)
    });
  } catch (err) {
    return next(err);
  }
});

centersRouter.put("/:id", requireAuth, requireRole("admin"), centerMutationRateLimiter, async (req, res, next) => {
  try {
    const parsed = updateCenterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid center update payload",
        details: parsed.error.flatten()
      });
    }
    const payload = parsed.data;

    const data = {};
    if (typeof payload.name === "string") data.name = payload.name.trim();
    if (typeof payload.manager === "string") data.manager = payload.manager.trim();
    if (typeof payload.phone === "string") {
      const normalizedPhone = payload.phone.trim() ? normalizePhone(payload.phone) : null;
      if (normalizedPhone && !isStrictTrPhone(normalizedPhone)) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          message: "Telefon 90 ile baslamali ve 10 hane icermelidir."
        });
      }
      data.phone = normalizedPhone;
    }
    if (typeof payload.email === "string") data.email = payload.email.trim().toLowerCase();
    if (typeof payload.address === "string") data.address = payload.address.trim();

    const uniqueCheck = await checkCenterContactUniqueness(data.email, data.phone, req.params.id);
    if (!uniqueCheck.ok) {
      return res.status(409).json({
        ok: false,
        error: uniqueCheck.error,
        message: uniqueCheck.message
      });
    }

    const updated = await prisma.center.update({
      where: { id: req.params.id },
      data,
      include: { _count: { select: { users: true } } }
    });

    return res.status(200).json({
      ok: true,
      data: mapCenter(updated)
    });
  } catch (err) {
    if (err && err.code === "P2025") {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Center not found"
      });
    }
    return next(err);
  }
});

centersRouter.put("/:id/status", requireAuth, requireRole("admin"), centerMutationRateLimiter, async (req, res, next) => {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid status payload",
        details: parsed.error.flatten()
      });
    }

    const updated = await prisma.center.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive },
      include: { _count: { select: { users: true } } }
    });

    return res.status(200).json({
      ok: true,
      data: mapCenter(updated)
    });
  } catch (err) {
    if (err && err.code === "P2025") {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Center not found"
      });
    }
    return next(err);
  }
});

centersRouter.delete("/:id", requireAuth, requireRole("admin"), centerMutationRateLimiter, async (req, res, next) => {
  try {
    const center = await prisma.center.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true }
    });
    if (!center) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Center not found"
      });
    }

    const [userCount, branchCount] = await Promise.all([
      prisma.user.count({ where: { centerId: req.params.id } }),
      prisma.branch.count({ where: { centerId: req.params.id } })
    ]);

    if (userCount > 0 || branchCount > 0) {
      return res.status(409).json({
        ok: false,
        error: "CENTER_DELETE_BLOCKED",
        message: "Merkez silinemedi. Once bagli sube ve kullanici kayitlarini temizleyin.",
        data: { userCount, branchCount }
      });
    }

    await prisma.center.delete({
      where: { id: req.params.id }
    });

    return res.status(200).json({
      ok: true,
      data: { id: center.id, name: center.name, deleted: true }
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { centersRouter };
