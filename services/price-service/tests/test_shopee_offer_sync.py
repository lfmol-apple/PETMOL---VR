"""
shopee_offer_sync — upsert em MarketplaceOffer a partir de busca+match na
Shopee. Nunca chama a rede de verdade nestes testes: search_product_offers
é substituído por monkeypatch (o cliente real já foi validado manualmente
contra a API ao vivo, ver shopee_affiliate_client.py).
"""
from sqlalchemy import select

from src.affiliate_feed import AffiliateFeedOffer
from src.affiliate_links import MarketplaceOffer
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog
import src.shopee_offer_sync as sync_module
from src.shopee_offer_sync import (
    _build_keyword,
    iter_awin_feed_products,
    iter_unified_awin_feed_products,
    sync_shopee_offer_for_gtin,
    sync_shopee_offer_from_feed_row,
)

GTIN = "7891234500000"

SOMA_15KG_OFFER = {
    "itemId": 58204606553,
    "productName": "Ração Soma Nutrição 15kg Carne Adulto Cão Standard Com Yucca",
    "shopName": "Shopping|Rural",
    "price": "75.9",
    "offerLink": "https://s.shopee.com.br/8AVT6ssHHP",
    "productLink": "https://shopee.com.br/product/1681698080/58204606553",
}
UNRELATED_OFFER = {
    "itemId": 21799066797,
    "productName": "Ração Premium Especial 22% de Proteína Carne e Arroz Brincalhão 15kg",
    "shopName": "Brincalhão Pet",
    "price": "132.85",
    "offerLink": "https://s.shopee.com.br/904a6Pp6aa",
    "productLink": "https://shopee.com.br/product/954438718/21799066797",
}
SOMA_15KG_SECOND_OFFER = {
    "itemId": 58204606554,
    "productName": "Ração Soma Nutrição 15kg Carne Adulto Cão Standard Com Yucca",
    "shopName": "Pet Barato",
    "price": "72.9",
    "offerLink": "https://s.shopee.com.br/8AVT6ssHHQ",
    "productLink": "https://shopee.com.br/product/1681698080/58204606554",
}
SOMA_15KG_OUTLIER_OFFER = {
    "itemId": 58204606555,
    "productName": "Ração Soma Nutrição 15kg Carne Adulto",
    "shopName": "Preço Suspeito",
    "price": "9.9",
    "offerLink": "https://s.shopee.com.br/8AVT6ssHHR",
    "productLink": "https://shopee.com.br/product/1681698080/58204606555",
}


def _register_product(name: str = "Ração Soma Nutrição Carne Adulto Cão 15kg", brand: str = "Soma") -> int:
    db = SessionLocal()
    try:
        product = ProductCatalog(barcode=GTIN, barcode_normalized=GTIN, name=name, brand=brand)
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.id
    finally:
        db.close()


def test_sem_produto_no_catalogo_nao_casa(monkeypatch):
    monkeypatch.setattr(sync_module, "search_product_offers", lambda *a, **k: [])
    result = sync_shopee_offer_for_gtin(SessionLocal(), "0000000000000")
    assert result.matched is False
    assert "não encontrado" in result.reason


def test_produto_sem_nome_nao_casa():
    db = SessionLocal()
    product = ProductCatalog(barcode=GTIN, barcode_normalized=GTIN, name=None, brand="Soma")
    db.add(product)
    db.commit()
    db.close()

    result = sync_shopee_offer_for_gtin(SessionLocal(), GTIN)
    assert result.matched is False
    assert "sem nome" in result.reason


def test_build_keyword_encurta_nome_longo_e_preserva_peso():
    product = ProductCatalog(
        barcode="7896181298083",
        barcode_normalized="7896181298083",
        name="Ração Royal Canin Veterinary Diet Urinary Small Dog para Cães de Porte Pequeno com Cálculos Urinários",
        brand="Royal Canin",
    )

    keyword = _build_keyword(product, expected_weight_kg=7.5)

    assert keyword == "Royal Canin Urinary Small Dog Cães Porte Pequeno Cálculos 7,5kg"
    assert "Ração Royal Canin Veterinary Diet" not in keyword


def test_match_confiavel_cria_marketplace_offer(monkeypatch):
    _register_product()
    monkeypatch.setattr(
        sync_module, "search_product_offers",
        lambda keyword, limit=10: [UNRELATED_OFFER, SOMA_15KG_OFFER],
    )

    result = sync_shopee_offer_for_gtin(SessionLocal(), GTIN)
    assert result.matched is True
    assert result.offer_id is not None

    db = SessionLocal()
    try:
        offer = db.get(MarketplaceOffer, result.offer_id)
        assert offer.merchant == "shopee"
        assert offer.affiliate_url == "https://s.shopee.com.br/8AVT6ssHHP"
        assert offer.price == 75.9
        assert offer.external_listing_id == "58204606553"
        assert offer.active is True
        assert offer.is_available is True
        assert offer.verified_at is not None
    finally:
        db.close()


def test_match_confiavel_grava_multiplas_ofertas_e_remove_outlier(monkeypatch):
    _register_product()
    monkeypatch.setattr(
        sync_module, "search_product_offers",
        lambda keyword, limit=10: [SOMA_15KG_OFFER, SOMA_15KG_SECOND_OFFER, SOMA_15KG_OUTLIER_OFFER],
    )

    result = sync_shopee_offer_for_gtin(SessionLocal(), GTIN)
    assert result.matched is True
    assert result.offer_ids is not None
    assert len(result.offer_ids) == 2

    db = SessionLocal()
    try:
        rows = db.scalars(select(MarketplaceOffer).where(MarketplaceOffer.merchant == "shopee")).all()
        assert {row.external_listing_id for row in rows} == {"58204606553", "58204606554"}
        assert min(row.price for row in rows if row.price is not None) == 72.9
    finally:
        db.close()


def test_sem_candidato_confiavel_nao_cria_oferta(monkeypatch):
    _register_product()
    # Só o item "errado" (marca/peso diferentes) na resposta da busca.
    monkeypatch.setattr(sync_module, "search_product_offers", lambda keyword, limit=10: [UNRELATED_OFFER])

    result = sync_shopee_offer_for_gtin(SessionLocal(), GTIN)
    assert result.matched is False
    assert "nenhum candidato confiável" in result.reason

    db = SessionLocal()
    try:
        rows = db.scalars(select(MarketplaceOffer).where(MarketplaceOffer.merchant == "shopee")).all()
        assert rows == []
    finally:
        db.close()


def test_reexecutar_atualiza_a_mesma_linha_em_vez_de_duplicar(monkeypatch):
    _register_product()
    monkeypatch.setattr(sync_module, "search_product_offers", lambda keyword, limit=10: [SOMA_15KG_OFFER])

    first = sync_shopee_offer_for_gtin(SessionLocal(), GTIN)
    assert first.matched is True

    updated_offer = dict(SOMA_15KG_OFFER, price="79.9")
    monkeypatch.setattr(sync_module, "search_product_offers", lambda keyword, limit=10: [updated_offer])
    second = sync_shopee_offer_for_gtin(SessionLocal(), GTIN)
    assert second.matched is True
    assert second.offer_id == first.offer_id

    db = SessionLocal()
    try:
        rows = db.scalars(select(MarketplaceOffer).where(MarketplaceOffer.merchant == "shopee")).all()
        assert len(rows) == 1
        assert rows[0].price == 79.9
    finally:
        db.close()


def test_offer_link_de_dominio_invalido_nunca_e_gravado(monkeypatch):
    _register_product()
    fake_offer = dict(SOMA_15KG_OFFER, offerLink="https://golpeshopee.com.br/produto")
    monkeypatch.setattr(sync_module, "search_product_offers", lambda keyword, limit=10: [fake_offer])

    result = sync_shopee_offer_for_gtin(SessionLocal(), GTIN)
    assert result.matched is False
    assert "offerLink inválido" in result.reason

    db = SessionLocal()
    try:
        rows = db.scalars(select(MarketplaceOffer).where(MarketplaceOffer.merchant == "shopee")).all()
        assert rows == []
    finally:
        db.close()


def test_erro_na_api_nao_derruba_o_sync(monkeypatch):
    _register_product()

    def _raise(keyword, limit=10):
        raise sync_module.ShopeeAffiliateError("credenciais inválidas")

    monkeypatch.setattr(sync_module, "search_product_offers", _raise)

    result = sync_shopee_offer_for_gtin(SessionLocal(), GTIN)
    assert result.matched is False
    assert "erro na API Shopee" in result.reason


AWIN_GTIN = "7899999900001"


def _register_awin_feed_offer(gtin: str = AWIN_GTIN, title: str = "Ração Soma Nutrição Carne Adulto Cão 15kg", brand: str = "Soma") -> None:
    db = SessionLocal()
    db.add(AffiliateFeedOffer(
        network="awin", merchant="cobasi", advertiser_id="123", external_product_id="ext-1",
        gtin=gtin, title=title, brand=brand, active=True, in_stock=True,
    ))
    db.commit()
    db.close()


def test_iter_awin_feed_products_so_traz_ativos_com_gtin_e_titulo():
    _register_awin_feed_offer()
    db = SessionLocal()
    inactive = AffiliateFeedOffer(
        network="awin", merchant="cobasi", advertiser_id="123", external_product_id="ext-2",
        gtin="7899999900002", title="Produto Inativo", brand="X", active=False, in_stock=True,
    )
    no_gtin = AffiliateFeedOffer(
        network="awin", merchant="cobasi", advertiser_id="123", external_product_id="ext-3",
        gtin=None, title="Produto Sem Gtin", brand="X", active=True, in_stock=True,
    )
    db.add_all([inactive, no_gtin])
    db.commit()

    items = iter_awin_feed_products(db, merchant="cobasi")
    db.close()

    gtins = {i[0] for i in items}
    assert AWIN_GTIN in gtins
    assert "7899999900002" not in gtins
    assert "7899999900003" not in gtins


def test_iter_unified_awin_feed_products_deduplica_merchants_e_escolhe_melhor_referencia():
    db = SessionLocal()
    db.add_all([
        AffiliateFeedOffer(
            network="awin", merchant="zeenow", advertiser_id="127557", external_product_id="zn-1",
            gtin=AWIN_GTIN, title="Soma Nutrição Adulto", brand="Soma", active=True, in_stock=True,
        ),
        AffiliateFeedOffer(
            network="awin", merchant="cobasi", advertiser_id="17870", external_product_id="cb-1",
            gtin=AWIN_GTIN, title="Ração Soma Nutrição Carne Adulto Cão 15kg", brand="Soma", active=True, in_stock=True,
        ),
        AffiliateFeedOffer(
            network="awin", merchant="zeedog", advertiser_id="127555", external_product_id="zd-1",
            gtin="7899999900004", title="Coleira Zee Dog Prisma M", brand="Zee Dog", active=True, in_stock=True,
        ),
    ])
    db.commit()

    items = iter_unified_awin_feed_products(db)
    db.close()

    by_gtin = {gtin: (title, brand) for gtin, title, brand in items}
    assert by_gtin[AWIN_GTIN] == ("Ração Soma Nutrição Carne Adulto Cão 15kg", "Soma")
    assert by_gtin["7899999900004"] == ("Coleira Zee Dog Prisma M", "Zee Dog")
    assert list(gtin for gtin, _title, _brand in items).count(AWIN_GTIN) == 1


def test_iter_unified_awin_feed_products_pula_gtin_com_shopee_ativa():
    db = SessionLocal()
    product = ProductCatalog(
        barcode=AWIN_GTIN,
        barcode_normalized=AWIN_GTIN,
        name="Ração Soma Nutrição Carne Adulto Cão 15kg",
        brand="Soma",
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    db.add_all([
        AffiliateFeedOffer(
            network="awin", merchant="cobasi", advertiser_id="17870", external_product_id="cb-1",
            gtin=AWIN_GTIN, title="Ração Soma Nutrição Carne Adulto Cão 15kg", brand="Soma", active=True, in_stock=True,
        ),
        MarketplaceOffer(
            product_id=product.id, merchant="shopee", external_listing_id="shopee-1",
            affiliate_url="https://s.shopee.com.br/8AVT6ssHHP", price=75.9,
            active=True, is_available=True,
        ),
    ])
    db.commit()

    items = iter_unified_awin_feed_products(db)
    db.close()

    assert AWIN_GTIN not in {gtin for gtin, _title, _brand in items}


def test_sync_from_feed_row_cria_products_catalog_quando_nao_existe(monkeypatch):
    monkeypatch.setattr(sync_module, "search_product_offers", lambda keyword, limit=10: [SOMA_15KG_OFFER])

    db = SessionLocal()
    assert db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == AWIN_GTIN)) is None

    result = sync_shopee_offer_from_feed_row(
        db, AWIN_GTIN, "Ração Soma Nutrição Carne Adulto Cão 15kg", "Soma",
    )
    assert result.matched is True

    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == AWIN_GTIN))
    assert product is not None
    assert product.brand == "Soma"
    assert product.source_primary == "awin_feed"
    db.close()


def test_sync_from_feed_row_nunca_sobrescreve_catalogo_ja_existente(monkeypatch):
    db = SessionLocal()
    db.add(ProductCatalog(
        barcode=AWIN_GTIN, barcode_normalized=AWIN_GTIN,
        name="Nome Já Cadastrado Por Tutor", brand="MarcaOriginal",
    ))
    db.commit()
    db.close()

    monkeypatch.setattr(sync_module, "search_product_offers", lambda keyword, limit=10: [SOMA_15KG_OFFER])

    db = SessionLocal()
    sync_shopee_offer_from_feed_row(db, AWIN_GTIN, "Nome Diferente Do Feed Awin", "MarcaDiferente")
    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == AWIN_GTIN))
    assert product.name == "Nome Já Cadastrado Por Tutor"
    assert product.brand == "MarcaOriginal"
    db.close()
