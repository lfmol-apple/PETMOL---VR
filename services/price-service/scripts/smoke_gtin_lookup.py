"""Smoke test for the RSC GTIN integration.

Usage:
  cd services/price-service
  PYTHONPATH=. ../../.venv/bin/python scripts/smoke_gtin_lookup.py 7896006217244
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".secrets" / ".env")
load_dotenv(ROOT / ".env")

from src.gtin_client import (  # noqa: E402
    GtinAuthError,
    GtinConfigError,
    GtinExternalError,
    get_gtin_token,
    get_product_by_gtin,
    get_product_image_url,
    normalize_gtin,
)


async def main() -> int:
    gtin = normalize_gtin(sys.argv[1] if len(sys.argv) > 1 else "7896006217244")
    print(f"[gtin-smoke] GTIN: {gtin}")

    try:
        token = await get_gtin_token()
        print(f"[gtin-smoke] token OK len={len(token)}")

        product = await get_product_by_gtin(gtin)
        if product is None:
            print("[gtin-smoke] produto nao encontrado")
            return 0

        print("[gtin-smoke] produto encontrado:")
        print(json.dumps(product, ensure_ascii=False, indent=2)[:4000])

        image_url = await get_product_image_url(gtin)
        print(f"[gtin-smoke] image_url={image_url}")
        return 0
    except GtinConfigError as exc:
        print(f"[gtin-smoke] CONFIG: {exc}")
        return 2
    except GtinAuthError as exc:
        print(f"[gtin-smoke] AUTH: {exc}")
        return 3
    except GtinExternalError as exc:
        print(f"[gtin-smoke] API: {exc}")
        return 4
    except Exception as exc:
        print(f"[gtin-smoke] ERRO: {exc}")
        return 5


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

