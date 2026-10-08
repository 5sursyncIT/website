#!/bin/sh
set -eu
cd /home/inaops/5sursync
umask 077
backup_dir="backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
sudo -n docker compose exec -T postgres pg_dump -U syncit -d syncit -Fc > "$backup_dir/database.dump"
sudo -n docker compose exec -T app tar -C /app/storage -czf - private media > "$backup_dir/files.tar.gz"
cp compose.yaml package-lock.json "$backup_dir/"
printf '%s\n' "$backup_dir"
