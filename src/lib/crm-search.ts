import { database } from "./database";
import { normalizeSearch } from "./crm";
// Accent-free substring match, or a close word (pg_trgm word similarity) for typos.
// 0.45 measured on fixtures: "mnistere" → "ministere" 0.67, "socitee" → "societe" 0.57,
// unrelated words ≤ 0.33.
const tables = {
  clients: "clients",
  contacts: "crm_contacts",
  deals: "crm_deals",
  documents: "crm_documents",
  activities: "crm_activities",
} as const;
export type SearchTable = keyof typeof tables;
export async function searchIDs(table: SearchTable, query: string, limit = 200): Promise<number[]> {
  const q = normalizeSearch(query);
  if (!q) return [];
  const like = "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const { rows } = await database().query(
    `SELECT id FROM ${tables[table]}
      WHERE search_text LIKE $1 OR word_similarity($2, search_text) >= 0.45
      ORDER BY (search_text LIKE $1) DESC, word_similarity($2, search_text) DESC, id DESC
      LIMIT $3`,
    [like, q, limit],
  );
  return rows.map((r) => Number(r.id));
}
// Payload "where" for the matching ids (an impossible id when nothing matches).
export async function searchWhere(table: SearchTable, query: string) {
  const ids = await searchIDs(table, query);
  return { id: { in: ids.length ? ids : [0] } };
}
