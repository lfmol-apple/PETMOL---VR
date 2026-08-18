#!/usr/bin/env bash
# Read-only: checks the exact facts a docs-alignment plan claims about the
# VPS's version/deploy layout, so we don't write documentation based on
# unverified assertions.
set -uo pipefail

echo "--- /opt/petmol/REVISION ---"
cat /opt/petmol/REVISION 2>&1 || echo "MISSING"

echo "--- /opt/petmol/app/REVISION (is it a symlink?) ---"
ls -la /opt/petmol/app/REVISION 2>&1 || echo "MISSING"

echo "--- /opt/petmol/current -> ---"
readlink -f /opt/petmol/current 2>&1 || echo "MISSING/NOT A SYMLINK"

echo "--- /opt/petmol/current/REVISION (if any) ---"
cat /opt/petmol/current/REVISION 2>&1 || echo "MISSING"

echo "--- version.json on 127.0.0.1:3000 ---"
curl -sS --max-time 5 http://127.0.0.1:3000/version.json 2>&1 || echo "REQUEST FAILED"
echo ""

echo "--- manifest.json in current release (if present) ---"
find /opt/petmol/current -maxdepth 2 -iname "manifest.json" 2>&1 | head -5
MANIFEST=$(find /opt/petmol/current -maxdepth 2 -iname "manifest.json" 2>/dev/null | head -1)
[ -n "$MANIFEST" ] && cat "$MANIFEST" 2>&1

echo "--- /opt/petmol/app (legacy dir — still present?) ---"
ls -la /opt/petmol/app 2>&1 | head -5

echo "--- git rev-parse in whichever tree /opt/petmol/app is (if a git repo) ---"
git -C /opt/petmol/app rev-parse HEAD 2>&1 || echo "not a git repo / no HEAD"

echo "--- releases dir ---"
ls -la /opt/petmol/releases 2>&1 | head -10
