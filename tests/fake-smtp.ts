// Test double of the Simafri SMTP submission server (port 587, STARTTLS, AUTH after TLS
// only). Used by tests/mail-imap-integration.ts on an internal Docker network: nothing
// leaves. Modes reproduce the outcomes the CRM must tell apart.
import { createRequire } from "node:module";
const load = createRequire(import.meta.url);

export type SmtpMode = "ok" | "reject-rcpt" | "partial" | "tempfail-data" | "drop-after-data";
export type Received = { from: string; to: string[]; raw: Buffer; user: string };
type Session = { id: string; user?: string; envelope: { mailFrom: { address: string } | false; rcptTo: { address: string }[] } };
type Server = { listen(port: number, host: string, cb: () => void): void; close(cb: () => void): void; connections: Set<{ id: string; _socket: { destroy(): void } }> };

export async function startFakeSmtp(o: { key: string; cert: string; user: string; password: string; port: number }) {
  const { SMTPServer } = load("smtp-server") as { SMTPServer: new (opts: Record<string, unknown>) => Server };
  const state = { mode: "ok" as SmtpMode, received: [] as Received[], onAccepted: null as null | ((r: Received) => Promise<void>), authFailures: 0, connections: 0 };
  const err = (code: number, text: string) => Object.assign(new Error(text), { responseCode: code });
  const server: Server = new SMTPServer({
    secure: false, key: o.key, cert: o.cert, allowInsecureAuth: false, authMethods: ["PLAIN", "LOGIN"], logger: false,
    banner: "fake Simafri submission", size: 10 * 1024 * 1024, disabledCommands: [],
    onConnect(_: unknown, cb: (e?: Error) => void) { state.connections++; cb(); },
    onAuth(auth: { username: string; password: string }, session: Session, cb: (e: Error | null, r?: { user: string }) => void) {
      if (auth.username !== o.user || auth.password !== o.password) { state.authFailures++; return cb(err(535, "5.7.8 Authentication failed")); }
      session.user = auth.username;
      cb(null, { user: auth.username });
    },
    onMailFrom(address: { address: string }, _: Session, cb: (e?: Error) => void) {
      if (address.address !== o.user) return cb(err(553, "5.7.1 Sender not owned by authenticated user"));
      cb();
    },
    onRcptTo(address: { address: string }, _: Session, cb: (e?: Error) => void) {
      if (state.mode === "reject-rcpt" || (state.mode === "partial" && address.address.includes("refuse")))
        return cb(err(550, "5.1.1 <" + address.address + ">: Recipient address rejected: User unknown"));
      cb();
    },
    onData(stream: NodeJS.ReadableStream, session: Session, cb: (e?: Error | null, msg?: string) => void) {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", async () => {
        const r: Received = { from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "", to: session.envelope.rcptTo.map((x) => x.address), raw: Buffer.concat(chunks), user: session.user ?? "" };
        if (state.mode === "tempfail-data") return cb(err(451, "4.3.0 Temporary failure, try again later"));
        state.received.push(r);
        if (state.mode === "drop-after-data") {
          // The message reached the server, the reply never reaches the client.
          for (const c of server.connections) if (c.id === session.id) c._socket.destroy();
          return;
        }
        if (state.onAccepted) await state.onAccepted(r).catch(() => undefined);
        cb(null, "2.0.0 Ok: queued as FAKE" + state.received.length);
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(o.port, "0.0.0.0", resolve));
  return { state, setMode: (m: SmtpMode) => { state.mode = m; }, close: () => new Promise<void>((resolve) => server.close(resolve)) };
}
