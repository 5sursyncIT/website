import { isAdmin } from "@/lib/access";
import {
  authenticated,
  checkOrigin,
  errorResponse,
  HTTPError,
  readJSON,
} from "@/lib/backend";
import { replySchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const { payload, user } = await authenticated();
    const { id } = await params;
    await rateLimit(request, `reply:${user!.id}`, 30);
    const result = replySchema.safeParse(await readJSON(request));
    if (!result.success) throw new HTTPError(400, "Message invalide.");
    const ticket = await payload.findByID({
      collection: "tickets",
      id,
      user,
      overrideAccess: false,
      depth: 0,
    });
    await payload.create({
      collection: "ticket-replies",
      user,
      overrideAccess: false,
      data: {
        ticket: Number(id),
        client: ticket.client,
        author: {
          relationTo: isAdmin(user) ? "admins" : "client-accounts",
          value: Number(user!.id),
        },
        ...result.data,
      },
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
