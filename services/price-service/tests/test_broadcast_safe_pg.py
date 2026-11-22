"""Envio avulso SEGURO em POSTGRES REAL (só roda com PETMOL_TEST_PG_URL, como o motor de campanhas): migração sobre o esquema ANTIGO,
claim por linha com execuções realmente paralelas e advisory lock da criação. Banco de teste; provedor simulado; nenhum push real."""
import os
import threading
import time
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import src.admin.broadcast_router as br
import src.admin.broadcast_safe as bs
from src.migrations import _pg_migrate_broadcast_safe
from src.user_auth.models import User
from src.user_auth.security import hash_password

R, B = br.AdminBroadcastRecipient, br.AdminBroadcast


@pytest.fixture(scope="module")
def pg():
    url = os.environ.get("PETMOL_TEST_PG_URL")
    if not url:
        if os.environ.get("PETMOL_REQUIRE_PG_TESTS") == "1":
            pytest.fail("PETMOL_REQUIRE_PG_TESTS=1 mas PETMOL_TEST_PG_URL não está definido")
        pytest.skip("sem PETMOL_TEST_PG_URL (Postgres)")
    eng = create_engine(url, pool_size=30, max_overflow=30)
    yield eng
    eng.dispose()


def test_migracao_sobre_o_esquema_antigo_com_duplicata_historica_nao_falha_e_e_idempotente(pg):
    """Reproduz a produção: tabelas SEM as colunas novas, com linhas antigas — inclusive (broadcast, user) repetido."""
    with pg.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS admin_broadcast_recipients, admin_broadcasts CASCADE"))
        c.execute(text("CREATE TABLE admin_broadcasts (id VARCHAR(36) PRIMARY KEY, created_at TIMESTAMPTZ, message TEXT NOT NULL, phase VARCHAR(12) NOT NULL DEFAULT 'sending')"))
        c.execute(text("CREATE TABLE admin_broadcast_recipients (id VARCHAR(36) PRIMARY KEY, broadcast_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL, delivered BOOLEAN NOT NULL DEFAULT false)"))
        c.execute(text("INSERT INTO admin_broadcasts (id, message) VALUES ('b1', 'x')"))
        c.execute(text("INSERT INTO admin_broadcast_recipients (id, broadcast_id, user_id, delivered) VALUES ('r1','b1','u1',true),('r2','b1','u1',true)"))   # duplicata histórica
    with pg.begin() as c:
        _pg_migrate_broadcast_safe(c)                                         # não pode falhar
    with pg.begin() as c:
        _pg_migrate_broadcast_safe(c)                                         # nem na segunda vez (idempotente)
        cols = {r[0] for r in c.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='admin_broadcast_recipients'"))}
        assert {"state", "attempts", "attempted_at", "finished_at", "detail", "not_before", "tz_name", "tz_basis"} <= cols
        bcols = {r[0] for r in c.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='admin_broadcasts'"))}
        assert {"title_tpl", "destination", "respect_quiet", "is_resend", "heartbeat_at"} <= bcols
        assert c.execute(text("SELECT count(*) FROM admin_broadcast_recipients WHERE state IS NULL")).scalar() == 2   # linhas antigas intactas
        # o índice parcial recusa duplicata NOVA, mas não toca nas antigas
        c.execute(text("INSERT INTO admin_broadcast_recipients (id, broadcast_id, user_id, state) VALUES ('n1','b2','u9','reserved')"))
    with pytest.raises(Exception):
        with pg.begin() as c:
            c.execute(text("INSERT INTO admin_broadcast_recipients (id, broadcast_id, user_id, state) VALUES ('n2','b2','u9','reserved')"))
    with pg.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS admin_broadcast_recipients, admin_broadcasts CASCADE"))


def _seed(pg, n):
    br.Base.metadata.create_all(pg)
    sf = sessionmaker(bind=pg)
    with sf() as s:
        for m in (R, B):
            s.query(m).delete()
        ids = []
        for i in range(n):
            uid = str(uuid.uuid4())
            s.add(User(id=uid, email=f"{uid[:8]}@pg.example", name=f"Tutor {i}", password_hash=hash_password("x")))
            ids.append(uid)
        s.commit()
        b = B(created_by="admin", message="msg {pets}", segment="todos", audience_kind="all", goal="atalho", recipients_total=n, phase="sending",
              destination="atalho", respect_quiet=False)
        s.add(b); s.flush()
        bs.create_ledger(s, b, [{"user_id": u} for u in ids], quiet=False)
        s.commit()
        return sf, b.id, ids


def test_postgres_execucoes_paralelas_nunca_enviam_duas_vezes_a_mesma_pessoa(pg, monkeypatch):
    sf, bid, ids = _seed(pg, 60)
    calls, lock = [], threading.Lock()

    def fake(uid, payload):
        with lock:
            calls.append(uid)
        time.sleep(0.002)
        return 1
    monkeypatch.setattr(br, "push_to_user", fake)
    monkeypatch.setattr(bs, "PAUSE_SECONDS", 0)
    barrier = threading.Barrier(4)

    def worker():
        barrier.wait()
        bs._run(sf, bid)                                                      # 4 execuções simultâneas, sem o registro em processo
    ts = [threading.Thread(target=worker) for _ in range(4)]
    [t.start() for t in ts]; [t.join() for t in ts]
    assert len(calls) == 60 and len(set(calls)) == 60                         # cada pessoa UMA vez, com concorrência real
    with sf() as s:
        c = bs.count_states(s, bid)
        assert c["accepted"] == 60 and c["reserved"] == 0 and c["sending"] == 0
        assert s.get(B, bid).phase == "done" and s.get(B, bid).delivered_total == 60


def test_postgres_queda_no_meio_recuperacao_e_retomada_sem_repetir(pg, monkeypatch):
    sf, bid, ids = _seed(pg, 20)
    calls = []

    class Crash(BaseException):
        pass

    def fake(uid, payload):
        calls.append(uid)
        if len(calls) == 9:
            raise Crash()                                                     # o provedor aceitou, o processo morreu
        return 1
    monkeypatch.setattr(br, "push_to_user", fake)
    monkeypatch.setattr(bs, "PAUSE_SECONDS", 0)
    try:
        bs.run_broadcast(bid, sf)
    except Crash:
        pass
    with bs._RUN_LOCK:
        bs._RUNNING.discard(bid)
    sent = list(calls)
    assert bs.recover_stale(sf, bs._now() + bs.STALE_AFTER * 2) == 1
    assert calls == sent                                                      # recuperar não enviou nada
    with sf() as s:
        c = bs.count_states(s, bid)
        assert (c["accepted"], c["uncertain"], c["reserved"]) == (8, 1, 11)
    n = bs.prepare_resume(sf, bid, 11, bs._now() + bs.STALE_AFTER * 2)
    bs.run_broadcast(bid, sf)
    assert n == 11 and len(calls) == 20 and len(set(calls)) == 20             # 20 pessoas, 20 chamadas: ninguém repetido
    with sf() as s:
        assert bs.count_states(s, bid)["accepted"] == 19


def test_postgres_advisory_lock_serializa_a_criacao(pg):
    order, ready = [], threading.Event()

    def first():
        with sessionmaker(bind=pg)() as s:
            bs.serialize_creation(s)
            ready.set()
            time.sleep(0.4)
            order.append("primeiro")
            s.commit()

    def second():
        ready.wait()
        with sessionmaker(bind=pg)() as s:
            bs.serialize_creation(s)                                          # bloqueia até o primeiro terminar
            order.append("segundo")
            s.commit()
    ts = [threading.Thread(target=first), threading.Thread(target=second)]
    [t.start() for t in ts]; [t.join() for t in ts]
    assert order == ["primeiro", "segundo"]
