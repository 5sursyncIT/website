#!/bin/sh
# Sauvegarde complète : les deux bases et les fichiers des deux applications.
# Corrigé le 10/10/2026 : la version précédente faisait le pg_dump de la base de
# PRODUCTION mais l'archive des fichiers via le service "app", qui est la
# PRÉPRODUCTION (le service app-production n'existe qu'avec compose.production.yaml).
# Les noms de fichiers suivent la convention des sauvegardes manuelles récentes.
set -eu
cd /home/inaops/5sursync
umask 077
backup_dir="backups/$(date -u +%Y%m%dT%H%M%SZ)"
PROD="-f compose.yaml -f compose.production.yaml"
# Chaque issue est enregistrée dans app_backup_events, que /crm/systeme lit. Un échec
# est enregistré aussi : sinon une sauvegarde silencieusement cassée se lit comme
# « aucune sauvegarde ». reference et detail sont des chaînes du script, jamais une entrée externe.
record() {
  sudo -n docker compose exec -T postgres psql -q -U syncit -d syncit \
    -c "INSERT INTO app_backup_events(kind,outcome,reference,size_bytes,detail) VALUES('backup','$1','$2',${3:-NULL},'${4:-}')" \
    >/dev/null 2>&1 || echo "note : sauvegarde non enregistrée (table app_backup_events absente tant que la migration n'est pas appliquée)" >&2
}
fail() { record failed "$backup_dir" NULL "$1"; echo "ÉCHEC : $1" >&2; exit 1; }
mkdir -p "$backup_dir"
# Bases : production puis préproduction.
sudo -n docker compose exec -T postgres pg_dump -U syncit -d syncit -Fc > "$backup_dir/syncit.dump" || fail "pg_dump syncit"
sudo -n docker compose exec -T postgres pg_dump -U syncit -d syncit_preprod -Fc > "$backup_dir/syncit_preprod.dump" || fail "pg_dump syncit_preprod"
# Fichiers téléversés : documents privés et médias, pour chaque application.
sudo -n docker compose $PROD exec -T app-production tar -C /app/storage -czf - private media > "$backup_dir/files-production.tar.gz" || fail "archive des fichiers de production"
sudo -n docker compose exec -T app tar -C /app/storage -czf - private media > "$backup_dir/files-preprod.tar.gz" || fail "archive des fichiers de préproduction"
# De quoi reconstruire l'environnement : composition, verrou de dépendances, image déployée.
cp compose.yaml compose.production.yaml package-lock.json "$backup_dir/" 2>/dev/null || true
sudo -n docker inspect 5sursync-app-production-1 --format '{{.Config.Image}}' > "$backup_dir/image-production.txt" 2>/dev/null || true
record ok "$backup_dir" "$(du -sb "$backup_dir" | cut -f1)" ""
printf '%s\n' "$backup_dir"
