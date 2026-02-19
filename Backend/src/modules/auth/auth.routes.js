const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../../common/auth/jwt");
const { normalizePhone, looksLikePhone } = require("../../common/utils/phone");

const authRouter = express.Router();

const loginSchema = z.object({
  emailOrPhone: z.string().min(3).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6)
}).refine((value) => {
  return !!((value.emailOrPhone && value.emailOrPhone.trim()) || value.email);
}, {
  message: "emailOrPhone is required"
});
const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid login payload",
        details: parsed.error.flatten()
      });
    }

    const password = parsed.data.password;
    const identifier = String(parsed.data.emailOrPhone || parsed.data.email || "").trim();
    const loweredIdentifier = identifier.toLowerCase();

    let user = null;
    if (loweredIdentifier.includes("@")) {
      user = await prisma.user.findUnique({
        where: { email: loweredIdentifier },
        include: { branch: true, center: true }
      });
    } else if (looksLikePhone(identifier)) {
      const normalizedPhone = normalizePhone(identifier);
      user = await prisma.user.findFirst({
        where: { phone: normalizedPhone },
        include: { branch: true, center: true }
      });
    } else {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Giris icin gecerli e-posta veya telefon numarasi girin."
      });
    }

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect"
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        ok: false,
        error: "USER_INACTIVE",
        message: "User account is inactive"
      });
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect"
      });
    }

    const tokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId || null,
      centerId: user.centerId || null
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken({ sub: user.id });

    return res.status(200).json({
      ok: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone || null,
          displayName: user.displayName,
          role: user.role,
          branchId: user.branchId,
          branchName: user.branch ? user.branch.name : null,
          centerId: user.centerId,
          centerName: user.center ? user.center.name : null,
          isActive: user.isActive
        }
      }
    });
  } catch (err) {
    return next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid refresh payload",
        details: parsed.error.flatten()
      });
    }

    let payload;
    try {
      payload = verifyRefreshToken(parsed.data.refreshToken);
    } catch (_err) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "Refresh token is invalid or expired"
      });
    }

    const userId = payload && payload.sub ? String(payload.sub) : "";
    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "Refresh token payload is invalid"
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true, center: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "User is not authorized"
      });
    }

    const tokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId || null,
      centerId: user.centerId || null
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken({ sub: user.id });

    return res.status(200).json({
      ok: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone || null,
          displayName: user.displayName,
          role: user.role,
          branchId: user.branchId,
          branchName: user.branch ? user.branch.name : null,
          centerId: user.centerId,
          centerName: user.center ? user.center.name : null,
          isActive: user.isActive
        }
      }
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { authRouter };
