"""Painel de Push → atalho "Mantenha o PETMOL gratuito": destino, público "faltam passos" e meta no catálogo."""
import uuid
from datetime import datetime, timezone

import src.admin.broadcast_router as br
from src.db import SessionLocal
from src.health.models import FeedingPlan
from src.notifications import NativePushToken
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import hash_password


def _user(db, name, gps=False):
    u = User(id=str(uuid.uuid4()), email=f"{uuid.uuid4().hex[:8]}@example.com", name=name, password_hash=hash_password("x"))
    if gps:
        u.location_source = "gps"; u.lat = -19.9; u.lng = -43.9
    db.add(u); db.commit()
    db.add(NativePushToken(id=str(uuid.uuid4()), user_id=u.id, platform="ios", token=f"t-{u.id}")); db.commit()   # alcançável
    return u


def _pet(db, u, food=False):
    pid = str(uuid.uuid4())
    db.add(Pet(id=pid, user_id=u.id, name="Rex", species="dog")); db.commit()
    if food:
        db.add(FeedingPlan(pet_id=pid, species="dog", country_code="BR", food_brand="Premier", created_at=datetime.now(timezone.utc))); db.commit()


def test_destino_atalho_abre_a_pagina_certa():
    assert br.admin_open_url("atalho", None) == "/home?modal=atalho"
    assert "atalho" in br.DESTINATIONS


def test_meta_do_catalogo_aponta_para_o_atalho_e_o_publico_certo():
    g = next(x for x in br.GOAL_CATALOG if x["key"] == "atalho")
    assert g["open"] == "atalho" and g["segment"] == "faltam_passos" and g["title"] == "{tutor}, mantenha o PETMOL gratuito"
    assert "31/12" in g["message"] and "20 minutos" in g["message"]
    assert "faltam_passos" in br.SEGMENTS


def test_faltam_passos_inclui_quem_falta_algo_e_exclui_quem_tem_tudo():
    db = SessionLocal()
    try:
        sem_pet = _user(db, "Sem pet")
        sem_racao = _user(db, "Sem ração", gps=True); _pet(db, sem_racao)
        so_falta_gps = _user(db, "Só falta GPS"); _pet(db, so_falta_gps, food=True)
        tem_tudo = _user(db, "Tem tudo", gps=True); _pet(db, tem_tudo, food=True)
        users, skipped = br.eligible_users(db, "faltam_passos", ignore_weekly_cap=True)
        ids = {u["user_id"] for u in users}
        sp, sr, sg, tt = (str(x.id) for x in (sem_pet, sem_racao, so_falta_gps, tem_tudo))
    finally:
        db.close()
    assert sp in ids and sr in ids and sg in ids
    assert tt not in ids
    assert skipped["segment"] >= 1
