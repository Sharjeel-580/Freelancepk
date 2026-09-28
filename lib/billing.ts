import { Prisma } from "@prisma/client";

export type BillableItem = { description: string; quantity: number; rate: number };

export function calculateItems(items: BillableItem[]) {
  const lines = items.map((item) => {
    const quantity = new Prisma.Decimal(item.quantity);
    const rate = new Prisma.Decimal(item.rate);
    const amount = quantity.mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return { description: item.description.trim(), quantity, rate, amount };
  });
  const total = lines.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (total.greaterThan("999999999999.99")) throw new RangeError("Invoice total exceeds the supported maximum.");
  return { lines, total };
}