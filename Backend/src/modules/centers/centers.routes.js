const express = require("express");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { requireRole } = require("../../common/middlewares/require-role");

const centersRouter = express.Router();

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

centersRouter.post("/", requireAuth, requireRole("admin"), async (req, res, next) => {
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
    const created = await prisma.center.create({
      data: {
        name: payload.name.trim(),
        manager: payload.manager ? payload.manager.trim() : null,
        phone: payload.phone ? payload.phone.trim() : null,
        email: payload.email ? payload.email.trim().toLowerCase() : null,
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

centersRouter.put("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
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
    if (typeof payload.phone === "string") data.phone = payload.phone.trim();
    if (typeof payload.email === "string") data.email = payload.email.trim().toLowerCase();
    if (typeof payload.address === "string") data.address = payload.address.trim();

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

centersRouter.put("/:id/status", requireAuth, requireRole("admin"), async (req, res, next) => {
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

module.exports = { centersRouter };
