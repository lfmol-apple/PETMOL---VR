#!/bin/bash
# PETMOL — manual rollback: swap `current` back to a previous release.
# Runs on the VPS.
#
# Usage:
#   bash rollback.sh            # rolls back to the most recent release
#                                # other than the one currently active
#   bash rollback.sh <sha>      # rolls back to a specific release SHA
set -euo pipefail

ROOT="/opt/petmol"
RELEASES_DIR="$ROOT/releases"
CURRENT_LINK="$ROOT/current"
LOCK_FILE="$ROOT/.activate.lock"

log()  { echo "[rollback] $*"; }
fail() { echo "[rollback][FAIL] $*" >&2; exit 1; }

CURRENT_SHA=""
[ -L "$CURRENT_LINK" ] && CURRENT_SHA="$(basename "$(readlink "$CURRENT_LINK")")"

TARGET_SHA="${1:-}"
if [ -z "$TARGET_SHA" ]; then
    TARGET_SHA="$(cd "$RELEASES_DIR" && ls -1t | grep -v -x "$CURRENT_SHA" | head -1)"
fi
[ -n "$TARGET_SHA" ] || fail "No other release found in $RELEASES_DIR to roll back to."
[ -d "$RELEASES_DIR/$TARGET_SHA" ] || fail "Release $TARGET_SHA not found in $RELEASES_DIR."

log "Rolling back: ${CURRENT_SHA:-<none>} -> $TARGET_SHA"

exec 200>>"$LOCK_FILE"
flock -w 30 200 || fail "Could not acquire activation lock within 30s."
echo "pid=$$ sha=$TARGET_SHA at=$(date -u +%FT%TZ) reason=manual_rollback" > "$LOCK_FILE"

ln -sfn "$RELEASES_DIR/$TARGET_SHA" "$CURRENT_LINK"
systemctl restart petmol-api
systemctl restart petmol-web

if bash "$RELEASES_DIR/$TARGET_SHA/deploy/release/health_check.sh" essential; then
    echo "sha=$TARGET_SHA activated_at=$(date -u +%FT%TZ) rolled_back_from=$CURRENT_SHA manual=true" > "$ROOT/REVISION"
    rm -f "$LOCK_FILE"
    log "Rollback to $TARGET_SHA succeeded."
else
    rm -f "$LOCK_FILE"
    fail "Rollback to $TARGET_SHA failed essential health checks — manual intervention needed, production may be down."
fi
