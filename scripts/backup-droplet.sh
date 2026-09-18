#!/bin/sh
# Nightly backup of the RoamHub360 droplet stack (docker-compose.cohost.yml, project name "roamhub360"):
#   1. Postgres logical dump  (all tenants' bookings, users, licences, audit, …)  -> db-<stamp>.sql.gz
#   2. The appdata volume     (floor plans, floor-plan images, buildings, push subs) -> appdata-<stamp>.tgz
# Keeps KEEP_DAYS (default 14) days locally under /root/backups/roamhub360. Exits non-zero if the
# dump looks empty so a broken backup shows up in the cron log instead of silently "succeeding".
#
#   sh /root/roamhub360/scripts/backup-droplet.sh            # run by hand
#   30 16 * * * sh /root/roamhub360/scripts/backup-droplet.sh >> /var/log/roamhub360-backup.log 2>&1
#
# Restore (fresh database):  gunzip -c db-<stamp>.sql.gz | docker compose -f docker-compose.cohost.yml exec -T db psql -U roamhub roamhub360
# Restore appdata:           docker run --rm -v roamhub360_roamhub_appdata:/data -v /root/backups/roamhub360:/in alpine sh -c 'cd /data && tar xzf /in/appdata-<stamp>.tgz'
# Offsite copy is NOT done here — sync /root/backups/roamhub360 elsewhere (rclone to DO Spaces / OneDrive).
set -eu

DIR=${ROAMHUB_DIR:-/root/roamhub360}
OUT=${BACKUP_DIR:-/root/backups/roamhub360}
KEEP=${KEEP_DAYS:-14}
COMPOSE="docker compose -f $DIR/docker-compose.cohost.yml"
VOLUME=roamhub360_roamhub_appdata
STAMP=$(date +%F-%H%M)

mkdir -p "$OUT"
cd "$DIR"

echo "[$(date -u +%FT%TZ)] backup start -> $OUT"

# 1. Database. --no-owner so the dump restores under any role; -T = no TTY (cron-safe).
$COMPOSE exec -T db pg_dump -U roamhub --no-owner roamhub360 | gzip > "$OUT/db-$STAMP.sql.gz"
SIZE=$(stat -c %s "$OUT/db-$STAMP.sql.gz")
if [ "$SIZE" -lt 2048 ]; then
  echo "[backup] ERROR: db dump is only $SIZE bytes — treating as failed" >&2
  exit 1
fi

# 2. Appdata volume, read-only mount, tarred from inside a throwaway container.
docker run --rm -v "$VOLUME":/data:ro -v "$OUT":/out alpine sh -c "cd /data && tar czf /out/appdata-$STAMP.tgz ."

# 3. Retention.
find "$OUT" -type f \( -name 'db-*.sql.gz' -o -name 'appdata-*.tgz' \) -mtime +"$KEEP" -delete

echo "[$(date -u +%FT%TZ)] backup done: db $(du -h "$OUT/db-$STAMP.sql.gz" | cut -f1), appdata $(du -h "$OUT/appdata-$STAMP.tgz" | cut -f1); $(ls "$OUT" | wc -l) files retained"
