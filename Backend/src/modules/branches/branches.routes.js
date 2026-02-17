const express = require("express");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { requireRole } = require("../../common/middlewares/require-role");

const branchesRouter = express.Router();

const statusSchema = z.object({
  isActive: z.boolean()
});

const adjustmentSchema = z.object({
  percent: z.number().min(-90).max(200)
});

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function applyPercent(basePrice, percent) {
  return Math.max(1, Math.round(basePrice * (1 + percent / 100)));
}

function mapBranch(branch) {
  const branchUser = (branch.users || []).find((u) => String(u.role || "").toLowerCase() === "sube");
  return {
    id: branch.id,
    name: branch.name,
    manager: branch.manager,
    phone: branch.phone,
    email: branch.email,
    address: branch.address,
    isActive: branch.isActive,
    priceAdjustmentPercent: toNumber(branch.priceAdjustment && branch.priceAdjustment.percent, 0),
    userEmail: branchUser ? branchUser.email : null
  };
}

branchesRouter.get("/", requireAuth, requireRole("merkez", "admin"), async (_req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        priceAdjustment: true,
        users: {
          select: { email: true, role: true }
        }
      }
    });

    return res.status(200).json({
      ok: true,
      data: branches.map(mapBranch)
    });
  } catch (err) {
    return next(err);
  }
});

branchesRouter.put("/:id/status", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
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

    const updated = await prisma.branch.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive },
      include: {
        priceAdjustment: true,
        users: {
          select: { email: true, role: true }
        }
      }
    });

    return res.status(200).json({
      ok: true,
      data: mapBranch(updated)
    });
  } catch (err) {
    if (err && err.code === "P2025") {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Branch not found"
      });
    }
    return next(err);
  }
});

branchesRouter.put("/:id/price-adjustment", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
  try {
    const parsed = adjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid adjustment payload",
        details: parsed.error.flatten()
      });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });

    if (!branch) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Branch not found"
      });
    }

    await prisma.branchPriceAdjustment.upsert({
      where: { branchId: req.params.id },
      update: { percent: parsed.data.percent },
      create: { branchId: req.params.id, percent: parsed.data.percent }
    });

    const updated = await prisma.branch.findUnique({
      where: { id: req.params.id },
      include: {
        priceAdjustment: true,
        users: {
          select: { email: true, role: true }
        }
      }
    });

    return res.status(200).json({
      ok: true,
      data: mapBranch(updated)
    });
  } catch (err) {
    return next(err);
  }
});

branchesRouter.get("/my-context", requireAuth, async (req, res, next) => {
  try {
    if (!req.user.branchId) {
      return res.status(400).json({
        ok: false,
        error: "BRANCH_REQUIRED",
        message: "Current user is not linked to a branch"
      });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: req.user.branchId },
      include: { priceAdjustment: true }
    });

    if (!branch) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Branch not found"
      });
    }

    const products = await prisma.product.findMany({
      orderBy: [{ createdAt: "asc" }]
    });

    const percent = toNumber(branch.priceAdjustment && branch.priceAdjustment.percent, 0);
    const productData = products.map((p) => {
      const basePrice = toNumber(p.basePrice, 0);
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        basePrice,
        adjustedPrice: applyPercent(basePrice, percent),
        isActive: p.isActive
      };
    });

    return res.status(200).json({
      ok: true,
      data: {
        branch: {
          id: branch.id,
          name: branch.name,
          isActive: branch.isActive
        },
        percent,
        products: productData
      }
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { branchesRouter };
