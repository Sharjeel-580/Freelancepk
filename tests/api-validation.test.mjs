import test from "node:test";
import assert from "node:assert/strict";
import { clientSchema, invoiceSchema, invoiceStatusSchema, localImportSchema, loginSchema, registerSchema } from "../lib/validation.ts";
import { verifySameOrigin } from "../lib/api.ts";
import { calculateItems } from "../lib/billing.ts";
import { serializeClient, serializeUser } from "../lib/serializers.ts";

test("registration normalizes email and accepts passwords of at least eight characters", () => {
  const parsed = registerSchema.safeParse({ name: "  Sana  ", email: "SANA@example.com", password: "exactly8" });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, { name: "Sana", email: "sana@example.com", password: "exactly8" });
  assert.equal(registerSchema.safeParse({ name: "Sana", email: "sana@example.com", password: "1234567" }).success, false);
  assert.equal(registerSchema.safeParse({ name: "Sana", email: "bad-email", password: "short" }).success, false);
  assert.equal(loginSchema.safeParse({ email: "person@example.com", password: "x" }).success, true);
});

test("client and invoice inputs reject browser-supplied ownership fields", () => {
  const client = clientSchema.safeParse({ name: "Client", company: "Studio", userId: "another-account" });
  assert.equal(client.success, true);
  assert.equal("userId" in client.data, false);

  const invoice = invoiceSchema.safeParse({ clientId: "owned-client", userId: "another-account", issueDate: "2026-09-01", dueDate: "2026-09-30", items: [{ description: "Design", quantity: 10.5, rate: 5000 }] });
  assert.equal(invoice.success, true);
  assert.equal("userId" in invoice.data, false);
  assert.equal(invoice.data.items[0].quantity * invoice.data.items[0].rate, 52500);
});

test("invoice validation accepts common positive decimal quantities and rejects invalid data", () => {
  for (const quantity of [1, 2, 5, 10, 10.5, 20, 100]) {
    assert.equal(invoiceSchema.safeParse({ clientId: "client", issueDate: "2026-09-28", dueDate: "2026-10-12", items: [{ description: "Work", quantity, rate: 5000 }] }).success, true, `quantity ${quantity}`);
  }
  assert.equal(invoiceSchema.safeParse({ clientId: "client", issueDate: "2026-09-28", dueDate: "2026-09-01", items: [{ description: "Work", quantity: 1, rate: 5000 }] }).success, false);
  assert.equal(invoiceSchema.safeParse({ clientId: "client", issueDate: "2026-09-28", dueDate: "2026-10-12", items: [{ description: "Work", quantity: 0, rate: 5000 }] }).success, false);
  assert.equal(invoiceStatusSchema.safeParse({ status: "paid", userId: "ignored" }).data.status, "paid");
});

test("legacy import accepts the existing browser invoice shape", () => {
  const parsed = localImportSchema.safeParse({
    clients: [{ id: "legacy-client", name: "Sana Studio", email: "sana@example.com", platform: "Direct" }],
    invoices: [{ id: "legacy-invoice", number: "FPK-2026-0001", clientId: "legacy-client", clientName: "Sana Studio", date: "2026-09-28", dueDate: "2026-10-12", status: "unpaid", note: "Thanks", items: [{ description: "Logo", quantity: 10, rate: 5000 }] }],
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.invoices[0].items[0].quantity * parsed.data.invoices[0].items[0].rate, 50000);
});

test("server invoice math uses decimal totals for multiple lines", () => {
  const result = calculateItems([
    { description: "Design", quantity: 10, rate: 5000 },
    { description: "Review", quantity: 1.5, rate: 2000 },
  ]);
  assert.equal(result.lines[0].amount.toString(), "50000");
  assert.equal(result.lines[1].amount.toString(), "3000");
  assert.equal(result.total.toString(), "53000");
  assert.throws(() => calculateItems([{ description: "Too much", quantity: 10000000, rate: 100000000000 }]), RangeError);
});

test("mutations accept the configured local origin and reject a mismatched origin", () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://freelancepk.example";
  try {
    assert.equal(verifySameOrigin({ headers: { origin: "https://freelancepk.example", host: "freelancepk.example", "x-forwarded-proto": "https" } }), true);
    assert.equal(verifySameOrigin({ headers: { origin: "https://attacker.example", host: "freelancepk.example", "x-forwarded-proto": "https" } }), false);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  }
});

test("origin guard allows only configured local and exact Codespaces preview origins", () => {
  const old = { app: process.env.NEXT_PUBLIC_APP_URL, name: process.env.CODESPACE_NAME, domain: process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN, mode: process.env.NODE_ENV, port: process.env.PORT };
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.CODESPACE_NAME = "test-codespace";
  process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = "app.github.dev";
  process.env.NODE_ENV = "production";
  process.env.PORT = "3000";
  try {
    assert.equal(verifySameOrigin({ headers: { origin: "https://test-codespace-3000.app.github.dev", host: "localhost:3000" } }), true);
    assert.equal(verifySameOrigin({ headers: { origin: "http://localhost:3000", host: "localhost:3000" } }), true);
    assert.equal(verifySameOrigin({ headers: { origin: "https://attacker.app.github.dev", host: "localhost:3000" } }), false);
  } finally {
    for (const [key, value] of [["NEXT_PUBLIC_APP_URL", old.app], ["CODESPACE_NAME", old.name], ["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", old.domain], ["NODE_ENV", old.mode], ["PORT", old.port]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("public serializers omit password hashes, account IDs, and legacy IDs", () => {
  assert.deepEqual(serializeUser({ id: "user-1", name: "Sana", email: "sana@example.com", passwordHash: "secret-hash" }), { id: "user-1", name: "Sana", email: "sana@example.com" });
  const client = serializeClient({ id: "client-1", userId: "owner-id", legacyId: "old-id", name: "Client", email: null, company: null, phone: null, notes: null, platform: null, createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z") });
  assert.equal("userId" in client, false);
  assert.equal("legacyId" in client, false);
});