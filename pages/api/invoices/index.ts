import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser } from "@/lib/auth";
import { handleApiError, methodNotAllowed, parseBody, rejectCrossOriginMutation } from "@/lib/api";
import { createInvoice } from "@/lib/invoices";
import { prisma } from "@/lib/prisma";
import { invoiceInclude, serializeInvoice } from "@/lib/serializers";
import { invoiceSchema } from "@/lib/validation";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (req.method === "GET") {
      const invoices = await prisma.invoice.findMany({ where: { userId: user.id }, orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }], include: invoiceInclude });
      return res.status(200).json({ invoices: invoices.map(serializeInvoice) });
    }
    if (req.method === "POST") {
      if (rejectCrossOriginMutation(req, res)) return;
      const input = parseBody(invoiceSchema, req.body);
      if (!input.clientId) return res.status(400).json({ error: "Choose a client for this invoice." });
      const invoice = await createInvoice(user.id, input);
      return invoice ? res.status(201).json({ invoice: serializeInvoice(invoice) }) : res.status(404).json({ error: "Client not found." });
    }
    return methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    return handleApiError(res, error);
  }
}