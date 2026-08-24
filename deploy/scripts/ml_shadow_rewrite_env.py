#!/usr/bin/env python3
"""Atomically set the Mercado Livre shadow-mode keys in the backend env file.

Run on the VPS only, by .github/workflows/ml-shadow-mode-configure.yml.

    python3 ml_shadow_rewrite_env.py <secret_file_path> <configure|rollback>

Never bash-sources the env file (a value elsewhere in it containing spaces/
parens has broken a naive `source`-based script before in this repo) —
reads it line by line and only replaces the specific keys it targets. Every
other existing variable in the file is left untouched. Rewrites via a temp
file + os.replace on the same filesystem so the file is never left partially
written, and preserves the original owner/group/mode.
"""
from __future__ import annotations

import os
import re
import stat
import sys

ENV_FILE = "/opt/petmol/shared/env/api.env"
CLIENT_ID = "5264011878653004"

KEY_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=.*$")


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[2] not in ("configure", "rollback"):
        print(f"usage: {sys.argv[0]} <secret_file_path> <configure|rollback>", file=sys.stderr)
        return 2

    secret_file, mode = sys.argv[1], sys.argv[2]

    with open(secret_file, "r") as f:
        client_secret = f.read().strip()

    if mode == "configure" and not client_secret:
        print("ERROR: secret file was empty", file=sys.stderr)
        return 1

    target = {
        "MERCADOLIVRE_CLIENT_ID": CLIENT_ID,
        "ENABLE_ML_PROVIDER": "true" if mode == "configure" else "false",
        "MERCADOLIVRE_PUBLIC_OFFERS_ENABLED": "false",
        "MERCADOLIVRE_AFFILIATE_ENABLED": "false",
    }
    # Only touch the secret line when configuring — rollback leaves whatever
    # secret is already on disk untouched, it just flips the flag back off.
    if mode == "configure":
        target["MERCADOLIVRE_CLIENT_SECRET"] = client_secret

    st = os.stat(ENV_FILE)

    with open(ENV_FILE, "r") as f:
        lines = f.readlines()

    seen: set[str] = set()
    new_lines: list[str] = []
    for line in lines:
        stripped = line.rstrip("\n")
        if "=" in stripped and not stripped.lstrip().startswith("#"):
            key = stripped.split("=", 1)[0]
            if key in target:
                new_lines.append(f"{key}={target[key]}\n")
                seen.add(key)
                continue
        new_lines.append(line)

    for key, value in target.items():
        if key not in seen:
            new_lines.append(f"{key}={value}\n")

    tmp_path = ENV_FILE + ".tmp_ml_rewrite"
    with open(tmp_path, "w") as f:
        f.writelines(new_lines)

    os.chown(tmp_path, st.st_uid, st.st_gid)
    os.chmod(tmp_path, stat.S_IMODE(st.st_mode))
    os.replace(tmp_path, ENV_FILE)

    # Sanity check the result: every non-comment, non-blank line must look
    # like KEY=VALUE.
    bad = 0
    total = 0
    with open(ENV_FILE, "r") as f:
        for line in f:
            s = line.rstrip("\n")
            if not s.strip() or s.lstrip().startswith("#"):
                continue
            total += 1
            if not KEY_PATTERN.match(s):
                bad += 1

    if bad:
        print(f"ERROR: {bad} malformed line(s) out of {total} after rewrite", file=sys.stderr)
        return 1

    print(f"OK: rewrote {len(target)} key(s), {total} total non-comment lines, 0 malformed")
    for key in target:
        if key == "MERCADOLIVRE_CLIENT_SECRET":
            print("MERCADOLIVRE_CLIENT_SECRET: set (value not shown)")
        else:
            print(f"{key}={target[key]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
