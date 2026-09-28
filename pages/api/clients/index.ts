import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser } from "@/lib/auth";
import { handleApiError, methodNotAllowed, parseBody, rejectCrossOriginMutation } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { serializeClient } from "@/lib/serializers";
import { clientSchema } from "@/lib/validation";
import { normalizeClientName } from "@/lib/clients";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (req.method === "GET") {
      const clients = await prisma.client.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
      return res.status(200).json({ clients: clients.map(serializeClient) });
    }
    if (req.method === "POST") {
      if (rejectCrossOriginMutation(req, res)) return;
      const input = parseBody(clientSchema, req.body);
      const client = await prisma.client.create({ data: { ...input, userId: user.id, normalizedName: normalizeClientName(input.name) } });
      return res.status(201).json({ client: serializeClient(client) });
    }
    return methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    return handleApiError(res, error);
  }
}