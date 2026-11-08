"""Registro de cio: CRUD, regras de data, só fêmeas, isolamento entre tutores."""
import uuid
from datetime import date, timedelta

from src.db import SessionLocal
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password


def _mk(db, sex="female"):
    u = User(id=str(uuid.uuid4()), email=f"cio.{uuid.uuid4().hex[:8]}@example.com", name="Tutor",
             password_hash=hash_password("x"))
    db.add(u); db.commit()
    p = Pet(id=str(uuid.uuid4()), user_id=u.id, name="Mel", species="dog", sex=sex)
    db.add(p); db.commit()
    return p.id, {"Authorization": f"Bearer {create_access_token(u.id)}"}


def _setup(sex="female"):
    db = SessionLocal()
    try:
        return _mk(db, sex)
    finally:
        db.close()


def _d(days_ago):
    return (date.today() - timedelta(days=days_ago)).isoformat()


def test_registrar_listar_encerrar_e_apagar(client):
    pid, hdr = _setup()
    r = client.post(f"/pets/{pid}/heat-cycles", headers=hdr, json={"started_on": _d(10), "notes": "sangramento leve"})
    assert r.status_code == 201
    cid = r.json()["id"]
    assert r.json()["ended_on"] is None

    r = client.patch(f"/pets/{pid}/heat-cycles/{cid}", headers=hdr, json={"ended_on": _d(1)})
    assert r.status_code == 200 and r.json()["ended_on"] == _d(1)

    lst = client.get(f"/pets/{pid}/heat-cycles", headers=hdr).json()
    assert [c["id"] for c in lst] == [cid]

    assert client.delete(f"/pets/{pid}/heat-cycles/{cid}", headers=hdr).status_code == 204
    assert client.get(f"/pets/{pid}/heat-cycles", headers=hdr).json() == []


def test_lista_vem_do_mais_recente_para_o_mais_antigo(client):
    pid, hdr = _setup()
    client.post(f"/pets/{pid}/heat-cycles", headers=hdr, json={"started_on": _d(400), "ended_on": _d(390)})
    client.post(f"/pets/{pid}/heat-cycles", headers=hdr, json={"started_on": _d(200), "ended_on": _d(190)})
    lst = client.get(f"/pets/{pid}/heat-cycles", headers=hdr).json()
    assert [c["started_on"] for c in lst] == [_d(200), _d(400)]


def test_so_um_cio_em_andamento_por_vez(client):
    pid, hdr = _setup()
    assert client.post(f"/pets/{pid}/heat-cycles", headers=hdr, json={"started_on": _d(5)}).status_code == 201
    r = client.post(f"/pets/{pid}/heat-cycles", headers=hdr, json={"started_on": _d(1)})
    assert r.status_code == 409


def test_datas_incoerentes_sao_recusadas(client):
    pid, hdr = _setup()
    futuro = (date.today() + timedelta(days=30)).isoformat()
    assert client.post(f"/pets/{pid}/heat-cycles", headers=hdr, json={"started_on": futuro}).status_code == 422
    assert client.post(f"/pets/{pid}/heat-cycles", headers=hdr,
                       json={"started_on": _d(5), "ended_on": _d(9)}).status_code == 422
    assert client.post(f"/pets/{pid}/heat-cycles", headers=hdr,
                       json={"started_on": _d(5), "mated_on": _d(9)}).status_code == 422


def test_reabrir_cio_apagando_o_fim(client):
    pid, hdr = _setup()
    cid = client.post(f"/pets/{pid}/heat-cycles", headers=hdr,
                      json={"started_on": _d(10), "ended_on": _d(2)}).json()["id"]
    r = client.patch(f"/pets/{pid}/heat-cycles/{cid}", headers=hdr, json={"clear_ended_on": True})
    assert r.status_code == 200 and r.json()["ended_on"] is None


def test_macho_nao_registra_cio(client):
    pid, hdr = _setup(sex="male")
    r = client.post(f"/pets/{pid}/heat-cycles", headers=hdr, json={"started_on": _d(3)})
    assert r.status_code == 422


def test_outro_tutor_nao_ve_nem_mexe(client):
    pid, hdr = _setup()
    _, outro = _setup()
    cid = client.post(f"/pets/{pid}/heat-cycles", headers=hdr, json={"started_on": _d(3)}).json()["id"]
    assert client.get(f"/pets/{pid}/heat-cycles", headers=outro).status_code == 404
    assert client.patch(f"/pets/{pid}/heat-cycles/{cid}", headers=outro, json={"notes": "x"}).status_code == 404
    assert client.delete(f"/pets/{pid}/heat-cycles/{cid}", headers=outro).status_code == 404


def test_sem_login_recusa(client):
    pid, _ = _setup()
    assert client.get(f"/pets/{pid}/heat-cycles").status_code in (401, 403)
