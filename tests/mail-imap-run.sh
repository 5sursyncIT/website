#!/bin/bash
# CRM ↔ Simafri mailbox (SMTP/IMAP) throwaway bench: internal Docker network (no Internet),
# ephemeral PostgreSQL *_test, a real IMAP server (Dovecot, tests/imap/dovecot.conf), the
# fake SMTP server (tests/fake-smtp.ts, inside the test process), certificates from a test
# authority generated here and used nowhere else, fixture addresses only. No mail leaves.
# Usage: tests/mail-imap-run.sh <image>   (or "src": node image + this working tree)
set -u
IMG=${1:?image or src}
QA=$(cd "$(dirname "$0")" && pwd); ROOT=$(dirname "$QA")
OUT=$QA/out-mail-imap; rm -rf "$OUT"; mkdir -p "$OUT/certs"; chmod 777 "$OUT"
N=synimap-test
D="sudo -n docker"
NODE=node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
cleanup() { $D rm -f synimap-app synimap-smtp synimap-db synimap-imap >/dev/null 2>&1; $D network rm $N >/dev/null 2>&1; }
cleanup
# Test authority and certificates (imap.test, smtp.test only: wrong-*.test must be refused).
C=$OUT/certs
openssl req -x509 -newkey rsa:2048 -sha256 -days 30 -nodes -subj "/CN=5sursync test CA" -keyout "$C/ca.key" -out "$C/ca.crt" 2>/dev/null
for h in imap smtp; do
  openssl req -newkey rsa:2048 -nodes -subj "/CN=$h.test" -keyout "$C/$h.key" -out "$C/$h.csr" 2>/dev/null
  printf "subjectAltName=DNS:%s.test\nextendedKeyUsage=serverAuth\n" "$h" > "$C/$h.ext"
  openssl x509 -req -in "$C/$h.csr" -CA "$C/ca.crt" -CAkey "$C/ca.key" -CAcreateserial -days 30 -sha256 -extfile "$C/$h.ext" -out "$C/$h.crt" 2>/dev/null
done
rm -f "$C/ca.key" "$C"/*.csr "$C"/*.ext "$C"/*.srl
printf 'fixture-imap-pass' > "$C/pw"   # same fixture password as tests/imap/dovecot.conf
chmod 644 "$C"/*
$D network create --internal $N >/dev/null
$D run -d --name synimap-db --network $N -e POSTGRES_DB=syncit_test -e POSTGRES_USER=syncit \
  -e POSTGRES_PASSWORD=fixture-db-pass postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24 >/dev/null
$D run -d --name synimap-imap --network $N --network-alias imap.test --network-alias wrong-imap.test \
  -v "$QA/imap/dovecot.conf":/etc/dovecot/dovecot.conf:ro -v "$C":/certs:ro --tmpfs /srv/mail:uid=1000,gid=1000 \
  dovecot/dovecot:2.3.21.1@sha256:547d28f9a893c93a1d2f6dc164880cd7bfa74009106dfa46b36a6a2ee636d921 >/dev/null
until $D logs synimap-db 2>&1 | grep -q "PostgreSQL init process complete"; do sleep 1; done
until $D exec synimap-db pg_isready -U syncit -d syncit_test >/dev/null 2>&1; do sleep 1; done
ENV=(-e DATABASE_URI=postgres://syncit:fixture-db-pass@synimap-db:5432/syncit_test
     -e PAYLOAD_SECRET=fixture-payload-secret-not-real-0123456789
     -e APP_ORIGIN=http://localhost:3000 -e ADMIN_ORIGIN=http://localhost:3000
     -e BOOTSTRAP_ADMIN_EMAIL=admin@example.test
     -e PRIVATE_UPLOAD_PATH=/app/storage/private -e MEDIA_STORAGE_PATH=/app/storage/media)
if [ "$IMG" = src ]; then
  RUN=(-u 1001:1001 -e HOME=/tmp -v "$ROOT":/app -w /app "$NODE")
else
  RUN=(-v "$QA":/app/tests:ro "$IMG")
fi
for i in 1 2 3; do
  $D run --rm --network $N "${ENV[@]}" "${RUN[@]}" npx payload migrate > "$OUT/migrate.log" 2>&1
  grep -q "Done." "$OUT/migrate.log" && break; echo "migrate retry $i"; sleep 3
done
grep -q "20261009_150000_crm_mail_imap" "$OUT/migrate.log" || { echo MIGRATE_FAILED; tail -20 "$OUT/migrate.log"; cleanup; exit 3; }
echo MIGRATED
$D run --rm --network $N --network-alias smtp.test --network-alias wrong-smtp.test "${ENV[@]}" -v "$C":/certs:ro "${RUN[@]}" \
  npx tsx tests/mail-imap-integration.ts > "$OUT/integration.log" 2>&1
IRC=$?
grep -c "^PASS" "$OUT/integration.log"; tail -3 "$OUT/integration.log"
RC=0
if [ "$IMG" != src ]; then
  # 2. Browser run: app with the Simafri provider pointed at the test servers, own database.
  $D exec synimap-db createdb -U syncit syncit_e2e_test
  ENV=("${ENV[@]/syncit_test/syncit_e2e_test}")
  for i in 1 2 3; do
    $D run --rm --network $N "${ENV[@]}" "$IMG" npx payload migrate > "$OUT/migrate-e2e.log" 2>&1
    grep -q "Done." "$OUT/migrate-e2e.log" && break; echo "migrate e2e retry $i"; sleep 3
  done
  grep -q "Done." "$OUT/migrate-e2e.log" || { echo MIGRATE_E2E_FAILED; cleanup; exit 3; }
  $D run -d --name synimap-smtp --network $N --network-alias smtp.test -e FAKE_SMTP_USER=contact@crm.example.test \
    -v "$QA":/app/tests:ro -v "$C":/certs:ro "$IMG" npx tsx tests/fake-smtp-server.ts >/dev/null
  MAILENV=(-e MAIL_ENABLED=true -e MAIL_PROVIDER=imap -e MAIL_ADDRESS=contact@crm.example.test
    -e MAIL_SMTP_HOST=smtp.test -e MAIL_SMTP_PORT=2587 -e MAIL_IMAP_HOST=imap.test -e MAIL_IMAP_PORT=993
    -e MAIL_PASSWORD_FILE=/certs/pw -e MAIL_TLS_CA_FILE=/certs/ca.crt -e MAIL_SEND_ALLOWLIST=awa@alpha.example.test)
  $D run -d --name synimap-app --network $N "${ENV[@]}" "${MAILENV[@]}" -v "$C":/certs:ro "$IMG" >/dev/null
  for i in $(seq 90); do $D exec synimap-app node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' 2>/dev/null && break; sleep 2; done
  echo APP_HEALTHY
  # Connection check without sending (scripts/mail-imap-check.ts), same environment as the app.
  $D exec synimap-app npx tsx scripts/mail-imap-check.ts > "$OUT/check.log" 2>&1; echo "CHECK $?" >> "$OUT/check.log"
  cat "$OUT/check.log"
  $D exec synimap-app node -e 'fetch("http://localhost:3000/api/cms/admins/first-register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"admin@example.test",password:"fixture-password-123456",name:"Propriétaire Fixture"})}).then(r=>console.log("first-register",r.status))'
  $D exec synimap-db psql -U syncit -d syncit_e2e_test -qc "UPDATE admins SET mail_access='send' WHERE email='admin@example.test'"
  $D run --rm --network container:synimap-app -v "$QA":/qa:ro -v "$OUT":/out -v "$C":/certs:ro \
    syncux-playwright:1.55 python3 /qa/mail-imap-e2e.py > "$OUT/e2e.log" 2>&1
  RC=$?
  tail -3 "$OUT/e2e.log"
  $D logs synimap-app 2>&1 | grep -iE "error|warn" | head -20 > "$OUT/app-errors.log"
  $D exec synimap-db psql -U syncit -d syncit_e2e_test -Atc "SELECT action, channel, admin_id IS NOT NULL FROM crm_mail.events ORDER BY id" > "$OUT/events.txt"
fi
$D logs synimap-imap 2>&1 | grep -iE "error|fatal|panic" | head -20 > "$OUT/imap-errors.log"
cleanup
echo "INTEGRATION $IRC E2E $RC"
[ $IRC -eq 0 ] && [ $RC -eq 0 ]
