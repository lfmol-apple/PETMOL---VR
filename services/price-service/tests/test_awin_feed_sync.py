"""
awin_feed_sync — nenhum teste aqui faz chamada de rede real: fetch_feed_csv
é sempre monkeypatchado com um CSV fixo em memória (mesma convenção de
test_affiliate_links.py pra fetch_cobasi_price).
"""
import pytest
from sqlalchemy import select

from src.affiliate_feed import AffiliateFeedOffer
from src.awin_feed_sync import AwinFeedSyncError, sync_awin_feed
from src.db import SessionLocal

HEADER = (
    "data_feed_id,merchant_id,merchant_name,aw_product_id,aw_deep_link,"
    "aw_image_url,aw_thumb_url,category_id,category_name,brand_id,"
    "brand_name,merchant_product_id,merchant_category,mpn,product_name,"
    "description,merchant_deep_link,merchant_image_url,search_price,"
    "condition,product_type,custom_1,custom_2,stock_status,product_GTIN"
)


def _row(
    aw_product_id="1001",
    gtin="7891234567890",
    price="59.90",
    stock="1",
    deep_link="https://www.awin1.com/cread.php?awinmid=17870&p=abc",
    name="Racao Teste 10kg",
):
    return (
        f"48117,17870,Cobasi,{aw_product_id},{deep_link},"
        f"https://img/awin.jpg,https://img/thumb.jpg,10,Racao,5,MarcaX,"
        f"SKU-{aw_product_id},Cachorro,MPN1,{name},"
        f"Descricao do produto,https://cobasi.com.br/p/{aw_product_id},"
        f"https://img/merchant.jpg,{price},new,product,,,{stock},{gtin}"
    )


def _csv(*rows: str) -> str:
    return "\n".join([HEADER, *rows]) + "\n"


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    db = SessionLocal()
    try:
        db.query(AffiliateFeedOffer).filter(AffiliateFeedOffer.network == "awin").delete()
        db.commit()
    finally:
        db.close()


def test_sync_upserts_rows_from_feed(monkeypatch):
    monkeypatch.setattr(
        "src.awin_feed_sync.fetch_feed_csv",
        lambda url: _csv(_row(aw_product_id="1001", gtin="7891234567890")),
    )

    db = SessionLocal()
    try:
        result = sync_awin_feed(db, "cobasi", datafeed_key="fake-key")
        assert result.rows_seen == 1
        assert result.rows_upserted == 1

        row = db.scalar(
            select(AffiliateFeedOffer).where(
                AffiliateFeedOffer.network == "awin",
                AffiliateFeedOffer.merchant == "cobasi",
                AffiliateFeedOffer.external_product_id == "1001",
            )
        )
        assert row is not None
        assert row.gtin == "7891234567890"
        assert row.price == 59.90
        assert row.in_stock is True
        assert row.active is True
        assert row.affiliate_url.startswith("https://www.awin1.com/")
        assert row.title == "Racao Teste 10kg"
    finally:
        db.close()


def test_sync_marks_missing_products_inactive_on_next_run(monkeypatch):
    db = SessionLocal()
    try:
        monkeypatch.setattr(
            "src.awin_feed_sync.fetch_feed_csv",
            lambda url: _csv(_row(aw_product_id="1001"), _row(aw_product_id="1002")),
        )
        sync_awin_feed(db, "cobasi", datafeed_key="fake-key")

        # Segunda rodada: produto 1002 saiu do feed (ex: fora de linha)
        monkeypatch.setattr(
            "src.awin_feed_sync.fetch_feed_csv",
            lambda url: _csv(_row(aw_product_id="1001")),
        )
        result = sync_awin_feed(db, "cobasi", datafeed_key="fake-key")
        assert result.rows_deactivated == 1

        still_active = db.scalar(
            select(AffiliateFeedOffer).where(AffiliateFeedOffer.external_product_id == "1001")
        )
        now_inactive = db.scalar(
            select(AffiliateFeedOffer).where(AffiliateFeedOffer.external_product_id == "1002")
        )
        assert still_active.active is True
        assert now_inactive.active is False
    finally:
        db.close()


def test_sync_reactivates_product_that_returns_to_feed(monkeypatch):
    db = SessionLocal()
    try:
        monkeypatch.setattr("src.awin_feed_sync.fetch_feed_csv", lambda url: _csv(_row(aw_product_id="1001")))
        sync_awin_feed(db, "cobasi", datafeed_key="fake-key")

        monkeypatch.setattr("src.awin_feed_sync.fetch_feed_csv", lambda url: _csv())
        sync_awin_feed(db, "cobasi", datafeed_key="fake-key")
        gone = db.scalar(select(AffiliateFeedOffer).where(AffiliateFeedOffer.external_product_id == "1001"))
        assert gone.active is False

        monkeypatch.setattr(
            "src.awin_feed_sync.fetch_feed_csv",
            lambda url: _csv(_row(aw_product_id="1001", price="65.00")),
        )
        sync_awin_feed(db, "cobasi", datafeed_key="fake-key")
        back = db.scalar(select(AffiliateFeedOffer).where(AffiliateFeedOffer.external_product_id == "1001"))
        assert back.active is True
        assert back.price == 65.00
    finally:
        db.close()


def test_real_cobasi_feed_stock_value_is_recognized(monkeypatch):
    """Valor real observado no feed de produção da Cobasi em 13/08/2026 —
    "disponível" (português), não os valores em inglês que a doc da Awin
    sugere. Regressão: um sync real chegou a marcar 8.398/8.398 produtos
    como in_stock=False por não reconhecer este valor."""
    monkeypatch.setattr(
        "src.awin_feed_sync.fetch_feed_csv",
        lambda url: _csv(_row(aw_product_id="3001", stock="disponível")),
    )
    db = SessionLocal()
    try:
        sync_awin_feed(db, "cobasi", datafeed_key="fake-key")
        row = db.scalar(select(AffiliateFeedOffer).where(AffiliateFeedOffer.external_product_id == "3001"))
        assert row.in_stock is True
    finally:
        db.close()


def test_unknown_stock_status_stores_none_not_false(monkeypatch):
    monkeypatch.setattr(
        "src.awin_feed_sync.fetch_feed_csv",
        lambda url: _csv(_row(aw_product_id="3002", stock="algum-valor-novo-nunca-visto")),
    )
    db = SessionLocal()
    try:
        sync_awin_feed(db, "cobasi", datafeed_key="fake-key")
        row = db.scalar(select(AffiliateFeedOffer).where(AffiliateFeedOffer.external_product_id == "3002"))
        assert row.in_stock is None
    finally:
        db.close()


def test_out_of_stock_row_stores_in_stock_false(monkeypatch):
    monkeypatch.setattr(
        "src.awin_feed_sync.fetch_feed_csv",
        lambda url: _csv(_row(aw_product_id="2001", stock="0")),
    )
    db = SessionLocal()
    try:
        sync_awin_feed(db, "cobasi", datafeed_key="fake-key")
        row = db.scalar(select(AffiliateFeedOffer).where(AffiliateFeedOffer.external_product_id == "2001"))
        assert row.in_stock is False
    finally:
        db.close()


def test_row_without_aw_product_id_is_skipped(monkeypatch):
    monkeypatch.setattr(
        "src.awin_feed_sync.fetch_feed_csv",
        lambda url: _csv(_row(aw_product_id="")),
    )
    db = SessionLocal()
    try:
        result = sync_awin_feed(db, "cobasi", datafeed_key="fake-key")
        assert result.rows_seen == 1
        assert result.rows_upserted == 0
    finally:
        db.close()


def test_unknown_merchant_raises():
    db = SessionLocal()
    try:
        with pytest.raises(AwinFeedSyncError):
            sync_awin_feed(db, "not_a_merchant", datafeed_key="fake-key")
    finally:
        db.close()


def test_merchant_without_feed_raises():
    """Petz não tem Product Feed na Awin (feed_available=False, real —
    ver awin_advertisers.py) — não precisa mock, é o estado de verdade."""
    db = SessionLocal()
    try:
        with pytest.raises(AwinFeedSyncError):
            sync_awin_feed(db, "petz", datafeed_key="fake-key")
    finally:
        db.close()


def test_missing_datafeed_key_raises(monkeypatch):
    monkeypatch.setattr("src.awin_feed_sync.get_settings", lambda: type("S", (), {"awin_datafeed_key": None})())
    db = SessionLocal()
    try:
        with pytest.raises(AwinFeedSyncError):
            sync_awin_feed(db, "cobasi")
    finally:
        db.close()
