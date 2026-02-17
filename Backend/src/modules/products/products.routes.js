const express = require("express");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { requireRole } = require("../../common/middlewares/require-role");

const productsRouter = express.Router();

function toCode(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function mapProduct(product) {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    basePrice: Number(product.basePrice),
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

const createSchema = z.object({
  name: z.string().min(2).max(64),
  basePrice: z.number().positive(),
  code: z.string().min(2).max(64).optional()
});

const updateSchema = z.object({
  name: z.string().min(2).max(64).optional(),
  basePrice: z.number().positive().optional()
});

const statusSchema = z.object({
  isActive: z.boolean()
});

productsRouter.get("/", requireAuth, async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: [{ createdAt: "asc" }]
    });

    return res.status(200).json({
      ok: true,
      data: products.map(mapProduct)
    });
  } catch (err) {
    return next(err);
  }
});

productsRouter.post("/", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid product payload",
        details: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const code = payload.code ? toCode(payload.code) : toCode(payload.name);
    if (!code) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Product code could not be generated"
      });
    }

    const exists = await prisma.product.findUnique({ where: { code } });
    if (exists) {
      return res.status(409).json({
        ok: false,
        error: "PRODUCT_EXISTS",
        message: "Product code already exists"
      });
    }

    const created = await prisma.product.create({
      data: {
        code,
        name: payload.name.trim(),
        basePrice: payload.basePrice,
        isActive: true
      }
    });

    return res.status(201).json({
      ok: true,
      data: mapProduct(created)
    });
  } catch (err) {
    return next(err);
  }
});

productsRouter.put("/status-bulk", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid bulk status payload",
        details: parsed.error.flatten()
      });
    }

    const result = await prisma.product.updateMany({
      data: { isActive: parsed.data.isActive }
    });

    return res.status(200).json({
      ok: true,
      data: { affectedRows: result.count }
    });
  } catch (err) {
    return next(err);
  }
});

productsRouter.put("/:id", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid update payload",
        details: parsed.error.flatten()
      });
    }

    const data = {};
    if (typeof parsed.data.name === "string") data.name = parsed.data.name.trim();
    if (typeof parsed.data.basePrice === "number") data.basePrice = parsed.data.basePrice;

    if (!Object.keys(data).length) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "No fields to update"
      });
    }

    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data
    });

    return res.status(200).json({
      ok: true,
      data: mapProduct(updated)
    });
  } catch (err) {
    if (err && err.code === "P2025") {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Product not found"
      });
    }
    return next(err);
  }
});

productsRouter.put("/:id/status", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
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

    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive }
    });

    return res.status(200).json({
      ok: true,
      data: mapProduct(updated)
    });
  } catch (err) {
    if (err && err.code === "P2025") {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Product not found"
      });
    }
    return next(err);
  }
});

productsRouter.delete("/:id", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
  try {
    await prisma.product.delete({
      where: { id: req.params.id }
    });

    return res.status(200).json({
      ok: true,
      data: { id: req.params.id }
    });
  } catch (err) {
    if (err && err.code === "P2025") {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Product not found"
      });
    }
    if (err && err.code === "P2003") {
      return res.status(409).json({
        ok: false,
        error: "PRODUCT_IN_USE",
        message: "Bu urun siparislerde kullanildigi icin silinemez."
      });
    }
    return next(err);
  }
});

module.exports = { productsRouter };

