#!/usr/bin/env bash
# Hunt post-deploy hook. Run on the VPS after `git pull` to keep the public
# frontend in sync with deployments/.
#
# The frontend fetches /deployments/Hunt.json from its document root (public/),
# so we expose deployments/ to the static server via a symlink. Without this,
# every page falls back to 0x0 and prints "contract not deployed."
#
# Idempotent. Safe to run on every pull.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOYMENTS="$REPO_ROOT/deployments"
PUBLIC_LINK="$REPO_ROOT/public/deployments"

if [ ! -d "$DEPLOYMENTS" ]; then
  echo "post-deploy: $DEPLOYMENTS not found, skipping symlink" >&2
  exit 1
fi

ln -sfn "$DEPLOYMENTS" "$PUBLIC_LINK"
echo "post-deploy: $PUBLIC_LINK -> $DEPLOYMENTS"
