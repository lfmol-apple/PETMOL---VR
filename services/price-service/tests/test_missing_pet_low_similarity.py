"""Pet Sumido — decisão do dono (26/09/2026): o achador pode enviar o aviso ao tutor MESMO com
índice de semelhança baixo. Antes, /match-photo descartava candidatos com score < 50 e quem estava
com o pet não tinha para quem enviar; /analyze-photo também escondia o índice baixo."""
import uuid

import pytest
from fastapi.testclient import TestClient

import src.missing_pets as mp_mod
from src.db import Base, SessionLocal, engine
from src.main import app
from src.missing_pets import FoundReport, MissingPet

client = TestClient(app)
PHOTO = "data:image/jpeg;base64,AAAA"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(mp_mod, "_decode_finder_photo", lambda _p: (b"x", "image/jpeg"))
    monkeypatch.setattr(mp_mod, "_assess_finder_photos_quality", lambda _p: {"ok": True, "checks": [], "warnings": []})
    monkeypatch.setattr(mp_mod, "_rank_candidates_by_visual_fingerprint", lambda _db, c, _p: (c, {}))
    monkeypatch.setattr(mp_mod, "_save_found_report_video", lambda _d: "/uploads/found_videos/t.mp4")
    monkeypatch.setattr(mp_mod, "_validate_proof_challenge", lambda *_a, **_k: (True, []))
    mp_mod._rl_events.clear()  # limite por IP em memória não pode vazar entre arquivos de teste
    yield
    mp_mod._rl_events.clear()
    with SessionLocal() as db:
        db.query(FoundReport).delete()
        db.query(MissingPet).delete()
        db.commit()


def _alert(name: str) -> str:
    with SessionLocal() as db:
        mp = MissingPet(
            id=str(uuid.uuid4()), user_id="owner", pet_id=None, pet_name=name, contact="x",
            status="active", current_radius_km=2.0, photo_url="/uploads/missing/x.jpg",
        )
        db.add(mp)
        db.commit()
        return mp.id


def test_match_photo_keeps_low_similarity_candidates_and_orders_by_score(monkeypatch):
    low, mid = _alert("Baixa"), _alert("Media")
    seq = iter([(12, "cores diferentes"), (60, "porte parecido")])
    monkeypatch.setattr(mp_mod, "_analyze_photo_compatibility", lambda *_a, **_k: next(seq))
    r = client.post("/missing-pets/match-photo", json={"finder_photos": [PHOTO]})
    assert r.status_code == 200
    data = r.json()
    assert len(data["matches"]) == 2  # antes: o de 12 era descartado
    levels = {m["pet_name"]: m["confidence_level"] for m in data["matches"]}
    assert sorted(levels.values()) == ["unlikely", "weak_candidate"]
    assert all(m["requires_human_confirmation"] for m in data["matches"])
    # o mais parecido vem primeiro
    assert data["matches"][0]["confidence_level"] == "weak_candidate"


def test_match_photo_with_score_zero_still_lists_candidate(monkeypatch):
    _alert("SemAnalise")
    monkeypatch.setattr(mp_mod, "_analyze_photo_compatibility", lambda *_a, **_k: (0, ""))
    matches = client.post("/missing-pets/match-photo", json={"finder_photos": [PHOTO]}).json()["matches"]
    assert len(matches) == 1 and matches[0]["confidence_label"] == "Pouca semelhança"


def test_analyze_photo_reports_low_score_instead_of_hiding_it(monkeypatch):
    mp_id = _alert("Rex")
    monkeypatch.setattr(mp_mod, "_analyze_photo_compatibility", lambda *_a, **_k: (20, "outro pelo"))
    d = client.post(f"/missing-pets/{mp_id}/analyze-photo", json={"finder_photos": [PHOTO]}).json()
    assert d["confidence_level"] == "unlikely" and d["confidence_label"] == "Pouca semelhança"
    assert d["requires_human_confirmation"] is True


def test_low_similarity_report_is_accepted_end_to_end(monkeypatch):
    mp_id = _alert("Rex")
    monkeypatch.setattr(mp_mod, "_analyze_photo_compatibility", lambda *_a, **_k: (5, "muito diferente"))
    r = client.post(f"/missing-pets/{mp_id}/report-found", json={
        "finder_contact": "(31) 99999-8888", "finder_photos": [], "has_possession": True,
        "finder_video": "data:video/mp4;base64,AAAA", "proof_challenge": "x", "proof_challenge_id": "y", "pre_score": 5,
    })
    assert r.status_code == 201 and r.json()["status"] == "reported"
    with SessionLocal() as db:
        rep = db.query(FoundReport).filter(FoundReport.missing_pet_id == mp_id).first()
        assert rep is not None and rep.compatibility_score == 5
