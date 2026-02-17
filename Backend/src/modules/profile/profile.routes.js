const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");

const profileRouter = express.Router();

const updateProfileSchema = z.object({
  subeAdi: z.string().min(2).max(120).optional(),
  yetkili: z.string().min(2).max(120).optional(),
  telefon: z.string().min(5).max(40).optional(),
  eposta: z.string().email().optional(),
  adres: z.string().max(500).optional(),
  displayName: z.string().min(2).max(120).optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6).max(128)
});

function mapProfile(user) {
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName || "",
      role: user.role
    },
    branch: user.branch ? {
      id: user.branch.id,
      name: user.branch.name || "",
      manager: user.branch.manager || "",
      phone: user.branch.phone || "",
      email: user.branch.email || "",
      address: user.branch.address || "",
      isActive: user.branch.isActive
    } : null
  };
}

profileRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { branch: true }
    });

    return res.status(200).json({
      ok: true,
      data: mapProfile(user)
    });
  } catch (err) {
    return next(err);
  }
});

profileRouter.put("/me", requireAuth, async (req, res, next) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid profile payload",
        details: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const updates = [];

    if (payload.eposta && payload.eposta !== req.user.email) {
      const emailOwner = await prisma.user.findUnique({ where: { email: payload.eposta } });
      if (emailOwner && emailOwner.id !== req.user.id) {
        return res.status(409).json({
          ok: false,
          error: "EMAIL_IN_USE",
          message: "Bu e-posta baska bir kullanici tarafindan kullaniliyor."
        });
      }
    }

    const userData = {};
    if (typeof payload.eposta === "string") userData.email = payload.eposta.trim();
    if (typeof payload.displayName === "string") userData.displayName = payload.displayName.trim();
    if (Object.keys(userData).length) {
      updates.push(
        prisma.user.update({
          where: { id: req.user.id },
          data: userData
        })
      );
    }

    const canUpdateBranch = req.user.role === "sube" && req.user.branchId;
    if (canUpdateBranch) {
      const branchData = {};
      if (typeof payload.subeAdi === "string") branchData.name = payload.subeAdi.trim();
      if (typeof payload.yetkili === "string") branchData.manager = payload.yetkili.trim();
      if (typeof payload.telefon === "string") branchData.phone = payload.telefon.trim();
      if (typeof payload.eposta === "string") branchData.email = payload.eposta.trim();
      if (typeof payload.adres === "string") branchData.address = payload.adres.trim();
      if (Object.keys(branchData).length) {
        updates.push(
          prisma.branch.update({
            where: { id: req.user.branchId },
            data: branchData
          })
        );
      }
    }

    if (updates.length) {
      await prisma.$transaction(updates);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { branch: true }
    });

    return res.status(200).json({
      ok: true,
      data: mapProfile(user)
    });
  } catch (err) {
    return next(err);
  }
});

profileRouter.put("/password", requireAuth, async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid password payload",
        details: parsed.error.flatten()
      });
    }

    const { currentPassword, newPassword } = parsed.data;
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    const passwordOk = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordOk) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_CREDENTIALS",
        message: "Mevcut sifre hatali."
      });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: newHash }
    });

    return res.status(200).json({
      ok: true,
      data: { updated: true }
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { profileRouter };
