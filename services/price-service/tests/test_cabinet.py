"""Armário do Pet: CRUD, categoria inferida, cálculo de 'acabando', isolamento entre tutores."""
import uuid
from datetime import date, timedelta

from src.db import SessionLocal
from src.pets.cabinet import infer_category
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password


def _tutor(db):
    u = User(id=str(uuid.uuid4()), email=f"arm.{uuid.uuid4().hex[:8]}@example.com", name="Tutor", password_hash=hash_password("x"))
    db.add(u); db.commit()
    p = Pet(id=str(uuid.uuid4()), user_id=u.id, name="Mel", species="dog", sex="female")
    db.add(p); db.commit()
    return p.id, {"Authorization": f"Bearer {create_access_token(u.id)}"}


def _setup():
    db = SessionLocal()
    try:
        return _tutor(db)
    finally:
        db.close()


def test_categoria_inferida_do_nome():
    assert infer_category("Gel Dental Pet Clean 60g") == "higiene"
    assert infer_category("Hidratante de patinhas Dermapet") == "higiene"
    assert infer_category("Ração Premier Gatos") == "alimentacao"
    assert infer_category("Vermífugo Drontal") == "saude"
    assert infer_category("Bolinha de tênis") == "brinquedos"
    assert infer_category("Peitoral Truelove") == "passeio"
    assert infer_category("Xyz qualquer") == "outros"


def test_adicionar_listar_e_apagar():
    pid, hdr = _setup()
    r = client_post = None
    from fastapi.testclient import TestClient
    from src.main import app
    c = TestClient(app)
    r = c.post(f"/pets/{pid}/cabinet", headers=hdr, json={"name": "Gel dental canino"})
    assert r.status_code == 201
    body = r.json()
    assert body["category"] == "higiene" and body["days_left"] is None
    # repetido (mesmo nome) devolve o existente
    r2 = c.post(f"/pets/{pid}/cabinet", headers=hdr, json={"name": "gel dental canino"})
    assert r2.json()["id"] == body["id"]
    assert len(c.get(f"/pets/{pid}/cabinet", headers=hdr).json()) == 1
    assert c.delete(f"/pets/{pid}/cabinet/{body['id']}", headers=hdr).status_code == 204
    assert c.get(f"/pets/{pid}/cabinet", headers=hdr).json() == []


def test_duracao_calcula_dias_restantes_e_reinicia():
    from fastapi.testclient import TestClient
    from src.main import app
    c = TestClient(app)
    pid, hdr = _setup()
    started = (date.today() - timedelta(days=25)).isoformat()
    it = c.post(f"/pets/{pid}/cabinet", headers=hdr, json={"name": "Shampoo neutro", "duration_days": 30, "started_on": started}).json()
    assert it["days_left"] == 5
    it = c.patch(f"/pets/{pid}/cabinet/{it['id']}", headers=hdr, json={"restarted_today": True}).json()
    assert it["days_left"] == 30
    it = c.patch(f"/pets/{pid}/cabinet/{it['id']}", headers=hdr, json={"clear_duration": True}).json()
    assert it["days_left"] is None and it["duration_days"] is None


def test_validacoes_e_isolamento():
    from fastapi.testclient import TestClient
    from src.main import app
    c = TestClient(app)
    pid, hdr = _setup()
    _, other = _setup()
    assert c.post(f"/pets/{pid}/cabinet", headers=hdr, json={"name": "x"}).status_code == 422
    assert c.post(f"/pets/{pid}/cabinet", headers=hdr, json={"name": "Escova", "category": "nada"}).status_code == 422
    assert c.get(f"/pets/{pid}/cabinet", headers=other).status_code in (403, 404)
    assert c.post(f"/pets/{pid}/cabinet", json={"name": "Escova"}).status_code in (401, 403)
