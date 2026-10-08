import { createSign, randomUUID } from "node:crypto";
import type { Credential, MailConfig } from "./config";
// Microsoft Graph, application flow (client credentials) with a certificate assertion.
// Two credentials: "read" holds Exchange "Application Mail.ReadWrite" (read, drafts; it
// cannot send), "send" holds "Application Mail.Send" only. Both are scoped by Exchange
// RBAC to the contact@ mailbox. Bodies returned by Graph are never logged or stored.
export class GraphError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`graph ${status} ${code}`);
  }
}
// The request may or may not have reached Microsoft (timeout, network, 5xx).
export class GraphUncertain extends Error {}

type Token = { value: string; expires: number };
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

export function clientAssertion(config: Pick<MailConfig, "tenantId" | "loginBase">, cred: Credential, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = b64({ alg: "RS256", typ: "JWT", x5t: cred.thumbprint });
  const body = b64({
    aud: `${config.loginBase}/${config.tenantId}/oauth2/v2.0/token`,
    iss: cred.clientId, sub: cred.clientId, jti: randomUUID(), nbf: iat, iat, exp: iat + 600,
  });
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(cred.keyPem).toString("base64url");
  return `${head}.${body}.${signature}`;
}

export type GraphResponse = { status: number; json: Record<string, unknown> | null; headers: Headers; bytes?: ArrayBuffer };
export type GraphRequest = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  raw?: boolean;
};

export class Graph {
  private tokens = new Map<string, Token>();
  constructor(readonly config: MailConfig, private readonly fetcher: typeof fetch = fetch) {}

  get mailbox() {
    return `/users/${encodeURIComponent(this.config.mailboxId)}`;
  }

  private async token(cred: Credential) {
    const cached = this.tokens.get(cred.name);
    if (cached && cached.expires > Date.now() + 60_000) return cached.value;
    const form = new URLSearchParams({
      client_id: cred.clientId,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion(this.config, cred),
    });
    let res: Response;
    try {
      res = await this.fetcher(`${this.config.loginBase}/${this.config.tenantId}/oauth2/v2.0/token`, {
        method: "POST", body: form, signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GraphError(0, "token-unreachable");
    }
    const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
    if (!res.ok || !json?.access_token) throw new GraphError(res.status, json?.error ?? "token-refused");
    this.tokens.set(cred.name, { value: json.access_token, expires: Date.now() + (json.expires_in ?? 3000) * 1000 });
    return json.access_token;
  }

  // Absolute URLs (nextLink, deltaLink) must point at the configured Graph endpoint.
  url(path: string) {
    if (/^https?:\/\//.test(path)) {
      if (!path.startsWith(this.config.graphBase + "/")) throw new GraphError(0, "foreign-link");
      return path;
    }
    return this.config.graphBase + path;
  }

  async call(credName: "read" | "send", path: string, req: GraphRequest = {}): Promise<GraphResponse> {
    const cred = credName === "send" ? this.config.send : this.config.read;
    const token = await this.token(cred);
    let res: Response;
    try {
      res = await this.fetcher(this.url(path), {
        method: req.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Prefer: 'IdType="ImmutableId"',
          ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...req.headers,
        },
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(req.timeoutMs ?? 30_000),
        redirect: "error",
      });
    } catch {
      throw new GraphUncertain("network");
    }
    if (res.status >= 500 || res.status === 429) throw Object.assign(new GraphUncertain(`status ${res.status}`), { status: res.status });
    if (req.raw && res.ok) return { status: res.status, json: null, headers: res.headers, bytes: await res.arrayBuffer() };
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try { json = text ? (JSON.parse(text) as Record<string, unknown>) : null; } catch { json = null; }
    if (!res.ok) {
      const code = (json?.error as { code?: string } | undefined)?.code ?? "error";
      throw new GraphError(res.status, code);
    }
    return { status: res.status, json, headers: res.headers };
  }
}
