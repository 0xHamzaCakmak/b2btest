const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { signAccessToken, signRefreshToken } = require("../../common/auth/jwt");

const authRouter = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
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

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { branch: true }
    });

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
      branchId: user.branchId || null
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
          displayName: user.displayName,
          role: user.role,
          branchId: user.branchId,
          branchName: user.branch ? user.branch.name : null,
          isActive: user.isActive
        }
      }
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { authRouter };
