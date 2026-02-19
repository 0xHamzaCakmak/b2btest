const express = require("express");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { requireRole } = require("../../common/middlewares/require-role");
const { createSimpleRateLimiter } = require("../../common/middlewares/rate-limit");

const ordersRouter = express.Router();
const createOrderRateLimiter = createSimpleRateLimiter({
  max: 30,
  windowMs: 5 * 60 * 1000,
  message: "Cok fazla siparis olusturma istegi. Lutfen biraz bekleyip tekrar deneyin.",
  keyFn(req) {
    return `${req.user && req.user.id ? req.user.id : req.ip || "ip"}:order-create`;
  }
});
const centerActionRateLimiter = createSimpleRateLimiter({
  max: 120,
  windowMs: 5 * 60 * 1000,
  message: "Cok fazla siparis aksiyonu. Lutfen kisa sure sonra tekrar deneyin.",
  keyFn(req) {
    return `${req.user && req.user.id ? req.user.id : req.ip || "ip"}:order-center-action`;
  }
});

const createOrderSchema = z.object({
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deliveryTime: z.string().min(4).max(5),
  note: z.string().max(1000).optional(),
  carryovers: z.array(
    z.object({
      productCode: z.string().min(2).max(64),
      qtyKg: z.number().min(0).max(100000)
    })
  ).optional(),
  items: z.array(
    z.object({
      productCode: z.string().min(2).max(64),
      qtyTray: z.number().int().positive()
    })
  ).min(1)
});

const bulkApproveSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  approveIds: z.array(z.string().uuid()).optional(),
  rejectIds: z.array(z.string().uuid()).optional(),
  orderItemDecisions: z.array(z.object({
    orderId: z.string().uuid(),
    approveItemIds: z.array(z.string().uuid()).optional(),
    rejectItemIds: z.array(z.string().uuid()).optional()
  })).optional()
}).refine((value) => {
  const ids = Array.isArray(value.ids) ? value.ids.length : 0;
  const approveIds = Array.isArray(value.approveIds) ? value.approveIds.length : 0;
  const rejectIds = Array.isArray(value.rejectIds) ? value.rejectIds.length : 0;
  const decisions = Array.isArray(value.orderItemDecisions) ? value.orderItemDecisions.length : 0;
  return (ids + approveIds + rejectIds + decisions) > 0;
}, {
  message: "At least one order id is required"
});

const carryoverQuerySchema = z.object({
  baseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

function applyPercent(basePrice, percent) {
  return Math.max(1, Math.round(basePrice * (1 + percent / 100)));
}

function applyPricing(basePrice, percent, extraAmount) {
  const percentApplied = Number(basePrice) * (1 + Number(percent || 0) / 100);
  return Math.max(1, Math.round(percentApplied + Number(extraAmount || 0)));
}

function toUiStatus(dbStatus) {
  const value = String(dbStatus || "").toUpperCase();
  if (value === "ONAYLANDI") return "Onaylandi";
  if (value === "KISMEN_ONAYLANDI") return "Kismen Onaylandi";
  if (value === "ONAYLANMADI") return "Onaylanmadi";
  return "Onay Bekliyor";
}

function toUiDeliveryStatus(dbStatus) {
  return String(dbStatus || "").toUpperCase() === "TESLIM_EDILDI"
    ? "Teslim Edildi"
    : "Teslim Bekliyor";
}

function generateOrderNo() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `SP-${yyyy}${mm}${dd}-${hh}${mi}${ss}-${random}`;
}

function mapOrder(order) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    branchId: order.branchId,
    branchName: order.branch ? order.branch.name : null,
    status: toUiStatus(order.status),
    deliveryDate: order.deliveryDate ? order.deliveryDate.toISOString().slice(0, 10) : null,
    deliveryTime: order.deliveryTime,
    note: order.note || "",
    totalTray: order.totalTray,
    totalAmount: Number(order.totalAmount),
    approvedBy: order.approvedBy || null,
    approvedAt: order.approvedAt || null,
    deliveryStatus: toUiDeliveryStatus(order.deliveryStatus),
    deliveredBy: order.deliveredBy || null,
    deliveredAt: order.deliveredAt || null,
    deliveredByName: order.deliveredByUser ? (order.deliveredByUser.displayName || order.deliveredByUser.email || null) : null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: (order.items || []).map((item) => ({
      id: item.id,
      productId: item.productId,
      productCode: item.product ? item.product.code : null,
      name: item.product ? item.product.name : "-",
      qty: item.qtyTray,
      approvedQty: item.approvedQtyTray === null || item.approvedQtyTray === undefined
        ? null
        : Number(item.approvedQtyTray),
      itemStatus: item.approvedQtyTray === null || item.approvedQtyTray === undefined
        ? "Onay Bekliyor"
        : (Number(item.approvedQtyTray) <= 0
          ? "Onaylanmadi"
          : (Number(item.approvedQtyTray) >= Number(item.qtyTray)
            ? "Onaylandi"
            : "Kismen Onaylandi")),
      unitPrice: Number(item.unitPrice)
    })),
    carryovers: (order.carryovers || []).map((entry) => ({
      id: entry.id,
      productId: entry.productId,
      productCode: entry.product ? entry.product.code : null,
      name: entry.product ? entry.product.name : "-",
      qtyKg: Number(entry.qtyKg)
    }))
  };
}

function toOrderStatusByItemCounts(approvedCount, totalCount) {
  if (approvedCount <= 0) return "ONAYLANMADI";
  if (approvedCount >= totalCount) return "ONAYLANDI";
  return "KISMEN_ONAYLANDI";
}

function allowedDeliveryStatus(dbStatus) {
  const v = String(dbStatus || "").toUpperCase();
  return v === "ONAYLANDI" || v === "KISMEN_ONAYLANDI";
}

function parseDateStrict(dateText, mode) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText || "")) return null;
  const parts = String(dateText).split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return null;

  const parsed = mode === "end"
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== (month - 1) ||
    parsed.getDate() !== day
  ) return null;
  return parsed;
}

ordersRouter.post("/", requireAuth, requireRole("sube", "admin"), createOrderRateLimiter, async (req, res, next) => {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid order payload",
        details: parsed.error.flatten()
      });
    }

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

    if (!branch.isActive) {
      return res.status(403).json({
        ok: false,
        error: "BRANCH_INACTIVE",
        message: "Branch is inactive and cannot create orders"
      });
    }

    const payload = parsed.data;
    const qtyByCode = payload.items.reduce((acc, item) => {
      acc[item.productCode] = (acc[item.productCode] || 0) + item.qtyTray;
      return acc;
    }, {});
    const orderCodes = Object.keys(qtyByCode);
    const carryoverRows = Array.isArray(payload.carryovers) ? payload.carryovers : [];
    const carryoverByCode = carryoverRows.reduce((acc, row) => {
      const safeCode = String(row.productCode || "").trim();
      const safeQty = Number(row.qtyKg || 0);
      if (!safeCode || safeQty <= 0) return acc;
      acc[safeCode] = (acc[safeCode] || 0) + safeQty;
      return acc;
    }, {});
    const carryoverCodes = Object.keys(carryoverByCode);
    const codes = Array.from(new Set(orderCodes.concat(carryoverCodes)));

    const products = await prisma.product.findMany({
      where: { code: { in: codes } }
    });
    const productMap = products.reduce((acc, p) => {
      acc[p.code] = p;
      return acc;
    }, {});

    for (const code of orderCodes) {
      if (!productMap[code]) {
        return res.status(400).json({
          ok: false,
          error: "PRODUCT_NOT_FOUND",
          message: `Product not found: ${code}`
        });
      }
      if (!productMap[code].isActive) {
        return res.status(400).json({
          ok: false,
          error: "PRODUCT_INACTIVE",
          message: `Product is inactive: ${code}`
        });
      }
    }

    const percent = Number(branch.priceAdjustment ? branch.priceAdjustment.percent : 0);
    const productAdjustments = await prisma.branchProductAdjustment.findMany({
      where: {
        branchId: branch.id,
        productId: { in: products.map((p) => p.id) }
      }
    });
    const adjustmentByProductId = new Map(
      productAdjustments.map((row) => [row.productId, Number(row.extraAmount || 0)])
    );
    const orderItems = [];
    let totalTray = 0;
    let totalAmount = 0;

    orderCodes.forEach((code) => {
      const qtyTray = Number(qtyByCode[code] || 0);
      const product = productMap[code];
      const base = Number(product.basePrice);
      const extraAmount = adjustmentByProductId.has(product.id) ? adjustmentByProductId.get(product.id) : 0;
      const unitPrice = applyPricing(base, percent, extraAmount);
      totalTray += qtyTray;
      totalAmount += qtyTray * unitPrice;
      orderItems.push({
        productId: product.id,
        qtyTray,
        unitPrice
      });
    });

    const carryoverItems = carryoverCodes.map((code) => {
      const product = productMap[code];
      return product
        ? {
            productId: product.id,
            qtyKg: Number(carryoverByCode[code])
          }
        : null;
    }).filter(Boolean);

    let createdOrder = null;
    for (let i = 0; i < 5; i += 1) {
      try {
        createdOrder = await prisma.order.create({
          data: {
            orderNo: generateOrderNo(),
            branchId: branch.id,
            status: "ONAY_BEKLIYOR",
            deliveryStatus: "TESLIM_BEKLIYOR",
            deliveryDate: new Date(`${payload.deliveryDate}T00:00:00.000Z`),
            deliveryTime: payload.deliveryTime,
            note: payload.note || "",
            totalTray,
            totalAmount,
            items: {
              create: orderItems
            },
            carryovers: {
              create: carryoverItems
            }
          },
          include: {
            branch: true,
            items: { include: { product: true } },
            carryovers: { include: { product: true } },
            deliveredByUser: { select: { id: true, email: true, displayName: true } }
          }
        });
        break;
      } catch (err) {
        if (err && err.code === "P2002" && i < 4) continue;
        throw err;
      }
    }

    return res.status(201).json({
      ok: true,
      data: mapOrder(createdOrder)
    });
  } catch (err) {
    return next(err);
  }
});

ordersRouter.get("/my", requireAuth, requireRole("sube", "admin"), async (req, res, next) => {
  try {
    if (!req.user.branchId) {
      return res.status(400).json({
        ok: false,
        error: "BRANCH_REQUIRED",
        message: "Current user is not linked to a branch"
      });
    }

    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    const where = { branchId: req.user.branchId };

    if (from || to) {
      const fromDate = from ? parseDateStrict(from, "start") : null;
      const toDate = to ? parseDateStrict(to, "end") : null;
      if ((from && !fromDate) || (to && !toDate)) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          message: "Invalid from/to query. Expected YYYY-MM-DD"
        });
      }
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        branch: true,
        items: { include: { product: true } },
        carryovers: { include: { product: true } },
        deliveredByUser: { select: { id: true, email: true, displayName: true } }
      }
    });

    return res.status(200).json({
      ok: true,
      data: orders.map(mapOrder)
    });
  } catch (err) {
    return next(err);
  }
});

ordersRouter.get("/my/carryover-candidates", requireAuth, requireRole("sube", "admin"), async (req, res, next) => {
  try {
    if (!req.user.branchId) {
      return res.status(400).json({
        ok: false,
        error: "BRANCH_REQUIRED",
        message: "Current user is not linked to a branch"
      });
    }

    const parsed = carryoverQuerySchema.safeParse(req.query || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid carryover query",
        details: parsed.error.flatten()
      });
    }

    const baseDateText = parsed.data.baseDate;
    const baseStart = baseDateText ? parseDateStrict(baseDateText, "start") : parseDateStrict(new Date().toISOString().slice(0, 10), "start");
    if (!baseStart) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid baseDate query. Expected YYYY-MM-DD"
      });
    }

    const yesterdayStart = new Date(baseStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const yesterdayOrders = await prisma.order.findMany({
      where: {
        branchId: req.user.branchId,
        createdAt: {
          gte: yesterdayStart,
          lte: yesterdayEnd
        }
      },
      include: {
        items: {
          include: { product: true }
        }
      }
    });

    const byCode = {};
    yesterdayOrders.forEach((order) => {
      (order.items || []).forEach((item) => {
        const code = item.product ? item.product.code : "";
        const name = item.product ? item.product.name : "";
        if (!code || !name) return;
        if (!byCode[code]) {
          byCode[code] = {
            productCode: code,
            name,
            yesterdayTray: 0,
            defaultKg: 0
          };
        }
        byCode[code].yesterdayTray += Number(item.qtyTray || 0);
      });
    });

    return res.status(200).json({
      ok: true,
      data: Object.values(byCode).sort((a, b) => a.name.localeCompare(b.name, "tr"))
    });
  } catch (err) {
    return next(err);
  }
});

ordersRouter.get("/", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
  try {
    const date = typeof req.query.date === "string" ? req.query.date : "";
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    const where = {};
    if (req.user.role === "merkez") {
      if (!req.user.centerId) {
        return res.status(400).json({
          ok: false,
          error: "CENTER_REQUIRED",
          message: "Current merkez user is not linked to a center"
        });
      }
      where.branch = { centerId: req.user.centerId };
    }
    if (date && (from || to)) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Use either date or from/to query, not both"
      });
    }

    if (date) {
      const start = parseDateStrict(date, "start");
      const end = parseDateStrict(date, "end");
      if (!start || !end) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          message: "Invalid date query. Expected YYYY-MM-DD"
        });
      }
      where.createdAt = {
        gte: start,
        lte: end
      };
    } else if (from || to) {
      const fromDate = from ? parseDateStrict(from, "start") : null;
      const toDate = to ? parseDateStrict(to, "end") : null;
      if ((from && !fromDate) || (to && !toDate)) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          message: "Invalid from/to query. Expected YYYY-MM-DD"
        });
      }
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        branch: true,
        items: { include: { product: true } },
        carryovers: { include: { product: true } },
        deliveredByUser: { select: { id: true, email: true, displayName: true } }
      }
    });

    return res.status(200).json({
      ok: true,
      data: orders.map(mapOrder)
    });
  } catch (err) {
    return next(err);
  }
});

ordersRouter.put("/:id/approve", requireAuth, requireRole("merkez", "admin"), centerActionRateLimiter, async (req, res, next) => {
  try {
    const orderForTotals = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        branch: { select: { centerId: true } },
        items: true
      }
    });
    if (!orderForTotals) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Order not found"
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
      if (!orderForTotals.branch || orderForTotals.branch.centerId !== req.user.centerId) {
        return res.status(403).json({
          ok: false,
          error: "FORBIDDEN",
          message: "Bu siparis baska bir merkeze bagli."
        });
      }
    }

    const totalTray = (orderForTotals.items || []).reduce((sum, item) => sum + Number(item.qtyTray || 0), 0);
    const totalAmount = (orderForTotals.items || []).reduce((sum, item) => {
      return sum + (Number(item.qtyTray || 0) * Number(item.unitPrice || 0));
    }, 0);

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of (orderForTotals.items || [])) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { approvedQtyTray: Number(item.qtyTray || 0) }
        });
      }

      return tx.order.update({
        where: { id: req.params.id },
        data: {
          status: "ONAYLANDI",
          approvedBy: req.user.id,
          approvedAt: new Date(),
          totalTray,
          totalAmount
        },
        include: {
          branch: true,
          items: { include: { product: true } },
          carryovers: { include: { product: true } },
          deliveredByUser: { select: { id: true, email: true, displayName: true } }
        }
      });
    });

    return res.status(200).json({
      ok: true,
      data: mapOrder(updated)
    });
  } catch (err) {
    if (err && err.code === "P2025") {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Order not found"
      });
    }
    return next(err);
  }
});

ordersRouter.put("/:id/deliver", requireAuth, requireRole("merkez", "admin"), centerActionRateLimiter, async (req, res, next) => {
  try {
    if (req.user.role === "merkez" && !req.user.centerId) {
      return res.status(400).json({
        ok: false,
        error: "CENTER_REQUIRED",
        message: "Current merkez user is not linked to a center"
      });
    }

    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { branch: { select: { centerId: true } } }
    });
    if (!order) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Order not found"
      });
    }
    if (req.user.role === "merkez" && (!order.branch || order.branch.centerId !== req.user.centerId)) {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
        message: "Bu siparis baska bir merkeze bagli."
      });
    }
    if (!allowedDeliveryStatus(order.status)) {
      return res.status(400).json({
        ok: false,
        error: "ORDER_NOT_APPROVED",
        message: "Siparis onaylanmadan teslim edildi olarak isaretlenemez."
      });
    }

    const updated = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        deliveryStatus: "TESLIM_EDILDI",
        deliveredBy: req.user.id,
        deliveredAt: new Date()
      },
      include: {
        branch: true,
        items: { include: { product: true } },
        carryovers: { include: { product: true } },
        deliveredByUser: { select: { id: true, email: true, displayName: true } }
      }
    });

    return res.status(200).json({
      ok: true,
      data: mapOrder(updated)
    });
  } catch (err) {
    if (err && err.code === "P2025") {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Order not found"
      });
    }
    return next(err);
  }
});

ordersRouter.put("/approve-bulk", requireAuth, requireRole("merkez", "admin"), centerActionRateLimiter, async (req, res, next) => {
  try {
    const parsed = bulkApproveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid bulk approve payload",
        details: parsed.error.flatten()
      });
    }

    let centerId = null;
    if (req.user.role === "merkez") {
      if (!req.user.centerId) {
        return res.status(400).json({
          ok: false,
          error: "CENTER_REQUIRED",
          message: "Current merkez user is not linked to a center"
        });
      }
      centerId = req.user.centerId;
    }

    const rawApproveIds = Array.isArray(parsed.data.approveIds)
      ? parsed.data.approveIds
      : (Array.isArray(parsed.data.ids) ? parsed.data.ids : []);
    const rawRejectIds = Array.isArray(parsed.data.rejectIds) ? parsed.data.rejectIds : [];
    const rejectSet = new Set(rawRejectIds);
    const approveIds = Array.from(new Set(rawApproveIds)).filter((id) => !rejectSet.has(id));
    const rejectIds = Array.from(rejectSet);
    const itemDecisions = Array.isArray(parsed.data.orderItemDecisions) ? parsed.data.orderItemDecisions : [];

    if (!approveIds.length && !rejectIds.length && !itemDecisions.length) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: "No valid order ids provided for approve/reject"
      });
    }

    let approvedCount = 0;
    let partiallyApprovedCount = 0;
    let rejectedCount = 0;
    const now = new Date();

    if (itemDecisions.length) {
      const requestedOrderIds = Array.from(new Set(itemDecisions.map((x) => x.orderId)));
      const where = {
        id: { in: requestedOrderIds },
        status: "ONAY_BEKLIYOR"
      };
      if (centerId) where.branch = { centerId };

      const orders = await prisma.order.findMany({
        where,
        include: { items: true }
      });
      const orderMap = new Map(orders.map((o) => [o.id, o]));

      for (const decision of itemDecisions) {
        const order = orderMap.get(decision.orderId);
        if (!order || !Array.isArray(order.items) || !order.items.length) continue;

        const validItemIds = new Set(order.items.map((item) => item.id));
        const approveItemSet = new Set(
          (Array.isArray(decision.approveItemIds) ? decision.approveItemIds : [])
            .filter((id) => validItemIds.has(id))
        );
        const rejectItemSet = new Set(
          (Array.isArray(decision.rejectItemIds) ? decision.rejectItemIds : [])
            .filter((id) => validItemIds.has(id) && !approveItemSet.has(id))
        );

        order.items.forEach((item) => {
          if (!approveItemSet.has(item.id) && !rejectItemSet.has(item.id)) {
            rejectItemSet.add(item.id);
          }
        });

        const approvedItems = order.items.filter((item) => approveItemSet.has(item.id));
        const approvedItemCount = approvedItems.length;
        const status = toOrderStatusByItemCounts(approvedItemCount, order.items.length);
        const totalTray = approvedItems.reduce((sum, item) => sum + Number(item.qtyTray || 0), 0);
        const totalAmount = approvedItems.reduce((sum, item) => {
          return sum + (Number(item.qtyTray || 0) * Number(item.unitPrice || 0));
        }, 0);

        await prisma.$transaction(async (tx) => {
          for (const item of order.items) {
            await tx.orderItem.update({
              where: { id: item.id },
              data: { approvedQtyTray: approveItemSet.has(item.id) ? Number(item.qtyTray || 0) : 0 }
            });
          }
          await tx.order.update({
            where: { id: order.id },
            data: {
              status,
              approvedBy: status === "ONAYLANMADI" ? null : req.user.id,
              approvedAt: status === "ONAYLANMADI" ? null : now,
              totalTray,
              totalAmount
            }
          });
        });

        if (status === "ONAYLANDI") approvedCount += 1;
        else if (status === "ONAYLANMADI") rejectedCount += 1;
        else partiallyApprovedCount += 1;
      }
    }

    if (approveIds.length) {
      const approveWhere = {
        id: { in: approveIds },
        status: "ONAY_BEKLIYOR"
      };
      if (centerId) approveWhere.branch = { centerId };

      const approveOrders = await prisma.order.findMany({
        where: approveWhere,
        include: { items: true }
      });
      for (const order of approveOrders) {
        const totalTray = (order.items || []).reduce((sum, item) => sum + Number(item.qtyTray || 0), 0);
        const totalAmount = (order.items || []).reduce((sum, item) => {
          return sum + (Number(item.qtyTray || 0) * Number(item.unitPrice || 0));
        }, 0);
        await prisma.$transaction(async (tx) => {
          for (const item of (order.items || [])) {
            await tx.orderItem.update({
              where: { id: item.id },
              data: { approvedQtyTray: Number(item.qtyTray || 0) }
            });
          }
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: "ONAYLANDI",
              approvedBy: req.user.id,
              approvedAt: now,
              totalTray,
              totalAmount
            }
          });
        });
      }
      approvedCount += approveOrders.length;
    }

    if (rejectIds.length) {
      const rejectWhere = {
        id: { in: rejectIds },
        status: "ONAY_BEKLIYOR"
      };
      if (centerId) rejectWhere.branch = { centerId };

      const rejectOrders = await prisma.order.findMany({
        where: rejectWhere,
        include: { items: true }
      });
      for (const order of rejectOrders) {
        await prisma.$transaction(async (tx) => {
          for (const item of (order.items || [])) {
            await tx.orderItem.update({
              where: { id: item.id },
              data: { approvedQtyTray: 0 }
            });
          }
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: "ONAYLANMADI",
              approvedBy: null,
              approvedAt: null,
              totalTray: 0,
              totalAmount: 0
            }
          });
        });
      }
      rejectedCount += rejectOrders.length;
    }

    return res.status(200).json({
      ok: true,
      data: {
        approvedCount,
        partiallyApprovedCount,
        rejectedCount,
        affectedRows: approvedCount + partiallyApprovedCount + rejectedCount
      }
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { ordersRouter };
