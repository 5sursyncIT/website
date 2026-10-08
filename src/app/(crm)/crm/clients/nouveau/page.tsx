import Link from "next/link";
import { as, crmContext } from "@/lib/crm-server";
import { ClientForm, Flash, Head } from "@/components/crm/parts";
export const metadata = { title: "Nouvelle entreprise" };
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function NewClient({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const ctx = await crmContext();
  const admins = await ctx.payload.find({ collection: "admins", pagination: false, depth: 0, ...as(ctx) });
  return (
    <>
      <Head title="Nouvelle entreprise" eyebrow={<Link href="/crm/clients">← Entreprises</Link>} />
      <Flash search={search} />
      <section className="crm-card">
        <ClientForm admins={admins.docs} back="/crm/clients/nouveau" />
      </section>
    </>
  );
}
