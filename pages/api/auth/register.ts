import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword, publicUser } from "@/lib/auth";
import { handleApiError, methodNotAllowed, parseBody, rejectCrossOriginMutation } from "@/lib/api";
import { registerSchema } from "@/lib/validation";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (rejectCrossOriginMutation(req, res)) return;
  try {
    const input = parseBody(registerSchema, req.body);
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({ data: { name: input.name, email: input.email, passwordHash } });
    await createSession(user.id, res);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    return handleApiError(res, error);
  }
}