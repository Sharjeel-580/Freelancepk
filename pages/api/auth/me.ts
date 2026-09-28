import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser, publicUser } from "@/lib/auth";
import { handleApiError, methodNotAllowed } from "@/lib/api";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(200).json({ user: null });
    return res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    return handleApiError(res, error);
  }
}