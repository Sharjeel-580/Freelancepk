import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser } from "@/lib/auth";
import { handleApiError, methodNotAllowed, parseBody, rejectCrossOriginMutation } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { serializeClient } from "@/lib/serializers";
import { clientUpdateSchema } from "@/lib/validation";
import { normalizeClientName } from "@/lib/clients";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const id = typeof req.query.id === "string" ? req.query.id : "";
    if (!id) return res.status(400).json({ error: "A client ID is required." });

    if (req.method === "GET") {
      const client = await prisma.client.findFirst({ where: { id, userId: user.id } });
      return client ? res.status(200).json({ client: serializeClient(client) }) : res.status(404).json({ error: "Client not found." });
    }
    if (req.method === "PATCH") {
      if (rejectCrossOriginMutation(req, res)) return;
      const input = parseBody(clientUpdateSchema, req.body);
      const exists = await prisma.client.findFirst({ where: { id, userId: user.id }, select: { id: true } });
      if (!exists) return res.status(404).json({ error: "Client not found." });
      const client = await prisma.client.update({ where: { userId_id: { userId: user.id, id } }, data: { ...input, ...(input.name ? { normalizedName: normalizeClientName(input.name) } : {}) } });
      return res.status(200).json({ client: serializeClient(client) });
    }
    if (req.method === "DELETE") {
      if (rejectCrossOriginMutation(req, res)) return;
      const client = await prisma.client.findFirst({ where: { id, userId: user.id }, select: { id: true } });
      if (!client) return res.status(404).json({ error: "Client not found." });
      await prisma.$transaction([
        prisma.invoice.updateMany({ where: { userId: user.id, clientId: id }, data: { clientId: null } }),
        prisma.client.delete({ where: { userId_id: { userId: user.id, id } } }),
      ]);
      return res.status(204).end();
    }
    return methodNotAllowed(res, ["GET", "PATCH", "DELETE"]);
  } catch (error) {
    return handleApiError(res, error);
  }
}