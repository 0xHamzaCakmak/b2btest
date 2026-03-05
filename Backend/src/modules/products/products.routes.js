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
const PRODUCT_UNITS = ["TEPSI", "KG", "ADET", "PALET"];

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
    centerId: product.centerId || null,
    code: product.code,
    name: product.name,
    unit: String(product.unit || "TEPSI").toUpperCase(),
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
  unit: z.enum(PRODUCT_UNITS).optional(),
  basePrice: z.number().positive(),
  code: z.string().min(2).max(64).optional(),
  imageUrl: z.string().max(1000).optional(),
  imageKey: z.string().max(1000).optional()
});

const updateSchema = z.object({
  name: z.string().min(2).max(64).optional(),
  unit: z.enum(PRODUCT_UNITS).optional(),
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

const centerQuerySchema = z.object({
  centerId: z.string().uuid().optional()
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

function resolveCenterIdForUser(req) {
  if (!req || !req.user) return "";
  const role = String(req.user.role || "").toLowerCase();
  if (role === "sube") {
    return req.user.branch && req.user.branch.centerId ? String(req.user.branch.centerId) : "";
  }
  if (role === "merkez" || role === "admin") {
    return req.user.centerId ? String(req.user.centerId) : "";
  }
  return "";
}

function ensureCenterBoundUser(req, res) {
  const centerId = resolveCenterIdForUser(req);
  if (!centerId) {
    res.status(400).json({
      ok: false,
      error: "CENTER_REQUIRED",
      message: "Current user is not linked to a center"
    });
    return null;
  }
  return centerId;
}

async function findProductOrForbidden(productId, req, res) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, centerId: true, imageKey: true }
  });
  if (!product) {
    res.status(404).json({
      ok: false,
      error: "NOT_FOUND",
      message: "Product not found"
    });
    return null;
  }

  const role = String(req.user && req.user.role || "").toLowerCase();
  if (role === "admin") {
    const adminCenterId = resolveCenterIdForUser(req);
    if (!adminCenterId || adminCenterId === product.centerId) return product;
    res.status(403).json({
      ok: false,
      error: "FORBIDDEN",
      message: "Bu urun baska bir merkeze bagli."
    });
    return null;
  }

  const centerId = ensureCenterBoundUser(req, res);
  if (!centerId) return null;
  if (product.centerId !== centerId) {
    res.status(403).json({
      ok: false,
      error: "FORBIDDEN",
      message: "Bu urun baska bir merkeze bagli."
    });
    return null;
  }
  return product;
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

productsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const role = String(req.user.role || "").toLowerCase();
    const where = {};
    if (role === "admin") {
      const parsed = centerQuerySchema.safeParse(req.query || {});
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          message: "Invalid centerId query",
          details: parsed.error.flatten()
        });
      }
      if (parsed.data.centerId) where.centerId = parsed.data.centerId;
    } else {
      const centerId = ensureCenterBoundUser(req, res);
      if (!centerId) return;
      where.centerId = centerId;
    }

    const products = await prisma.product.findMany({
      where,
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

productsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const role = String(req.user.role || "").toLowerCase();
    if (!["admin", "merkez", "sube"].includes(role)) {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
        message: "Bu islem icin yetkiniz yok."
      });
    }

    const current = await findProductOrForbidden(req.params.id, req, res);
    if (!current) return;
    const product = await prisma.product.findUnique({ where: { id: current.id } });
    return res.status(200).json({
      ok: true,
      data: mapProduct(product)
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

    const centerId = ensureCenterBoundUser(req, res);
    if (!centerId) return;

    const payload = parsed.data;
    const code = payload.code ? toCode(payload.code) : toCode(payload.name);
    if (!code) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Product code could not be generated"
      });
    }

    const exists = await prisma.product.findFirst({ where: { centerId, code } });
    if (exists) {
      return res.status(409).json({
        ok: false,
        error: "PRODUCT_EXISTS",
        message: "Product code already exists"
      });
    }

    const created = await prisma.product.create({
      data: {
        centerId,
        code,
        name: payload.name.trim(),
        unit: String(payload.unit || "TEPSI").toUpperCase(),
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
    if (err && err.code === "P2002") {
      return res.status(409).json({
        ok: false,
        error: "PRODUCT_EXISTS",
        message: "Ayni merkezde bu isim veya kodda urun zaten var."
      });
    }
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

    const centerId = ensureCenterBoundUser(req, res);
    if (!centerId) return;

    const result = await prisma.product.updateMany({
      where: { centerId },
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

    const current = await findProductOrForbidden(req.params.id, req, res);
    if (!current) return;

    const data = {};
    if (typeof parsed.data.name === "string") data.name = parsed.data.name.trim();
    if (typeof parsed.data.unit === "string") data.unit = String(parsed.data.unit).toUpperCase();
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
    if (err && err.code === "P2002") {
      return res.status(409).json({
        ok: false,
        error: "PRODUCT_EXISTS",
        message: "Ayni merkezde bu isim veya kodda urun zaten var."
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

    const current = await findProductOrForbidden(req.params.id, req, res);
    if (!current) return;

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
    const current = await findProductOrForbidden(req.params.id, req, res);
    if (!current) return;

    const refs = await prisma.$transaction([
      prisma.orderItem.count({ where: { productId: req.params.id } }),
      prisma.orderCarryover.count({ where: { productId: req.params.id } })
    ]);
    const orderItemRefCount = Number(refs[0] || 0);
    const carryoverRefCount = Number(refs[1] || 0);
    if (orderItemRefCount > 0 || carryoverRefCount > 0) {
      return res.status(409).json({
        ok: false,
        error: "PRODUCT_IN_USE",
        message: "Bu urunden daha once siparis verildigi icin silinemedi."
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
