from sqlalchemy import select

from src.affiliate_feed import AffiliateFeedOffer
from src.affiliate_links import MarketplaceOffer
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog
import src.shopee_offer_audit as audit_module
from src.shopee_offer_audit import audit_active_shopee_offers

GTIN = "7891234500777"

EXPECTED_FEED_TITLE = "Ração Royal Canin Mini Adult Cães Adultos Porte Pequeno 7,5kg"
VALID_SHOPEE_NODE = {
    "itemId": 101,
    "productName": "Royal Canin Mini Adult Caes Adultos Porte Pequeno 7,5kg",
    "shopName": "Pet Oficial",
    "price": "345.04",
    "offerLink": "https://s.shopee.com.br/royalMiniAdult",
    "productLink": "https://shopee.com.br/product/1/101",
}
WRONG_SHOPEE_NODE = {
    "itemId": 202,
    "productName": "Royal Canin Medium Adult Caes Adultos 7,5kg",
    "shopName": "Pet Errado",
    "price": "382.32",
    "offerLink": "https://s.shopee.com.br/royalMediumAdult",
    "productLink": "https://shopee.com.br/product/1/202",
}


def _seed_product_with_offer(*, listing_id: str, product_name: str = "Ração Royal Canin Cães Adultos 7,5kg") -> int:
    db = SessionLocal()
    try:
        product = ProductCatalog(
            barcode=GTIN,
            barcode_normalized=GTIN,
            name=product_name,
            brand="Royal Canin",
            category="food",
        )
        db.add(product)
        db.flush()
        offer = MarketplaceOffer(
            product_id=product.id,
            merchant="shopee",
            external_listing_id=listing_id,
            seller_name="cache antigo",
            affiliate_url="https://s.shopee.com.br/cacheAntigo",
            direct_url="https://shopee.com.br/product/old",
            price=382.32,
            is_available=True,
            active=True,
        )
        db.add(offer)
        db.commit()
        return offer.id
    finally:
        db.close()


def _seed_feed_row(title: str = EXPECTED_FEED_TITLE) -> None:
    db = SessionLocal()
    try:
        db.add(AffiliateFeedOffer(
            network="awin",
            merchant="cobasi",
            advertiser_id="17870",
            external_product_id="cobasi-royal-mini",
            gtin=GTIN,
            title=title,
            brand="Royal Canin",
            active=True,
            in_stock=True,
        ))
        db.commit()
    finally:
        db.close()


def test_auditoria_revalida_listing_salvo_e_atualiza_preco(monkeypatch):
    offer_id = _seed_product_with_offer(listing_id=str(VALID_SHOPEE_NODE["itemId"]))
    _seed_feed_row()

    monkeypatch.setattr(audit_module, "search_product_offers", lambda keyword, limit=20: [WRONG_SHOPEE_NODE, VALID_SHOPEE_NODE])

    db = SessionLocal()
    try:
        result = audit_active_shopee_offers(db)
    finally:
        db.close()

    assert result.total == 1
    assert result.valid == 1
    assert result.invalid == 0
    assert result.items[0].decision == "valid"
    assert result.items[0].matched_listing_ids == ["101"]

    db = SessionLocal()
    try:
        offer = db.get(MarketplaceOffer, offer_id)
        assert offer.active is True
        assert offer.price == 345.04
        assert offer.affiliate_url == VALID_SHOPEE_NODE["offerLink"]
    finally:
        db.close()


def test_auditoria_desativa_listing_salvo_quando_produto_nao_bate(monkeypatch):
    offer_id = _seed_product_with_offer(listing_id=str(WRONG_SHOPEE_NODE["itemId"]))
    _seed_feed_row()

    monkeypatch.setattr(audit_module, "search_product_offers", lambda keyword, limit=20: [WRONG_SHOPEE_NODE, VALID_SHOPEE_NODE])

    db = SessionLocal()
    try:
        result = audit_active_shopee_offers(db, deactivate_invalid=True)
    finally:
        db.close()

    assert result.total == 1
    assert result.valid == 0
    assert result.invalid == 1
    assert result.deactivated == 1
    assert result.items[0].reason == "saved_listing_not_in_confident_matches"

    db = SessionLocal()
    try:
        offer = db.get(MarketplaceOffer, offer_id)
        assert offer.active is False
        assert offer.last_checked_at is not None
    finally:
        db.close()


def test_auditoria_usa_feed_awin_como_identidade_forte(monkeypatch):
    _seed_product_with_offer(listing_id=str(VALID_SHOPEE_NODE["itemId"]), product_name="Ração Royal Canin 7,5kg")
    _seed_feed_row()
    searched_keywords = []

    def _fake_search(keyword, limit=20):
        searched_keywords.append(keyword)
        return [VALID_SHOPEE_NODE]

    monkeypatch.setattr(audit_module, "search_product_offers", _fake_search)

    db = SessionLocal()
    try:
        result = audit_active_shopee_offers(db)
    finally:
        db.close()

    assert result.valid == 1
    assert result.items[0].expected_title == EXPECTED_FEED_TITLE
    assert result.items[0].expected_weight_kg == 7.5
    assert any("Mini Adult" in keyword for keyword in searched_keywords)


def test_auditoria_nao_desativa_em_dry_run(monkeypatch):
    offer_id = _seed_product_with_offer(listing_id=str(WRONG_SHOPEE_NODE["itemId"]))
    _seed_feed_row()
    monkeypatch.setattr(audit_module, "search_product_offers", lambda keyword, limit=20: [WRONG_SHOPEE_NODE])

    db = SessionLocal()
    try:
        result = audit_active_shopee_offers(db, deactivate_invalid=False)
    finally:
        db.close()

    assert result.invalid == 1
    assert result.deactivated == 0
    db = SessionLocal()
    try:
        offer = db.scalar(select(MarketplaceOffer).where(MarketplaceOffer.id == offer_id))
        assert offer.active is True
    finally:
        db.close()


def test_auditoria_reporta_progresso(monkeypatch):
    _seed_product_with_offer(listing_id=str(VALID_SHOPEE_NODE["itemId"]))
    _seed_feed_row()
    monkeypatch.setattr(audit_module, "search_product_offers", lambda keyword, limit=20: [VALID_SHOPEE_NODE])
    progress = []

    db = SessionLocal()
    try:
        result = audit_active_shopee_offers(db, progress_callback=lambda processed, audit: progress.append((processed, audit.total, audit.valid)))
    finally:
        db.close()

    assert result.valid == 1
    assert progress == [(0, 1, 0), (1, 1, 1)]
