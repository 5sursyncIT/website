#!/bin/sh
set -eu
cd /home/inaops/5sursync
sudo -n docker compose ps
curl --fail --silent http://127.0.0.1:3105/api/health
for route in / /services /realisations /a-propos /contact /reseaux-cloud /solutions-metier /developpement-api /maintenance-support /support/connexion; do
  code=$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:3105$route")
  test "$code" = 200
  printf '%s %s\n' "$code" "$route"
done
sudo -n docker compose exec -T postgres psql -U syncit -d syncit -Atc 'SELECT COUNT(*) FROM pages; SELECT COUNT(*) FROM admins; SELECT COUNT(*) FROM client_accounts;'
sudo -n nginx -t
systemctl is-active nginx ssh docker
