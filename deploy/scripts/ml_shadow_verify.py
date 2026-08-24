#!/usr/bin/env python3
"""Backend-only shadow-mode verification for the Mercado Livre provider.

Run on the VPS only, from services/price-service/, by
.github/workflows/ml-shadow-mode-configure.yml — never invoked through any
public HTTP route, so this never exposes an ML offer to a tutor.

    cd /opt/petmol/current/services/price-service
    .venv/bin/python3 /path/to/ml_shadow_verify.py

Prints only non-sensitive confirmation: whether a token was acquired (never
the token itself), how many results a real search returned, and a few
public product fields (title/brand/price/gtin) for manual sanity-check of
the conservative brand/name/size/GTIN matching.
"""
from __future__ import annotations

import asyncio
import os
import re
import sys

ENV_FILE = "/opt/petmol/shared/env/api.env"
WANTED_KEYS = {
    "MERCADOLIVRE_CLIENT_ID",
    "MERCADOLIVRE_CLIENT_SECRET",
    "ENABLE_ML_PROVIDER",
    "MERCADOLIVRE_PUBLIC_OFFERS_ENABLED",
    "MERCADOLIVRE_AFFILIATE_ENABLED",
}
KEY_PATTERN = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")

TEST_QUERY = "Royal Canin Urinary S/O Small Dog 7,5 kg"


def _load_ml_env() -> None:
    # Deliberately does NOT bash-source the file (a value elsewhere in it
    # with spaces/parens has broken naive `source` before) — only pulls the
    # specific keys this check needs, line by line.
    with open(ENV_FILE, "r") as f:
        for line in f:
            s = line.rstrip("\n")
            if not s.strip() or s.lstrip().startswith("#"):
                continue
            m = KEY_PATTERN.match(s)
            if m and m.group(1) in WANTED_KEYS:
                os.environ[m.group(1)] = m.group(2)


async def main() -> int:
    _load_ml_env()

    sys.path.insert(0, ".")
    from src.providers.mercadolivre import mercadolivre_provider  # noqa: E402

    try:
        token = await mercadolivre_provider._token_client.get_access_token()
        print(f"TOKEN_ACQUIRED: yes (value not shown, length={len(token)})")
    except Exception as exc:
        print(f"TOKEN_ACQUIRED: no ({type(exc).__name__})")
        return 1

    results = await mercadolivre_provider.search(
        query=TEST_QUERY,
        country="BR",
        product_type="food",
        limit=5,
    )
    print(f"SEARCH_RESULT_COUNT: {len(results)}")
    for r in results[:3]:
        print(f"MATCH: title={r.title!r} brand={r.brand!r} price={r.price} gtin={r.gtin}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
