#!/bin/bash
# CRM throwaway stack: internal network, ephemeral PostgreSQL *_test, fixture secrets only.
set -u
IMG=${1:?image}
QA=$(cd "$(dirname "$0")" && pwd)
OUT=$QA/out-crm-limits; rm -rf "$OUT"; mkdir -p "$OUT"; chmod 777 "$OUT"
N=synclim-test
D="sudo -n docker"
cleanup() { $D rm -f synclim-app synclim-db >/dev/null 2>&1; $D network rm $N >/dev/null 2>&1; }
cleanup
$D network create --internal $N >/dev/null
$D run -d --name synclim-db --network $N -e POSTGRES_DB=syncit_test -e POSTGRES_USER=syncit \
  -e POSTGRES_PASSWORD=fixture-db-pass postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24 >/dev/null
until $D logs synclim-db 2>&1 | grep -q "PostgreSQL init process complete"; do sleep 1; done
until $D exec synclim-db pg_isready -U syncit -d syncit_test >/dev/null 2>&1; do sleep 1; done
ENV=(-e DATABASE_URI=postgres://syncit:fixture-db-pass@synclim-db:5432/syncit_test
     -e PAYLOAD_SECRET=fixture-payload-secret-not-real-0123456789
     -e APP_ORIGIN=http://localhost:3000 -e ADMIN_ORIGIN=http://localhost:3000
     -e BOOTSTRAP_ADMIN_EMAIL=admin@example.test
     -e PRIVATE_UPLOAD_PATH=/app/storage/private -e MEDIA_STORAGE_PATH=/app/storage/media
     -e SITE_ORIGIN=https://preprod.5sursync.com)
for i in 1 2 3; do
  $D run --rm --network $N "${ENV[@]}" "$IMG" npx payload migrate > "$OUT/migrate.log" 2>&1
  grep -q "Done." "$OUT/migrate.log" && break; echo "migrate retry $i"; sleep 3
done
grep -c "Migrated:" "$OUT/migrate.log"
grep -q "Done." "$OUT/migrate.log" || { echo MIGRATE_FAILED; cleanup; exit 3; }
$D run --rm --network $N "${ENV[@]}" "$IMG" npm run seed:content 2>&1 | tail -3
$D run -d --name synclim-app --network $N "${ENV[@]}" "$IMG" >/dev/null
for i in $(seq 90); do $D exec synclim-app node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' 2>/dev/null && break; sleep 2; done
echo APP_HEALTHY
$D run --rm --network container:synclim-app -v "$QA":/qa:ro -v "$OUT":/out \
  syncux-playwright:1.55 python3 /qa/crm-limits.py
RC=$?
$D logs synclim-app 2>&1 | grep -iE "error|warn" | grep -v "^$" | head -20 > "$OUT/app-errors.log"
cleanup
echo "EXIT $RC"
exit $RC
