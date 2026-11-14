"""Normalização manual de nomes (página temporária) e e-mail como apoio quando o nome é ilegível."""
import uuid
from datetime import datetime, timedelta, timezone

from src.admin import tutor_sex as ts
from src.admin.tutor_names_admin import _pending
from src.db import SessionLocal
from src.notifications import NativePushToken
from src.user_auth.models import User


def test_override_tem_prioridade_e_nome_ilegivel_usa_email():
    assert ts.estimate("Zildinha Souza") == "unknown"
    assert ts.estimate("Zildinha Souza", overrides={"ZILDINHA": "female"}) == "female"
    assert ts.estimate("Carlos", overrides={"CARLOS": "female"}) == "female"            # decisão do dono manda
    assert ts.estimate("J. R.", "mariana.silva@x.com") == "female"                       # nome ilegível → começo do e-mail
    assert ts.estimate("", "joaosilva2020@x.com") == "male"                              # prefixo de 4+ letras
    assert ts.estimate("Zildinha", "mariana@x.com") == "unknown"                            # nome legível: e-mail NÃO é usado
    assert ts.estimate("", "ab@x.com") == "unknown" and ts.estimate(None, None) == "unknown"
    assert ts.email_first_name("analista@x.com") == ""                                   # prefixo curto demais não casa


def test_pagina_lista_so_primeiro_nome_e_contagem_e_decisao_vale_para_todos():
    now = datetime.now(timezone.utc)
    ids = []
    with SessionLocal() as db:
        db.query(ts.FirstNameSex).delete(); db.commit()
        base = _pending(db)["pending_tutors"]
        for nome in ("Zildinha Souza", "Zildinha Lima", "Xerxes Rocha"):
            uid = str(uuid.uuid4()); ids.append(uid)
            db.add(User(id=uid, email=f"{uid[:8]}@t.example", name=nome, password_hash="x", created_at=now - timedelta(days=3)))
            db.flush()
            db.add(NativePushToken(id=str(uuid.uuid4()), user_id=uid, platform="ios", token=f"t-{uid}", created_at=now))
        db.commit()
        out = _pending(db)
        row = next(p for p in out["pending"] if p["key"] == "ZILDINHA")
        assert row["tutors"] == 2 and set(row) == {"key", "name", "tutors"}              # sem e-mail nem id
        assert out["pending_tutors"] == base + 3
        db.add(ts.FirstNameSex(name_key="ZILDINHA", sex="female")); db.commit()
        after = _pending(db)
        assert after["by_manual"] >= 2 and all(p["key"] != "ZILDINHA" for p in after["pending"])
        db.query(ts.FirstNameSex).delete()
        for uid in ids:
            db.query(NativePushToken).filter(NativePushToken.user_id == uid).delete()
            db.query(User).filter(User.id == uid).delete()
        db.commit()
