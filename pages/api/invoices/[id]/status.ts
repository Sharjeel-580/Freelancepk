import type { NextApiRequest, NextApiResponse } from "next";
import { InvoiceStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { handleApiError, methodNotAllowed, parseBody, rejectCrossOriginMutation } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { invoiceInclude, serializeInvoice } from "@/lib/serializers";
import { invoiceStatusSchema } from "@/lib/validation";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") return methodNotAllowed(res, ["PATCH"]);
  if (rejectCrossOriginMutation(req, res)) return;
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const id = typeof req.query.id === "string" ? req.query.id : "";
    const { status } = parseBody(invoiceStatusSchema, req.body);
    const result = await prisma.invoice.updateMany({ where: { id, userId: user.id }, data: { status: status as InvoiceStatus, paidAt: status === "paid" ? new Date() : null } });
    if (!result.count) return res.status(404).json({ error: "Invoice not found." });
    const invoice = await prisma.invoice.findFirst({ where: { id, userId: user.id }, include: invoiceInclude });
    return res.status(200).json({ invoice: serializeInvoice(invoice!) });
  } catch (error) {
    return handleApiError(res, error);
  }
}