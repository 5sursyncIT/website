#!/bin/bash
# CRM ↔ contact@ throwaway stack: internal Docker network (no Internet), ephemeral
# PostgreSQL *_test, fake Graph (tests/fake-graph.ts), test-only certificates generated
# here, fixture accounts only. Nothing reaches Microsoft; no mail leaves.
set -u
IMG=${1:?image}
QA=$(cd "$(dirname "$0")" && pwd)
OUT=$QA/out-mail; rm -rf "$OUT"; mkdir -p "$OUT/certs"; chmod 777 "$OUT"
N=synmail-test
D="sudo -n docker"
cleanup() { $D rm -f synmail-app synmail-db synmail-graph >/dev/null 2>&1; $D network rm $N >/dev/null 2>&1; }
cleanup
$D network create --internal $N >/dev/null
$D run -d --name synmail-db --network $N -e POSTGRES_DB=syncit_test -e POSTGRES_USER=syncit \
  -e POSTGRES_PASSWORD=fixture-db-pass postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24 >/dev/null
until $D logs synmail-db 2>&1 | grep -q "PostgreSQL init process complete"; do sleep 1; done
until $D exec synmail-db pg_isready -U syncit -d syncit_test >/dev/null 2>&1; do sleep 1; done
ENV=(-e DATABASE_URI=postgres://syncit:fixture-db-pass@synmail-db:5432/syncit_test
     -e PAYLOAD_SECRET=fixture-payload-secret-not-real-0123456789
     -e APP_ORIGIN=http://localhost:3000 -e ADMIN_ORIGIN=http://localhost:3000
     -e BOOTSTRAP_ADMIN_EMAIL=admin@example.test
     -e PRIVATE_UPLOAD_PATH=/app/storage/private -e MEDIA_STORAGE_PATH=/app/storage/media)
for i in 1 2 3; do
  $D run --rm --network $N "${ENV[@]}" "$IMG" npx payload migrate > "$OUT/migrate.log" 2>&1
  grep -q "Done." "$OUT/migrate.log" && break; echo "migrate retry $i"; sleep 3
done
grep -q "Migrated:  20261008_173554_crm_mail" "$OUT/migrate.log" || { echo MIGRATE_FAILED; cleanup; exit 3; }
echo MIGRATED

# 1. Server-side integration (in-process fake Graph, real PostgreSQL).
$D run --rm --network $N "${ENV[@]}" -v "$QA":/app/tests:ro "$IMG" npx tsx tests/mail-integration.ts > "$OUT/integration.log" 2>&1
IRC=$?
grep -c "^PASS" "$OUT/integration.log"; tail -2 "$OUT/integration.log"

# 2. Browser run on its own fresh database (the integration run created admins).
$D exec synmail-db createdb -U syncit syncit_e2e_test
ENV=("${ENV[@]/syncit_test/syncit_e2e_test}")
$D run --rm --network $N "${ENV[@]}" "$IMG" npx payload migrate > "$OUT/migrate-e2e.log" 2>&1
grep -q "Done." "$OUT/migrate-e2e.log" || { echo MIGRATE_E2E_FAILED; cleanup; exit 3; }
# Test-only certificates (never used anywhere else), fake Graph, app with mail enabled.
for n in read send; do
  openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes -subj "/CN=fixture $n" -keyout "$OUT/certs/$n.key" -out "$OUT/certs/$n.crt" 2>/dev/null
done
chmod 644 "$OUT"/certs/*
TENANT=17ea5f54-f67a-4949-b5b9-92a78a9d4fe7; MBX=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
RC_ID=11111111-1111-1111-1111-111111111111; SC_ID=22222222-2222-2222-2222-222222222222
$D run -d --name synmail-graph --network $N -v "$QA":/app/tests:ro -v "$OUT/certs":/certs:ro \
  -e FAKE_TENANT=$TENANT -e FAKE_MAILBOX_ID=$MBX -e FAKE_MAILBOX_ADDRESS=contact@5sursync.com \
  -e FAKE_READ_CLIENT=$RC_ID -e FAKE_READ_CERT=/certs/read.crt -e FAKE_SEND_CLIENT=$SC_ID -e FAKE_SEND_CERT=/certs/send.crt \
  "$IMG" npx tsx tests/fake-graph.ts >/dev/null
MAILENV=(-e MAIL_ENABLED=true -e MAIL_GRAPH_BASE=http://synmail-graph:8080/v1.0 -e MAIL_LOGIN_BASE=http://synmail-graph:8080
  -e MAIL_TENANT_ID=$TENANT -e MAIL_MAILBOX_ID=$MBX -e MAIL_MAILBOX_ADDRESS=contact@5sursync.com
  -e MAIL_READ_CLIENT_ID=$RC_ID -e MAIL_READ_KEY_FILE=/certs/read.key -e MAIL_READ_CERT_FILE=/certs/read.crt
  -e MAIL_SEND_CLIENT_ID=$SC_ID -e MAIL_SEND_KEY_FILE=/certs/send.key -e MAIL_SEND_CERT_FILE=/certs/send.crt
  -e MAIL_SEND_ALLOWLIST=test@example.test)
$D run -d --name synmail-app --network $N "${ENV[@]}" "${MAILENV[@]}" -v "$OUT/certs":/certs:ro "$IMG" >/dev/null
for i in $(seq 90); do $D exec synmail-app node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' 2>/dev/null && break; sleep 2; done
echo APP_HEALTHY
# First administrator through the private path (no X-Real-IP), then the "send" right as the
# production migration gives it to the owner.
$D exec synmail-app node -e 'fetch("http://localhost:3000/api/cms/admins/first-register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"admin@example.test",password:"fixture-password-123456",name:"Propriétaire Fixture"})}).then(r=>console.log("first-register",r.status))'
$D exec synmail-db psql -U syncit -d syncit_e2e_test -qc "UPDATE admins SET mail_access='send' WHERE email='admin@example.test'"
$D run --rm --network container:synmail-app -v "$QA":/qa:ro -v "$OUT":/out \
  syncux-playwright:1.55 python3 /qa/mail-e2e.py
RC=$?
$D logs synmail-app 2>&1 | grep -iE "error|warn" | head -20 > "$OUT/app-errors.log"
$D exec synmail-db psql -U syncit -d syncit_e2e_test -Atc "SELECT action, channel, admin_id IS NOT NULL FROM crm_mail.events ORDER BY id" > "$OUT/events.txt"
cleanup
echo "INTEGRATION $IRC E2E $RC"
[ $IRC -eq 0 ] && [ $RC -eq 0 ]
