import type { Prisma } from "@prisma/client";

export const invoiceInclude = { items: { orderBy: { id: "asc" as const } }, client: true } satisfies Prisma.InvoiceInclude;

export function serializeInvoice<T extends Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>>(invoice: T) {
  return {
    id: invoice.id,
    number: invoice.invoiceNumber,
    invoiceNumber: invoice.invoiceNumber,
    clientId: invoice.clientId,
    clientName: invoice.clientName,
    date: invoice.issueDate.toISOString().slice(0, 10),
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate.toISOString().slice(0, 10),
    status: invoice.status,
    note: invoice.notes,
    notes: invoice.notes,
    subtotal: Number(invoice.subtotal),
    total: Number(invoice.total),
    paidAt: invoice.paidAt?.toISOString().slice(0, 10) ?? null,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    items: invoice.items.map((item) => ({ id: item.id, description: item.description, quantity: Number(item.quantity), rate: Number(item.rate), amount: Number(item.amount) })),
  };
}

export function serializeClient<T extends { id: string; name: string; email: string | null; company: string | null; phone: string | null; notes: string | null; platform: string | null; createdAt: Date; updatedAt: Date }>(client: T) {
  return {
    id: client.id,
    name: client.name,
    email: client.email,
    company: client.company,
    phone: client.phone,
    notes: client.notes,
    platform: client.platform,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}

export function serializeUser(user: { id: string; name: string; email: string }) {
  return { id: user.id, name: user.name, email: user.email };
}