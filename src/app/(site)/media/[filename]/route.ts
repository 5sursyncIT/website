import { readFile } from "node:fs/promises";
import path from "node:path";
import { backend } from "@/lib/backend";
import { isMediaFilename } from "@/lib/showcase";
// Public images uploaded in the CMS; /api/cms stays behind the admin protection.
const types = new Set(["image/png", "image/jpeg", "image/webp"]);
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  // Accented names may arrive decomposed (NFD); uploads are stored as sent (NFC).
  const filename = (await params).filename.normalize("NFC");
  const notFound = () => new Response("Introuvable", { status: 404 });
  if (!isMediaFilename(filename)) return notFound();
  try {
    const result = await (await backend()).find({
      collection: "media",
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
      overrideAccess: false,
    });
    const media = result.docs[0];
    if (!media?.mimeType || !types.has(media.mimeType)) return notFound();
    const directory = process.env.MEDIA_STORAGE_PATH || path.resolve("storage/media");
    const data = await readFile(path.join(directory, path.basename(filename)));
    return new Response(data, {
      headers: {
        "Content-Type": media.mimeType,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return notFound();
  }
}
