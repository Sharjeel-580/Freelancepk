import { InvoiceStatus, Prisma } from "@prisma/client";
import type { InvoiceInput } from "@/lib/validation";
import { invoiceInclude } from "@/lib/serializers";
import { prisma } from "@/lib/prisma";
import { calculateItems } from "@/lib/billing";

export type InvoiceFields = Partial<InvoiceInput> & { status?: "draft" | "unpaid" | "paid" };

export function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

async function nextInvoiceNumber(userId: string) {
  const year = new Date().getUTCFullYear();
  const prefix = `FPK-${year}-`;
  const existing = await prisma.invoice.findMany({ where: { userId, invoiceNumber: { startsWith: prefix } }, select: { invoiceNumber: true } });
  const used = new Set(existing.map((invoice) => invoice.invoiceNumber));
  let sequence = existing.length + 1;
  while (used.has(`${prefix}${String(sequence).padStart(4, "0")}`)) sequence += 1;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

export async function createInvoice(userId: string, input: InvoiceInput, legacyId?: string) {
  const { lines, total } = calculateItems(input.items);
  const client = input.clientId ? await prisma.client.findFirst({ where: { id: input.clientId, userId } }) : null;
  if (input.clientId && !client) return null;
  const invoiceNumber = input.invoiceNumber || await nextInvoiceNumber(userId);
  const status = (input.status || "unpaid") as InvoiceStatus;
  const paidAt = status === "paid" ? new Date() : null;
  return prisma.invoice.create({
    data: {
      userId,
      clientId: client?.id ?? null,
      clientName: client?.name || "Deleted client",
      legacyId,
      invoiceNumber,
      issueDate: day(input.issueDate),
      dueDate: day(input.dueDate),
      status,
      notes: input.notes,
      subtotal: total,
      total,
      paidAt,
      items: { create: lines },
    },
    include: invoiceInclude,
  });
}

export async function updateInvoice(userId: string, id: string, input: InvoiceFields) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({ where: { id, userId }, include: invoiceInclude });
    if (!existing) return null;
    const issueDate = input.issueDate ? day(input.issueDate) : existing.issueDate;
    const dueDate = input.dueDate ? day(input.dueDate) : existing.dueDate;
    if (dueDate < issueDate) return "invalid-dates" as const;

    let clientId = existing.clientId;
    let clientName = existing.clientName;
    if (Object.hasOwn(input, "clientId")) {
      if (input.clientId) {
        const client = await tx.client.findFirst({ where: { id: input.clientId, userId } });
        if (!client) return "invalid-client" as const;
        clientId = client.id;
        clientName = client.name;
      } else {
        clientId = null;
      }
    }

    const items = input.items ? calculateItems(input.items) : null;
    const status = (input.status || existing.status) as InvoiceStatus;
    const paidAt = status === "paid" ? existing.paidAt || new Date() : null;
    return tx.invoice.update({
      where: { userId_id: { userId, id } },
      data: {
        clientId,
        clientName,
        invoiceNumber: input.invoiceNumber ?? existing.invoiceNumber,
        issueDate,
        dueDate,
        status,
        notes: input.notes === undefined ? existing.notes : input.notes,
        ...(items ? { subtotal: items.total, total: items.total, items: { deleteMany: {}, create: items.lines } } : {}),
        paidAt,
      },
      include: invoiceInclude,
    });
  });
}