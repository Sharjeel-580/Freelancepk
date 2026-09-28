ALTER TABLE "Client" ADD COLUMN "normalizedName" TEXT;

UPDATE "Client" SET "normalizedName" = lower(btrim("name"));

WITH ranked_clients AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "userId", "normalizedName" ORDER BY "createdAt", "id") AS "duplicateRank"
  FROM "Client"
)
UPDATE "Client" AS client
SET "normalizedName" = client."normalizedName" || chr(31) || client."id"
FROM ranked_clients
WHERE client."id" = ranked_clients."id" AND ranked_clients."duplicateRank" > 1;

ALTER TABLE "Client" ALTER COLUMN "normalizedName" SET NOT NULL;
CREATE UNIQUE INDEX "Client_userId_normalizedName_key" ON "Client"("userId", "normalizedName");