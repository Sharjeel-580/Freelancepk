import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/serializers";

const SESSION_COOKIE = "fpk_session";
const SESSION_DAYS = 7;

export type PublicUser = { id: string; name: string; email: string };

export function publicUser(user: PublicUser): PublicUser {
  return serializeUser(user);
}

function digestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function setSessionCookie(res: NextApiResponse, token: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

export async function createSession(userId: string, res: NextApiResponse) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: digestToken(token), expiresAt } });
  setSessionCookie(res, token, SESSION_DAYS * 24 * 60 * 60);
}

export async function destroySession(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await prisma.session.deleteMany({ where: { tokenHash: digestToken(token) } });
  setSessionCookie(res, "", 0);
}

export async function getSessionUser(req: NextApiRequest) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = digestToken(token);
  const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.deleteMany({ where: { tokenHash } });
    return null;
  }
  return session.user;
}

export async function requireUser(req: NextApiRequest, res: NextApiResponse): Promise<PublicUser | null> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Please sign in to continue." });
    return null;
  }
  return publicUser(user);
}

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);