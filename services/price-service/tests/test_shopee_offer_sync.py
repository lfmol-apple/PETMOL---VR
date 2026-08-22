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
    _build_keyword_variants,
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
NEXGARD_OFFER = {
    "itemId": 99112233445,
    "productName": "NexGard Antipulgas e Carrapatos para Cães de 4,1kg a 10kg 1 comprimido",
    "shopName": "Pet Oficial",
    "price": "89.9",
    "offerLink": "https://s.shopee.com.br/8AVT6ssNGD",
    "productLink": "https://shopee.com.br/product/1681698080/99112233445",
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


def test_build_keyword_variants_remove_acento_e_inclui_busca_curta():
    product = ProductCatalog(
        barcode="7891106910255",
        barcode_normalized="7891106910255",
        name="Coleira Antipulgas Seresto Cães e gatos até 8kg - 8 meses de proteção - Único",
        brand="Seresto",
    )

    variants = _build_keyword_variants(product, expected_weight_kg=8.0)

    assert variants[0] == "Seresto Coleira Antipulgas Caes gatos ate 8kg 8"
    assert "Seresto 8kg" in variants
    assert all("ã" not in variant and "é" not in variant and "ç" not in variant for variant in variants)


def test_match_confiavel_cria_marketplace_offer(monkeypatch):
    _register_product()
    captured_limits = []

    def _fake_search(keyword, limit=10):
        captured_limits.append(limit)
        return [UNRELATED_OFFER, SOMA_15KG_OFFER]

    monkeypatch.setattr(
        sync_module, "search_product_offers",
        _fake_search,
    )

    result = sync_shopee_offer_for_gtin(SessionLocal(), GTIN)
    assert result.matched is True
    assert result.offer_id is not None
    assert captured_limits
    assert set(captured_limits) == {20}

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


def test_iter_unified_awin_feed_products_prioriza_itens_comerciais_petmol():
    db = SessionLocal()
    db.add_all([
        AffiliateFeedOffer(
            network="awin", merchant="zeenow", advertiser_id="127557", external_product_id="zn-aquario",
            gtin="000116007405", title="Condicionador para Aquário Acid Regulator Seachem - 50 g",
            brand="Seachem", active=True, in_stock=True,
        ),
        AffiliateFeedOffer(
            network="awin", merchant="zeedog", advertiser_id="127555", external_product_id="zd-brinquedo",
            gtin="0035585034003", title="Brinquedo Dispenser para Ração ou Petisco Kong Wobbler Vermelho",
            brand="Kong", active=True, in_stock=True,
        ),
        AffiliateFeedOffer(
            network="awin", merchant="cobasi", advertiser_id="17870", external_product_id="cb-racao",
            gtin="7891234500094", title="Ração Soma Nutrição Carne Adulto Cão 15kg",
            brand="Soma", active=True, in_stock=True,
        ),
        AffiliateFeedOffer(
            network="awin", merchant="zeenow", advertiser_id="127557", external_product_id="zn-scalibor",
            gtin="7891234500100", title="SCALIBOR Coleira Antiparasitária para Cães",
            brand="Scalibor", active=True, in_stock=True,
        ),
    ])
    db.commit()

    items = iter_unified_awin_feed_products(db)
    db.close()

    gtins = [gtin for gtin, _title, _brand in items[:2]]
    assert gtins == ["7891234500100", "7891234500094"]


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


def test_sync_from_feed_row_usa_marca_comercial_do_titulo_quando_brand_e_fabricante(monkeypatch):
    monkeypatch.setattr(sync_module, "search_product_offers", lambda keyword, limit=10: [NEXGARD_OFFER])

    db = SessionLocal()
    result = sync_shopee_offer_from_feed_row(
        db,
        "7898053774343",
        "Antipulgas e Carrapatos Nexgard para Cães de 4,1kg a 10kg 1 comprimido",
        "Boehringer Ingelheim",
    )

    assert result.matched is True

    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == "7898053774343"))
    assert product is not None
    offer = db.scalar(select(MarketplaceOffer).where(MarketplaceOffer.product_id == product.id))
    assert offer is not None
    assert offer.external_listing_id == "99112233445"
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


# ── GTIN irmão (mesmo item, código de barras diferente) ─────────────────

IRMAO_TITLE = "Filtro Interno Maxxi FI 500"
IRMAO_BRAND = "Maxxi"
IRMAO_PRICE = 99.9
IRMAO_GTIN_A = "7898762981131"
IRMAO_GTIN_B = "7898762981148"

MAXXI_FALLBACK_OFFER = {
    "itemId": 77001122334,
    "productName": "Filtro Interno Maxxi FI 500",
    "shopName": "Aquarismo Center",
    "price": "149.9",
    "offerLink": "https://s.shopee.com.br/maxxiFallback",
    "productLink": "https://shopee.com.br/product/1/77001122334",
}


def _boom_se_chamado(*_args, **_kwargs):
    raise AssertionError("search_product_offers não deveria ser chamado — devia reaproveitar o GTIN irmão")


def _registrar_gtin_ja_casado(merchant: str = "cobasi", price: float = IRMAO_PRICE) -> int:
    """GTIN A: já tem entrada em products_catalog + oferta Shopee ativa."""
    db = SessionLocal()
    db.add(AffiliateFeedOffer(
        network="awin", merchant=merchant, advertiser_id="17870", external_product_id="irmao-a",
        gtin=IRMAO_GTIN_A, title=IRMAO_TITLE, brand=IRMAO_BRAND, price=price, active=True, in_stock=True,
    ))
    product = ProductCatalog(
        barcode=IRMAO_GTIN_A, barcode_normalized=IRMAO_GTIN_A, name=IRMAO_TITLE, brand=IRMAO_BRAND,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    db.add(MarketplaceOffer(
        product_id=product.id, merchant="shopee", external_listing_id="shopee-irmao-a",
        affiliate_url="https://s.shopee.com.br/irmaoA", price=price, active=True, is_available=True,
    ))
    db.commit()
    product_id = product.id
    db.close()
    return product_id


def test_sync_from_feed_row_reaproveita_oferta_de_gtin_irmao_mesmo_preco(monkeypatch):
    _registrar_gtin_ja_casado()
    monkeypatch.setattr(sync_module, "search_product_offers", _boom_se_chamado)

    db = SessionLocal()
    db.add(AffiliateFeedOffer(
        network="awin", merchant="cobasi", advertiser_id="17870", external_product_id="irmao-b",
        gtin=IRMAO_GTIN_B, title=IRMAO_TITLE, brand=IRMAO_BRAND, price=IRMAO_PRICE, active=True, in_stock=True,
    ))
    db.commit()

    result = sync_shopee_offer_from_feed_row(db, IRMAO_GTIN_B, IRMAO_TITLE, IRMAO_BRAND)
    assert result.matched is True
    assert "irmão" in result.reason

    product_b = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == IRMAO_GTIN_B))
    offer_b = db.scalar(select(MarketplaceOffer).where(MarketplaceOffer.product_id == product_b.id))
    assert offer_b is not None
    assert offer_b.external_listing_id == "shopee-irmao-a"
    assert offer_b.affiliate_url == "https://s.shopee.com.br/irmaoA"
    db.close()


def test_sync_from_feed_row_nao_reaproveita_quando_preco_diverge(monkeypatch):
    """Preço diferente = tamanho/versão realmente diferente — nunca cola."""
    _registrar_gtin_ja_casado(price=IRMAO_PRICE)
    monkeypatch.setattr(sync_module, "search_product_offers", lambda keyword, limit=10: [MAXXI_FALLBACK_OFFER])

    db = SessionLocal()
    db.add(AffiliateFeedOffer(
        network="awin", merchant="cobasi", advertiser_id="17870", external_product_id="irmao-c",
        gtin=IRMAO_GTIN_B, title=IRMAO_TITLE, brand=IRMAO_BRAND, price=149.9, active=True, in_stock=True,
    ))
    db.commit()

    result = sync_shopee_offer_from_feed_row(db, IRMAO_GTIN_B, IRMAO_TITLE, IRMAO_BRAND)
    assert result.matched is True

    product_b = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == IRMAO_GTIN_B))
    offer_b = db.scalar(select(MarketplaceOffer).where(MarketplaceOffer.product_id == product_b.id))
    # Casou pela busca normal (MAXXI_FALLBACK_OFFER), não reaproveitou o irmão A
    assert offer_b.external_listing_id == str(MAXXI_FALLBACK_OFFER["itemId"])
    db.close()


def test_sync_from_feed_row_nao_reaproveita_entre_lojas_diferentes(monkeypatch):
    """Mesmo título/marca/preço, mas lojas (merchants) diferentes — não é
    garantia de ser o mesmo item físico, então não reaproveita."""
    _registrar_gtin_ja_casado(merchant="cobasi")
    monkeypatch.setattr(sync_module, "search_product_offers", lambda keyword, limit=10: [MAXXI_FALLBACK_OFFER])

    db = SessionLocal()
    db.add(AffiliateFeedOffer(
        network="awin", merchant="zeenow", advertiser_id="127557", external_product_id="irmao-d",
        gtin=IRMAO_GTIN_B, title=IRMAO_TITLE, brand=IRMAO_BRAND, price=IRMAO_PRICE, active=True, in_stock=True,
    ))
    db.commit()

    result = sync_shopee_offer_from_feed_row(db, IRMAO_GTIN_B, IRMAO_TITLE, IRMAO_BRAND)
    assert result.matched is True

    product_b = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == IRMAO_GTIN_B))
    offer_b = db.scalar(select(MarketplaceOffer).where(MarketplaceOffer.product_id == product_b.id))
    assert offer_b.external_listing_id == str(MAXXI_FALLBACK_OFFER["itemId"])
    db.close()
