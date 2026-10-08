// Test double of Microsoft Graph + Entra token endpoint for the contact@ link. Local only
// (in-process or on an internal Docker network): nothing reaches Microsoft, no mail leaves.
// It checks the certificate assertion and simulates Exchange RBAC: the "read" app cannot
// send, the "send" app can only send, and any other mailbox is refused (403).
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createPublicKey, createVerify, X509Certificate, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";

type Addr = { emailAddress: { address: string; name?: string } };
type Msg = {
  id: string; folder: "inbox" | "sentitems" | "drafts"; internetMessageId: string; conversationId: string; changeKey: number;
  subject: string; from?: Addr; toRecipients: Addr[]; ccRecipients: Addr[]; bccRecipients: Addr[];
  receivedDateTime: string; sentDateTime?: string; isDraft: boolean; body: string; messageClass: string;
  attachments: { id: string; name: string; contentType: string; contentBytes: string; isInline: boolean; contentId?: string }[];
};
export type FakeOptions = { tenant: string; mailbox: string; mailboxAddress: string; apps: Record<string, { role: "read" | "send"; key: KeyObject }> };
export type SendMode = "ok" | "fail400" | "after503" | "drop";

export function startFakeGraph(opts: FakeOptions, port = 0) {
  const messages = new Map<string, Msg>();
  const log: { seq: number; id: string; folder: string; removed: boolean }[] = [];
  let seq = 0, n = 0, generation = 1;
  const state = { sendMode: "ok" as SendMode, sends: [] as { id: string; to: string[] }[], calls: [] as string[], tokens: 0 };
  const touch = (m: Msg, removed = false, folder = m.folder) => log.push({ seq: ++seq, id: m.id, folder, removed });
  const addr = (a: string, name?: string): Addr => ({ emailAddress: { address: a, ...(name ? { name } : {}) } });

  function add(input: Partial<Msg> & { folder: Msg["folder"]; subject: string }) {
    const id = input.id ?? `AAMkImm-${++n}`;
    const m: Msg = {
      id, internetMessageId: `<fake-${n}-${Date.now()}@fake.test>`, conversationId: `conv-${n}`, changeKey: 1, toRecipients: [], ccRecipients: [], bccRecipients: [],
      receivedDateTime: new Date().toISOString(), isDraft: input.folder === "drafts", body: "<p>texte</p>", messageClass: "IPM.Note", attachments: [], ...input,
    } as Msg;
    messages.set(id, m);
    if (m.folder !== "drafts") touch(m);
    return m;
  }
  const text = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|table|blockquote)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const view = (m: Msg, select: string | null, bodyType: string) => {
    const full: Record<string, unknown> = {
      id: m.id, internetMessageId: m.internetMessageId, conversationId: m.conversationId, changeKey: `ck-${m.changeKey}`, subject: m.subject,
      from: m.from, toRecipients: m.toRecipients, ccRecipients: m.ccRecipients, bccRecipients: m.bccRecipients,
      receivedDateTime: m.receivedDateTime, sentDateTime: m.sentDateTime, hasAttachments: m.attachments.some((a) => !a.isInline),
      isDraft: m.isDraft, parentFolderId: `folder-${m.folder}`, body: { contentType: bodyType, content: bodyType === "text" ? text(m.body) : m.body },
    };
    if (!select) return full;
    return Object.fromEntries(["id", ...select.split(",")].filter((k) => k in full).map((k) => [k, full[k]]));
  };
  const b64json = (v: unknown) => JSON.parse(Buffer.from(v as string, "base64url").toString());
  function verifyAssertion(form: URLSearchParams) {
    const [h, p, s] = String(form.get("client_assertion")).split(".");
    const app = opts.apps[String(form.get("client_id"))];
    if (!app || !h || !p || !s) return null;
    const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(app.key, Buffer.from(s, "base64url"));
    const payload = b64json(p), head = b64json(h);
    if (!ok || head.alg !== "RS256" || !head.x5t || payload.iss !== form.get("client_id") || payload.sub !== form.get("client_id") || !String(payload.aud).endsWith(`/${opts.tenant}/oauth2/v2.0/token`) || payload.exp * 1000 < Date.now()) return null;
    if (form.get("scope") !== "https://graph.microsoft.com/.default" || form.get("grant_type") !== "client_credentials") return null;
    return app.role;
  }
  const send = (res: ServerResponse, status: number, body?: unknown) => {
    res.writeHead(status, body === undefined ? {} : { "Content-Type": "application/json" });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const err = (res: ServerResponse, status: number, code: string) => send(res, status, { error: { code, message: code } });
  const readBody = (req: IncomingMessage) => new Promise<string>((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });

  function delta(res: ServerResponse, url: URL, folder: Msg["folder"], base: string) {
    const skip = url.searchParams.get("$skiptoken"), token = url.searchParams.get("$deltatoken");
    const pageSize = 2;
    if (token !== null) {
      const [gen, since] = token.split(".").map(Number);
      if (gen !== generation) return err(res, 410, "SyncStateNotFound");
      const changed = new Map<string, { removed: boolean }>();
      for (const e of log) if (e.seq > since && e.folder === folder) changed.set(e.id, { removed: e.removed });
      const value = [...changed].map(([id, c]) => (c.removed || messages.get(id)?.folder !== folder ? { id, "@removed": { reason: "deleted" } } : view(messages.get(id)!, null, "html")));
      return send(res, 200, { value, "@odata.deltaLink": `${base}/delta?$deltatoken=${generation}.${seq}` });
    }
    let st: { offset: number; snap: number; since: string | null; gen: number };
    if (skip) {
      st = b64json(skip);
      if (st.gen !== generation) return err(res, 410, "SyncStateNotFound");
    } else {
      const f = url.searchParams.get("$filter") ?? "";
      const m = f.match(/^receivedDateTime ge (\S+)$/);
      if (f && !m) return err(res, 400, "BadRequest");
      st = { offset: 0, snap: seq, since: m ? m[1] : null, gen: generation };
    }
    const all = [...messages.values()].filter((m) => m.folder === folder && (!st.since || m.receivedDateTime >= st.since)).sort((a, b) => b.receivedDateTime.localeCompare(a.receivedDateTime));
    const page = all.slice(st.offset, st.offset + pageSize).map((m) => view(m, null, "html"));
    if (st.offset + pageSize < all.length) {
      const next = Buffer.from(JSON.stringify({ ...st, offset: st.offset + pageSize })).toString("base64url");
      return send(res, 200, { value: page, "@odata.nextLink": `${base}/delta?$skiptoken=${next}` });
    }
    return send(res, 200, { value: page, "@odata.deltaLink": `${base}/delta?$deltatoken=${st.gen}.${st.snap}` });
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const raw = await readBody(req);
    const origin = `http://${req.headers.host}`;
    state.calls.push(`${req.method} ${url.pathname}`);
    // ---- control (tests only) ----
    if (url.pathname.startsWith("/_control/")) {
      const body = raw ? JSON.parse(raw) : {};
      if (url.pathname === "/_control/add") return send(res, 200, view(add({ ...body, from: body.from ? addr(body.from, body.fromName) : undefined, toRecipients: (body.to ?? []).map((a: string) => addr(a)), ccRecipients: (body.cc ?? []).map((a: string) => addr(a)) }), null, "html"));
      if (url.pathname === "/_control/remove") { const m = messages.get(body.id); if (m) { messages.delete(m.id); touch(m, true); } return send(res, 200, {}); }
      if (url.pathname === "/_control/send-mode") { state.sendMode = body.mode; return send(res, 200, {}); }
      if (url.pathname === "/_control/expire-delta") { generation++; return send(res, 200, {}); }
      if (url.pathname === "/_control/state") return send(res, 200, { sends: state.sends, tokens: state.tokens, drafts: [...messages.values()].filter((m) => m.folder === "drafts").map((m) => ({ id: m.id, subject: m.subject, body: m.body, attachments: m.attachments.map((a) => a.contentId ?? a.name) })), calls: state.calls });
      if (url.pathname === "/_control/edit-in-outlook") { const m = messages.get(body.id); if (m) { m.body += "<p>ajout Outlook</p>"; m.changeKey++; } return send(res, 200, {}); }
      return err(res, 404, "NotFound");
    }
    // ---- token ----
    const tokenPath = url.pathname.match(/^\/([^/]+)\/oauth2\/v2\.0\/token$/);
    if (tokenPath && req.method === "POST") {
      if (tokenPath[1] !== opts.tenant) return send(res, 400, { error: "invalid_tenant" });
      const role = verifyAssertion(new URLSearchParams(raw));
      if (!role) return send(res, 401, { error: "invalid_client" });
      state.tokens++;
      return send(res, 200, { access_token: `fake-${role}-${Date.now()}`, token_type: "Bearer", expires_in: 3599 });
    }
    // ---- Graph ----
    const auth = String(req.headers.authorization ?? "").match(/^Bearer fake-(read|send)-/);
    if (!auth) return err(res, 401, "InvalidAuthenticationToken");
    const role = auth[1];
    const g = url.pathname.match(/^\/v1\.0\/users\/([^/]+)(\/.*)$/);
    if (!g) return err(res, 404, "NotFound");
    // Exchange RBAC scope: this mailbox only.
    if (decodeURIComponent(g[1]) !== opts.mailbox) return err(res, 403, "ErrorAccessDenied");
    const rest = g[2];
    const isSend = req.method === "POST" && /\/(send|sendMail)$/.test(rest);
    if (role === "read" && isSend) return err(res, 403, "ErrorAccessDenied");
    if (role === "send" && !isSend) return err(res, 403, "ErrorAccessDenied");
    const prefer = String(req.headers.prefer ?? "");
    const bodyType = /outlook\.body-content-type="text"/.test(prefer) ? "text" : "html";
    const body = raw ? JSON.parse(raw) : {};
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\/mailFolders\/(inbox|sentitems)\/messages\/delta$/)) && req.method === "GET")
      return delta(res, url, m[1] as Msg["folder"], `${origin}/v1.0/users/${g[1]}/mailFolders/${m[1]}/messages`);
    if (rest === "/mailFolders/sentitems" && req.method === "GET") return send(res, 200, { id: "folder-sentitems" });
    if (rest === "/mailFolders/sentitems/messages" && req.method === "GET") {
      const f = (url.searchParams.get("$filter") ?? "").match(/^internetMessageId eq '(.*)'$/);
      return send(res, 200, { value: [...messages.values()].filter((x) => x.folder === "sentitems" && f && x.internetMessageId === f[1].replace(/''/g, "'")).map((x) => ({ id: x.id })) });
    }
    if (rest === "/messages" && req.method === "POST") {
      const d = add({ folder: "drafts", subject: body.subject ?? "", body: body.body?.content ?? "", toRecipients: body.toRecipients ?? [], ccRecipients: body.ccRecipients ?? [] });
      return send(res, 201, view(d, null, "html"));
    }
    if (!(m = rest.match(/^\/messages\/([^/]+)(\/.*)?$/))) return err(res, 404, "NotFound");
    const msg = messages.get(decodeURIComponent(m[1]));
    const sub = m[2] ?? "";
    if (!msg) return err(res, 404, "ErrorItemNotFound");
    if (sub === "" && req.method === "GET") {
      const v = view(msg, url.searchParams.get("$select"), bodyType);
      if ((url.searchParams.get("$expand") ?? "").includes("0x001A")) v.singleValueExtendedProperties = [{ id: "String 0x1a", value: msg.messageClass }];
      return send(res, 200, v);
    }
    if (sub === "" && req.method === "PATCH") {
      if (!msg.isDraft) return err(res, 400, "ErrorInvalidOperation");
      if (body.subject !== undefined) msg.subject = body.subject;
      if (body.toRecipients) msg.toRecipients = body.toRecipients;
      if (body.ccRecipients) msg.ccRecipients = body.ccRecipients;
      if (body.body) msg.body = body.body.content;
      msg.changeKey++;
      return send(res, 200, view(msg, null, "html"));
    }
    if (sub === "" && req.method === "DELETE") { messages.delete(msg.id); return send(res, 204); }
    if (sub === "/createReply" && req.method === "POST") {
      const d = add({ folder: "drafts", subject: `RE: ${msg.subject}`, conversationId: msg.conversationId, toRecipients: msg.from ? [msg.from] : [], body: `<html><body><p>&nbsp;</p><hr><div>${msg.body}</div></body></html>` });
      return send(res, 201, view(d, null, "html"));
    }
    if (sub === "/attachments" && req.method === "POST") {
      msg.attachments.push({ id: `att-${++n}`, name: body.name, contentType: body.contentType, contentBytes: body.contentBytes, isInline: !!body.isInline, contentId: body.contentId });
      msg.changeKey++;
      return send(res, 201, {});
    }
    if (sub === "/attachments" && req.method === "GET")
      return send(res, 200, { value: msg.attachments.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, size: Buffer.from(a.contentBytes, "base64").length, isInline: a.isInline })) });
    if ((m = sub.match(/^\/attachments\/([^/]+)(\/\$value)?$/)) && req.method === "GET") {
      const a = msg.attachments.find((x) => x.id === decodeURIComponent(m![1]));
      if (!a) return err(res, 404, "ErrorItemNotFound");
      if (m[2]) { res.writeHead(200, { "Content-Type": a.contentType }); return res.end(Buffer.from(a.contentBytes, "base64")); }
      return send(res, 200, { name: a.name, contentType: a.contentType, size: Buffer.from(a.contentBytes, "base64").length });
    }
    if (sub === "/send" && req.method === "POST") {
      if (!msg.isDraft) return err(res, 400, "ErrorInvalidOperation");
      if (state.sendMode === "fail400") return err(res, 400, "ErrorInvalidRecipients");
      // The message really leaves (to the fake), whatever the answer below.
      state.sends.push({ id: msg.id, to: msg.toRecipients.map((r) => r.emailAddress.address) });
      msg.isDraft = false; msg.folder = "sentitems"; msg.sentDateTime = msg.receivedDateTime = new Date().toISOString(); msg.changeKey++;
      touch(msg);
      if (state.sendMode === "after503") return err(res, 503, "ServiceUnavailable");
      if (state.sendMode === "drop") return req.socket.destroy();
      return send(res, 202);
    }
    return err(res, 404, "NotFound");
  });
  return new Promise<{ url: string; close: () => void; add: typeof add; state: typeof state; expireDelta: () => void; remove: (id: string) => void; editInOutlook: (id: string) => void; messages: Map<string, Msg> }>((resolve) =>
    server.listen(port, () => {
      const p = (server.address() as { port: number }).port;
      resolve({
        url: `http://127.0.0.1:${p}`, close: () => server.close(), add, state, messages,
        expireDelta: () => { generation++; },
        remove: (id) => { const x = messages.get(id); if (x) { messages.delete(id); touch(x, true); } },
        editInOutlook: (id) => { const x = messages.get(id); if (x) { x.body += "<p>ajout Outlook</p>"; x.changeKey++; } },
      });
    }));
}

// Standalone (e2e container): FAKE_TENANT, FAKE_MAILBOX_ID, FAKE_MAILBOX_ADDRESS,
// FAKE_READ_CLIENT/FAKE_READ_CERT, FAKE_SEND_CLIENT/FAKE_SEND_CERT.
if (process.argv[1]?.endsWith("fake-graph.ts")) {
  const key = (file: string) => createPublicKey(new X509Certificate(readFileSync(file)).publicKey.export({ type: "spki", format: "pem" }));
  void startFakeGraph({
    tenant: process.env.FAKE_TENANT!, mailbox: process.env.FAKE_MAILBOX_ID!, mailboxAddress: process.env.FAKE_MAILBOX_ADDRESS!,
    apps: {
      [process.env.FAKE_READ_CLIENT!]: { role: "read", key: key(process.env.FAKE_READ_CERT!) },
      [process.env.FAKE_SEND_CLIENT!]: { role: "send", key: key(process.env.FAKE_SEND_CERT!) },
    },
  }, 8080).then(() => console.log("fake graph listening on 8080"));
}
