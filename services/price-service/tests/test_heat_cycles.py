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


# ── Acompanhamento: ativar, ritmo e lembretes ────────────────────────────────

def _pet_full(species="dog", sex="female", neutered=False):
    db = SessionLocal()
    try:
        u = User(id=str(uuid.uuid4()), email=f"cio.{uuid.uuid4().hex[:8]}@example.com", name="Tutor",
                 password_hash=hash_password("x"))
        db.add(u); db.commit()
        p = Pet(id=str(uuid.uuid4()), user_id=u.id, name="Mel Silva", species=species, sex=sex, neutered=neutered)
        db.add(p); db.commit()
        return p.id, u.id, {"Authorization": f"Bearer {create_access_token(u.id)}"}
    finally:
        db.close()


def test_ativar_com_ritmo_padrao_e_desativar(client):
    pid, _, hdr = _pet_full()
    assert client.get(f"/pets/{pid}/heat-cycles/settings", headers=hdr).json() is None
    r = client.put(f"/pets/{pid}/heat-cycles/settings", headers=hdr, json={"enabled": True, "interval_days": 180, "duration_days": 21})
    assert r.status_code == 200 and r.json() == {"enabled": True, "interval_days": 180, "duration_days": 21}
    r = client.put(f"/pets/{pid}/heat-cycles/settings", headers=hdr, json={"enabled": False, "interval_days": 150, "duration_days": 7})
    assert r.json()["enabled"] is False and r.json()["interval_days"] == 150


def test_ritmo_fora_das_opcoes_e_recusado_e_gata_tem_as_dela(client):
    pid, _, hdr = _pet_full()
    assert client.put(f"/pets/{pid}/heat-cycles/settings", headers=hdr, json={"interval_days": 21, "duration_days": 21}).status_code == 422
    gid, _, ghdr = _pet_full(species="cat")
    assert client.put(f"/pets/{gid}/heat-cycles/settings", headers=ghdr, json={"interval_days": 21, "duration_days": 7}).status_code == 200
    assert client.put(f"/pets/{gid}/heat-cycles/settings", headers=ghdr, json={"interval_days": 180, "duration_days": 21}).status_code == 422


def test_castrada_macho_e_outras_especies_nao_ativam(client):
    for kw in ({"neutered": True}, {"sex": "male"}, {"species": "rabbit"}):
        pid, _, hdr = _pet_full(**kw)
        r = client.put(f"/pets/{pid}/heat-cycles/settings", headers=hdr, json={"interval_days": 180, "duration_days": 21})
        assert r.status_code == 422, kw


def _enable(pid, interval, duration, cycles):
    from src.pets.heat_models import HeatCycle, HeatSettings
    db = SessionLocal()
    try:
        db.add(HeatSettings(pet_id=pid, enabled=True, interval_days=interval, duration_days=duration))
        for s, e in cycles:
            db.add(HeatCycle(pet_id=pid, started_on=s, ended_on=e))
        db.commit()
    finally:
        db.close()


def _push_spy(monkeypatch):
    sent = []
    import src.notifications as n
    monkeypatch.setattr(n, "push_to_user", lambda uid, payload, *a, **k: sent.append((uid, payload)) or 1)
    return sent


def test_lembrete_semanal_nos_15_dias_antes_da_cadela(client, monkeypatch):
    from src.pets.heat_care import send_heat_reminders
    pid, uid, _ = _pet_full()
    last = date(2026, 1, 1)
    _enable(pid, 180, 21, [(last, last + timedelta(days=20))])
    sent = _push_spy(monkeypatch)
    nxt = last + timedelta(days=180)
    for d, expected in [(16, 0), (15, 1), (14, 0), (8, 1), (1, 1), (0, 0)]:
        before = len(sent)
        send_heat_reminders(today=nxt - timedelta(days=d))
        assert len(sent) - before == expected, d
    send_heat_reminders(today=nxt - timedelta(days=8))  # repetir o mesmo dia não duplica
    assert len(sent) == 3
    assert "Mel" in sent[0][1]["title"] and "Silva" not in sent[0][1]["title"]


def test_aviso_de_fim_do_cio_e_media_real_refina_a_previsao(client, monkeypatch):
    from src.pets.heat_care import send_heat_reminders, next_heat_on
    from src.pets.heat_models import HeatCycle, HeatSettings
    pid, uid, _ = _pet_full()
    started = date(2026, 3, 1)
    _enable(pid, 180, 7, [(started, None)])
    sent = _push_spy(monkeypatch)
    send_heat_reminders(today=started + timedelta(days=6))   # ainda dentro da duração
    assert sent == []
    send_heat_reminders(today=started + timedelta(days=7))   # passou da duração e segue aberto
    assert len(sent) == 1 and "terminado" in sent[0][1]["title"]

    cs = [HeatCycle(pet_id="x", started_on=date(2025, 1, 1), ended_on=date(2025, 1, 21)),
          HeatCycle(pet_id="x", started_on=date(2025, 6, 20), ended_on=date(2025, 7, 10))]  # 170 dias
    assert next_heat_on("dog", HeatSettings(interval_days=180, duration_days=21), cs, date(2025, 8, 1)) == date(2025, 6, 20) + timedelta(days=170)


def test_gata_um_aviso_3_dias_antes_e_pausa_na_entressafra(client, monkeypatch):
    from src.pets.heat_care import send_heat_reminders, next_heat_on
    from src.pets.heat_models import HeatCycle, HeatSettings
    pid, uid, _ = _pet_full(species="cat")
    last = date(2026, 10, 1)
    _enable(pid, 21, 7, [(last, last + timedelta(days=6))])
    sent = _push_spy(monkeypatch)
    for d in (4, 3, 2):
        send_heat_reminders(today=last + timedelta(days=21 - d))
    assert len(sent) == 1
    old = [HeatCycle(pet_id="x", started_on=date(2026, 1, 1), ended_on=date(2026, 1, 7))]
    assert next_heat_on("cat", HeatSettings(interval_days=21, duration_days=7), old, date(2026, 6, 1)) is None


def test_desativado_nao_recebe_lembrete(client, monkeypatch):
    from src.pets.heat_care import send_heat_reminders
    from src.pets.heat_models import HeatSettings
    pid, uid, _ = _pet_full()
    last = date(2026, 1, 1)
    _enable(pid, 180, 21, [(last, last + timedelta(days=20))])
    db = SessionLocal()
    db.query(HeatSettings).filter(HeatSettings.pet_id == pid).update({"enabled": False}); db.commit(); db.close()
    sent = _push_spy(monkeypatch)
    send_heat_reminders(today=last + timedelta(days=165))
    assert sent == []
