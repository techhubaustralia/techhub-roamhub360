#!/bin/sh
# Fire a RoamHub360 scheduled-jobs task from the host cron. Reads JOBS_SECRET from the stack's .env so
# the secret never sits in the crontab, hits the app on its local port (no round-trip through Caddy),
# and logs one line per run with the HTTP status + response so a failing job is visible.
#
#   */30 * * * * sh /root/roamhub360/scripts/jobs-tick.sh tick     # reminders, auto-release, checkout, digest, licence checks
#   0 7 1 * *    sh /root/roamhub360/scripts/jobs-tick.sh report   # monthly ROI report to workspace admins
#
# Tasks: tick | reminder | checkin | checkout | auto-release | auto-checkout | digest | license-check | audit-prune | report
set -u

DIR=${ROAMHUB_DIR:-/root/roamhub360}
PORT=${APP_PORT:-3100}
LOG=${JOBS_LOG:-/var/log/roamhub360-jobs.log}
TASK=${1:-tick}

SECRET=$(grep -E '^JOBS_SECRET=' "$DIR/.env" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')
if [ -z "$SECRET" ]; then
  echo "[$(date -u +%FT%TZ)] $TASK ERROR: JOBS_SECRET not found in $DIR/.env" >> "$LOG"
  exit 1
fi

RESP=$(curl -sS -m 120 -w '\n%{http_code}' -H "x-jobs-secret: $SECRET" "http://127.0.0.1:$PORT/api/jobs/$TASK" 2>&1)
CODE=$(printf '%s' "$RESP" | tail -n1)
BODY=$(printf '%s' "$RESP" | sed '$d' | tr -d '\n' | cut -c1-300)
echo "[$(date -u +%FT%TZ)] $TASK HTTP $CODE $BODY" >> "$LOG"
[ "$CODE" = "200" ]
