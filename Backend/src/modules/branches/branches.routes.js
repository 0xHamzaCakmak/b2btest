const express = require("express");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { requireRole } = require("../../common/middlewares/require-role");
const { createSimpleRateLimiter } = require("../../common/middlewares/rate-limit");

const branchesRouter = express.Router();
const branchMutationRateLimiter = createSimpleRateLimiter({
  max: 120,
  windowMs: 5 * 60 * 1000,
  message: "Cok fazla sube degisikligi istegi. Lutfen kisa sure sonra tekrar deneyin.",
  keyFn(req) {
    return `${req.user && req.user.id ? req.user.id : req.ip || "ip"}:branch-mutation`;
  }
});

const statusSchema = z.object({
  isActive: z.boolean()
});

const createBranchSchema = z.object({
  name: z.string().min(2).max(120),
  manager: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  centerId: z.string().uuid(),
  isActive: z.boolean().optional(),
  priceAdjustmentPercent: z.number().min(-90).max(200).optional()
});

const updateBranchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  manager: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  centerId: z.string().uuid().optional()
});

const adjustmentSchema = z.object({
  percent: z.number().min(-90).max(200)
});

const productAdjustmentSchema = z.object({
  extraAmount: z.number().min(-100000).max(100000)
});

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function applyPercent(basePrice, percent) {
  return Math.max(1, Math.round(basePrice * (1 + percent / 100)));
}

function applyPricing(basePrice, percent, extraAmount) {
  const percentApplied = Number(basePrice) * (1 + Number(percent || 0) / 100);
  return Math.max(1, Math.round(percentApplied + Number(extraAmount || 0)));
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
    centerId: branch.centerId || null,
    centerName: branch.center ? branch.center.name : null,
    priceAdjustmentPercent: toNumber(branch.priceAdjustment && branch.priceAdjustment.percent, 0),
    productAdjustmentCount: Array.isArray(branch.productAdjustments) ? branch.productAdjustments.length : 0,
    userEmail: branchUser ? branchUser.email : null
  };
}

async function ensureCenter(centerId) {
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, isActive: true }
  });
  if (!center) return { ok: false, error: "Center bulunamadi." };
  return { ok: true, center };
}

branchesRouter.get("/", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
  try {
    const where = {};
    if (req.user.role === "merkez") {
      if (!req.user.centerId) {
        return res.status(400).json({
          ok: false,
          error: "CENTER_REQUIRED",
          message: "Current merkez user is not linked to a center"
        });
      }
      where.centerId = req.user.centerId;
    }

    const branches = await prisma.branch.findMany({
      where,
      orderBy: [{ name: "asc" }],
      include: {
        center: true,
        priceAdjustment: true,
        productAdjustments: {
          select: { id: true }
        },
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

branchesRouter.post("/", requireAuth, requireRole("admin"), branchMutationRateLimiter, async (req, res, next) => {
  try {
    const parsed = createBranchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid branch payload",
        details: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const centerCheck = await ensureCenter(payload.centerId);
    if (!centerCheck.ok) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: centerCheck.error
      });
    }

    const created = await prisma.branch.create({
      data: {
        name: payload.name.trim(),
        manager: payload.manager ? payload.manager.trim() : null,
        phone: payload.phone ? payload.phone.trim() : null,
        email: payload.email ? payload.email.trim() : null,
        address: payload.address ? payload.address.trim() : null,
        centerId: payload.centerId,
        isActive: payload.isActive !== false
      },
      include: {
        center: true,
        priceAdjustment: true,
        productAdjustments: {
          select: { id: true }
        },
        users: {
          select: { email: true, role: true }
        }
      }
    });

    if (typeof payload.priceAdjustmentPercent === "number") {
      await prisma.branchPriceAdjustment.upsert({
        where: { branchId: created.id },
        update: { percent: payload.priceAdjustmentPercent },
        create: { branchId: created.id, percent: payload.priceAdjustmentPercent }
      });
    }

    const fullCreated = await prisma.branch.findUnique({
      where: { id: created.id },
      include: {
        center: true,
        priceAdjustment: true,
        productAdjustments: {
          select: { id: true }
        },
        users: {
          select: { email: true, role: true }
        }
      }
    });

    return res.status(201).json({
      ok: true,
      data: mapBranch(fullCreated)
    });
  } catch (err) {
    return next(err);
  }
});

branchesRouter.put("/:id", requireAuth, requireRole("admin"), branchMutationRateLimiter, async (req, res, next) => {
  try {
    const parsed = updateBranchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid branch update payload",
        details: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const data = {};
    if (typeof payload.name === "string") data.name = payload.name.trim();
    if (typeof payload.manager === "string") data.manager = payload.manager.trim();
    if (typeof payload.phone === "string") data.phone = payload.phone.trim();
    if (typeof payload.email === "string") data.email = payload.email.trim();
    if (typeof payload.address === "string") data.address = payload.address.trim();
    if (typeof payload.centerId === "string") {
      const centerCheck = await ensureCenter(payload.centerId);
      if (!centerCheck.ok) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          message: centerCheck.error
        });
      }
      data.centerId = payload.centerId;
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "No fields to update"
      });
    }

    const updated = await prisma.branch.update({
      where: { id: req.params.id },
      data,
      include: {
        center: true,
        priceAdjustment: true,
        productAdjustments: {
          select: { id: true }
        },
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

branchesRouter.put("/:id/status", requireAuth, requireRole("merkez", "admin"), branchMutationRateLimiter, async (req, res, next) => {
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

    if (req.user.role === "merkez") {
      if (!req.user.centerId) {
        return res.status(400).json({
          ok: false,
          error: "CENTER_REQUIRED",
          message: "Current merkez user is not linked to a center"
        });
      }
      const target = await prisma.branch.findUnique({
        where: { id: req.params.id },
        select: { id: true, centerId: true }
      });
      if (!target) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
          message: "Branch not found"
        });
      }
      if (target.centerId !== req.user.centerId) {
        return res.status(403).json({
          ok: false,
          error: "FORBIDDEN",
          message: "Bu sube baska bir merkeze bagli."
        });
      }
    }

    const updated = await prisma.branch.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive },
      include: {
        center: true,
        priceAdjustment: true,
        productAdjustments: {
          select: { id: true }
        },
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

branchesRouter.put("/:id/price-adjustment", requireAuth, requireRole("merkez", "admin"), branchMutationRateLimiter, async (req, res, next) => {
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
      select: { id: true, centerId: true }
    });

    if (!branch) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Branch not found"
      });
    }
    if (req.user.role === "merkez") {
      if (!req.user.centerId) {
        return res.status(400).json({
          ok: false,
          error: "CENTER_REQUIRED",
          message: "Current merkez user is not linked to a center"
        });
      }
      if (branch.centerId !== req.user.centerId) {
        return res.status(403).json({
          ok: false,
          error: "FORBIDDEN",
          message: "Bu sube baska bir merkeze bagli."
        });
      }
    }

    await prisma.branchPriceAdjustment.upsert({
      where: { branchId: req.params.id },
      update: { percent: parsed.data.percent },
      create: { branchId: req.params.id, percent: parsed.data.percent }
    });

    const updated = await prisma.branch.findUnique({
      where: { id: req.params.id },
      include: {
        center: true,
        priceAdjustment: true,
        productAdjustments: {
          select: { id: true }
        },
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

    const productAdjustments = await prisma.branchProductAdjustment.findMany({
      where: {
        branchId: branch.id,
        productId: { in: products.map((p) => p.id) }
      }
    });
    const adjustmentByProductId = new Map(
      productAdjustments.map((row) => [row.productId, toNumber(row.extraAmount, 0)])
    );

    const percent = toNumber(branch.priceAdjustment && branch.priceAdjustment.percent, 0);
    const productData = products.map((p) => {
      const basePrice = toNumber(p.basePrice, 0);
      const extraAmount = adjustmentByProductId.has(p.id) ? adjustmentByProductId.get(p.id) : 0;
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        basePrice,
        extraAmount,
        adjustedPrice: applyPricing(basePrice, percent, extraAmount),
        isActive: p.isActive,
        imageUrl: p.imageUrl || null
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

branchesRouter.get("/:id/product-adjustments", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
  try {
    const branch = await prisma.branch.findUnique({
      where: { id: req.params.id },
      include: { priceAdjustment: true }
    });

    if (!branch) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Branch not found"
      });
    }

    if (req.user.role === "merkez") {
      if (!req.user.centerId) {
        return res.status(400).json({
          ok: false,
          error: "CENTER_REQUIRED",
          message: "Current merkez user is not linked to a center"
        });
      }
      if (branch.centerId !== req.user.centerId) {
        return res.status(403).json({
          ok: false,
          error: "FORBIDDEN",
          message: "Bu sube baska bir merkeze bagli."
        });
      }
    }

    const products = await prisma.product.findMany({
      orderBy: [{ createdAt: "asc" }]
    });
    const rows = await prisma.branchProductAdjustment.findMany({
      where: {
        branchId: branch.id,
        productId: { in: products.map((p) => p.id) }
      }
    });
    const byProductId = new Map(rows.map((row) => [row.productId, toNumber(row.extraAmount, 0)]));
    const percent = toNumber(branch.priceAdjustment && branch.priceAdjustment.percent, 0);

    return res.status(200).json({
      ok: true,
      data: {
        branchId: branch.id,
        percent,
        products: products.map((p) => {
          const basePrice = toNumber(p.basePrice, 0);
          const extraAmount = byProductId.has(p.id) ? byProductId.get(p.id) : 0;
          return {
            productId: p.id,
            code: p.code,
            name: p.name,
            basePrice,
            extraAmount,
            hasOverride: byProductId.has(p.id),
            adjustedPrice: applyPricing(basePrice, percent, extraAmount)
          };
        })
      }
    });
  } catch (err) {
    return next(err);
  }
});

branchesRouter.put("/:id/product-adjustments/:productId", requireAuth, requireRole("merkez", "admin"), branchMutationRateLimiter, async (req, res, next) => {
  try {
    const parsed = productAdjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid product adjustment payload",
        details: parsed.error.flatten()
      });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: req.params.id },
      include: { priceAdjustment: true }
    });
    if (!branch) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Branch not found"
      });
    }

    if (req.user.role === "merkez") {
      if (!req.user.centerId) {
        return res.status(400).json({
          ok: false,
          error: "CENTER_REQUIRED",
          message: "Current merkez user is not linked to a center"
        });
      }
      if (branch.centerId !== req.user.centerId) {
        return res.status(403).json({
          ok: false,
          error: "FORBIDDEN",
          message: "Bu sube baska bir merkeze bagli."
        });
      }
    }

    const product = await prisma.product.findUnique({
      where: { id: req.params.productId },
      select: { id: true, code: true, name: true, basePrice: true }
    });
    if (!product) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Product not found"
      });
    }

    const extraAmount = Number(parsed.data.extraAmount || 0);
    if (Math.abs(extraAmount) < 0.000001) {
      await prisma.branchProductAdjustment.deleteMany({
        where: {
          branchId: branch.id,
          productId: product.id
        }
      });
    } else {
      await prisma.branchProductAdjustment.upsert({
        where: {
          branchId_productId: {
            branchId: branch.id,
            productId: product.id
          }
        },
        update: { extraAmount },
        create: {
          branchId: branch.id,
          productId: product.id,
          extraAmount
        }
      });
    }

    const percent = toNumber(branch.priceAdjustment && branch.priceAdjustment.percent, 0);
    return res.status(200).json({
      ok: true,
      data: {
        branchId: branch.id,
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        extraAmount,
        adjustedPrice: applyPricing(toNumber(product.basePrice, 0), percent, extraAmount)
      }
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { branchesRouter };
