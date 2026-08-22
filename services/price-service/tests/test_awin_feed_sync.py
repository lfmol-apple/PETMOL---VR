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
    "condition,product_type,custom_1,custom_2,stock_status,in_stock,product_GTIN"
)


def _row(
    aw_product_id="1001",
    gtin="7891234567890",
    price="59.90",
    stock="1",
    in_stock="",
    deep_link="https://www.awin1.com/cread.php?awinmid=17870&p=abc",
    name="Racao Teste 10kg",
    merchant_id="17870",
    data_feed_id="48117",
    merchant_name="Cobasi",
    category_name="Racao",
    merchant_category="Cachorro",
    product_type="product",
):
    return (
        f"{data_feed_id},{merchant_id},{merchant_name},{aw_product_id},{deep_link},"
        f"https://img/awin.jpg,https://img/thumb.jpg,10,{category_name},5,MarcaX,"
        f"SKU-{aw_product_id},{merchant_category},MPN1,{name},"
        f"Descricao do produto,https://cobasi.com.br/p/{aw_product_id},"
        f"https://img/merchant.jpg,{price},new,{product_type},,,{stock},{in_stock},{gtin}"
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

        # Feed com OUTRO produto (rows_seen > 0) — não um feed vazio, que
        # agora é tratado como falha e nunca desativa nada (ver
        # test_empty_feed_never_deactivates_previous_catalog).
        monkeypatch.setattr("src.awin_feed_sync.fetch_feed_csv", lambda url: _csv(_row(aw_product_id="9999")))
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


def test_stock_status_takes_precedence_over_in_stock(monkeypatch):
    monkeypatch.setattr(
        "src.awin_feed_sync.fetch_feed_csv",
        lambda url: _csv(_row(aw_product_id="3003", stock="disponível", in_stock="0")),
    )
    db = SessionLocal()
    try:
        sync_awin_feed(db, "cobasi", datafeed_key="fake-key")
        row = db.scalar(select(AffiliateFeedOffer).where(AffiliateFeedOffer.external_product_id == "3003"))
        assert row.in_stock is True
    finally:
        db.close()


def test_zeedog_row_uses_in_stock_and_product_type_fallback(monkeypatch):
    deep_link = "https://www.awin1.com/cread.php?awinmid=127555&awinaffid=3032803&a=3032803&m=127555&p=abc"
    monkeypatch.setattr(
        "src.awin_feed_sync.fetch_feed_csv",
        lambda url: _csv(
            _row(
                aw_product_id="zd-1001",
                gtin="7891111111111",
                stock="",
                in_stock="1",
                deep_link=deep_link,
                name="Zee Dog Coleira Prisma",
                merchant_id="127555",
                data_feed_id="116649",
                merchant_name="Zee Dog",
                category_name="",
                merchant_category="",
                product_type="coleiras",
            )
        ),
    )
    db = SessionLocal()
    try:
        result = sync_awin_feed(db, "zeedog", datafeed_key="fake-key")
        assert result.rows_seen == 1
        assert result.rows_upserted == 1

        row = db.scalar(select(AffiliateFeedOffer).where(AffiliateFeedOffer.external_product_id == "zd-1001"))
        assert row is not None
        assert row.merchant == "zeedog"
        assert row.advertiser_id == "127555"
        assert row.gtin == "7891111111111"
        assert row.in_stock is True
        assert row.category == "coleiras"
        assert row.affiliate_url == deep_link
    finally:
        db.close()


def test_zeedog_in_stock_zero_stores_false(monkeypatch):
    monkeypatch.setattr(
        "src.awin_feed_sync.fetch_feed_csv",
        lambda url: _csv(
            _row(
                aw_product_id="zd-1002",
                stock="",
                in_stock="0",
                merchant_id="127555",
                data_feed_id="116649",
                merchant_name="Zee Dog",
            )
        ),
    )
    db = SessionLocal()
    try:
        sync_awin_feed(db, "zeedog", datafeed_key="fake-key")
        row = db.scalar(select(AffiliateFeedOffer).where(AffiliateFeedOffer.external_product_id == "zd-1002"))
        assert row.in_stock is False
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
    monkeypatch.setattr(
        "src.awin_feed_sync.get_settings",
        lambda: type("S", (), {"awin_datafeed_key": None, "awin_sync_enabled": True})(),
    )
    db = SessionLocal()
    try:
        with pytest.raises(AwinFeedSyncError):
            sync_awin_feed(db, "cobasi")
    finally:
        db.close()


def test_sync_disabled_raises_and_does_not_touch_network(monkeypatch):
    monkeypatch.setattr(
        "src.awin_feed_sync.get_settings",
        lambda: type("S", (), {"awin_datafeed_key": "fake-key", "awin_sync_enabled": False})(),
    )

    def _boom(url):
        raise AssertionError("fetch_feed_csv não deveria ser chamado com awin_sync_enabled=False")

    monkeypatch.setattr("src.awin_feed_sync.fetch_feed_csv", _boom)
    db = SessionLocal()
    try:
        with pytest.raises(AwinFeedSyncError, match="AWIN_SYNC_ENABLED"):
            sync_awin_feed(db, "cobasi")
    finally:
        db.close()


def test_empty_feed_never_deactivates_previous_catalog(monkeypatch):
    """§11: feed vazio NUNCA é tratado como sincronização válida — nunca
    desativa o catálogo anterior silenciosamente."""
    db = SessionLocal()
    try:
        monkeypatch.setattr("src.awin_feed_sync.fetch_feed_csv", lambda url: _csv(_row(aw_product_id="1001")))
        sync_awin_feed(db, "cobasi", datafeed_key="fake-key")

        monkeypatch.setattr("src.awin_feed_sync.fetch_feed_csv", lambda url: _csv())
        with pytest.raises(AwinFeedSyncError, match="vazio"):
            sync_awin_feed(db, "cobasi", datafeed_key="fake-key")

        still_there = db.scalar(select(AffiliateFeedOffer).where(AffiliateFeedOffer.external_product_id == "1001"))
        assert still_there is not None
        assert still_there.active is True
    finally:
        db.close()


def test_concurrent_sync_same_merchant_is_blocked(monkeypatch):
    """Duas sincronizações do mesmo merchant não podem rodar ao mesmo
    tempo — a segunda chamada, enquanto a primeira "está rodando" (run sem
    finished_at), levanta erro em vez de disputar a mesma tabela."""
    from src.affiliate_feed import AffiliateFeedSyncRun
    from src.awin_advertisers import get_awin_advertiser

    db = SessionLocal()
    try:
        advertiser = get_awin_advertiser("cobasi")
        running = AffiliateFeedSyncRun(
            network="awin", merchant="cobasi", advertiser_id=advertiser.advertiser_id,
            feed_id=advertiser.feed_id, status="running",
        )
        db.add(running)
        db.commit()

        monkeypatch.setattr("src.awin_feed_sync.fetch_feed_csv", lambda url: _csv(_row()))
        with pytest.raises(AwinFeedSyncError, match="em andamento"):
            sync_awin_feed(db, "cobasi", datafeed_key="fake-key")
    finally:
        db.query(AffiliateFeedSyncRun).filter(AffiliateFeedSyncRun.merchant == "cobasi").delete()
        db.commit()
        db.close()


def test_sync_run_is_recorded_on_success(monkeypatch):
    from src.affiliate_feed import AffiliateFeedSyncRun

    monkeypatch.setattr(
        "src.awin_feed_sync.fetch_feed_csv",
        lambda url: _csv(_row(aw_product_id="1001", gtin="7891234567890")),
    )
    db = SessionLocal()
    try:
        result = sync_awin_feed(db, "cobasi", datafeed_key="fake-key")
        assert result.run_id is not None

        run = db.get(AffiliateFeedSyncRun, result.run_id)
        assert run.status == "success"
        assert run.finished_at is not None
        assert run.rows_seen == 1
        assert run.rows_upserted == 1
        assert run.rows_with_gtin == 1
        assert run.rows_with_affiliate_url == 1
    finally:
        db.query(AffiliateFeedSyncRun).filter(AffiliateFeedSyncRun.merchant == "cobasi").delete()
        db.commit()
        db.close()


def test_sync_run_recorded_on_failure_never_leaks_url(monkeypatch):
    from src.affiliate_feed import AffiliateFeedSyncRun

    def _boom(url):
        raise RuntimeError(f"conexão falhou pra {url}")  # url contém a apikey de propósito, pra testar a sanitização

    monkeypatch.setattr("src.awin_feed_sync.fetch_feed_csv", _boom)
    db = SessionLocal()
    try:
        with pytest.raises(AwinFeedSyncError):
            sync_awin_feed(db, "cobasi", datafeed_key="segredo-nao-pode-vazar")

        run = db.scalar(
            select(AffiliateFeedSyncRun)
            .where(AffiliateFeedSyncRun.merchant == "cobasi")
            .order_by(AffiliateFeedSyncRun.id.desc())
        )
        assert run.status == "failed"
        assert "segredo-nao-pode-vazar" not in (run.error_message or "")
    finally:
        db.query(AffiliateFeedSyncRun).filter(AffiliateFeedSyncRun.merchant == "cobasi").delete()
        db.commit()
        db.close()
