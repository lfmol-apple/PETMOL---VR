"""Registro agregado da demanda de busca (src/search_demand.py): privacidade, filtro, retenção, relatório e não-interferência."""
import inspect
from datetime import date, timedelta

import pytest
from sqlalchemy import inspect as sa_inspect, select

from src import search_demand as sd
from src.affiliate_feed import AffiliateFeedOffer
from src.config import get_settings
from src.db import SessionLocal, engine

VOCAB = frozenset({"golden", "adulto", "frango", "15kg", "pipicat", "scalibor", "nexgard", "royal", "canin"})


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    get_settings.cache_clear()
    sd.reset_caches_for_tests()
    with SessionLocal() as db:
        db.query(sd.SearchDemandDaily).delete()
        db.query(sd.SearchDemandMonthly).delete()
        db.query(AffiliateFeedOffer).filter(AffiliateFeedOffer.network == "awin").delete()
        db.commit()
    yield
    get_settings.cache_clear()
    sd.reset_caches_for_tests()
    with SessionLocal() as db:
        db.query(sd.SearchDemandDaily).delete()
        db.query(sd.SearchDemandMonthly).delete()
        db.query(AffiliateFeedOffer).filter(AffiliateFeedOffer.network == "awin").delete()
        db.commit()


def _on(monkeypatch):
    monkeypatch.setenv("SEARCH_DEMAND_ENABLED", "true")
    get_settings.cache_clear()


def _offer(**kw):
    d = dict(network="awin", merchant="cobasi", advertiser_id="17870", external_product_id="1", gtin="7891234500001",
             title="Racao Golden Adulto Frango 15kg", brand="Golden", price=100.0, in_stock=True, active=True,
             affiliate_url="https://www.awin1.com/pclick.php?p=1")
    d.update(kw)
    with SessionLocal() as db:
        db.add(AffiliateFeedOffer(**d))
        db.commit()


# ── filtro de dados pessoais ──────────────────────────────────────────────────

@pytest.mark.parametrize("q,expected", [
    ("Golden Adulto 15kg", ("term", "golden adulto 15kg")),
    ("  RAÇÃO   Golden ", ("term", "racao golden")),
    ("joao.silva@gmail.com", ("rejected:contact", "")),
    ("https://site.com/x", ("rejected:contact", "")),
    ("www.petz", ("rejected:contact", "")),
    ("meu cachorro golden", ("rejected:personal", "")),
    ("rua das flores golden", ("rejected:personal", "")),
    ("cpf 12345678901", ("rejected:digits", "")),
    ("11987654321", ("rejected:digits", "")),
    ("01310100 golden", ("rejected:digits", "")),
    ("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", ("rejected:long_word", "")),
    ("maria jose silva", ("other", "")),       # nome de pessoa: fora do vocabulário → só contagem
    ("thor golden", ("other", "")),             # nome de pet misturado: não guarda o texto
    ("   ", ("rejected:empty", "")),
])
def test_classify_rules(q, expected):
    assert sd.classify(q, VOCAB) == expected


def test_classify_without_vocabulary_never_keeps_text():
    assert sd.classify("golden adulto", None) == ("other", "")


def test_classify_gtin_valid_vs_invalid():
    valid = "7896016401008"  # GTIN-13 válido (dígito verificador correto)
    assert sd.luhn_free_gtin_ok(valid)
    assert sd.classify(valid, VOCAB) == ("gtin", valid)
    assert sd.classify("7896016401009", VOCAB) == ("rejected:digits", "")  # dígito verificador errado → não é produto


def test_classify_truncates_to_six_words():
    k, v = sd.classify("golden adulto frango pipicat scalibor nexgard royal canin", VOCAB)
    assert k == "term" and len(v.split()) == 6


def test_every_rule_is_needed_mutation_guard():
    """Cada regra do filtro tem de ser exercida por pelo menos uma entrada acima (se alguém remover uma, algum caso muda)."""
    src = inspect.getsource(sd.classify)
    for needle in ("_CONTACT_RX", "_LONG_DIGITS_RX", "PERSONAL_WORDS", "MAX_WORD_LETTERS", "vocabulary is None", "KEY_GTIN"):
        assert needle in src


# ── gravação, flag e privacidade do esquema ───────────────────────────────────

def test_disabled_by_default_writes_nothing():
    _offer()
    sd.record_search("golden", None, 1)
    with SessionLocal() as db:
        assert db.scalar(select(sd.SearchDemandDaily.id)) is None


def test_records_and_sums(monkeypatch):
    _on(monkeypatch)
    _offer()
    for n in (3, 0, 2):
        sd.record_search("golden adulto", None, n)
    with SessionLocal() as db:
        row = db.scalar(select(sd.SearchDemandDaily).where(sd.SearchDemandDaily.key_type == "term"))
        assert (row.key_value, row.searches, row.zero_results) == ("golden adulto", 3, 1)


def test_pending_result_not_counted_as_zero(monkeypatch):
    _on(monkeypatch)
    _offer()
    sd.record_search("golden", None, None)
    with SessionLocal() as db:
        assert db.scalar(select(sd.SearchDemandDaily.zero_results)) == 0


def test_rejected_and_other_store_no_text(monkeypatch):
    _on(monkeypatch)
    _offer()
    sd.record_search("fulano@x.com", None, 0)
    sd.record_search("maria jose", None, 0)
    with SessionLocal() as db:
        rows = db.execute(select(sd.SearchDemandDaily.key_type, sd.SearchDemandDaily.key_value)).all()
    assert sorted(rows) == [("other", ""), ("rejected:contact", "")]


def test_schema_has_no_identifying_columns():
    for table in ("search_demand_daily", "search_demand_monthly"):
        cols = {c["name"] for c in sa_inspect(engine).get_columns(table)}
        assert not cols & {"user_id", "email", "ip", "anonymous_id", "session_id", "user_agent", "device_id", "created_at", "timestamp", "query", "raw"}
        assert not any(c["name"] for fk in [sa_inspect(engine).get_foreign_keys(table)] for c in fk)


def test_rate_cap_per_term(monkeypatch):
    _on(monkeypatch)
    _offer()
    for _ in range(sd.MAX_PER_TERM_PER_MINUTE + 15):
        sd.record_search("golden", None, 1)
    with SessionLocal() as db:
        assert db.scalar(select(sd.SearchDemandDaily.searches)) == sd.MAX_PER_TERM_PER_MINUTE


def test_distinct_terms_cap(monkeypatch):
    _on(monkeypatch)
    monkeypatch.setattr(sd, "MAX_DISTINCT_TERMS_PER_DAY", 2)
    _offer(title="Alfa Beta Gama Delta")
    for w in ("alfa", "beta", "gama", "delta"):
        sd.record_search(w, None, 1)
    with SessionLocal() as db:
        n_terms = db.query(sd.SearchDemandDaily).filter_by(key_type="term").count()
        cap = db.query(sd.SearchDemandDaily).filter_by(key_type="rejected:cap").first()
    assert n_terms == 2 and cap and cap.searches == 2 and cap.key_value == ""


def test_failure_in_recording_is_swallowed(monkeypatch):
    _on(monkeypatch)
    monkeypatch.setattr(sd, "classify", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    sd.record_search("golden", None, 1)  # não levanta


# ── retenção ──────────────────────────────────────────────────────────────────

def test_retention_summarizes_5plus_and_deletes_old():
    today = date(2026, 11, 14)
    old = today - timedelta(days=100)  # setembro/2026 ou agosto
    with SessionLocal() as db:
        db.add_all([
            sd.SearchDemandDaily(day=old, key_type="term", key_value="golden", searches=4, zero_results=1),
            sd.SearchDemandDaily(day=old - timedelta(days=1), key_type="term", key_value="golden", searches=3, zero_results=0),
            sd.SearchDemandDaily(day=old, key_type="term", key_value="raro", searches=2, zero_results=2),
            sd.SearchDemandDaily(day=old, key_type="other", key_value="", searches=50, zero_results=0),
            sd.SearchDemandDaily(day=today, key_type="term", key_value="recente", searches=1, zero_results=0),
        ])
        db.commit()
        out = sd.run_retention(db, today)
        assert out["deleted_daily"] == 4
        monthly = db.execute(select(sd.SearchDemandMonthly.key_value, sd.SearchDemandMonthly.searches)).all()
        assert sum(n for k, n in monthly if k == "golden") >= 4 and all(k == "golden" for k, _ in monthly)
        assert "raro" not in [k for k, _ in monthly]            # contagem baixa não sobrevive ao resumo
        assert db.query(sd.SearchDemandDaily).filter_by(key_value="recente").count() == 1
        sd.run_retention(db, today)  # idempotente


def test_retention_drops_monthly_older_than_24_months():
    today = date(2026, 11, 14)
    with SessionLocal() as db:
        db.add_all([sd.SearchDemandMonthly(month=date(2024, 10, 1), key_type="term", key_value="velho", searches=9, zero_results=0),
                    sd.SearchDemandMonthly(month=date(2024, 12, 1), key_type="term", key_value="ok", searches=9, zero_results=0)])
        db.commit()
        sd.run_retention(db, today)
        assert [r for (r,) in db.execute(select(sd.SearchDemandMonthly.key_value)).all()] == ["ok"]


# ── relatório ─────────────────────────────────────────────────────────────────

def test_report_min_threshold_and_separations(monkeypatch):
    today = sd.today_br()
    _offer(gtin="7896016401008", title="Racao Golden Adulto Frango 15kg")
    with SessionLocal() as db:
        db.add_all([
            sd.SearchDemandDaily(day=today, key_type="term", key_value="golden adulto", searches=5, zero_results=0),   # resultado, sem link ML
            sd.SearchDemandDaily(day=today, key_type="term", key_value="scalibor", searches=4, zero_results=4),       # sem resultado
            sd.SearchDemandDaily(day=today, key_type="term", key_value="nexgard", searches=2, zero_results=2),        # abaixo do piso
            sd.SearchDemandDaily(day=today, key_type="other", key_value="", searches=7, zero_results=0),
            sd.SearchDemandDaily(day=today, key_type="rejected:contact", key_value="", searches=2, zero_results=0),
        ])
        db.commit()
        rep = sd.build_report(db, 30)
    labels = {i["key"] for i in rep["items"]}
    assert labels == {"golden adulto", "scalibor"}                      # "nexgard" (2 buscas) nunca aparece
    assert rep["unrecognized_searches"] == 7 and rep["rejected_total"] == 2
    assert [i["key"] for i in rep["no_result"]] == ["scalibor"]
    gold = next(i for i in rep["items"] if i["key"] == "golden adulto")
    assert gold["commission"] == {"cobasi": True, "mercadolivre": False, "amazon": None}
    assert gold["ml_gap"] is True and gold["no_commissionable_link"] is False
    assert {i["key"] for i in rep["opportunities"]} == {"golden adulto", "scalibor"}


# ── não-interferência com as buscas ───────────────────────────────────────────

def test_search_response_identical_with_flag_on_and_off(client, monkeypatch):
    monkeypatch.setenv("AWIN_ENABLED", "true")
    monkeypatch.setenv("AWIN_SHADOW_MODE", "false")
    get_settings.cache_clear()
    _offer()
    off = client.get("/commerce/awin-search", params={"q": "golden"})
    _on(monkeypatch)
    sd.reset_caches_for_tests()
    on = client.get("/commerce/awin-search", params={"q": "golden"})
    assert off.status_code == on.status_code == 200 and off.json() == on.json()
    with SessionLocal() as db:
        assert db.query(sd.SearchDemandDaily).filter_by(key_type="term", key_value="golden").count() == 1


def test_search_still_works_when_recording_explodes(client, monkeypatch):
    monkeypatch.setenv("AWIN_ENABLED", "true")
    monkeypatch.setenv("AWIN_SHADOW_MODE", "false")
    get_settings.cache_clear()
    _on(monkeypatch)
    _offer()
    monkeypatch.setattr(sd, "SessionLocal", lambda: (_ for _ in ()).throw(RuntimeError("db down")))
    r = client.get("/commerce/awin-search", params={"q": "golden"})
    assert r.status_code == 200 and len(r.json()["results"]) == 1


def test_admin_report_requires_admin(client):
    assert client.get("/v1/admin/search-demand/report").status_code in (401, 403)


def test_collection_hooks_are_after_response_only():
    """A coleta usa BackgroundTasks (depois da resposta) nas duas rotas; nunca dentro da montagem do resultado."""
    import src.main as m
    assert inspect.getsource(m).count("background_tasks.add_task(_search_demand.record_search") == 2
    assert "record_search" not in inspect.getsource(m._commerce_awin_search_impl)
