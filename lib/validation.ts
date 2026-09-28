import { z } from "zod";

const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => value || null);

export const clientSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.union([emailSchema, z.literal("")]).optional().transform((value) => value || null),
  company: optionalText(120),
  phone: optionalText(50),
  notes: optionalText(5000),
  platform: optionalText(50),
});

export const clientUpdateSchema = clientSchema.partial();

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.number().finite().positive().max(10000000),
  rate: z.number().finite().nonnegative().max(100000000000),
});

const invoiceItemsSchema = z.array(invoiceItemSchema).min(1).max(100).superRefine((items, context) => {
  const total = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  if (!Number.isFinite(total) || total > 999999999999.99) context.addIssue({ code: "custom", message: "Invoice total exceeds the supported maximum." });
});

const invoiceFields = {
  clientId: z.string().min(1).nullable().optional(),
  invoiceNumber: z.string().trim().min(1).max(50).optional(),
  issueDate: z.string().date(),
  dueDate: z.string().date(),
  status: z.enum(["draft", "unpaid", "paid"]).optional(),
  notes: optionalText(5000),
  items: invoiceItemsSchema,
};

export const invoiceSchema = z.object(invoiceFields).refine((value) => value.dueDate >= value.issueDate, { path: ["dueDate"], message: "Due date must be on or after the issue date." });
export const invoiceUpdateSchema = z.object(invoiceFields).partial().refine((value) => !value.issueDate || !value.dueDate || value.dueDate >= value.issueDate, { path: ["dueDate"], message: "Due date must be on or after the issue date." });
export const invoiceStatusSchema = z.object({ status: z.enum(["draft", "unpaid", "paid"]) });

export const localImportSchema = z.object({
  clients: z.array(z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(100), email: z.string().trim().email().or(z.literal("")).optional(), company: z.string().trim().optional(), phone: z.string().trim().optional(), notes: z.string().trim().optional(), platform: z.string().trim().optional() })).max(1000),
  invoices: z.array(z.object({ id: z.string().min(1), number: z.string().min(1).max(50), clientId: z.string().optional(), clientName: z.string().trim().min(1).max(100), date: z.string().date(), dueDate: z.string().date(), status: z.enum(["draft", "unpaid", "paid"]).catch("unpaid"), note: z.string().max(5000).optional(), items: invoiceItemsSchema })).max(5000),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;