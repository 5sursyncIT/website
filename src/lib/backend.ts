import { getPayload } from "payload";
import config from "@payload-config";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clientID, isAdmin } from "./access";
export const backend = () => getPayload({ config });
export async function identity() {
  const payload = await backend();
  const token = (await cookies()).get("payload-token")?.value;
  if (!token) return { payload, user: null };
  const { user } = await payload.auth({
    headers: new Headers({ authorization: `JWT ${token}` }),
  });
  return { payload, user };
}
export async function authenticated() {
  const context = await identity();
  if (!isAdmin(context.user) && clientID(context.user) === null)
    throw new HTTPError(401, "Connexion requise.");
  return context;
}
// Pages: an anonymous or expired session goes to login, never to an error page.
export async function supportPageUser() {
  const context = await identity();
  if (!isAdmin(context.user) && clientID(context.user) === null)
    redirect("/support/connexion");
  return context;
}
export class HTTPError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof HTTPError)
    return Response.json({ error: error.message }, { status: error.status });
  const status =
    error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : 0;
  // Payload validation errors are client errors, not an unavailable service.
  if (status === 400)
    return Response.json({ error: "Données invalides." }, { status: 400 });
  if ([401, 403, 404].includes(status))
    return Response.json({ error: "Ressource inaccessible." }, { status });
  return Response.json(
    { error: "La demande ne peut pas être traitée. Réessayez plus tard." },
    { status: 503 },
  );
}
export function checkOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN;
  if (
    !expected ||
    ![expected, process.env.ADMIN_ORIGIN]
      .filter(Boolean)
      .includes(request.headers.get("origin") || "")
  )
    throw new HTTPError(403, "Origine non autorisée.");
}
export async function readJSON(request: Request, max = 24000) {
  const reader = request.body?.getReader();
  if (!reader) throw new HTTPError(400, "Corps manquant.");
  const parts: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > max) {
      await reader.cancel();
      throw new HTTPError(413, "Demande trop volumineuse.");
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString());
  } catch {
    throw new HTTPError(400, "Données invalides.");
  }
}
