"""A GTIN that isn't found shouldn't re-hit Cosmos/GTIN on every scan.

No Cosmos/GTIN credentials are configured in the test environment, so both
providers naturally miss without needing to be mocked — this test instead
checks the side effect: ProductLookupQueue.attempts must not increase on a
second lookup within the backoff window, since a second increment would only
happen if the external providers were consulted again instead of the
negative-cache short-circuit kicking in.
"""
from sqlalchemy.orm import sessionmaker

from src.db import engine
from src.product_catalog_lookup import ProductLookupQueue

# A syntactically valid GTIN-13 (correct check digit) that isn't a real product.
UNKNOWN_GTIN = "0000000000017"


def _get_queue_attempts(gtin: str) -> int:
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        row = db.query(ProductLookupQueue).filter(
            ProductLookupQueue.barcode_normalized == gtin
        ).first()
        return row.attempts if row else 0
    finally:
        db.close()


def test_unknown_gtin_is_not_relooked_up_within_backoff_window(client):
    first = client.get(f"/products/lookup/gtin/{UNKNOWN_GTIN}")
    assert first.status_code == 200, first.text
    assert first.json()["queued"] is True
    attempts_after_first = _get_queue_attempts(UNKNOWN_GTIN)
    assert attempts_after_first >= 1

    second = client.get(f"/products/lookup/gtin/{UNKNOWN_GTIN}")
    assert second.status_code == 200, second.text
    assert second.json()["queued"] is True

    attempts_after_second = _get_queue_attempts(UNKNOWN_GTIN)
    assert attempts_after_second == attempts_after_first, (
        "attempts incremented again — the negative cache didn't short-circuit "
        "the second lookup, meaning Cosmos/GTIN would be hit again for the "
        "same known-missing product"
    )


def test_manual_confirmation_clears_the_negative_cache(client):
    """A GTIN the negative cache would otherwise short-circuit must be served
    from the catalog immediately after a tutor manually confirms it — not
    wait out the 24h/7d/30d backoff. save_product_to_catalog already flips
    the queue row to 'resolved' on confirm, and the negative-cache query
    only ever matches 'pending' rows, so this should already work; this
    test exists to keep it that way.
    """
    first = client.get(f"/products/lookup/gtin/{UNKNOWN_GTIN}")
    assert first.status_code == 200, first.text
    assert first.json()["queued"] is True

    confirm = client.post(
        "/product-lookup/confirm",
        json={"code": UNKNOWN_GTIN, "name": "Ração Teste Confirmada", "category": "food"},
    )
    assert confirm.status_code == 200, confirm.text

    after_confirm = client.get(f"/products/lookup/gtin/{UNKNOWN_GTIN}")
    assert after_confirm.status_code == 200, after_confirm.text
    body = after_confirm.json()
    assert body["found"] is True, (
        "still coming back as queued/not-found after manual confirmation — "
        "the negative cache wasn't invalidated"
    )
    assert body["product"]["name"] == "Ração Teste Confirmada"
