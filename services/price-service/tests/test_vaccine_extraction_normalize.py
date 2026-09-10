"""Pós-processamento da leitura de carteirinha (sem chamar o Gemini).

Cobre os defeitos vistos nas cartas reais do usuário: o Gemini repetia a mesma
vacina 2–3x (mesma marca + mesma data) e a confiança nunca chegava na resposta.
"""

from src.vision.service import VisionService


def test_dedupe_collapses_same_brand_same_date():
    rows = [
        {"name": "V10", "commercial_brand": "VANGUARD® PLUS", "date": "2017-07-31",
         "next_date": "2017-08-21", "field_confidence": {"date": 0.9}},
        {"name": "V10", "commercial_brand": "Vanguard Plus", "date": "2017-07-31",
         "next_date": "2017-08-21", "field_confidence": {"date": 0.95}},
        {"name": "V10", "commercial_brand": "VANGUARD® PLUS", "date": "2017-08-30",
         "next_date": "2017-09-20"},
    ]
    out = VisionService._dedupe_vaccines(rows)
    dates = sorted(v["date"] for v in out)
    assert dates == ["2017-07-31", "2017-08-30"]


def test_dedupe_drops_dateless_ghost_of_dated_row():
    rows = [
        {"name": "Vacina Múltipla (V10)", "commercial_brand": "Vanguard Plus", "date": "2026-06-20"},
        {"name": "Vacina Múltipla (V10)", "commercial_brand": "Vanguard Plus", "date": None},
    ]
    out = VisionService._dedupe_vaccines(rows)
    assert len(out) == 1
    assert out[0]["date"] == "2026-06-20"


def test_dedupe_keeps_two_real_shots_different_dates():
    rows = [
        {"name": "Raiva", "commercial_brand": "Nobivac Raiva", "date": "2019-11-14"},
        {"name": "Raiva", "commercial_brand": "Nobivac Raiva", "date": "2020-11-18"},
    ]
    out = VisionService._dedupe_vaccines(rows)
    assert len(out) == 2


def test_dedupe_keeps_dateless_when_no_dated_sibling():
    rows = [
        {"name": "Giárdia", "commercial_brand": "", "date": None},
    ]
    out = VisionService._dedupe_vaccines(rows)
    assert len(out) == 1


def test_dedupe_prefers_more_complete_row():
    rows = [
        {"name": "V10", "commercial_brand": "Duramune", "date": "2020-11-18"},
        {"name": "V10", "commercial_brand": "Duramune", "date": "2020-11-18",
         "next_date": "2021-11-18", "veterinarian": "Dr. Bruno", "notes": "lote X"},
    ]
    out = VisionService._dedupe_vaccines(rows)
    assert len(out) == 1
    assert out[0]["veterinarian"] == "Dr. Bruno"
