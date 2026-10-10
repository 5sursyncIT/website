import {
  authenticated,
  checkOrigin,
  errorResponse,
  HTTPError,
  readJSON,
} from "@/lib/backend";
import { isFullAdmin, relationID } from "@/lib/access";
import { newInvitation } from "@/lib/invitations";
import { randomBytes } from "node:crypto";
import { z } from "zod";
const schema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.email().max(150),
    client: z.number().int().positive(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { payload, user } = await authenticated();
    if (!isFullAdmin(user)) throw new HTTPError(403, "Accès réservé aux administrateurs.");
    const result = schema.safeParse(await readJSON(request));
    if (!result.success) throw new HTTPError(400, "Données invalides.");
    await payload.findByID({
      collection: "clients",
      id: result.data.client,
      user,
      overrideAccess: false,
    });
    const invitation = newInvitation();
    const email = result.data.email.toLowerCase();
    const existing = await payload.find({
      collection: "client-accounts",
      where: { email: { equals: email } },
      user,
      overrideAccess: false,
      depth: 0,
      limit: 1,
    });
    const account = existing.docs[0];
    const pending = {
      invitedAt: new Date().toISOString(),
      invitationHash: invitation.hash,
      invitationExpiresAt: invitation.expiresAt,
    };
    if (account) {
      // Expired or failed activation: reissue on the same disabled account only.
      if (account.enabled)
        throw new HTTPError(409, "Ce compte est déjà actif.");
      if (String(relationID(account.client)) !== String(result.data.client))
        throw new HTTPError(409, "Cet e-mail appartient à une autre organisation.");
      await payload.update({
        collection: "client-accounts",
        id: account.id,
        user,
        overrideAccess: false,
        data: pending,
      });
    } else {
      await payload.create({
        collection: "client-accounts",
        user,
        overrideAccess: false,
        data: {
          ...result.data,
          email,
          enabled: false,
          ...pending,
          password: randomBytes(48).toString("hex"),
        },
      });
    }
    return Response.json(
      {
        invitationURL: `${process.env.APP_ORIGIN}/support/activation#${invitation.token}`,
        expiresAt: invitation.expiresAt,
        message:
          "Compte désactivé créé. Transmettez ce lien par un canal privé vérifié ; aucun e-mail envoyé.",
      },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
