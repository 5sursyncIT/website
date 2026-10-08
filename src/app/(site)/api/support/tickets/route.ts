import { clientID } from "@/lib/access";
import {
  authenticated,
  checkOrigin,
  errorResponse,
  HTTPError,
  readJSON,
} from "@/lib/backend";
import { ticketSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
export async function GET() {
  try {
    const { payload, user } = await authenticated();
    const result = await payload.find({
      collection: "tickets",
      user,
      overrideAccess: false,
      depth: 0,
      limit: 50,
      sort: "-updatedAt",
    });
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { payload, user } = await authenticated();
    await rateLimit(request, `ticket:${user!.id}`, 10);
    const result = ticketSchema.safeParse(await readJSON(request));
    if (!result.success)
      throw new HTTPError(400, "Vérifiez le sujet et la description.");
    const owner = clientID(user);
    if (owner === null)
      throw new HTTPError(403, "Créez ce ticket depuis l’administration.");
    const ticket = await payload.create({
      collection: "tickets",
      user,
      overrideAccess: false,
      data: {
        ...result.data,
        client: Number(owner),
        author: { relationTo: "client-accounts", value: Number(user!.id) },
        status: "open",
      },
    });
    return Response.json({ id: ticket.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
