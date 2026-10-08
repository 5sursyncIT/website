import {
  backend,
  checkOrigin,
  errorResponse,
  HTTPError,
  readJSON,
} from "@/lib/backend";
import { consumeInvitation } from "@/lib/invitations";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
const schema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    password: z.string().min(14).max(200),
  })
  .strict();
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await rateLimit(request, "activation", 10);
    const result = schema.safeParse(await readJSON(request));
    if (!result.success)
      throw new HTTPError(
        400,
        "Lien invalide ou mot de passe trop court (14 caractères minimum).",
      );
    const id = await consumeInvitation(result.data.token);
    if (!id) throw new HTTPError(401, "Invitation expirée ou déjà utilisée.");
    const p = await backend();
    await p.update({
      collection: "client-accounts",
      id,
      overrideAccess: true,
      data: { password: result.data.password, enabled: true },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
