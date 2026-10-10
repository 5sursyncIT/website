#!/bin/sh
# Prouve qu'une sauvegarde se restaure vraiment, dans une base de contrôle JETABLE
# supprimée à la fin. Ne touche jamais syncit (données de production) et ne démarre
# jamais l'application dessus : le but est un fait enregistré pour /crm/systeme,
# parce que lister un fichier de sauvegarde ne prouve rien.
# Usage : sh deployment/restore-test.sh [backups/<dossier>]
set -eu
cd /home/inaops/5sursync
umask 077
# Deux conventions coexistent dans backups/ : database.dump (deployment/backup.sh) et
# syncit.dump (sauvegardes manuelles avant bascule). Les deux sont acceptées, et seuls
# les dossiers contenant réellement un dump sont candidats — triés par date, pas par nom.
find_dump() {
  for name in database.dump syncit.dump; do
    [ -f "$1/$name" ] && { printf '%s\n' "$1/$name"; return 0; }
  done
  return 1
}
if [ $# -ge 1 ]; then
  dump_dir=$(printf '%s' "$1" | sed 's:/$::')
else
  dump_dir=$(for d in backups/*/; do
      d=${d%/}
      find_dump "$d" >/dev/null 2>&1 && printf '%s\t%s\n' "$(stat -c %Y "$d")" "$d"
    done | sort -n | tail -1 | cut -f2)
fi
[ -n "${dump_dir:-}" ] || { echo "aucune sauvegarde contenant un dump dans backups/" >&2; exit 2; }
dump=$(find_dump "$dump_dir") || { echo "$dump_dir ne contient ni database.dump ni syncit.dump" >&2; exit 2; }
test_db="syncit_restore_test_$(date -u +%Y%m%d%H%M%S)"
record() {
  sudo -n docker compose exec -T postgres psql -q -U syncit -d syncit \
    -c "INSERT INTO app_backup_events(kind,outcome,reference,size_bytes,detail) VALUES('restore-test','$1','$2',NULL,'${3:-}')" \
    >/dev/null 2>&1 || echo "note : test non enregistré (table app_backup_events absente tant que la migration n'est pas appliquée)" >&2
}
drop() { sudo -n docker compose exec -T postgres psql -q -U syncit -d postgres -c "DROP DATABASE IF EXISTS $test_db" >/dev/null 2>&1 || true; }
fail() { drop; record failed "$dump_dir" "$1"; echo "ÉCHEC : $1" >&2; exit 1; }
trap 'drop' EXIT
echo "Sauvegarde testée : $dump ($(du -h "$dump" | cut -f1))"
sudo -n docker compose exec -T postgres psql -q -U syncit -d postgres -c "CREATE DATABASE $test_db" >/dev/null || fail "création de la base de contrôle"
sudo -n docker compose exec -T postgres pg_restore -U syncit -d "$test_db" --no-owner --no-privileges < "$dump" >/dev/null 2>&1 \
  || fail "pg_restore dans la base de contrôle"
# La restauration n'est crédible que si les structures dont dépend le site sont là.
counts=$(sudo -n docker compose exec -T postgres psql -tA -U syncit -d "$test_db" -c \
  "SELECT (SELECT count(*) FROM pages)||'/'||(SELECT count(*) FROM admins)||'/'||(SELECT count(*) FROM clients)||'/'||(SELECT count(*) FROM payload_migrations)") \
  || fail "lecture des tables restaurées"
counts=$(printf '%s' "$counts" | tr -d '\r\n ')
case "$counts" in
  0/*) fail "base restaurée sans aucune page (pages/admins/clients/migrations = $counts)" ;;
esac
record ok "$dump_dir" "pages/admins/clients/migrations = $counts"
echo "Restauration de contrôle réussie : $dump_dir (pages/admins/clients/migrations = $counts)"
echo "Base de contrôle $test_db supprimée ; syncit n'a pas été touchée."
