import { cookies } from "next/headers";
import {
  backend,
  checkOrigin,
  errorResponse,
  HTTPError,
  readJSON,
} from "@/lib/backend";
import { loginSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await rateLimit(request, "login", 10);
    const parsed = loginSchema.safeParse(await readJSON(request));
    if (!parsed.success) throw new HTTPError(400, "Identifiants invalides.");
    const payload = await backend();
    let result;
    try {
      result = await payload.login({
        collection: "client-accounts",
        data: parsed.data,
      });
    } catch {
      throw new HTTPError(401, "E-mail ou mot de passe incorrect.");
    }
    if (!result.token || !result.user?.enabled)
      throw new HTTPError(401, "E-mail ou mot de passe incorrect.");
    (await cookies()).set("payload-token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
      path: "/",
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
