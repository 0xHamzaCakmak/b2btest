const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { normalizePhone, isStrictTrPhone } = require("../../common/utils/phone");
const { createSimpleRateLimiter } = require("../../common/middlewares/rate-limit");
const { requireRole } = require("../../common/middlewares/require-role");

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
const createCenterSubUserSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(7).max(50).optional(),
  password: z.string().min(6).max(128),
  displayName: z.string().min(2).max(120).optional(),
  isActive: z.boolean().optional()
});
const centerSubUserStatusSchema = z.object({
  isActive: z.boolean()
});
const centerSubUserResetPasswordSchema = z.object({
  newPassword: z.string().min(6).max(128).optional()
});
const centerSubUserMutationRateLimiter = createSimpleRateLimiter({
  max: 80,
  windowMs: 5 * 60 * 1000,
  message: "Cok fazla merkez alt kullanici islemi. Lutfen kisa sure sonra tekrar deneyin.",
  keyFn(req) {
    return `${req.user && req.user.id ? req.user.id : req.ip || "ip"}:center-sub-user-mutation`;
  }
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

function mapCenterSubUser(user) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone || null,
    displayName: user.displayName || "",
    role: user.role,
    centerId: user.centerId || null,
    centerName: user.center ? user.center.name : null,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
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

profileRouter.get("/center-sub-users", requireAuth, requireRole("merkez"), async (req, res, next) => {
  try {
    if (!req.user.centerId) {
      return res.status(400).json({
        ok: false,
        error: "CENTER_REQUIRED",
        message: "Current merkez user is not linked to a center"
      });
    }
    const users = await prisma.user.findMany({
      where: {
        role: "merkez_alt",
        centerId: req.user.centerId
      },
      orderBy: [{ createdAt: "asc" }],
      include: { center: true }
    });
    return res.status(200).json({
      ok: true,
      data: users.map(mapCenterSubUser)
    });
  } catch (err) {
    return next(err);
  }
});

profileRouter.post("/center-sub-users", requireAuth, requireRole("merkez"), centerSubUserMutationRateLimiter, async (req, res, next) => {
  try {
    if (!req.user.centerId) {
      return res.status(400).json({
        ok: false,
        error: "CENTER_REQUIRED",
        message: "Current merkez user is not linked to a center"
      });
    }
    const parsed = createCenterSubUserSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid center sub user payload",
        details: parsed.error.flatten()
      });
    }
    const payload = parsed.data;
    const normalizedPhone = payload.phone ? normalizePhone(payload.phone) : null;
    if (normalizedPhone && !isStrictTrPhone(normalizedPhone)) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Telefon 90 ile baslamali ve 10 hane icermelidir."
      });
    }
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
    const hash = await bcrypt.hash(payload.password, 10);
    const created = await prisma.user.create({
      data: {
        email: payload.email.trim().toLowerCase(),
        phone: normalizedPhone || null,
        passwordHash: hash,
        displayName: payload.displayName ? payload.displayName.trim() : null,
        role: "merkez_alt",
        centerId: req.user.centerId,
        branchId: null,
        isActive: payload.isActive !== false
      },
      include: { center: true }
    });
    return res.status(201).json({
      ok: true,
      data: mapCenterSubUser(created)
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

profileRouter.put("/center-sub-users/:id/status", requireAuth, requireRole("merkez"), centerSubUserMutationRateLimiter, async (req, res, next) => {
  try {
    if (!req.user.centerId) {
      return res.status(400).json({
        ok: false,
        error: "CENTER_REQUIRED",
        message: "Current merkez user is not linked to a center"
      });
    }
    const parsed = centerSubUserStatusSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid status payload",
        details: parsed.error.flatten()
      });
    }
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, centerId: true }
    });
    if (!target) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "User not found"
      });
    }
    if (target.role !== "merkez_alt" || target.centerId !== req.user.centerId) {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
        message: "Bu kullanici baska bir merkeze bagli."
      });
    }
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive },
      include: { center: true }
    });
    return res.status(200).json({
      ok: true,
      data: mapCenterSubUser(updated)
    });
  } catch (err) {
    return next(err);
  }
});

profileRouter.put("/center-sub-users/:id/reset-password", requireAuth, requireRole("merkez"), centerSubUserMutationRateLimiter, async (req, res, next) => {
  try {
    if (!req.user.centerId) {
      return res.status(400).json({
        ok: false,
        error: "CENTER_REQUIRED",
        message: "Current merkez user is not linked to a center"
      });
    }
    const parsed = centerSubUserResetPasswordSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid reset password payload",
        details: parsed.error.flatten()
      });
    }
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, centerId: true }
    });
    if (!target) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "User not found"
      });
    }
    if (target.role !== "merkez_alt" || target.centerId !== req.user.centerId) {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
        message: "Bu kullanici baska bir merkeze bagli."
      });
    }
    const nextPassword = parsed.data.newPassword || "12345678";
    const hash = await bcrypt.hash(nextPassword, 10);
    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: hash }
    });
    return res.status(200).json({
      ok: true,
      data: { userId: target.id, tempPassword: nextPassword }
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { profileRouter };
