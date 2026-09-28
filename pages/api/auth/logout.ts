import type { NextApiRequest, NextApiResponse } from "next";
import { destroySession } from "@/lib/auth";
import { handleApiError, methodNotAllowed, rejectCrossOriginMutation } from "@/lib/api";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (rejectCrossOriginMutation(req, res)) return;
  try {
    await destroySession(req, res);
    return res.status(200).json({ ok: true });
  } catch (error) {
    return handleApiError(res, error);
  }
}