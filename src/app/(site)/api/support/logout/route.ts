import { cookies } from "next/headers";
import { createLocalReq, logoutOperation } from "payload";
import { authenticated, checkOrigin, errorResponse } from "@/lib/backend";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { payload, user } = await authenticated();
    const req = await createLocalReq({ user: user! }, payload);
    await logoutOperation({
      collection: payload.collections[user!.collection],
      req,
      allSessions: false,
    });
    (await cookies()).delete("payload-token");
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
