import { backend } from "@/lib/backend";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const p = await backend();
    await p.find({
      collection: "pages",
      limit: 1,
      depth: 0,
      overrideAccess: false,
    });
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
