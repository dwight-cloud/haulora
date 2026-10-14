#!/usr/bin/env bash
set -euo pipefail

# Usage: ./deploy.sh user@your-vps /opt/logisticmind
HOST="${1:?ssh target required (e.g. root@1.2.3.4)}"
REMOTE_DIR="${2:-/opt/logisticmind}"

echo "→ Syncing source to $HOST:$REMOTE_DIR"
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env --exclude .env.local --exclude data \
  ./ "$HOST:$REMOTE_DIR/"

echo "→ Building and restarting containers"
ssh "$HOST" "cd $REMOTE_DIR && docker compose up -d --build"

echo "✓ Deployed."
