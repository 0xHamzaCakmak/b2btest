const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { normalizePhone, isStrictTrPhone } = require("../../common/utils/phone");
const { createSimpleRateLimiter } = require("../../common/middlewares/rate-limit");

const profileRouter = express.Router();
const profileUpdateRateLimiter = createSimpleRateLimiter({
  max: 60,
  windowMs: 5 * 60 * 1000,
  message: "Cok fazla profil guncelleme istegi. Lutfen kisa sure sonra tekrar deneyin.",
  keyFn(req) {
    return `${req.user && req.user.id ? req.user.id : req.ip || "ip"}:profile-update`;
  }
});
const passwordChangeRateLimiter = createSimpleRateLimiter({
  max: 12,
  windowMs: 15 * 60 * 1000,
  message: "Cok fazla sifre degisikligi denemesi. Lutfen daha sonra tekrar deneyin.",
  keyFn(req) {
    return `${req.user && req.user.id ? req.user.id : req.ip || "ip"}:password-change`;
  }
});

const updateProfileSchema = z.object({
  subeAdi: z.string().min(2).max(120).optional(),
  yetkili: z.string().min(2).max(120).optional(),
  telefon: z.string().min(5).max(40).optional(),
  eposta: z.string().email().optional(),
  adres: z.string().max(500).optional(),
  displayName: z.string().min(2).max(120).optional(),
  userEmail: z.string().email().optional(),
  userPhone: z.string().min(5).max(40).optional(),
  branchName: z.string().min(2).max(120).optional(),
  branchManager: z.string().min(2).max(120).optional(),
  branchPhone: z.string().min(5).max(40).optional(),
  branchEmail: z.string().email().optional(),
  branchAddress: z.string().max(500).optional(),
  centerName: z.string().min(2).max(120).optional(),
  centerManager: z.string().min(2).max(120).optional(),
  centerPhone: z.string().min(5).max(40).optional(),
  centerEmail: z.string().email().optional(),
  centerAddress: z.string().max(500).optional()
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
      phone: user.phone || "",
      displayName: user.displayName || "",
      role: user.role
    },
    center: user.center ? {
      id: user.center.id,
      name: user.center.name || "",
      manager: user.center.manager || "",
      phone: user.center.phone || "",
      email: user.center.email || "",
      address: user.center.address || "",
      isActive: user.center.isActive
    } : null,
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
      include: { branch: true, center: true }
    });

    return res.status(200).json({
      ok: true,
      data: mapProfile(user)
    });
  } catch (err) {
    return next(err);
  }
});

profileRouter.put("/me", requireAuth, profileUpdateRateLimiter, async (req, res, next) => {
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
    const effectiveUserEmail = typeof payload.userEmail === "string" ? payload.userEmail : payload.eposta;
    const effectiveUserPhone = typeof payload.userPhone === "string" ? payload.userPhone : payload.telefon;
    const effectiveBranchName = typeof payload.branchName === "string" ? payload.branchName : payload.subeAdi;
    const effectiveBranchManager = typeof payload.branchManager === "string" ? payload.branchManager : payload.yetkili;
    const effectiveBranchPhone = typeof payload.branchPhone === "string" ? payload.branchPhone : payload.telefon;
    const effectiveBranchEmail = typeof payload.branchEmail === "string" ? payload.branchEmail : payload.eposta;
    const effectiveBranchAddress = typeof payload.branchAddress === "string" ? payload.branchAddress : payload.adres;
    const effectiveCenterName = typeof payload.centerName === "string" ? payload.centerName : null;
    const effectiveCenterManager = typeof payload.centerManager === "string" ? payload.centerManager : null;
    const effectiveCenterPhone = typeof payload.centerPhone === "string" ? payload.centerPhone : null;
    const effectiveCenterEmail = typeof payload.centerEmail === "string" ? payload.centerEmail : null;
    const effectiveCenterAddress = typeof payload.centerAddress === "string" ? payload.centerAddress : null;

    if (effectiveUserEmail && effectiveUserEmail !== req.user.email) {
      const emailOwner = await prisma.user.findUnique({ where: { email: effectiveUserEmail } });
      if (emailOwner && emailOwner.id !== req.user.id) {
        return res.status(409).json({
          ok: false,
          error: "EMAIL_IN_USE",
          message: "Bu e-posta baska bir kullanici tarafindan kullaniliyor."
        });
      }
    }

    if (typeof effectiveUserPhone === "string" && effectiveUserPhone.trim()) {
      const normalizedPhone = normalizePhone(effectiveUserPhone);
      if (!isStrictTrPhone(normalizedPhone)) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          message: "Telefon 90 ile baslamali ve 10 hane icermelidir."
        });
      }
      const phoneOwner = await prisma.user.findFirst({
        where: { phone: normalizedPhone },
        select: { id: true }
      });
      if (phoneOwner && phoneOwner.id !== req.user.id) {
        return res.status(409).json({
          ok: false,
          error: "PHONE_IN_USE",
          message: "Bu telefon numarasi baska bir kullanici tarafindan kullaniliyor."
        });
      }
    }

    const userData = {};
    if (typeof effectiveUserEmail === "string") userData.email = effectiveUserEmail.trim();
    if (typeof effectiveUserPhone === "string") {
      const normalizedPhone = effectiveUserPhone.trim() ? normalizePhone(effectiveUserPhone) : null;
      if (normalizedPhone && !isStrictTrPhone(normalizedPhone)) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          message: "Telefon 90 ile baslamali ve 10 hane icermelidir."
        });
      }
      userData.phone = normalizedPhone;
    }
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
      if (typeof effectiveBranchName === "string") branchData.name = effectiveBranchName.trim();
      if (typeof effectiveBranchManager === "string") branchData.manager = effectiveBranchManager.trim();
      if (typeof effectiveBranchPhone === "string") {
        const normalizedPhone = effectiveBranchPhone.trim() ? normalizePhone(effectiveBranchPhone) : null;
        if (normalizedPhone && !isStrictTrPhone(normalizedPhone)) {
          return res.status(400).json({
            ok: false,
            error: "VALIDATION_ERROR",
            message: "Telefon 90 ile baslamali ve 10 hane icermelidir."
          });
        }
        branchData.phone = normalizedPhone;
      }
      if (typeof effectiveBranchEmail === "string") branchData.email = effectiveBranchEmail.trim();
      if (typeof effectiveBranchAddress === "string") branchData.address = effectiveBranchAddress.trim();
      if (Object.keys(branchData).length) {
        updates.push(
          prisma.branch.update({
            where: { id: req.user.branchId },
            data: branchData
          })
        );
      }
    }

    const canUpdateCenter = req.user.role === "merkez" && req.user.centerId;
    if (canUpdateCenter) {
      const centerData = {};
      if (typeof effectiveCenterName === "string") centerData.name = effectiveCenterName.trim();
      if (typeof effectiveCenterManager === "string") centerData.manager = effectiveCenterManager.trim();
      if (typeof effectiveCenterPhone === "string") {
        const normalizedPhone = effectiveCenterPhone.trim() ? normalizePhone(effectiveCenterPhone) : null;
        if (normalizedPhone && !isStrictTrPhone(normalizedPhone)) {
          return res.status(400).json({
            ok: false,
            error: "VALIDATION_ERROR",
            message: "Telefon 90 ile baslamali ve 10 hane icermelidir."
          });
        }
        centerData.phone = normalizedPhone;
      }
      if (typeof effectiveCenterEmail === "string") centerData.email = effectiveCenterEmail.trim();
      if (typeof effectiveCenterAddress === "string") centerData.address = effectiveCenterAddress.trim();
      if (Object.keys(centerData).length) {
        updates.push(
          prisma.center.update({
            where: { id: req.user.centerId },
            data: centerData
          })
        );
      }
    }

    if (updates.length) {
      await prisma.$transaction(updates);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { branch: true, center: true }
    });

    return res.status(200).json({
      ok: true,
      data: mapProfile(user)
    });
  } catch (err) {
    return next(err);
  }
});

profileRouter.put("/password", requireAuth, passwordChangeRateLimiter, async (req, res, next) => {
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
