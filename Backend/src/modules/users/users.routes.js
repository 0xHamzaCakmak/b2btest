const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { requireRole } = require("../../common/middlewares/require-role");
const { normalizePhone } = require("../../common/utils/phone");

const usersRouter = express.Router();

const roles = ["sube", "merkez", "admin"];

const createUserSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(7).max(50).optional(),
  password: z.string().min(6).max(128),
  role: z.enum(["sube", "merkez", "admin"]),
  displayName: z.string().min(2).max(120).optional(),
  branchId: z.string().uuid().nullable().optional(),
  centerId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional()
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).max(50).nullable().optional(),
  role: z.enum(["sube", "merkez", "admin"]).optional(),
  displayName: z.string().min(2).max(120).optional(),
  branchId: z.string().uuid().nullable().optional(),
  centerId: z.string().uuid().nullable().optional()
});

const statusSchema = z.object({
  isActive: z.boolean()
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6).max(128).optional()
});

function mapUser(user) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone || null,
    displayName: user.displayName || "",
    role: user.role,
    branchId: user.branchId,
    branchName: user.branch ? user.branch.name : null,
    centerId: user.centerId,
    centerName: user.center ? user.center.name : null,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function ensureRelationsIfNeeded(role, branchId, centerId) {
  if (role === "sube") {
    if (!branchId) {
      return { ok: false, error: "Sube kullanicisi icin branchId zorunlu." };
    }
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return { ok: false, error: "Branch bulunamadi." };
    }
    return { ok: true };
  }

  if (role === "merkez") {
    if (!centerId) {
      return { ok: false, error: "Merkez kullanicisi icin centerId zorunlu." };
    }
    const center = await prisma.center.findUnique({ where: { id: centerId } });
    if (!center) {
      return { ok: false, error: "Center bulunamadi." };
    }
    return { ok: true };
  }

  return { ok: true };
}

usersRouter.get("/", requireAuth, requireRole("admin"), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: [{ createdAt: "asc" }],
      include: { branch: true, center: true }
    });
    return res.status(200).json({
      ok: true,
      data: users.map(mapUser)
    });
  } catch (err) {
    return next(err);
  }
});

usersRouter.post("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid user payload",
        details: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const normalizedPhone = payload.phone ? normalizePhone(payload.phone) : null;
    if (normalizedPhone) {
      const phoneOwner = await prisma.user.findFirst({
        where: { phone: normalizedPhone },
        select: { id: true }
      });
      if (phoneOwner) {
        return res.status(409).json({
          ok: false,
          error: "PHONE_IN_USE",
          message: "Bu telefon numarasi zaten kullaniliyor."
        });
      }
    }
    const role = payload.role;
    const branchId = role === "sube" ? (payload.branchId || null) : null;
    const centerId = role === "merkez" ? (payload.centerId || null) : null;
    const relationCheck = await ensureRelationsIfNeeded(role, branchId, centerId);
    if (!relationCheck.ok) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: relationCheck.error
      });
    }

    const hash = await bcrypt.hash(payload.password, 10);
    const created = await prisma.user.create({
      data: {
        email: payload.email.trim().toLowerCase(),
        phone: normalizedPhone || null,
        passwordHash: hash,
        displayName: payload.displayName ? payload.displayName.trim() : null,
        role,
        branchId,
        centerId,
        isActive: payload.isActive !== false
      },
      include: { branch: true, center: true }
    });

    return res.status(201).json({
      ok: true,
      data: mapUser(created)
    });
  } catch (err) {
    if (err && err.code === "P2002") {
      return res.status(409).json({
        ok: false,
        error: "EMAIL_IN_USE",
        message: "Bu e-posta zaten kullaniliyor."
      });
    }
    return next(err);
  }
});

usersRouter.put("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid update payload",
        details: parsed.error.flatten()
      });
    }

    const current = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { branch: true, center: true }
    });
    if (!current) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "User not found"
      });
    }

    const payload = parsed.data;
    const normalizedPhone = Object.prototype.hasOwnProperty.call(payload, "phone")
      ? (payload.phone ? normalizePhone(payload.phone) : null)
      : undefined;
    if (normalizedPhone) {
      const phoneOwner = await prisma.user.findFirst({
        where: { phone: normalizedPhone },
        select: { id: true }
      });
      if (phoneOwner && phoneOwner.id !== current.id) {
        return res.status(409).json({
          ok: false,
          error: "PHONE_IN_USE",
          message: "Bu telefon numarasi zaten kullaniliyor."
        });
      }
    }
    const role = payload.role || current.role;
    const branchId = role === "sube"
      ? (Object.prototype.hasOwnProperty.call(payload, "branchId") ? payload.branchId : current.branchId)
      : null;
    const centerId = role === "merkez"
      ? (Object.prototype.hasOwnProperty.call(payload, "centerId") ? payload.centerId : current.centerId)
      : null;

    const relationCheck = await ensureRelationsIfNeeded(role, branchId, centerId);
    if (!relationCheck.ok) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: relationCheck.error
      });
    }

    const data = {
      role,
      branchId,
      centerId
    };
    if (typeof payload.email === "string") data.email = payload.email.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(payload, "phone")) data.phone = normalizedPhone || null;
    if (typeof payload.displayName === "string") data.displayName = payload.displayName.trim();

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data,
      include: { branch: true, center: true }
    });

    return res.status(200).json({
      ok: true,
      data: mapUser(updated)
    });
  } catch (err) {
    if (err && err.code === "P2002") {
      return res.status(409).json({
        ok: false,
        error: "EMAIL_IN_USE",
        message: "Bu e-posta zaten kullaniliyor."
      });
    }
    return next(err);
  }
});

usersRouter.put("/:id/status", requireAuth, requireRole("admin"), async (req, res, next) => {
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

    if (req.params.id === req.user.id && parsed.data.isActive === false) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Admin kendi hesabini pasif yapamaz."
      });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive },
      include: { branch: true, center: true }
    });

    return res.status(200).json({
      ok: true,
      data: mapUser(updated)
    });
  } catch (err) {
    if (err && err.code === "P2025") {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "User not found"
      });
    }
    return next(err);
  }
});

usersRouter.put("/:id/reset-password", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid reset password payload",
        details: parsed.error.flatten()
      });
    }
    const plain = parsed.data.newPassword || "12345678";
    const hash = await bcrypt.hash(plain, 10);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash: hash }
    });
    return res.status(200).json({
      ok: true,
      data: { id: req.params.id, tempPassword: plain }
    });
  } catch (err) {
    if (err && err.code === "P2025") {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "User not found"
      });
    }
    return next(err);
  }
});

usersRouter.get("/meta/branches", requireAuth, requireRole("admin"), async (_req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, isActive: true }
    });
    return res.status(200).json({
      ok: true,
      data: branches
    });
  } catch (err) {
    return next(err);
  }
});

usersRouter.get("/meta/centers", requireAuth, requireRole("admin"), async (_req, res, next) => {
  try {
    const centers = await prisma.center.findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, isActive: true }
    });
    return res.status(200).json({
      ok: true,
      data: centers
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { usersRouter, roles };
