#!/bin/sh
# Copy the local RoamHub360 backups offsite with rclone, so a lost droplet is not a lost customer.
# Runs after backup-droplet.sh (cron 16:30 UTC) — schedule this at 17:00 UTC.
#
# One-time setup on the droplet (interactive, do it once):
#   apt-get install -y rclone            # or: curl https://rclone.org/install.sh | bash
#   rclone config                        # create a remote named  roamhub-offsite
#     - DigitalOcean Spaces: type "s3", provider "DigitalOcean", region e.g. syd1, access key + secret
#     - OneDrive (TechHub):  type "onedrive", sign in as the service mailbox in the browser step
#   rclone mkdir roamhub-offsite:roamhub360-backups
#   sh /root/roamhub360/scripts/offsite-sync.sh   # first run by hand, read the log line
#
#   0 17 * * * sh /root/roamhub360/scripts/offsite-sync.sh >> /var/log/roamhub360-backup.log 2>&1
#
# `sync` mirrors the local folder (14-day retention applies offsite too). Change to `copy` if you
# want the offsite side to keep everything forever.
set -u

SRC=${BACKUP_DIR:-/root/backups/roamhub360}
REMOTE=${OFFSITE_REMOTE:-roamhub-offsite:roamhub360-backups}

if ! command -v rclone >/dev/null 2>&1; then
  echo "[$(date -u +%FT%TZ)] offsite ERROR: rclone not installed (see header of this script)" >&2
  exit 1
fi
if ! rclone listremotes 2>/dev/null | grep -q "^${REMOTE%%:*}:$"; then
  echo "[$(date -u +%FT%TZ)] offsite ERROR: rclone remote '${REMOTE%%:*}' not configured (rclone config)" >&2
  exit 1
fi

if rclone sync "$SRC" "$REMOTE" --transfers 2 --checkers 4 --stats 0 -q; then
  N=$(rclone lsf "$REMOTE" 2>/dev/null | wc -l)
  echo "[$(date -u +%FT%TZ)] offsite ok: $N files at $REMOTE"
else
  echo "[$(date -u +%FT%TZ)] offsite ERROR: rclone sync failed (see rclone output above)" >&2
  exit 1
fi
