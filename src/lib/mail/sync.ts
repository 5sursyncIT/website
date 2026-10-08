import { Graph, GraphError, GraphUncertain } from "./graph";
import { MailStore, type Folder, type GraphMessage } from "./store";
import { isLikelyNdr, isNdrClass, ndrFailedRecipients } from "./rules";
// Incremental synchronisation of Inbox and Sent Items (Graph delta query, per folder).
// First run: messages received in the last N days (receivedDateTime ge …, Graph returns
// at most 5,000 per folder in that case). Then only changes, from the saved deltaLink.
// An interrupted round resumes from the saved nextLink. Microsoft losing the sync state
// (410 / syncStateNotFound) restarts from the same initial date without duplicates.
export const FOLDERS: Folder[] = ["inbox", "sentitems"];
export const SELECT = "id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments,isDraft";
const RESET_CODES = /syncstatenotfound|resyncrequired|syncstateinvalid|invaliddeltatoken/i;

export function initialDeltaPath(mailbox: string, folder: Folder, since: Date) {
  const params = new URLSearchParams({ $select: SELECT, $filter: `receivedDateTime ge ${since.toISOString().replace(/\.\d{3}Z$/, "Z")}` });
  return `${mailbox}/mailFolders/${folder}/messages/delta?${params.toString().replace(/\+/g, "%20")}`;
}

export type SyncResult = { folder: Folder; seen: number; removed: number; complete: boolean; reset?: boolean; skipped?: boolean; error?: string };

export async function syncFolder(graph: Graph, store: MailStore, folder: Folder, maxPages = 40): Promise<SyncResult> {
  const state = await store.claimFolder(folder, graph.config.sinceDays);
  if (!state) return { folder, seen: 0, removed: 0, complete: false, skipped: true };
  let url = state.next_link ?? state.delta_link ?? initialDeltaPath(graph.mailbox, folder, state.initial_since);
  let seen = 0, removed = 0;
  try {
    for (let page = 0; page < maxPages; page++) {
      const res = await graph.call("read", url, { headers: { Prefer: 'IdType="ImmutableId", odata.maxpagesize=50' } });
      const body = res.json ?? {};
      for (const item of (body.value as (GraphMessage & { "@removed"?: unknown })[]) ?? []) {
        if (item["@removed"]) { await store.markRemoved(item.id); removed++; continue; }
        if (item.isDraft) continue;
        const ndr = folder === "inbox" && isLikelyNdr(item.from?.emailAddress?.address, item.subject);
        const row = await store.upsertMessage(folder, item, { ndr });
        // A CRM draft now in Sent Items: its company and contact were chosen by a person.
        if (folder === "sentitems")
          for (const d of await store.markInSent(item.internetMessageId ?? null, item.id))
            if (d.client_id) await store.setLink(row.id, d.client_id, d.contact_id, "draft", null, "sync").catch(() => store.setLink(row.id, d.client_id!, null, "draft", null, "sync"));
        seen++;
      }
      const next = body["@odata.nextLink"] as string | undefined;
      const delta = body["@odata.deltaLink"] as string | undefined;
      if (next) { await store.saveNext(folder, next); url = next; continue; }
      if (delta) await store.saveDelta(folder, delta);
      await store.finishFolder(folder, null, seen);
      return { folder, seen, removed, complete: !!delta };
    }
    await store.finishFolder(folder, null, seen);
    return { folder, seen, removed, complete: false };
  } catch (error) {
    if (error instanceof GraphError && (error.status === 410 || RESET_CODES.test(error.code))) {
      await store.resetFolder(folder);
      await store.finishFolder(folder, `reset:${error.code}`, seen);
      return { folder, seen, removed, complete: false, reset: true };
    }
    const code = error instanceof GraphError ? `graph-${error.status}-${error.code}` : error instanceof GraphUncertain ? "graph-unavailable" : "internal";
    await store.finishFolder(folder, code, seen);
    return { folder, seen, removed, complete: false, error: code };
  }
}

// Reports flagged by sender/subject are confirmed by their message class, and their
// text is read once to find which of our recipients failed. The text is not kept.
export async function checkNdrs(graph: Graph, store: MailStore) {
  const sentTo = await store.recentSentRecipients();
  let checked = 0;
  for (const m of await store.uncheckedNdr()) {
    try {
      const res = await graph.call("read", `${graph.mailbox}/messages/${encodeURIComponent(m.graph_id)}?$select=body&$expand=${encodeURIComponent("singleValueExtendedProperties($filter=id eq 'String 0x001A')")}`,
        { headers: { Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' } });
      const props = (res.json?.singleValueExtendedProperties as { id: string; value: string }[] | undefined) ?? [];
      const klass = props.find((p) => /0x001A/i.test(p.id))?.value;
      const isNdr = klass ? isNdrClass(klass) : true;
      const text = String((res.json?.body as { content?: string } | undefined)?.content ?? "");
      await store.recordNdr(m.id, isNdr ? ndrFailedRecipients(text, sentTo) : [], isNdr);
      checked++;
    } catch (error) {
      if (error instanceof GraphError && error.status === 404) await store.recordNdr(m.id, [], false);
    }
  }
  return checked;
}

export async function syncAll(graph: Graph, store: MailStore) {
  const results: SyncResult[] = [];
  for (const folder of FOLDERS) results.push(await syncFolder(graph, store, folder));
  await store.expireSending();
  const linked = await store.linkPending();
  const ndr = await checkNdrs(graph, store);
  return { results, linked, ndr };
}
