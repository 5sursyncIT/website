import { canMail } from "@/lib/mail/access";
import { mailContext } from "@/lib/mail/crm";
import { attachment } from "@/lib/mail/service";
// Attachment of a contact@ email: CRM session + mailbox read right, streamed from
// Microsoft, always downloaded (never rendered in the CRM origin), never stored.
export async function GET(_: Request, { params }: { params: Promise<{ id: string; piece: string }> }) {
  const p = await params;
  const id = Number(p.id);
  const { deps, actor } = await mailContext();
  if (!deps || !canMail({ mailAccess: actor.level }, "read") || !Number.isInteger(id) || id <= 0 || !/^[\w=+/-]{1,512}$/.test(p.piece))
    return new Response("Introuvable", { status: 404 });
  const file = await attachment(deps, actor, id, p.piece).catch(() => null);
  if (!file) return new Response("Introuvable", { status: 404 });
  const name = file.name.replace(/[\r\n"\\]/g, "_").slice(0, 150) || "piece-jointe";
  return new Response(file.bytes, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
