"""Admin remove foto de pet que não é pet (já publicada) e avisa o tutor
por push + e-mail — apaga arquivo, limpa o banco, sem tocar em mais nada."""
from pathlib import Path

from src.admin.models import AdminUser
from src.config import get_settings
from src.db import SessionLocal
from src.moderation.models import PhotoModerationDecision
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password


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


def _tutor_with_photo(photo_key: str, email="vitor@example.com"):
    """Tutor + pet com foto real em disco (uploads/), como em produção."""
    path = Path("uploads") / photo_key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"fake-jpeg-bytes")
    db = SessionLocal()
    try:
        u = User(email=email, password_hash=hash_password("x"), name="Vitor Tavares")
        db.add(u)
        db.commit()
        pet = Pet(user_id=u.id, name="Thor", species="dog", photo=photo_key)
        db.add(pet)
        db.commit()
        return u.id, pet.id
    finally:
        db.close()


def _spy(monkeypatch):
    pushes, mails = [], []
    monkeypatch.setattr("src.notifications.push_to_user",
                        lambda uid, payload, *a, **k: (pushes.append((uid, payload)) or 1))
    monkeypatch.setattr("src.mailer.send_mail",
                        lambda *, to, subject, body_text, **kw: (mails.append((to, subject, body_text)) or True))
    return pushes, mails


def test_remove_foto_apaga_arquivo_banco_e_avisa_por_push_e_email(client, monkeypatch):
    headers = _admin_headers()
    pushes, mails = _spy(monkeypatch)
    uid, pet_id = _tutor_with_photo("pets/naopet-1.jpg")

    r = client.post(f"/v1/admin/moderation/pets/{pet_id}/remove-photo", json={}, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["photo_removed"] is True and body["push_sent"] == 1 and body["email_sent"] is True

    # arquivo apagado do disco
    assert not (Path("uploads") / "pets/naopet-1.jpg").exists()
    # banco limpo + auditoria (só metadados, com quem decidiu)
    db = SessionLocal()
    try:
        assert db.query(Pet).filter(Pet.id == pet_id).first().photo is None
        d = db.query(PhotoModerationDecision).filter(PhotoModerationDecision.entity_id == pet_id).first()
        assert d.status == "rejected" and d.reviewed_by_admin_id and d.final_public_key is None
    finally:
        db.close()

    # push + e-mail gentis, pro tutor certo, sem acusação
    assert pushes[0][0] == uid
    assert "espaço é reservado para a foto do seu pet" in pushes[0][1]["body"]
    to, subject, text = mails[0]
    assert to == "vitor@example.com" and "não foi aprovada" in subject
    assert "reservado para a foto do seu pet" in text and "Thor" in text


def test_remove_foto_limpa_alerta_de_pet_sumido_que_herdou_a_foto(client, monkeypatch):
    from src.missing_pets import MissingPet

    headers = _admin_headers()
    _spy(monkeypatch)
    uid, pet_id = _tutor_with_photo("pets/naopet-2.jpg", email="v2@example.com")
    db = SessionLocal()
    try:
        mp = MissingPet(user_id=uid, pet_id=pet_id, pet_name="Thor", species="dog",
                        contact="31999990000", photo_url="pets/naopet-2.jpg", lat=-19.9, lng=-43.9)
        db.add(mp)
        db.commit()
        mp_id = mp.id
    finally:
        db.close()

    r = client.post(f"/v1/admin/moderation/pets/{pet_id}/remove-photo", json={}, headers=headers)
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        assert db.query(MissingPet).filter(MissingPet.id == mp_id).first().photo_url is None
    finally:
        db.close()


def test_falha_no_push_e_no_email_nao_desfaz_a_remocao(client, monkeypatch):
    headers = _admin_headers()

    def boom(*a, **k):
        raise RuntimeError("fora do ar")
    monkeypatch.setattr("src.notifications.push_to_user", boom)
    monkeypatch.setattr("src.mailer.send_mail", boom)
    _, pet_id = _tutor_with_photo("pets/naopet-3.jpg", email="v3@example.com")

    r = client.post(f"/v1/admin/moderation/pets/{pet_id}/remove-photo", json={}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["push_sent"] == 0 and r.json()["email_sent"] is False
    assert not (Path("uploads") / "pets/naopet-3.jpg").exists()   # foto sai mesmo assim


def test_pet_sem_foto_e_pet_inexistente(client, monkeypatch):
    headers = _admin_headers()
    _spy(monkeypatch)
    db = SessionLocal()
    try:
        u = User(email="v4@example.com", password_hash=hash_password("x"), name="V4")
        db.add(u)
        db.commit()
        pet = Pet(user_id=u.id, name="Semfoto", species="cat")
        db.add(pet)
        db.commit()
        pet_id = pet.id
    finally:
        db.close()
    assert client.post(f"/v1/admin/moderation/pets/{pet_id}/remove-photo", json={}, headers=headers).status_code == 400
    assert client.post("/v1/admin/moderation/pets/nao-existe/remove-photo", json={}, headers=headers).status_code == 404


def test_so_admin_com_jwt_pode_remover_chave_de_leitura_nao(client, monkeypatch):
    _spy(monkeypatch)
    _, pet_id = _tutor_with_photo("pets/naopet-5.jpg", email="v5@example.com")
    monkeypatch.setattr(get_settings(), "admin_ops_api_key", "test-ops-key", raising=False)

    assert client.post(f"/v1/admin/moderation/pets/{pet_id}/remove-photo", json={}).status_code in (401, 403)
    r = client.post(f"/v1/admin/moderation/pets/{pet_id}/remove-photo", json={},
                    headers={"X-Admin-Api-Key": "test-ops-key"})
    assert r.status_code in (401, 403)
    assert (Path("uploads") / "pets/naopet-5.jpg").exists()   # nada foi apagado
    (Path("uploads") / "pets/naopet-5.jpg").unlink()
