import Link from "next/link";
import { crmContext } from "@/lib/crm-server";
import { Flash, Head } from "@/components/crm/parts";
import { ClientImport } from "@/components/crm/import";
export const metadata = { title: "Importer des entreprises" };
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function ImportClients({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  await crmContext();
  return (
    <>
      <Head title="Importer des entreprises" eyebrow={<Link href="/crm/clients">← Entreprises</Link>} />
      <Flash search={search} />
      <ClientImport />
    </>
  );
}
