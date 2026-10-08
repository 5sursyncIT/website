import { as, crmContext } from "@/lib/crm-server";
import { contactDetails } from "@/lib/contact-details";
import { documentFilename, documentPDF } from "@/lib/crm-pdf";
// The same PDF as the e-mail attachment, for download (admins only, never cached).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const ctx = await crmContext();
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const doc = await ctx.payload.findByID({ collection: "crm-documents", id, depth: 1, disableErrors: true, ...as(ctx) });
  if (!doc) return new Response("Not found", { status: 404 });
  const creditFor = doc.creditFor && typeof doc.creditFor === "object" ? doc.creditFor.number : null;
  const pdf = await documentPDF(doc, await contactDetails(), creditFor);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${documentFilename(doc)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
