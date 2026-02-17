const express = require("express");
const { z } = require("zod");
const { prisma } = require("../../config/prisma");
const { requireAuth } = require("../../common/middlewares/require-auth");
const { requireRole } = require("../../common/middlewares/require-role");

const ordersRouter = express.Router();

const createOrderSchema = z.object({
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deliveryTime: z.string().min(4).max(5),
  note: z.string().max(1000).optional(),
  items: z.array(
    z.object({
      productCode: z.string().min(2).max(64),
      qtyTray: z.number().int().positive()
    })
  ).min(1)
});

const bulkApproveSchema = z.object({
  ids: z.array(z.string().uuid()).min(1)
});

function applyPercent(basePrice, percent) {
  return Math.max(1, Math.round(basePrice * (1 + percent / 100)));
}

function toUiStatus(dbStatus) {
  return String(dbStatus || "").toUpperCase() === "ONAYLANDI"
    ? "Onaylandi"
    : "Onay Bekliyor";
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
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: (order.items || []).map((item) => ({
      id: item.id,
      productId: item.productId,
      productCode: item.product ? item.product.code : null,
      name: item.product ? item.product.name : "-",
      qty: item.qtyTray,
      unitPrice: Number(item.unitPrice)
    }))
  };
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

ordersRouter.post("/", requireAuth, requireRole("sube", "admin"), async (req, res, next) => {
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
    const codes = Object.keys(qtyByCode);

    const products = await prisma.product.findMany({
      where: { code: { in: codes } }
    });
    const productMap = products.reduce((acc, p) => {
      acc[p.code] = p;
      return acc;
    }, {});

    for (const code of codes) {
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
    const orderItems = [];
    let totalTray = 0;
    let totalAmount = 0;

    codes.forEach((code) => {
      const qtyTray = Number(qtyByCode[code] || 0);
      const product = productMap[code];
      const base = Number(product.basePrice);
      const unitPrice = applyPercent(base, percent);
      totalTray += qtyTray;
      totalAmount += qtyTray * unitPrice;
      orderItems.push({
        productId: product.id,
        qtyTray,
        unitPrice
      });
    });

    let createdOrder = null;
    for (let i = 0; i < 5; i += 1) {
      try {
        createdOrder = await prisma.order.create({
          data: {
            orderNo: generateOrderNo(),
            branchId: branch.id,
            status: "ONAY_BEKLIYOR",
            deliveryDate: new Date(`${payload.deliveryDate}T00:00:00.000Z`),
            deliveryTime: payload.deliveryTime,
            note: payload.note || "",
            totalTray,
            totalAmount,
            items: {
              create: orderItems
            }
          },
          include: {
            branch: true,
            items: { include: { product: true } }
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
        items: { include: { product: true } }
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

ordersRouter.get("/", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
  try {
    const date = typeof req.query.date === "string" ? req.query.date : "";
    const where = {};
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
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        branch: true,
        items: { include: { product: true } }
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

ordersRouter.put("/:id/approve", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
  try {
    const updated = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        status: "ONAYLANDI",
        approvedBy: req.user.id,
        approvedAt: new Date()
      },
      include: {
        branch: true,
        items: { include: { product: true } }
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

ordersRouter.put("/approve-bulk", requireAuth, requireRole("merkez", "admin"), async (req, res, next) => {
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

    const result = await prisma.order.updateMany({
      where: { id: { in: parsed.data.ids } },
      data: {
        status: "ONAYLANDI",
        approvedBy: req.user.id,
        approvedAt: new Date()
      }
    });

    return res.status(200).json({
      ok: true,
      data: { affectedRows: result.count }
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { ordersRouter };
