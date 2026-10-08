import { authenticated, errorResponse, HTTPError } from "@/lib/backend";
import { readFile } from "node:fs/promises";
import path from "node:path";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { payload, user } = await authenticated();
    const { id } = await params;
    await payload.findByID({
      collection: "ticket-files",
      id,
      user,
      overrideAccess: false,
      depth: 0,
    });
    const file = await payload.findByID({
      collection: "ticket-files",
      id,
      overrideAccess: true,
      depth: 0,
    });
    if (!/^[a-f0-9-]{36}$/.test(file.storageKey))
      throw new HTTPError(404, "Fichier inaccessible.");
    const data = await readFile(
      path.join(
        process.env.PRIVATE_UPLOAD_PATH || path.resolve("storage/private"),
        file.storageKey,
      ),
    );
    return new Response(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
