import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser } from "@/lib/auth";
import { handleApiError, methodNotAllowed, parseBody, rejectCrossOriginMutation } from "@/lib/api";
import { updateInvoice } from "@/lib/invoices";
import { prisma } from "@/lib/prisma";
import { invoiceInclude, serializeInvoice } from "@/lib/serializers";
import { invoiceUpdateSchema } from "@/lib/validation";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const id = typeof req.query.id === "string" ? req.query.id : "";
    if (!id) return res.status(400).json({ error: "An invoice ID is required." });

    if (req.method === "GET") {
      const invoice = await prisma.invoice.findFirst({ where: { id, userId: user.id }, include: invoiceInclude });
      return invoice ? res.status(200).json({ invoice: serializeInvoice(invoice) }) : res.status(404).json({ error: "Invoice not found." });
    }
    if (req.method === "PATCH") {
      if (rejectCrossOriginMutation(req, res)) return;
      const input = parseBody(invoiceUpdateSchema, req.body);
      const invoice = await updateInvoice(user.id, id, input);
      if (invoice === "invalid-client") return res.status(404).json({ error: "Client not found." });
      if (invoice === "invalid-dates") return res.status(400).json({ error: "Due date must be on or after the issue date." });
      return invoice ? res.status(200).json({ invoice: serializeInvoice(invoice) }) : res.status(404).json({ error: "Invoice not found." });
    }
    if (req.method === "DELETE") {
      if (rejectCrossOriginMutation(req, res)) return;
      const result = await prisma.invoice.deleteMany({ where: { id, userId: user.id } });
      return result.count ? res.status(204).end() : res.status(404).json({ error: "Invoice not found." });
    }
    return methodNotAllowed(res, ["GET", "PATCH", "DELETE"]);
  } catch (error) {
    return handleApiError(res, error);
  }
}