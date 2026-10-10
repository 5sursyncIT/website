// Standalone fake SMTP submission server for the browser bench (tests/mail-imap-run.sh):
// STARTTLS on 2587 (test authority) and a control endpoint on 8025 to read what it received
// and to switch modes. Internal Docker network only; nothing is relayed anywhere.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { startFakeSmtp, type SmtpMode } from "./fake-smtp";

const fake = await startFakeSmtp({
  key: readFileSync("/certs/smtp.key", "utf8"), cert: readFileSync("/certs/smtp.crt", "utf8"),
  user: process.env.FAKE_SMTP_USER ?? "", password: readFileSync("/certs/pw", "utf8").trim(), port: 2587,
});
createServer((req, res) => {
  if (req.method === "POST" && req.url?.startsWith("/mode/")) {
    fake.setMode(req.url.slice(6) as SmtpMode);
    res.end("ok");
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({
    mode: fake.state.mode, connections: fake.state.connections, authFailures: fake.state.authFailures,
    received: fake.state.received.map((r) => ({ from: r.from, to: r.to, user: r.user, raw: r.raw.toString("base64") })),
  }));
}).listen(8025, "0.0.0.0");
console.log("fake smtp ready");
