#!/usr/bin/env python3
"""Refresh prices for already validated commerce offers.

Does not create new merchant links and does not replace SKUs.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.commerce_price_refresh import refresh_marketplace_prices  # noqa: E402
from src.db import SessionLocal  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--merchant", default="shopee", choices=["shopee"])
    parser.add_argument("--max-offers", type=int, default=200)
    parser.add_argument("--delay-seconds", type=float, default=0.4)
    parser.add_argument("--search-limit", type=int, default=20)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = refresh_marketplace_prices(
            db,
            merchant=args.merchant,
            max_offers=args.max_offers,
            delay_seconds=args.delay_seconds,
            search_limit=args.search_limit,
        )
    finally:
        db.close()

    print(
        "merchant={merchant} processed={processed} refreshed={refreshed} "
        "unchanged={unchanged} unavailable={unavailable} identity_conflict={identity_conflict} "
        "api_error={api_error} timeout={timeout} remaining={remaining} duration_seconds={duration_seconds}".format(
            **result.__dict__
        )
    )
    # The job is item-isolated. A transient API error is observable in the
    # summary but should not make systemd mark the whole night as failed.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
