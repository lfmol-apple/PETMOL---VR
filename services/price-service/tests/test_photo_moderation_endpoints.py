"""Integração: os endpoints reais de upload (perfil do pet, Pet Sumido,
avistamento, achador) respeitando a moderação — não só a lógica isolada
(ver test_photo_moderation.py). `VisionService.moderate_pet_photo`
mockado na fronteira com a rede em todo teste."""
from __future__ import annotations

import base64
import io
import json

import pytest
from PIL import Image

from src.admin.models import AdminUser
from src.db import SessionLocal
from src.moderation.models import PhotoModerationDecision
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password


def _make_test_photo() -> bytes:
    """Imagem com contraste/textura de verdade — uma cor sólida falha no
    checador de qualidade JÁ existente (`_assess_finder_photo_quality`,
    stddev de brilho baixo demais = "baixo contraste"), que é anterior e
    independente da moderação de conteúdo que este arquivo testa."""
    from PIL import ImageDraw

    img = Image.new("RGB", (600, 500), color=(90, 140, 200))
    draw = ImageDraw.Draw(img)
    draw.ellipse((150, 100, 450, 400), fill=(210, 160, 90))
    draw.rectangle((0, 400, 600, 500), fill=(40, 60, 30))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=90)
    return out.getvalue()


def _jpeg_b64() -> str:
    return "data:image/jpeg;base64," + base64.b64encode(_make_test_photo()).decode()


def _jpeg_bytes() -> bytes:
    return _make_test_photo()


@pytest.fixture(autouse=True)
def _clear_rejection_lockout():
    """O bloqueio por recusas repetidas (5/hora por IP) é estado de módulo: sem limpar, os
    testes de recusa deste arquivo se atrapalham entre si."""
    import src.moderation.service as service_mod
    service_mod._rejection_events.clear()
    yield
    service_mod._rejection_events.clear()


def _mock_vision(monkeypatch, classification: dict):
    async def _fake(self, image_bytes):
        return classification
    monkeypatch.setattr("src.vision.service.VisionService.moderate_pet_photo", _fake)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-fake")


APPROVED_CLASSIFICATION = {
    "animal_present": True, "species": "dog", "pet_is_main_subject": True,
    "nudity_or_sexual_content": False, "graphic_violence_or_animal_cruelty": False,
    "inappropriate_content_involving_minors": False, "image_type": "real_photo",
    "confidence": 0.9, "reason": "cão real, bem enquadrado",
}
REJECTED_CLASSIFICATION = {
    "animal_present": False, "species": None, "pet_is_main_subject": False,
    "nudity_or_sexual_content": False, "graphic_violence_or_animal_cruelty": False,
    "inappropriate_content_involving_minors": False, "image_type": "other",
    "confidence": 0.9, "reason": "sem pet identificável",
}
PENDING_CLASSIFICATION = {
    "animal_present": True, "species": "dog", "pet_is_main_subject": False,
    "nudity_or_sexual_content": False, "graphic_violence_or_animal_cruelty": False,
    "inappropriate_content_involving_minors": False, "image_type": "real_photo",
    "confidence": 0.5, "reason": "pet pouco visível",
}


def _signup(client, cid, email):
    client.post("/auth/signup", json={"name": "Tutor", "email": email, "password": "senha123",
                                       "terms_accepted": True}, headers={"X-PETMOL-CLIENT-ID": cid})
    r = client.post("/auth/login", json={"email": email, "password": "senha123"},
                     headers={"X-PETMOL-CLIENT-ID": cid})
    return r.json()["access_token"]


def _admin_headers():
    db = SessionLocal()
    try:
        u = User(email="leonardofmol@gmail.com", password_hash=hash_password("x"), name="Admin")
        db.add(u)
        db.commit()
        db.add(AdminUser(user_id=u.id, role="master"))
        db.commit()
        return {"Authorization": f"Bearer {create_access_token(u.id)}"}
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════════
#  Perfil do pet — POST /pets/{id}/photo
# ═══════════════════════════════════════════════════════════════════════

def test_pet_photo_aprovada_atualiza_o_pet(client, monkeypatch):
    _mock_vision(monkeypatch, APPROVED_CLASSIFICATION)
    token = _signup(client, "cid-modA", "modA@example.com")
    headers = {"Authorization": f"Bearer {token}", "X-PETMOL-CLIENT-ID": "cid-modA"}
    pet = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=headers).json()

    r = client.post(f"/pets/{pet['id']}/photo", headers=headers,
                     files={"file": ("foto.jpg", _jpeg_bytes(), "image/jpeg")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "approved"
    assert "photo_url" in body

    updated = client.get(f"/pets/{pet['id']}", headers=headers).json()
    assert updated["photo"] is not None


def test_pet_photo_rejeitada_nao_muda_o_pet_e_devolve_422(client, monkeypatch):
    _mock_vision(monkeypatch, REJECTED_CLASSIFICATION)
    token = _signup(client, "cid-modB", "modB@example.com")
    headers = {"Authorization": f"Bearer {token}", "X-PETMOL-CLIENT-ID": "cid-modB"}
    pet = client.post("/pets", json={"name": "Mia", "species": "cat"}, headers=headers).json()

    r = client.post(f"/pets/{pet['id']}/photo", headers=headers,
                     files={"file": ("foto.jpg", _jpeg_bytes(), "image/jpeg")})
    assert r.status_code == 422
    assert "Não foi possível aprovar" in r.json()["detail"]

    unchanged = client.get(f"/pets/{pet['id']}", headers=headers).json()
    assert unchanged["photo"] is None


def test_pet_photo_pendente_nao_muda_o_pet_ainda(client, monkeypatch):
    _mock_vision(monkeypatch, PENDING_CLASSIFICATION)
    token = _signup(client, "cid-modC", "modC@example.com")
    headers = {"Authorization": f"Bearer {token}", "X-PETMOL-CLIENT-ID": "cid-modC"}
    pet = client.post("/pets", json={"name": "Thor", "species": "dog"}, headers=headers).json()

    r = client.post(f"/pets/{pet['id']}/photo", headers=headers,
                     files={"file": ("foto.jpg", _jpeg_bytes(), "image/jpeg")})
    assert r.status_code == 200
    assert r.json()["status"] == "pending"

    unchanged = client.get(f"/pets/{pet['id']}", headers=headers).json()
    assert unchanged["photo"] is None


def test_pet_photo_arquivo_invalido_e_recusado_antes_da_ia(client, monkeypatch):
    called = {"n": 0}

    async def _should_not_be_called(self, image_bytes):
        called["n"] += 1
        return APPROVED_CLASSIFICATION
    monkeypatch.setattr("src.vision.service.VisionService.moderate_pet_photo", _should_not_be_called)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-fake")

    token = _signup(client, "cid-modD", "modD@example.com")
    headers = {"Authorization": f"Bearer {token}", "X-PETMOL-CLIENT-ID": "cid-modD"}
    pet = client.post("/pets", json={"name": "Bob", "species": "dog"}, headers=headers).json()

    r = client.post(f"/pets/{pet['id']}/photo", headers=headers,
                     files={"file": ("foto.jpg", b"nao e uma imagem de verdade", "image/jpeg")})
    assert r.status_code == 400
    assert called["n"] == 0  # sanitização barra ANTES de gastar chamada de IA


# ═══════════════════════════════════════════════════════════════════════
#  Pet Sumido — /missing-pets/upload-photo e /missing-pets/public-report
# ═══════════════════════════════════════════════════════════════════════

def test_missing_pet_upload_photo_aprovada(client, monkeypatch):
    _mock_vision(monkeypatch, APPROVED_CLASSIFICATION)
    r = client.post("/missing-pets/upload-photo", json={"photo_base64": _jpeg_b64()})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "approved"
    assert body["photo_url"].startswith("pets/")


def test_missing_pet_upload_photo_rejeitada(client, monkeypatch):
    _mock_vision(monkeypatch, REJECTED_CLASSIFICATION)
    r = client.post("/missing-pets/upload-photo", json={"photo_base64": _jpeg_b64()})
    assert r.status_code == 422
    assert "Não foi possível aprovar" in r.json()["detail"]


def test_photo_url_arbitraria_no_post_direto_e_ignorada_sem_bloquear_alerta(client, monkeypatch):
    """Contorno direto pela API: mandar um photo_url que nunca passou por
    moderação nenhuma. O alerta é criado (Pet Sumido é urgente), mas SEM
    essa foto não-verificada."""
    token = _signup(client, "cid-modE", "modE@example.com")
    headers = {"Authorization": f"Bearer {token}", "X-PETMOL-CLIENT-ID": "cid-modE"}

    r = client.post("/missing-pets", json={
        "pet_name": "Fantasma", "contact": "11999999999",
        "photo_url": "pets/isso-nunca-foi-moderado.jpg",
    }, headers=headers)
    assert r.status_code == 201, r.text
    mp_id = r.json()["id"]

    from src.db import SessionLocal
    from src.missing_pets import MissingPet
    db = SessionLocal()
    try:
        mp = db.query(MissingPet).filter(MissingPet.id == mp_id).first()
        assert mp.photo_url is None  # a string não-verificada nunca chega a ser gravada
    finally:
        db.close()


def test_photo_url_realmente_aprovada_e_aceita(client, monkeypatch):
    _mock_vision(monkeypatch, APPROVED_CLASSIFICATION)
    token = _signup(client, "cid-modF", "modF@example.com")
    headers = {"Authorization": f"Bearer {token}", "X-PETMOL-CLIENT-ID": "cid-modF"}

    uploaded = client.post("/missing-pets/upload-photo", json={"photo_base64": _jpeg_b64()})
    photo_url = uploaded.json()["photo_url"]

    r = client.post("/missing-pets", json={
        "pet_name": "Bibi", "contact": "11999999999", "photo_url": photo_url,
    }, headers=headers)
    assert r.status_code == 201

    from src.db import SessionLocal
    from src.missing_pets import MissingPet
    db = SessionLocal()
    try:
        mp = db.query(MissingPet).filter(MissingPet.id == r.json()["id"]).first()
        assert mp.photo_url == photo_url
    finally:
        db.close()


def test_public_report_com_foto_rejeitada_nao_cria_alerta(client, monkeypatch):
    _mock_vision(monkeypatch, REJECTED_CLASSIFICATION)
    r = client.post("/missing-pets/public-report", json={
        "pet_name": "Desconhecido", "reporter_contact": "11988887777",
        "photo_base64": _jpeg_b64(),
    })
    assert r.status_code == 422


def test_public_report_com_foto_pendente_cria_alerta_sem_foto_publica(client, monkeypatch):
    _mock_vision(monkeypatch, PENDING_CLASSIFICATION)
    r = client.post("/missing-pets/public-report", json={
        "pet_name": "Talvez", "reporter_contact": "11988887777",
        "photo_base64": _jpeg_b64(),
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["photo_pending_review"] is True
    assert body["photo_pending_message"]

    from src.db import SessionLocal
    from src.missing_pets import MissingPet
    db = SessionLocal()
    try:
        mp = db.query(MissingPet).filter(MissingPet.id == body["id"]).first()
        assert mp.photo_url is None  # pendente nunca fica pública
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════════
#  Avistamento — POST /pet-sightings
# ═══════════════════════════════════════════════════════════════════════

def test_sighting_foto_aprovada_entra_no_registro(client, monkeypatch):
    _mock_vision(monkeypatch, APPROVED_CLASSIFICATION)
    r = client.post("/pet-sightings", json={
        "finder_photos": [_jpeg_b64()],
        "situation": "visto_no_local",
    })
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "created"


def test_sighting_apenas_fotos_rejeitadas_devolve_422(client, monkeypatch):
    _mock_vision(monkeypatch, REJECTED_CLASSIFICATION)
    r = client.post("/pet-sightings", json={
        "finder_photos": [_jpeg_b64()],
        "situation": "visto_no_local",
    })
    assert r.status_code == 422


# ═══════════════════════════════════════════════════════════════════════
#  Painel admin de moderação
# ═══════════════════════════════════════════════════════════════════════

def test_admin_lista_e_aprova_foto_pendente(client, monkeypatch):
    _mock_vision(monkeypatch, PENDING_CLASSIFICATION)
    admin_headers = _admin_headers()

    r = client.post("/missing-pets/upload-photo", json={"photo_base64": _jpeg_b64()})
    assert r.json()["status"] == "pending"

    listed = client.get("/v1/admin/moderation?status=pending", headers=admin_headers)
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert len(items) >= 1
    decision_id = items[0]["id"]

    approved = client.post(f"/v1/admin/moderation/{decision_id}/approve", json={"note": "ok, deixei passar"}, headers=admin_headers)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    summary = client.get("/v1/admin/moderation/summary", headers=admin_headers).json()
    assert summary["approved"] >= 1


def test_admin_rejeita_foto_pendente(client, monkeypatch):
    _mock_vision(monkeypatch, PENDING_CLASSIFICATION)
    admin_headers = _admin_headers()

    client.post("/missing-pets/upload-photo", json={"photo_base64": _jpeg_b64()})
    listed = client.get("/v1/admin/moderation?status=pending", headers=admin_headers).json()
    decision_id = listed["items"][0]["id"]

    r = client.post(f"/v1/admin/moderation/{decision_id}/reject", json={"note": "não deu pra confirmar"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"


def test_foto_pendente_ou_rejeitada_nunca_tem_url_publica_sem_admin(client, monkeypatch):
    """Só o endpoint de admin autenticado consegue ver a foto — nunca uma
    URL pública direta."""
    _mock_vision(monkeypatch, PENDING_CLASSIFICATION)
    r = client.post("/missing-pets/upload-photo", json={"photo_base64": _jpeg_b64()})
    assert "photo_url" not in r.json() or r.json().get("photo_url") is None

    admin_headers = _admin_headers()
    listed = client.get("/v1/admin/moderation?status=pending", headers=admin_headers).json()
    decision_id = listed["items"][0]["id"]

    without_auth = client.get(f"/v1/admin/moderation/{decision_id}/image")
    assert without_auth.status_code in (401, 403)

    with_auth = client.get(f"/v1/admin/moderation/{decision_id}/image", headers=admin_headers)
    assert with_auth.status_code == 200


# ═══════════════════════════════════════════════════════════════════════
#  Painel: fotos recusadas (não sensíveis) ficam guardadas em área privada
#  por 30 dias pro admin conferir; as sensíveis nunca; aprovadas mostram a foto
# ═══════════════════════════════════════════════════════════════════════

def test_recusada_nao_sensivel_fica_guardada_privada_e_o_admin_ve(client, monkeypatch):
    _mock_vision(monkeypatch, REJECTED_CLASSIFICATION)
    assert client.post("/missing-pets/upload-photo", json={"photo_base64": _jpeg_b64()}).status_code == 422
    admin_headers = _admin_headers()

    item = client.get("/v1/admin/moderation?status=rejected", headers=admin_headers).json()["items"][0]
    assert item["has_image"] is True and item["image_note"] is None and item["photo_key"] is None

    img = client.get(f"/v1/admin/moderation/{item['id']}/image", headers=admin_headers)
    assert img.status_code == 200 and img.content[:2] == b"\xff\xd8"          # JPEG de verdade
    assert client.get(f"/v1/admin/moderation/{item['id']}/image").status_code in (401, 403)   # sem login: nunca


@pytest.mark.parametrize("flag", [
    "nudity_or_sexual_content", "graphic_violence_or_animal_cruelty", "inappropriate_content_involving_minors",
])
def test_recusada_por_conteudo_sensivel_nunca_e_guardada(client, monkeypatch, flag):
    _mock_vision(monkeypatch, {**REJECTED_CLASSIFICATION, "animal_present": True, flag: True})
    assert client.post("/missing-pets/upload-photo", json={"photo_base64": _jpeg_b64()}).status_code == 422
    admin_headers = _admin_headers()

    item = client.get("/v1/admin/moderation?status=rejected", headers=admin_headers).json()["items"][0]
    assert item["has_image"] is False
    assert "sensível" in item["image_note"]
    assert client.get(f"/v1/admin/moderation/{item['id']}/image", headers=admin_headers).status_code == 404


def test_aprovada_devolve_a_chave_publica_pra_mostrar_a_foto(client, monkeypatch):
    _mock_vision(monkeypatch, APPROVED_CLASSIFICATION)
    r = client.post("/missing-pets/upload-photo", json={"photo_base64": _jpeg_b64()})
    assert r.json()["status"] == "approved"
    item = client.get("/v1/admin/moderation?status=approved", headers=_admin_headers()).json()["items"][0]
    assert item["photo_key"] and item["photo_key"].endswith(".jpg")
    assert item["has_image"] is False           # a foto é pública: o painel usa a URL normal


def test_fotos_recusadas_ha_mais_de_30_dias_sao_apagadas(client, monkeypatch):
    from datetime import datetime, timedelta, timezone
    from src.moderation import storage as review_storage
    from src.moderation.service import purge_expired_rejected_images

    _mock_vision(monkeypatch, REJECTED_CLASSIFICATION)
    client.post("/missing-pets/upload-photo", json={"photo_base64": _jpeg_b64()})
    db = SessionLocal()
    try:
        d = db.query(PhotoModerationDecision).filter(PhotoModerationDecision.status == "rejected").first()
        assert d.image_retained is True and review_storage.read_pending(d.storage_key) is not None
        d.created_at = datetime.now(timezone.utc) - timedelta(days=31)
        db.commit()

        assert purge_expired_rejected_images(db) == 1
        db.refresh(d)
        assert d.image_retained is False
        assert review_storage.read_pending(d.storage_key) is None
    finally:
        db.close()
