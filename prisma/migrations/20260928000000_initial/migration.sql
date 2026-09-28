CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'unpaid', 'paid');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "legacyId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "company" TEXT,
  "phone" TEXT,
  "notes" TEXT,
  "platform" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" TEXT,
  "legacyId" TEXT,
  "invoiceNumber" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "issueDate" DATE NOT NULL,
  "dueDate" DATE NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'unpaid',
  "notes" TEXT,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  "paidAt" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceItem" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL,
  "rate" DECIMAL(14,2) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "Client_userId_id_key" ON "Client"("userId", "id");
CREATE UNIQUE INDEX "Client_userId_legacyId_key" ON "Client"("userId", "legacyId");
CREATE INDEX "Client_userId_name_idx" ON "Client"("userId", "name");
CREATE INDEX "Client_userId_createdAt_idx" ON "Client"("userId", "createdAt");
CREATE UNIQUE INDEX "Invoice_userId_id_key" ON "Invoice"("userId", "id");
CREATE UNIQUE INDEX "Invoice_userId_invoiceNumber_key" ON "Invoice"("userId", "invoiceNumber");
CREATE UNIQUE INDEX "Invoice_userId_legacyId_key" ON "Invoice"("userId", "legacyId");
CREATE INDEX "Invoice_userId_issueDate_idx" ON "Invoice"("userId", "issueDate" DESC);
CREATE INDEX "Invoice_userId_status_issueDate_idx" ON "Invoice"("userId", "status", "issueDate");
CREATE INDEX "Invoice_clientId_userId_idx" ON "Invoice"("clientId", "userId");
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_userId_fkey" FOREIGN KEY ("clientId", "userId") REFERENCES "Client"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;