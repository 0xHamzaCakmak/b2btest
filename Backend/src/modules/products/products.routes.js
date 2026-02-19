const express = require("express");
const { z } = require("zod");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { requireRole } = require("../../common/middlewares/require-role");
const { createSimpleRateLimiter } = require("../../common/middlewares/rate-limit");

const productsRouter = express.Router();
const productMutationRateLimiter = createSimpleRateLimiter({
  max: 120,
  windowMs: 5 * 60 * 1000,
  message: "Cok fazla urun degisikligi istegi. Lutfen kisa sure sonra tekrar deneyin.",
  keyFn(req) {
    return `${req.user && req.user.id ? req.user.id : req.ip || "ip"}:product-mutation`;
  }
});
const productUploadRateLimiter = createSimpleRateLimiter({
  max: 30,
  windowMs: 5 * 60 * 1000,
  message: "Cok fazla gorsel yukleme istegi. Lutfen kisa sure sonra tekrar deneyin.",
  keyFn(req) {
    return `${req.user && req.user.id ? req.user.id : req.ip || "ip"}:product-upload`;
  }
});
const uploadsBaseDir = path.resolve(path.join(__dirname, "../../../uploads"));
const productUploadsDir = path.join(uploadsBaseDir, "products");
const maxImageBytes = 5 * 1024 * 1024;

const mimeToExt = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif"
};

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
    imageUrl: product.imageUrl || null,
    imageKey: product.imageKey || null,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

const createSchema = z.object({
  name: z.string().min(2).max(64),
  basePrice: z.number().positive(),
  code: z.string().min(2).max(64).optional(),
  imageUrl: z.string().max(1000).optional(),
  imageKey: z.string().max(1000).optional()
});

const updateSchema = z.object({
  name: z.string().min(2).max(64).optional(),
  basePrice: z.number().positive().optional(),
  imageUrl: z.string().max(1000).nullable().optional(),
  imageKey: z.string().max(1000).nullable().optional(),
  removeImage: z.boolean().optional()
});

const statusSchema = z.object({
  isActive: z.boolean()
});

const uploadImageSchema = z.object({
  fileName: z.string().min(1).max(180),
  mimeType: z.string().min(5).max(120),
  dataBase64: z.string().min(20)
});

function imageUrlFromKey(req, key) {
  const normalized = String(key || "").replace(/\\/g, "/").replace(/^\/+/, "");
  return `${req.protocol}://${req.get("host")}/uploads/${normalized}`;
}

function resolveImagePathFromKey(imageKey) {
  const safeKey = String(imageKey || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!safeKey.startsWith("products/")) return null;
  const fullPath = path.resolve(path.join(uploadsBaseDir, safeKey));
  if (!fullPath.startsWith(uploadsBaseDir)) return null;
  return fullPath;
}

async function deleteImageIfExists(imageKey) {
  const fullPath = resolveImagePathFromKey(imageKey);
  if (!fullPath) return;
  try {
    await fs.unlink(fullPath);
  } catch (err) {
    if (!err || err.code !== "ENOENT") throw err;
  }
}

productsRouter.post("/upload-image", requireAuth, requireRole("merkez", "admin"), productUploadRateLimiter, async (req, res, next) => {
  try {
    const parsed = uploadImageSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid upload payload",
        details: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    if (!payload.mimeType.startsWith("image/")) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Only image files are allowed"
      });
    }

    const fileBuffer = Buffer.from(payload.dataBase64, "base64");
    if (!fileBuffer || !fileBuffer.length) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Image data is empty"
      });
    }
    if (fileBuffer.length > maxImageBytes) {
      return res.status(400).json({
        ok: false,
        error: "PAYLOAD_TOO_LARGE",
        message: "Image size cannot exceed 5MB"
      });
    }

    await fs.mkdir(productUploadsDir, { recursive: true });

    const fallbackExt = path.extname(payload.fileName || "").toLowerCase();
    const ext = mimeToExt[payload.mimeType.toLowerCase()] || (fallbackExt || ".jpg");
    const fileName = `${Date.now()}_${crypto.randomUUID().replaceAll("-", "")}${ext}`;
    const imageKey = `products/${fileName}`;
    const filePath = path.join(productUploadsDir, fileName);

    await fs.writeFile(filePath, fileBuffer);

    return res.status(201).json({
      ok: true,
      data: {
        imageUrl: imageUrlFromKey(req, imageKey),
        imageKey
      }
    });
  } catch (err) {
    return next(err);
  }
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

productsRouter.post("/", requireAuth, requireRole("merkez", "admin"), productMutationRateLimiter, async (req, res, next) => {
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
        imageUrl: payload.imageUrl ? payload.imageUrl.trim() : null,
        imageKey: payload.imageKey ? payload.imageKey.trim() : null,
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

productsRouter.put("/status-bulk", requireAuth, requireRole("merkez", "admin"), productMutationRateLimiter, async (req, res, next) => {
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

productsRouter.put("/:id", requireAuth, requireRole("merkez", "admin"), productMutationRateLimiter, async (req, res, next) => {
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

    const current = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { id: true, imageKey: true }
    });
    if (!current) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Product not found"
      });
    }

    const data = {};
    if (typeof parsed.data.name === "string") data.name = parsed.data.name.trim();
    if (typeof parsed.data.basePrice === "number") data.basePrice = parsed.data.basePrice;
    if (parsed.data.removeImage === true) {
      data.imageUrl = null;
      data.imageKey = null;
    } else {
      if (Object.prototype.hasOwnProperty.call(parsed.data, "imageUrl")) data.imageUrl = parsed.data.imageUrl ? parsed.data.imageUrl.trim() : null;
      if (Object.prototype.hasOwnProperty.call(parsed.data, "imageKey")) data.imageKey = parsed.data.imageKey ? parsed.data.imageKey.trim() : null;
    }

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

    const oldImageKey = current.imageKey ? String(current.imageKey) : "";
    const newImageKey = updated.imageKey ? String(updated.imageKey) : "";
    if (oldImageKey && oldImageKey !== newImageKey) {
      await deleteImageIfExists(oldImageKey);
    }

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

productsRouter.put("/:id/status", requireAuth, requireRole("merkez", "admin"), productMutationRateLimiter, async (req, res, next) => {
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

productsRouter.delete("/:id", requireAuth, requireRole("merkez", "admin"), productMutationRateLimiter, async (req, res, next) => {
  try {
    const current = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { id: true, imageKey: true }
    });
    if (!current) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Product not found"
      });
    }

    await prisma.product.delete({ where: { id: req.params.id } });
    if (current.imageKey) {
      await deleteImageIfExists(current.imageKey);
    }

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

