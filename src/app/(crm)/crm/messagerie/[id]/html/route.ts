import { canMail } from "@/lib/mail/access";
import { mailContext } from "@/lib/mail/crm";
import { readMessage } from "@/lib/mail/service";
// Formatted version of a received email, as a top-level document in a CSP sandbox:
// opaque origin, no script, no form, no remote image or font (no tracking pixel), no
// framing. Active tags are removed beforehand as well (stripActiveHtml).
const CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const { deps, actor } = await mailContext();
  if (!deps || !canMail({ mailAccess: actor.level }, "read") || !Number.isInteger(id) || id <= 0) return new Response("Introuvable", { status: 404 });
  const message = await readMessage(deps, actor, id, "html").catch(() => null);
  if (!message) return new Response("Introuvable", { status: 404 });
  return new Response(`<!doctype html><meta charset="utf-8"><title>Email</title>${message.body}`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CSP,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
