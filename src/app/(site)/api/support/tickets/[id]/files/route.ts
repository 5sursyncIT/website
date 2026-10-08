import {
  authenticated,
  checkOrigin,
  errorResponse,
  HTTPError,
} from "@/lib/backend";
import { validateFile } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const { payload, user } = await authenticated();
    const { id } = await params;
    const ticket = await payload.findByID({
      collection: "tickets",
      id,
      user,
      overrideAccess: false,
      depth: 0,
    });
    if (ticket.status === "closed") throw new HTTPError(409, "Ticket fermé.");
    await rateLimit(request, `upload:${user!.id}`, 10);
    const length = Number(request.headers.get("content-length"));
    if (!length || length > 6 * 1024 * 1024)
      throw new HTTPError(413, "Fichier trop volumineux.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1)
      throw new HTTPError(400, "Un fichier par envoi.");
    const bytes = Buffer.from(await file.arrayBuffer());
    let valid;
    try {
      valid = validateFile(bytes, file.type, file.name);
    } catch {
      throw new HTTPError(400, "PDF, PNG ou JPEG uniquement, 5 Mo maximum.");
    }
    const existing = await payload.count({
      collection: "ticket-files",
      where: { ticket: { equals: id } },
      user,
      overrideAccess: false,
    });
    if (existing.totalDocs >= 10)
      throw new HTTPError(409, "Limite de fichiers atteinte pour ce ticket.");
    const storageKey = randomUUID();
    const directory =
      process.env.PRIVATE_UPLOAD_PATH || path.resolve("storage/private");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const location = path.join(directory, storageKey);
    await writeFile(location, bytes, { flag: "wx", mode: 0o600 });
    try {
      await payload.create({
        collection: "ticket-files",
        overrideAccess: true,
        data: {
          client: ticket.client,
          ticket: ticket.id,
          ...valid,
          storageKey,
        },
      });
    } catch (e) {
      await unlink(location);
      throw e;
    }
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
