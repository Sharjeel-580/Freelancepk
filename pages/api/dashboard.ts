import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser } from "@/lib/auth";
import { handleApiError, methodNotAllowed } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { invoiceInclude, serializeInvoice } from "@/lib/serializers";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const [totalClients, totalInvoices, paid, unpaid, paidThisMonth, recentInvoices] = await Promise.all([
      prisma.client.count({ where: { userId: user.id } }),
      prisma.invoice.count({ where: { userId: user.id } }),
      prisma.invoice.aggregate({ where: { userId: user.id, status: "paid" }, _sum: { total: true } }),
      prisma.invoice.aggregate({ where: { userId: user.id, status: "unpaid" }, _sum: { total: true } }),
      prisma.invoice.aggregate({ where: { userId: user.id, status: "paid", paidAt: { gte: monthStart, lt: nextMonth } }, _sum: { total: true } }),
      prisma.invoice.findMany({ where: { userId: user.id }, orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }], take: 5, include: invoiceInclude }),
    ]);
    return res.status(200).json({
      totalClients,
      totalInvoices,
      paidAmount: Number(paid._sum.total ?? 0),
      unpaidAmount: Number(unpaid._sum.total ?? 0),
      paidThisMonth: Number(paidThisMonth._sum.total ?? 0),
      recentInvoices: recentInvoices.map(serializeInvoice),
    });
  } catch (error) {
    return handleApiError(res, error);
  }
}