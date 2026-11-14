"""Ajustes do painel: foto nos pets sumidos (caminhos antigos/absolutos) e 'Notificações ativas' no Desempenho."""
import uuid
from datetime import datetime, timedelta, timezone

from src.admin.missing_pets_admin import _photo_src
from src.admin.performance_router import _compute
from src.db import SessionLocal
from src.notifications import NativePushToken, PushSubscription
from src.user_auth.models import User


def test_photo_src_normaliza_caminhos():
    assert _photo_src(None) is None and _photo_src("") is None
    assert _photo_src("pets/abc.jpg") == "/uploads/pets/abc.jpg"
    assert _photo_src("https://www.petmol.com.br/uploads/pets/x.jpg") == "/uploads/pets/x.jpg"
    assert _photo_src("https://petmol.com.br/uploads/pets/x.jpg") == "/uploads/pets/x.jpg"
    assert _photo_src("/uploads/pets/x.jpg") == "/uploads/pets/x.jpg"
    assert _photo_src("https://cdn.exemplo.com/a.jpg") == "https://cdn.exemplo.com/a.jpg"


def test_notificacoes_ativas_contam_tutor_uma_vez_e_ignoram_desligados():
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        ids = []
        for n in range(4):
            uid = str(uuid.uuid4()); ids.append(uid)
            db.add(User(id=uid, email=f"{uid[:8]}@t.example", name="T", password_hash="x", created_at=now - timedelta(days=9)))
        db.flush()
        before = _compute(db, None, None, None, None)["totals"]["notificacoes"]
        # a: web + ios (conta 1) · b: só desligado (não conta) · c: android ativo (conta) · d: sem push
        db.add(PushSubscription(id=str(uuid.uuid4()), user_id=ids[0], endpoint=f"https://p/{ids[0]}", p256dh="k", auth="a", created_at=now - timedelta(days=2)))
        db.add(NativePushToken(id=str(uuid.uuid4()), user_id=ids[0], platform="ios", token=f"t-{ids[0]}", created_at=now - timedelta(days=1)))
        db.add(NativePushToken(id=str(uuid.uuid4()), user_id=ids[1], platform="ios", token=f"t-{ids[1]}", created_at=now, disabled_at=now))
        db.add(NativePushToken(id=str(uuid.uuid4()), user_id=ids[2], platform="android", token=f"t-{ids[2]}", created_at=now))
        db.commit()
        res = _compute(db, None, None, None, None)
        assert res["totals"]["notificacoes"] - before == 2
        assert all("notificacoes" in d for d in res["series"])
        only_android = _compute(db, None, None, "android", {ids[2]})
        assert only_android["totals"]["notificacoes"] == 1
        for uid in ids:
            db.query(PushSubscription).filter(PushSubscription.user_id == uid).delete()
            db.query(NativePushToken).filter(NativePushToken.user_id == uid).delete()
            db.query(User).filter(User.id == uid).delete()
        db.commit()


def test_pets_sumidos_quem_encontrou_inferido_pelos_relatos():
    from src.admin import missing_pets_admin as mp
    from src.missing_pets import FoundReport, MissingPet
    owner = str(uuid.uuid4())
    ids = {}
    with SessionLocal() as db:
        db.add(User(id=owner, email=f"{owner[:8]}@t.example", name="Dono", password_hash="x"))
        db.flush()
        for tag, st in (("terceiro", "found"), ("proprio", "found"), ("nenhum", "found"), ("aberto", "active")):
            p = MissingPet(id=str(uuid.uuid4()), user_id=owner, pet_name=tag, species="dog", contact="x", status=st)
            db.add(p); ids[tag] = p.id
        db.flush()
        db.add(FoundReport(missing_pet_id=ids["terceiro"], finder_contact="x", finder_user_id=None))
        db.add(FoundReport(missing_pet_id=ids["proprio"], finder_contact="y", finder_user_id=owner))
        db.commit()
    try:
        class _A:  # chama a função do endpoint direto (a dependência de admin é só autenticação)
            pass
        out = {i["pet_name"]: i for i in mp.list_missing_pets(status="all", limit=500, current=_A())["items"] if i["pet_name"] in ids}
        assert out["terceiro"]["found_by"] == "terceiro" and out["terceiro"]["third_party_reports"] == 1
        assert out["proprio"]["found_by"] == "proprio_relato" and out["proprio"]["third_party_reports"] == 0
        assert out["nenhum"]["found_by"] == "sem_relato"
        assert out["aberto"]["found_by"] is None
    finally:
        with SessionLocal() as db:
            db.query(FoundReport).filter(FoundReport.missing_pet_id.in_(list(ids.values()))).delete(synchronize_session=False)
            db.query(MissingPet).filter(MissingPet.id.in_(list(ids.values()))).delete(synchronize_session=False)
            db.query(User).filter(User.id == owner).delete()
            db.commit()
