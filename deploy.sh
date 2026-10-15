#!/usr/bin/env bash
# Deploy Haulio to a single Docker host over SSH.
#
#   ./deploy.sh teoh-lightsail /opt/haulio [--with-data]
#
# --with-data  also ships the local SQLite file (warmed HERE routes, eval
#              results, run history). Use on first deploy or to reset the demo.
set -euo pipefail
HOST="${1:?ssh target required}"
REMOTE_DIR="${2:-/opt/haulio}"
WITH_DATA="${3:-}"

echo "→ Syncing source to $HOST:$REMOTE_DIR"
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env --exclude .env.local --exclude data --exclude tsconfig.tsbuildinfo \
  ./ "$HOST:$REMOTE_DIR/"

echo "→ Shipping environment (.env.local → .env)"
rsync -az .env.local "$HOST:$REMOTE_DIR/.env"
ssh "$HOST" "chmod 600 $REMOTE_DIR/.env"

if [[ "$WITH_DATA" == "--with-data" ]]; then
  echo "→ Shipping database"
  sqlite3 data/copilot.db "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
  ssh "$HOST" "mkdir -p $REMOTE_DIR/data"
  rsync -az data/copilot.db "$HOST:$REMOTE_DIR/data/haulio.db"
fi
# The container runs as uid 1001; the bind-mounted data dir must be writable by it.
ssh "$HOST" "mkdir -p $REMOTE_DIR/data && sudo chown -R 1001:1001 $REMOTE_DIR/data"

echo "→ Building and restarting containers"
ssh "$HOST" "cd $REMOTE_DIR && docker compose up -d --build 2>&1 | tail -5"

echo "→ Health"
sleep 3
ssh "$HOST" "curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost/"
echo "✓ Deployed."
