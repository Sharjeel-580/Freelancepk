# FreelancePK

A private client, invoice, and pricing workbench for independent professionals in Pakistan.

## Stack

- Next.js Pages Router for the existing frontend and API routes.
- TypeScript, Prisma, and PostgreSQL for authenticated persistent data.
- HTTP-only, same-site sessions backed by hashed random tokens; bcrypt password hashes.

## Configure

1. Install Node.js 22.12 or newer and PostgreSQL 14 or newer.
2. Copy `.env.example` to `.env` and set both `DATABASE_URL` and `DIRECT_URL` to your local PostgreSQL URL. Do not commit `.env`.
3. Install dependencies with `npm install`.
4. Apply the database migration with `npm run db:migrate`.
5. Start the app with `npm run dev` and open `http://localhost:3000`.

## Vercel deployment

Vercel detects this Next.js project automatically; no `vercel.json` or UI changes are required. Use Node.js 22.12 or newer, the default Next.js framework preset, `npm install` for install, and `npm run build` for the build command.

Configure these variables in each Vercel environment that will run the app:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL runtime connection. Use the provider's pooled/serverless URL when available; otherwise use its direct URL. |
| `DIRECT_URL` | Yes | Direct PostgreSQL connection used by Prisma Migrate. If the provider supplies pooled and direct URLs, use the direct one here. Both URLs must address the same database. |
| `NEXT_PUBLIC_APP_URL` | Only for a custom domain | Exact public origin, for example `https://your-domain.example` (no path or trailing slash). Vercel's generated `VERCEL_URL` and `VERCEL_BRANCH_URL` are recognized automatically for standard Vercel domains. |

Vercel sets `NODE_ENV` and its `VERCEL_*` system variables. There is no session-signing secret to configure: session tokens are generated with cryptographic randomness, stored hashed in PostgreSQL, and sent only in an HTTP-only cookie. Never copy the local `.env` into Vercel or commit it.

Use a managed PostgreSQL service compatible with Prisma 6.12 and TLS. Connection strings have this shape; replace every placeholder with values from your provider and percent-encode reserved characters in credentials:

```text
postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

Before promoting a production deployment, run `npm run db:migrate` once from a trusted deployment runner configured with production `DIRECT_URL`. This runs `prisma migrate deploy` (checked-in migrations only); it does not create development migrations. Do not run production migrations against the production database from every Preview build; give Preview its own database and its own `DATABASE_URL`/`DIRECT_URL`, or disable Preview deployments that access the database. Keep migrations backward-compatible while old and new serverless instances overlap.

`npm run build` runs the frontend sync, `prisma generate`, and `next build`. A real production build and database migration have been verified against the local PostgreSQL instance; production deployment remains blocked until the Vercel database URLs and, if applicable, custom-domain origin are configured.

## Scripts

- `npm run dev`: sync the existing frontend assets and start Next.js.
- `npm run build`: sync assets, generate Prisma client, and build the production app.
- `npm run lint`: TypeScript check.
- `npm test`: validation and security-boundary tests.
- `npm run db:dev`: create/apply a local development migration.
- `npm run db:migrate`: apply checked-in migrations.

## Data and security

Client and invoice APIs derive the account ID exclusively from the authenticated session. Password hashes and session tokens are never returned to the browser. The session cookie is HTTP-only, SameSite=Lax, and Secure in production. Invoice totals are calculated server-side using decimal arithmetic. Mutating requests must be same-origin.

On first sign-in, existing `freelancepk-workspace-v1` browser data is offered to the authenticated account through an idempotent import. The original localStorage copy is intentionally preserved; after import, normal client/invoice changes are stored in PostgreSQL. The import endpoint is authenticated and only writes records under that account.

## API

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET|POST /api/clients`, `GET|PATCH|DELETE /api/clients/:id`
- `GET|POST /api/invoices`, `GET|PATCH|DELETE /api/invoices/:id`, `PATCH /api/invoices/:id/status`
- `GET /api/dashboard`
- `POST /api/import/local` (authenticated legacy-data import)

Without a configured PostgreSQL `DATABASE_URL`, the production app cannot authenticate or persist data. Schema validation, Prisma generation, TypeScript checks, and API input tests can still be run without a database connection.
