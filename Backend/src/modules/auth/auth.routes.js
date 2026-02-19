const express = require("express");
const bcrypt = require("bcrypt");
const { randomUUID } = require("crypto");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../../common/auth/jwt");
const { normalizePhone, looksLikePhone } = require("../../common/utils/phone");
const { env } = require("../../config/env");
const { createSimpleRateLimiter } = require("../../common/middlewares/rate-limit");
const {
  setAccessTokenCookie,
  clearAccessTokenCookie,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest
} = require("../../common/utils/cookies");

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
  refreshToken: z.string().min(20).optional()
});

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (forwarded) return forwarded;
  return req.ip || "";
}

function getRefreshExpiryDate() {
  const days = Math.max(1, Number(env.REFRESH_TOKEN_DAYS || 7));
  return new Date(Date.now() + (days * 24 * 60 * 60 * 1000));
}

async function createRefreshSession(userId, req, jti) {
  await prisma.refreshSession.create({
    data: {
      jti,
      userId,
      expiresAt: getRefreshExpiryDate(),
      ipAddress: getClientIp(req) || null,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 1000) || null
    }
  });
}

const loginRateLimiter = createSimpleRateLimiter({
  max: 10,
  windowMs: 15 * 60 * 1000,
  message: "Cok fazla giris denemesi. Lutfen daha sonra tekrar deneyin.",
  keyFn(req) {
    const identifier = String(
      (req.body && (req.body.emailOrPhone || req.body.email)) || ""
    )
      .trim()
      .toLowerCase();
    return `${req.ip || "ip"}:${identifier || "unknown"}`;
  }
});
const refreshRateLimiter = createSimpleRateLimiter({
  max: 30,
  windowMs: 5 * 60 * 1000,
  message: "Cok fazla token yenileme istegi. Lutfen kisa sure sonra tekrar deneyin.",
  keyFn(req) {
    return `${req.ip || "ip"}:refresh`;
  }
});
const logoutRateLimiter = createSimpleRateLimiter({
  max: 60,
  windowMs: 5 * 60 * 1000,
  message: "Cok fazla cikis istegi. Lutfen kisa sure sonra tekrar deneyin.",
  keyFn(req) {
    return `${req.ip || "ip"}:logout`;
  }
});

authRouter.post("/login", loginRateLimiter, async (req, res, next) => {
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
    const refreshJti = randomUUID();
    const refreshToken = signRefreshToken({ sub: user.id }, { jwtid: refreshJti });
    await createRefreshSession(user.id, req, refreshJti);
    setAccessTokenCookie(res, accessToken);
    setRefreshTokenCookie(res, refreshToken);

    return res.status(200).json({
      ok: true,
      data: {
        accessToken,
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

authRouter.post("/refresh", refreshRateLimiter, async (req, res, next) => {
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

    const tokenFromBody = parsed.data.refreshToken || "";
    const tokenFromCookie = getRefreshTokenFromRequest(req);
    const refreshTokenInput = tokenFromBody || tokenFromCookie;

    if (!refreshTokenInput) {
      clearAccessTokenCookie(res);
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "Refresh token is missing"
      });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshTokenInput);
    } catch (_err) {
      clearAccessTokenCookie(res);
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "Refresh token is invalid or expired"
      });
    }

    const userId = payload && payload.sub ? String(payload.sub) : "";
    const tokenJti = payload && payload.jti ? String(payload.jti) : "";
    if (!userId) {
      clearAccessTokenCookie(res);
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "Refresh token payload is invalid"
      });
    }
    if (!tokenJti) {
      clearAccessTokenCookie(res);
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "Refresh token jti is missing"
      });
    }

    const refreshSession = await prisma.refreshSession.findUnique({
      where: { jti: tokenJti }
    });
    if (
      !refreshSession ||
      refreshSession.userId !== userId ||
      !!refreshSession.revokedAt ||
      refreshSession.expiresAt <= new Date()
    ) {
      clearAccessTokenCookie(res);
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "Refresh session is invalid"
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
    const nextRefreshJti = randomUUID();
    const refreshToken = signRefreshToken({ sub: user.id }, { jwtid: nextRefreshJti });
    await prisma.$transaction([
      prisma.refreshSession.update({
        where: { jti: tokenJti },
        data: {
          revokedAt: new Date(),
          replacedByJti: nextRefreshJti
        }
      }),
      prisma.refreshSession.create({
        data: {
          jti: nextRefreshJti,
          userId: user.id,
          expiresAt: getRefreshExpiryDate(),
          ipAddress: getClientIp(req) || null,
          userAgent: String(req.headers["user-agent"] || "").slice(0, 1000) || null
        }
      })
    ]);
    setAccessTokenCookie(res, accessToken);
    setRefreshTokenCookie(res, refreshToken);

    return res.status(200).json({
      ok: true,
      data: {
        accessToken,
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

authRouter.post("/logout", logoutRateLimiter, async (_req, res) => {
  const refreshTokenInput = getRefreshTokenFromRequest(_req);
  if (refreshTokenInput) {
    try {
      const payload = verifyRefreshToken(refreshTokenInput);
      const tokenJti = payload && payload.jti ? String(payload.jti) : "";
      if (tokenJti) {
        await prisma.refreshSession.updateMany({
          where: {
            jti: tokenJti,
            revokedAt: null
          },
          data: { revokedAt: new Date() }
        });
      }
    } catch (_err) {
      // Ignore invalid token on logout; cookie will be cleared anyway.
    }
  }
  clearAccessTokenCookie(res);
  clearRefreshTokenCookie(res);
  return res.status(200).json({
    ok: true,
    data: { loggedOut: true }
  });
});

module.exports = { authRouter };
