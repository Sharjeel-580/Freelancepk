import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError, type ZodType } from "zod";

export type ApiError = { error: string; details?: unknown };

export function methodNotAllowed(res: NextApiResponse<ApiError>, methods: string[]) {
  res.setHeader("Allow", methods);
  return res.status(405).json({ error: "Method not allowed." });
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  return schema.parse(body);
}

export function handleApiError(res: NextApiResponse<ApiError>, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: "Please check the submitted fields.", details: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    const target = "meta" in error && error.meta && typeof error.meta === "object" && "target" in error.meta ? error.meta.target : undefined;
    if (String(target).includes("normalizedName")) return res.status(409).json({ error: "A client with this name already exists." });
    return res.status(409).json({ error: "A record with those details already exists." });
  }
  console.error("API request failed.", error);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}

export function verifySameOrigin(req: NextApiRequest): boolean {
  const originHeader = req.headers.origin;
  if (!originHeader) return process.env.NODE_ENV !== "production";

  let origin: string;
  try {
    const parsed = new URL(originHeader);
    if (parsed.origin !== originHeader || !["http:", "https:"].includes(parsed.protocol)) return false;
    origin = parsed.origin;
  } catch {
    return false;
  }

  const allowedOrigins = new Set<string>();
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) {
    try {
      const parsed = new URL(configuredUrl);
      if (["http:", "https:"].includes(parsed.protocol)) allowedOrigins.add(parsed.origin);
    } catch {
      // Ignore malformed optional configuration rather than broadening access.
    }
  }

  const port = process.env.PORT || "3000";
  if (process.env.NODE_ENV !== "production") {
    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]) allowedOrigins.add(`http://${host}`);
  }

  const codespaceName = process.env.CODESPACE_NAME;
  const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (codespaceName && forwardingDomain && /^[a-z0-9-]+$/i.test(codespaceName) && /^[a-z0-9.-]+$/i.test(forwardingDomain)) {
    allowedOrigins.add(`https://${codespaceName}-${port}.${forwardingDomain}`);
  }

  const vercelHost = process.env.VERCEL_URL;
  if (vercelHost && /^[a-z0-9.-]+\.vercel\.app$/i.test(vercelHost)) allowedOrigins.add(`https://${vercelHost}`);
  const vercelBranchHost = process.env.VERCEL_BRANCH_URL;
  if (vercelBranchHost && /^[a-z0-9.-]+\.vercel\.app$/i.test(vercelBranchHost)) allowedOrigins.add(`https://${vercelBranchHost}`);

  return allowedOrigins.has(origin);
}

export function rejectCrossOriginMutation(req: NextApiRequest, res: NextApiResponse<ApiError>): boolean {
  if (verifySameOrigin(req)) return false;
  res.status(403).json({ error: "Cross-origin request rejected." });
  return true;
}