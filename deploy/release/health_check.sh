#!/bin/bash
# PETMOL — health checks for an activated release. Runs on the VPS.
# Usage: health_check.sh essential|optional
#
# essential: the only checks allowed to fail a deploy / trigger a rollback.
# optional:  everything else — logs a warning, never fails the script.
set -uo pipefail

MODE="${1:-essential}"

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; }

check_http() {
    local name="$1" url="$2" pattern="$3" attempts="${4:-15}" delay="${5:-2}"
    local code=""
    for ((i = 1; i <= attempts; i++)); do
        code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || true)
        if [[ "$code" =~ $pattern ]]; then
            pass "$name: HTTP $code"
            return 0
        fi
        [ "$i" -lt "$attempts" ] && sleep "$delay"
    done
    fail "$name: HTTP ${code:-000} (expected pattern: $pattern)"
    return 1
}

if [ "$MODE" = "essential" ]; then
    FAILED=0
    check_http "API health"    "http://127.0.0.1:8000/health" '^200$'         20 2 || FAILED=1
    check_http "Frontend home" "http://127.0.0.1:3000/"        '^(200|307|308)$' 20 2 || FAILED=1
    exit "$FAILED"
fi

# Non-essential: never fail the script's exit code, just report.
check_http "API /suggest" "http://127.0.0.1:8000/suggest?q=racao&country=BR&limit=3" '^200$' 5 1 || true
check_http "sw.js"        "http://127.0.0.1:3000/sw.js"                              '^200$' 5 1 || true
check_http "VAPID key"    "http://127.0.0.1:8000/notifications/vapid-public-key"     '^200$' 5 1 || true
exit 0
