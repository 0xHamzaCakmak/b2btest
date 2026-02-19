const { prisma } = require("../../config/prisma");
const { verifyAccessToken } = require("../auth/jwt");
const { getAccessTokenFromRequest } = require("../utils/cookies");

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    const cookieToken = getAccessTokenFromRequest(req);
    const token = bearerToken || cookieToken;
    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "Missing access token"
      });
    }

    const payload = verifyAccessToken(token);
    const userId = payload && payload.sub ? String(payload.sub) : "";

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "Invalid token payload"
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

    req.user = user;
    return next();
  } catch (_err) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
      message: "Token is invalid or expired"
    });
  }
}

module.exports = { requireAuth };
