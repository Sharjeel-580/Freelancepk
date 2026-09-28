import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { createSession, publicUser, verifyPassword } from "@/lib/auth";
import { handleApiError, methodNotAllowed, parseBody, rejectCrossOriginMutation } from "@/lib/api";
import { loginSchema } from "@/lib/validation";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (rejectCrossOriginMutation(req, res)) return;
  try {
    const input = parseBody(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) return res.status(401).json({ error: "Email or password is incorrect." });
    await createSession(user.id, res);
    return res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    return handleApiError(res, error);
  }
}