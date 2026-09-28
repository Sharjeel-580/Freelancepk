import type { NextApiRequest, NextApiResponse } from "next";
import { InvoiceStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { rejectCrossOriginMutation, handleApiError, methodNotAllowed, parseBody } from "@/lib/api";
import { day } from "@/lib/invoices";
import { calculateItems } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { localImportSchema } from "@/lib/validation";
import { invoiceInclude, serializeInvoice } from "@/lib/serializers";
import { normalizeClientName } from "@/lib/clients";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (rejectCrossOriginMutation(req, res)) return;
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const input = parseBody(localImportSchema, req.body);
    const result = await prisma.$transaction(async (tx) => {
      const clientIds = new Map<string, string>();
      let clientsImported = 0;
      let invoicesImported = 0;
      for (const legacy of input.clients) {
        const existing = await tx.client.findUnique({ where: { userId_legacyId: { userId: user.id, legacyId: legacy.id } } });
        const baseName = normalizeClientName(legacy.name);
        const conflictingName = await tx.client.findUnique({ where: { userId_normalizedName: { userId: user.id, normalizedName: baseName } }, select: { legacyId: true } });
        const normalizedName = conflictingName && conflictingName.legacyId !== legacy.id ? `${baseName}\u001f${legacy.id}` : baseName;
        const client = await tx.client.upsert({
          where: { userId_legacyId: { userId: user.id, legacyId: legacy.id } },
          create: { userId: user.id, legacyId: legacy.id, name: legacy.name, normalizedName, email: legacy.email || null, company: legacy.company || null, phone: legacy.phone || null, notes: legacy.notes || null, platform: legacy.platform || null },
          update: {},
        });
        clientIds.set(legacy.id, client.id);
        if (!existing) clientsImported += 1;
      }

      for (const legacy of input.invoices) {
        const existing = await tx.invoice.findUnique({ where: { userId_legacyId: { userId: user.id, legacyId: legacy.id } } });
        if (existing) continue;
        const { lines, total } = calculateItems(legacy.items);
        const clientId = legacy.clientId ? clientIds.get(legacy.clientId) : undefined;
        let invoiceNumber = legacy.number.slice(0, 50);
        let suffix = 1;
        while (await tx.invoice.findFirst({ where: { userId: user.id, invoiceNumber }, select: { id: true } })) {
          const marker = `-M${suffix++}`;
          invoiceNumber = `${legacy.number.slice(0, 50 - marker.length)}${marker}`;
        }
        await tx.invoice.upsert({
          where: { userId_legacyId: { userId: user.id, legacyId: legacy.id } },
          create: {
            userId: user.id,
            legacyId: legacy.id,
            invoiceNumber,
            clientId: clientId ?? null,
            clientName: legacy.clientName,
            issueDate: day(legacy.date),
            dueDate: day(legacy.dueDate),
            status: legacy.status as InvoiceStatus,
            notes: legacy.note || null,
            subtotal: total,
            total,
            paidAt: legacy.status === "paid" ? day(legacy.date) : null,
            items: { create: lines },
          },
          update: {},
          include: invoiceInclude,
        });
        invoicesImported += 1;
      }
      return { clientsImported, invoicesImported };
    });
    return res.status(200).json({ ...result, preservedLocalCopy: true });
  } catch (error) {
    return handleApiError(res, error);
  }
}