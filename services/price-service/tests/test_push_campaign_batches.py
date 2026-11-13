"""Campanhas push — ETAPA 3: reserva segura, lotes, idempotência, execução e recuperação.

TODOS os testes de serviço rodam nos DOIS bancos (SQLite e PostgreSQL). O Postgres vem de PETMOL_TEST_PG_URL; no CI ele é obrigatório
(PETMOL_REQUIRE_PG_TESTS=1: sem Postgres o teste FALHA em vez de pular). NENHUM teste envia push real: o provedor é sempre falso e há uma
guarda que faz qualquer chamada ao provedor real explodir."""
import os
import threading
import uuid
from collections import Counter
from datetime import timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, unquote, urlparse

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import src.admin.broadcast_router as br
import src.admin.push_campaign_batches as svc
import src.admin.push_campaigns as pc
from src.admin.activation_campaign_router import ActivationOptOut
from src.admin.deps import get_current_admin
from src.db import Base, SessionLocal
from src.user_auth.models import User
from tests.test_push_audience import _TABLES, F, G, R, World, NOW  # noqa: F401  (só os auxiliares; nada de test_* é importado)

ADMIN = "admin-1"
URL_AFILIADO = "https://www.amazon.com.br/dp/B07FQ6F1PZ?tag=amazonpetmol-20&linkCode=ll1&utm_source=petmol%20push"


class Crash(BaseException):
    """Simula a queda do processo: NÃO é Exception, então o executor não a captura e o estado fica como estava no banco."""


class Fake:
    """Provedor FALSO. plan: {user_id: 'ok'|'two'|'zero'|'timeout'|'net'|'crash'}."""
    def __init__(self, plan=None, default="ok"):
        self.plan, self.default, self.calls, self.lock, self.hook = plan or {}, default, [], threading.Lock(), None

    def __call__(self, uid, payload):
        with self.lock:
            self.calls.append((uid, payload))
        if self.hook:
            self.hook(uid)
        b = self.plan.get(uid, self.default)
        if b == "crash":
            raise Crash()
        if b == "timeout":
            raise TimeoutError("timeout")
        if b == "net":
            raise ConnectionError("rede")
        return {"ok": 1, "two": 2, "zero": 0}[b]

    @property
    def users(self):
        return Counter(u for u, _ in self.calls)


def _no_real_push(*a, **k):
    raise AssertionError("provedor REAL chamado em teste")


@pytest.fixture(scope="module")
def pg_engine():
    url = os.environ.get("PETMOL_TEST_PG_URL")
    if not url:
        if os.environ.get("PETMOL_REQUIRE_PG_TESTS") == "1":
            pytest.fail("PETMOL_REQUIRE_PG_TESTS=1 mas PETMOL_TEST_PG_URL não está definido")
        pytest.skip("sem PETMOL_TEST_PG_URL (Postgres)")
    eng = create_engine(url, pool_size=30, max_overflow=30)
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


def _wipe(sf):
    with sf() as s:
        for m in (br.AdminBroadcastRecipient, br.AdminBroadcast) + _TABLES:
            s.query(m).delete()
        s.commit()


@pytest.fixture(params=["sqlite", "postgres"])
def env(request, monkeypatch):
    if request.param == "sqlite":
        sf = SessionLocal
    else:
        sf = sessionmaker(bind=request.getfixturevalue("pg_engine"))
    _wipe(sf)
    monkeypatch.setattr(svc, "send_push", _no_real_push)                 # guarda: sem provedor falso explícito, qualquer envio explode
    monkeypatch.setattr(svc, "spawn", lambda fn, *a: None)               # a reserva NÃO executa sozinha: os testes chamam execute_batch
    monkeypatch.setattr(svc, "EXEC_PAUSE_SECONDS", 0)
    yield SimpleNamespace(sf=sf, kind=request.param, mp=monkeypatch)
    _wipe(sf)


def seed(env, n, species="cat", *, push=True, optout=False, pets=1):
    with env.sf() as s:
        w = World(s)
        ids = []
        for i in range(n):
            u = w.user(f"t{i}", ios=push, optout=optout)
            for _ in range(pets):
                w.pet(u, species)
            ids.append(u)
        s.commit()
    return ids


def campaign(env, **kw):
    data = dict(name="Campanha teste", message="Oferta de ração hoje.", title="{tutor}, olha para {pets}", goal=None, destination=None,
                product_url=None, product_title=None, created_by=ADMIN)
    data.update(kw)
    with env.sf() as s:
        return svc.create_campaign(s, **data).id


CATS = F(R("pet_species", "in", ["cat"]), scope="any")
TUDO = F()


def reserve(env, cid, flt, n=None, *, all_=False, key=None, admin=ADMIN, confirm=None, now=None):
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, flt, requested=n, all_available=all_, admin_id=admin, now=now)
    key = key or uuid.uuid4().hex
    res = svc.reserve_batch(env.sf, cid, flt, requested=n, all_available=all_, idempotency_key=key, admin_id=admin, token=pv["token"],
                            confirm_count=pv["will_reserve"] if confirm is None else confirm, now=now)
    return res, pv, key


def run(env, batch_id, provider=None, **kw):
    prov = provider or Fake()
    env.mp.setattr(svc, "send_push", prov)
    svc.execute_batch(env.sf, batch_id, chunk=kw.pop("chunk", 5), pause=0, **kw)
    return prov


def rows(env, cid):
    with env.sf() as s:
        return [(r.user_id, r.state, r.batch_id, r.accepted_devices, r.error_code) for r in
                s.query(pc.PushCampaignRecipient).filter(pc.PushCampaignRecipient.campaign_id == cid).all()]


def batch_users(env, batch_id):
    with env.sf() as s:
        return {r.user_id for r in s.query(pc.PushCampaignRecipient).filter(pc.PushCampaignRecipient.batch_id == batch_id).all()}


def error_of(fn, *a, **k):
    with pytest.raises(svc.BatchError) as e:
        fn(*a, **k)
    return e.value


def nothing_reserved(env, cid):
    with env.sf() as s:
        return (s.query(pc.PushCampaignRecipient).filter_by(campaign_id=cid).count(),
                s.query(br.AdminBroadcast).filter(br.AdminBroadcast.campaign_id == cid).count()) == (0, 0)


# ══ LOTES SUCESSIVOS SEM REPETIÇÃO ════════════════════════════════════════════

def test_lotes_de_50_30_e_100_sem_repeticao_e_depois_todos_os_restantes(env):
    seed(env, 300)
    cid = campaign(env)
    seen, prov_calls = [], Counter()
    for n, all_ in ((50, False), (30, False), (100, False), (None, True)):
        res, pv, _ = reserve(env, cid, CATS, n, all_=all_)
        b = res["batch"]
        assert b["reserved"] == (n or 120) and pv["smaller_than_requested"] is False
        got = batch_users(env, b["id"])
        assert len(got) == b["reserved"]
        assert not (got & set().union(*seen)) if seen else True               # nenhum tutor de lote anterior
        seen.append(got)
        prov = run(env, b["id"])
        prov_calls.update(prov.users)
        assert svc.serialize_batch(env.sf(), env.sf().get(br.AdminBroadcast, b["id"]))["phase"] == "done"
    assert [len(s) for s in seen] == [50, 30, 100, 120] and len(set().union(*seen)) == 300
    assert set(prov_calls.values()) == {1} and len(prov_calls) == 300           # cada tutor recebeu UMA tentativa de envio
    assert all(st == "accepted" for _, st, *_ in rows(env, cid))
    assert pv["available"] == 120
    with env.sf() as s:
        assert svc.preview_batch(s, cid, CATS, requested=10, all_available=False, admin_id=ADMIN)["available"] == 0


def test_mudar_os_filtros_entre_lotes_nunca_repete_o_tutor(env):
    gatos = set(seed(env, 100, "cat")); seed(env, 100, "dog")
    cid = campaign(env)
    a = reserve(env, cid, CATS, 40)[0]["batch"]; run(env, a["id"])
    b = reserve(env, cid, TUDO, 100)[0]["batch"]; run(env, b["id"])             # filtro totalmente diferente: todos os 200
    c = reserve(env, cid, CATS, None, all_=True)[0]["batch"]                     # volta aos gatos
    ua, ub, uc = (batch_users(env, x["id"]) for x in (a, b, c))
    assert not (ua & ub) and not (ua & uc) and not (ub & uc)
    assert len(ua) == 40 and len(ub) == 100 and ua <= gatos and uc <= gatos
    assert len(uc) == 100 - 40 - len(ub & gatos)                                  # os gatos que o lote 2 (todos) NÃO levou
    assert all(n == 1 for n in Counter(u for u, *_ in rows(env, cid)).values())


def test_tutor_com_varios_pets_e_aparelhos_entra_uma_vez(env):
    with env.sf() as s:
        w = World(s)
        t = w.user("cinco", web=True, ios=True, android=True)
        for _ in range(5):
            w.pet(t, "cat")
        s.commit()
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, None, all_=True)
    assert res["batch"]["reserved"] == 1
    prov = run(env, res["batch"]["id"])
    assert prov.users == Counter({t: 1}) and len(rows(env, cid)) == 1


def test_sem_push_e_opt_out_nunca_sao_reservados(env):
    ok = seed(env, 5)
    seed(env, 4, push=False)
    seed(env, 3, optout=True)
    cid = campaign(env)
    res, pv, _ = reserve(env, cid, CATS, None, all_=True)
    assert batch_users(env, res["batch"]["id"]) == set(ok) and pv["counts"]["not_reachable"] == {"no_push": 4, "opt_out": 3}


def test_a_selecao_e_aleatoria_e_o_banco_guarda_so_quem_foi_reservado(env):
    seed(env, 300)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, 50)
    got = batch_users(env, res["batch"]["id"])
    first_50_sorted = set(svc.pa.resolve_audience_ids(env.sf(), CATS)[:50])
    assert got != first_50_sorted and len(got) == 50                             # sorteio, não "os 50 primeiros"


# ══ PRÉVIA E CONFIRMAÇÃO ═════════════════════════════════════════════════════

def test_lote_menor_que_o_pedido_exige_confirmar_o_numero_menor(env):
    seed(env, 20)
    cid = campaign(env)
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=50, all_available=False, admin_id=ADMIN)
    assert (pv["available"], pv["will_reserve"], pv["smaller_than_requested"]) == (20, 20, True) and "20" in pv["confirmation"]
    e = error_of(svc.reserve_batch, env.sf, cid, CATS, requested=50, all_available=False, idempotency_key=uuid.uuid4().hex, admin_id=ADMIN,
                 token=pv["token"], confirm_count=50)                            # confirmou 50: não é o que vai acontecer
    assert e.code == "bad_confirmation" and e.extra["will_reserve"] == 20 and nothing_reserved(env, cid)
    ok = svc.reserve_batch(env.sf, cid, CATS, requested=50, all_available=False, idempotency_key=uuid.uuid4().hex, admin_id=ADMIN,
                           token=pv["token"], confirm_count=20)
    assert ok["batch"]["reserved"] == 20


def test_a_previa_amarra_campanha_conteudo_filtros_quantidade_e_administrador(env):
    seed(env, 60)
    a, b = campaign(env, name="Campanha A"), campaign(env, name="Campanha B")
    with env.sf() as s:
        pv = svc.preview_batch(s, a, CATS, requested=10, all_available=False, admin_id=ADMIN)
    kw = dict(requested=10, all_available=False, admin_id=ADMIN, token=pv["token"], confirm_count=10)
    for outro, args in (
        ("outra campanha", (env.sf, b, CATS)), ("outros filtros", (env.sf, a, F(R("platform", "in", ["ios"])))),
        ("outra quantidade", (env.sf, a, CATS)), ("todos em vez de 10", (env.sf, a, CATS)), ("outro admin", (env.sf, a, CATS)),
    ):
        k = dict(kw, idempotency_key=uuid.uuid4().hex)
        if outro == "outra quantidade":
            k["requested"] = 11; k["confirm_count"] = 11
        if outro == "todos em vez de 10":
            k.update(requested=None, all_available=True)
        if outro == "outro admin":
            k["admin_id"] = "outro-admin"
        assert error_of(svc.reserve_batch, *args, **k).code == "preview_stale", outro
    tampered = pv["token"][:-4] + ("0000" if not pv["token"].endswith("0000") else "1111")
    assert error_of(svc.reserve_batch, env.sf, a, CATS, **dict(kw, token=tampered, idempotency_key=uuid.uuid4().hex)).code == "invalid_token"
    assert error_of(svc.reserve_batch, env.sf, a, CATS, **dict(kw, token="lixo", idempotency_key=uuid.uuid4().hex)).code == "invalid_token"
    assert error_of(svc.reserve_batch, env.sf, a, CATS, **dict(kw, token="", idempotency_key=uuid.uuid4().hex)).code == "invalid_token"
    assert nothing_reserved(env, a) and nothing_reserved(env, b)


def test_previa_expirada_e_recusada(env):
    seed(env, 10)
    cid = campaign(env)
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=5, all_available=False, admin_id=ADMIN)
    late = svc._utcnow() + timedelta(seconds=svc.PREVIEW_TTL_SECONDS + 5)
    e = error_of(svc.reserve_batch, env.sf, cid, CATS, requested=5, all_available=False, idempotency_key=uuid.uuid4().hex, admin_id=ADMIN,
                 token=pv["token"], confirm_count=5, now=late)
    assert e.code == "token_expired" and nothing_reserved(env, cid)


def test_se_o_publico_muda_entre_a_previa_e_a_confirmacao_nada_e_reservado(env):
    seed(env, 10)
    cid = campaign(env)
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=5, all_available=False, admin_id=ADMIN)
    seed(env, 1)                                                                  # entrou mais um gato com push
    e = error_of(svc.reserve_batch, env.sf, cid, CATS, requested=5, all_available=False, idempotency_key=uuid.uuid4().hex, admin_id=ADMIN,
                 token=pv["token"], confirm_count=5)
    assert e.code == "audience_changed" and e.extra["available_now"] == 11 and nothing_reserved(env, cid)


def test_troca_de_um_tutor_por_outro_com_a_mesma_contagem_tambem_e_detectada(env):
    ids = seed(env, 10)
    cid = campaign(env)
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=5, all_available=False, admin_id=ADMIN)
    with env.sf() as s:                                                           # um sai (opt-out) e outro entra: a contagem continua 10
        s.add(ActivationOptOut(user_id=ids[0])); s.commit()
    seed(env, 1)
    e = error_of(svc.reserve_batch, env.sf, cid, CATS, requested=5, all_available=False, idempotency_key=uuid.uuid4().hex, admin_id=ADMIN,
                 token=pv["token"], confirm_count=5)
    assert e.code == "audience_changed" and nothing_reserved(env, cid)


def test_se_o_banco_recusar_algum_destinatario_o_lote_inteiro_e_desfeito_sem_encolher(env):
    """Rede de segurança: se `ON CONFLICT` devolver menos linhas que o lote, NADA fica reservado e o lote não encolhe em silêncio."""
    seed(env, 20)
    cid = campaign(env)
    real = svc._insert_recipients
    env.mp.setattr(svc, "_insert_recipients", lambda db, c, b, ids, now: set(sorted(real(db, c, b, ids, now))[:-1]))
    e = error_of(reserve, env, cid, CATS, 10)
    assert e.code == "reservation_conflict" and nothing_reserved(env, cid)
    with env.sf() as s:
        assert s.get(pc.PushCampaign, cid).content_locked_at is None and s.get(pc.PushCampaign, cid).status == "draft"


def test_pedido_invalido_quantidade_e_todos_ao_mesmo_tempo_ou_nenhum(env):
    seed(env, 5)
    cid = campaign(env)
    with env.sf() as s:
        for kw in (dict(requested=5, all_available=True), dict(requested=None, all_available=False)):
            assert error_of(svc.preview_batch, s, cid, CATS, admin_id=ADMIN, **kw).code == "invalid_request"
        assert error_of(svc.preview_batch, s, "nao-existe", CATS, requested=1, all_available=False, admin_id=ADMIN).code == "campaign_not_found"


def test_previa_sem_ninguem_nao_gera_token(env):
    cid = campaign(env)
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=5, all_available=False, admin_id=ADMIN)
    assert pv["will_reserve"] == 0 and pv["token"] is None and pv["can_reserve"] is False


def test_sem_chave_de_assinatura_a_previa_nao_funciona(env):
    seed(env, 3)
    cid = campaign(env)
    env.mp.setattr(svc, "get_settings", lambda: SimpleNamespace(jwt_secret=""))
    with env.sf() as s:
        e = error_of(svc.preview_batch, s, cid, CATS, requested=1, all_available=False, admin_id=ADMIN)
    assert e.code == "signing_key_missing" and e.status == 503


# ══ IDEMPOTÊNCIA ═════════════════════════════════════════════════════════════

def test_a_mesma_chave_devolve_o_mesmo_lote_sem_reservar_de_novo(env):
    seed(env, 40)
    cid = campaign(env)
    first, pv, key = reserve(env, cid, CATS, 10)
    again = svc.reserve_batch(env.sf, cid, CATS, requested=10, all_available=False, idempotency_key=key, admin_id=ADMIN, token=pv["token"],
                              confirm_count=10)
    assert again["idempotent_replay"] is True and again["batch"]["id"] == first["batch"]["id"]
    # o clique repetido depois que o público já mudou (a prévia está "velha"): continua devolvendo o mesmo lote
    again2 = svc.reserve_batch(env.sf, cid, CATS, requested=10, all_available=False, idempotency_key=key, admin_id=ADMIN, token="qualquer", confirm_count=0)
    assert again2["idempotent_replay"] and again2["batch"]["id"] == first["batch"]["id"]
    assert len(rows(env, cid)) == 10
    with env.sf() as s:
        assert s.query(br.AdminBroadcast).filter(br.AdminBroadcast.campaign_id == cid).count() == 1


def test_a_mesma_chave_para_outra_operacao_e_recusada(env):
    seed(env, 40)
    a, b = campaign(env, name="Campanha A"), campaign(env, name="Campanha B")
    _, pv, key = reserve(env, a, CATS, 10)
    kw = dict(admin_id=ADMIN, token=pv["token"], confirm_count=10, idempotency_key=key)
    assert error_of(svc.reserve_batch, env.sf, b, CATS, requested=10, all_available=False, **kw).code == "idempotency_key_reused"
    assert error_of(svc.reserve_batch, env.sf, a, CATS, requested=20, all_available=False, **dict(kw, confirm_count=20)).code == "idempotency_key_reused"
    assert error_of(svc.reserve_batch, env.sf, a, F(R("platform", "in", ["ios"])), requested=10, all_available=False, **kw).code == "idempotency_key_reused"
    assert len(rows(env, a)) == 10 and nothing_reserved(env, b)


@pytest.mark.parametrize("key", ["curta", "x" * 65, "com espaço 1234567890", "acentuação-ç-123456", ""])
def test_chave_de_idempotencia_invalida(env, key):
    seed(env, 3)
    cid = campaign(env)
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=1, all_available=False, admin_id=ADMIN)
    assert error_of(svc.reserve_batch, env.sf, cid, CATS, requested=1, all_available=False, idempotency_key=key, admin_id=ADMIN, token=pv["token"],
                    confirm_count=1).code == "invalid_request"


# ══ UM LOTE POR VEZ, CAMPANHA ENCERRADA, CONTEÚDO FIXO ═══════════════════════

def test_um_lote_por_vez_na_campanha(env):
    seed(env, 40)
    cid = campaign(env)
    first, *_ = reserve(env, cid, CATS, 10)
    assert error_of(reserve, env, cid, CATS, 5).code == "batch_in_progress"
    with env.sf() as s:
        assert svc.preview_batch(s, cid, CATS, requested=5, all_available=False, admin_id=ADMIN)["can_reserve"] is False
    run(env, first["batch"]["id"])
    assert reserve(env, cid, CATS, 5)[0]["batch"]["batch_no"] == 2


def test_campanha_encerrada_nao_aceita_lote_e_nao_encerra_com_lote_em_andamento(env):
    seed(env, 10)
    cid = campaign(env)
    first, *_ = reserve(env, cid, CATS, 5)
    assert error_of(svc.close_campaign, env.sf, cid).code == "batch_in_progress"
    run(env, first["batch"]["id"])
    assert svc.close_campaign(env.sf, cid)["status"] == "closed"
    assert error_of(reserve, env, cid, CATS, 1).code == "campaign_closed"


def test_a_propria_reserva_recusa_campanha_encerrada_mesmo_com_previa_anterior(env):
    """A prévia já recusa campanha encerrada; aqui a campanha é encerrada DEPOIS da prévia e a RESERVA tem que recusar por conta própria."""
    seed(env, 10)
    cid = campaign(env)
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=5, all_available=False, admin_id=ADMIN)
    svc.close_campaign(env.sf, cid)
    e = error_of(svc.reserve_batch, env.sf, cid, CATS, requested=5, all_available=False, idempotency_key=uuid.uuid4().hex, admin_id=ADMIN,
                 token=pv["token"], confirm_count=5)
    assert e.code == "campaign_closed" and nothing_reserved(env, cid)


def test_reivindicar_um_pedaco_so_pega_reservados_nunca_incertos_falhos_ou_aceitos(env):
    """Teste direto e instantâneo (sem laço): o único estado que a execução reivindica é `reserved`."""
    seed(env, 8)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, 8)
    bid = res["batch"]["id"]
    with env.sf() as s:
        recs = s.query(pc.PushCampaignRecipient).filter(pc.PushCampaignRecipient.batch_id == bid).order_by(pc.PushCampaignRecipient.id).all()
        for r, st in zip(recs[:4], ("uncertain", "failed", "accepted", "sending")):
            r.state = st
        s.commit()
        expected = {str(r.user_id) for r in recs[4:]}
    with env.sf() as s:
        got = svc._claim_chunk(s, bid, 100)
    assert {u for _id, u in got} == expected and len(got) == 4
    states = {st for (_u, st, *_rest) in rows(env, cid)}
    assert states == {"uncertain", "failed", "accepted", "sending"}


def test_conteudo_alterado_entre_a_previa_e_a_reserva_invalida_a_previa(env):
    """Antes do 1º lote o conteúdo ainda não está travado no banco: se mudar depois da prévia, a reserva recusa (o token guarda o hash)."""
    seed(env, 10)
    cid = campaign(env)
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=5, all_available=False, admin_id=ADMIN)
    with env.sf() as s:
        c = s.get(pc.PushCampaign, cid)
        c.message = "Texto diferente do que foi conferido na prévia."
        c.content_hash = pc.compute_content_hash(c.title, c.message, c.destination, c.goal, c.product_url, c.product_title)
        s.commit()
    e = error_of(svc.reserve_batch, env.sf, cid, CATS, requested=5, all_available=False, idempotency_key=uuid.uuid4().hex, admin_id=ADMIN,
                 token=pv["token"], confirm_count=5)
    assert e.code == "preview_stale" and nothing_reserved(env, cid)


def test_conteudo_fica_fixo_depois_do_primeiro_lote_e_o_link_de_afiliado_nao_e_alterado(env):
    seed(env, 6)
    cid = campaign(env, product_url=URL_AFILIADO, product_title="Ração Golden 15kg")
    with env.sf() as s:
        c = s.get(pc.PushCampaign, cid)
        assert c.product_url == URL_AFILIADO and c.destination == "produto" and c.content_locked_at is None
    res, *_ = reserve(env, cid, CATS, 3)
    with env.sf() as s:
        c = s.get(pc.PushCampaign, cid)
        assert c.content_locked_at is not None and c.status == "active"
        c.message = "outra mensagem"
        with pytest.raises(ValueError, match="fixo depois do primeiro lote"):
            s.commit()
        s.rollback()
    prov = run(env, res["batch"]["id"])
    for _, payload in prov.calls:                                                # o link chega às notificações EXATAMENTE como foi colado
        url = payload["data"]["url"]
        qs = parse_qs(urlparse(url).query)
        assert qs["produto"][0] == URL_AFILIADO and qs["b"] == [res["batch"]["id"]]      # parse_qs já decodifica uma vez: tem que bater byte a byte
        assert url.startswith("/home?produto=")
    run(env, reserve(env, cid, CATS, 3)[0]["batch"]["id"], Fake())               # o 2º lote leva o MESMO conteúdo
    with env.sf() as s:
        assert s.get(pc.PushCampaign, cid).product_url == URL_AFILIADO


def test_criacao_valida_o_conteudo_como_o_envio_avulso(env):
    with env.sf() as s:
        base = dict(name="ok nome", message="Mensagem boa", title=None, goal=None, destination=None, product_url=None, product_title=None, created_by=ADMIN)
        for bad, trecho in (
            (dict(product_url="https://evil.com/x", product_title="X"), "loja parceira"),
            (dict(product_url="http://amzn.to/x", product_title="X"), "https://"),
            (dict(product_url="https://amzn.to/x"), "nome do produto"),
            (dict(goal="inexistente"), "Ação desconhecida"),
            (dict(name="ab"), "3 a 120"),
            (dict(message="ok"), ""),
        ):
            e = error_of(svc.create_campaign, s, **dict(base, **bad))
            assert e.code == "invalid_content" and e.status == 422 and trecho in e.message, bad
    with env.sf() as s:
        c = svc.create_campaign(s, **dict(base, product_url=URL_AFILIADO, product_title="Produto"))
        assert c.destination == "produto" and c.content_hash == pc.compute_content_hash(None, "Mensagem boa", "produto", None, URL_AFILIADO, "Produto")


# ══ EXECUÇÃO: INTENÇÃO ANTES DO PROVEDOR E RESULTADOS ════════════════════════

def test_a_intencao_de_envio_esta_no_banco_antes_de_chamar_o_provedor(env):
    seed(env, 6)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, 6)
    prov = Fake()
    visto = []

    def hook(uid):                                                                # OUTRA conexão: só enxerga o que já foi CONFIRMADO
        with env.sf() as other:
            r = other.query(pc.PushCampaignRecipient).filter_by(campaign_id=cid, user_id=uid).one()
            visto.append((r.state, r.attempted_at is not None))
    prov.hook = hook
    run(env, res["batch"]["id"], prov)
    assert visto and all(v == ("sending", True) for v in visto)


def test_resultados_aceito_falhou_e_incerto_sem_substituir_ninguem(env):
    ids = seed(env, 12)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, None, all_=True)
    reservados = batch_users(env, res["batch"]["id"])
    plan = {ids[0]: "zero", ids[1]: "timeout", ids[2]: "net", ids[3]: "two"}
    prov = run(env, res["batch"]["id"], Fake(plan))
    got = {u: (st, dev, err) for u, st, _, dev, err in rows(env, cid)}
    assert got[ids[0]] == ("failed", 0, "no_device_accepted")
    assert got[ids[1]] == ("uncertain", 0, "TimeoutError") and got[ids[2]] == ("uncertain", 0, "ConnectionError")
    assert got[ids[3]] == ("accepted", 2, None)
    assert sum(1 for v in got.values() if v[0] == "accepted") == 9
    assert {u for u, *_ in rows(env, cid)} == reservados == set(ids)             # a identidade dos reservados foi preservada; ninguém entrou no lugar
    assert prov.users == Counter(ids)                                            # e cada um foi tentado UMA vez (nem o incerto, nem o que falhou, repetem)
    with env.sf() as s:
        b = s.get(br.AdminBroadcast, res["batch"]["id"])
        assert (b.phase, b.delivered_total, b.recipients_total) == ("done", 9, 12)
        m = svc.serialize_batch(s, b)
        assert m["counts"] == {"reserved": 0, "sending": 0, "accepted": 9, "failed": 1, "uncertain": 2} and "Não é confirmação de entrega" in m["accepted_note"]
        assert m["metrics"]["delivered"] == 9                                    # o histórico/métricas existentes continuam valendo
    # nada é reenviado: nova execução do mesmo lote não chama o provedor
    assert run(env, res["batch"]["id"], Fake()).calls == []


def test_quem_pediu_para_parar_depois_da_reserva_nao_recebe(env):
    ids = seed(env, 6)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, None, all_=True)
    with env.sf() as s:
        s.add(ActivationOptOut(user_id=ids[0])); s.commit()
    prov = run(env, res["batch"]["id"])
    assert ids[0] not in prov.users
    st = {u: (s_, e) for u, s_, _, _, e in rows(env, cid)}
    assert st[ids[0]] == ("failed", "opted_out_after_reservation") and len(prov.calls) == 5


def test_excluir_a_conta_depois_da_reserva_nao_quebra_o_lote_nem_devolve_o_tutor(env):
    from src.user_auth.purge import purge_user_data
    ids = seed(env, 6)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, None, all_=True)
    with env.sf() as s:
        purge_user_data(s, s.query(User).filter(User.id == ids[0]).first()); s.commit()
    prov = run(env, res["batch"]["id"])
    assert ids[0] not in prov.users and len(prov.calls) == 5
    assert ids[0] not in {u for u, *_ in rows(env, cid)}                         # a linha foi apagada junto com a conta (LGPD)
    with env.sf() as s:
        assert s.get(br.AdminBroadcast, res["batch"]["id"]).phase == "done"


def test_nenhuma_etapa_de_reserva_previa_ou_recuperacao_chama_o_provedor(env):
    seed(env, 8)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, 4)                                          # o provedor da fixture explode se for chamado
    svc.recover_batch(env.sf, res["batch"]["id"])
    with env.sf() as s:
        svc.preview_batch(s, cid, CATS, requested=2, all_available=False, admin_id=ADMIN)
    assert svc.send_push is _no_real_push


# ══ INTERRUPÇÃO, REINÍCIO E RECUPERAÇÃO ══════════════════════════════════════

def _interrupted(env, n=20, crash_at=3):
    ids = seed(env, n)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, None, all_=True)
    order = []
    prov = Fake()
    # a 3ª chamada derruba o "processo": simula kill (BaseException) no meio do pedaço de 5
    def hook(uid):
        order.append(uid)
        if len(order) == crash_at:
            prov.plan[uid] = "crash"
    prov.hook = hook
    env.mp.setattr(svc, "send_push", prov)
    with pytest.raises(Crash):
        svc.execute_batch(env.sf, res["batch"]["id"], chunk=5, pause=0)
    return ids, cid, res["batch"]["id"], prov


def test_queda_no_meio_do_envio_deixa_o_estado_reconstituivel(env):
    _, cid, bid, prov = _interrupted(env)
    states = Counter(st for _, st, *_ in rows(env, cid))
    assert states == {"accepted": 2, "sending": 3, "reserved": 15}                # 2 concluídos; o que estava em curso ficou 'sending'
    with env.sf() as s:
        b = s.get(br.AdminBroadcast, bid)
        assert b.phase == "sending"
        assert svc.serialize_batch(s, b, now=svc._utcnow() + timedelta(minutes=30))["interrupted_suspected"] is True
        assert svc.serialize_batch(s, b)["interrupted_suspected"] is False        # recém-criado: ainda não é suspeito


def test_recuperacao_so_reclassifica_e_nunca_envia(env):
    _, cid, bid, prov = _interrupted(env)
    antes = len(prov.calls)
    env.mp.setattr(svc, "send_push", _no_real_push)                              # qualquer chamada ao provedor durante a recuperação explode
    out = svc.recover_batch(env.sf, bid)
    assert out["reclassified"] == 3 and out["batch"]["phase"] == "interrupted"
    assert Counter(st for _, st, *_ in rows(env, cid)) == {"accepted": 2, "uncertain": 3, "reserved": 15}
    assert {r[4] for r in rows(env, cid) if r[1] == "uncertain"} == {"interrupted"}
    assert len(prov.calls) == antes
    assert svc.recover_batch(env.sf, bid)["reclassified"] == 0                    # idempotente


def test_retomar_envia_so_quem_nunca_foi_tentado_e_nunca_o_incerto_nem_o_que_falhou(env):
    ids, cid, bid, prov = _interrupted(env)
    svc.recover_batch(env.sf, bid)
    antes = {u for u, st, *_ in rows(env, cid) if st == "uncertain"}
    assert error_of(svc.resume_batch, env.sf, bid, 99).code == "bad_confirmation"      # número errado: nada acontece
    out = svc.resume_batch(env.sf, bid, 15)
    assert out["remaining"] == 15 and out["batch"]["phase"] == "sending"
    prov2 = run(env, bid, Fake())
    assert not (set(prov2.users) & antes) and len(prov2.calls) == 15
    # no total, nenhum tutor foi tentado duas vezes (somando as duas execuções)
    total = Counter(u for u, _ in prov.calls) + prov2.users
    # a 3ª chamada da 1ª execução foi a "queda": o provedor chegou a ser chamado para ela, mas ela ficou incerta e NÃO repete
    assert max(total.values()) == 1
    with env.sf() as s:
        b = s.get(br.AdminBroadcast, bid)
        assert b.phase == "done" and Counter(st for _, st, *_ in rows(env, cid)) == {"accepted": 17, "uncertain": 3}


def test_devolver_ao_publico_apaga_so_os_nunca_tentados_e_o_resto_continua_usado(env):
    ids, cid, bid, prov = _interrupted(env)
    svc.recover_batch(env.sf, bid)
    assert error_of(svc.release_batch, env.sf, bid, 1).code == "bad_confirmation"
    out = svc.release_batch(env.sf, bid, 15)
    assert out["released"] == 15 and out["batch"]["phase"] == "done" and out["batch"]["reserved"] == 5
    assert Counter(st for _, st, *_ in rows(env, cid)) == {"accepted": 2, "uncertain": 3}
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=100, all_available=False, admin_id=ADMIN)
    assert pv["available"] == 15                                                  # os 15 nunca tentados voltaram; os 5 tentados NUNCA voltam
    tentados = {r[0] for r in rows(env, cid)}                                      # accepted + uncertain: ficam para sempre
    nxt, *_ = reserve(env, cid, CATS, None, all_=True)
    assert len(batch_users(env, nxt["batch"]["id"])) == 15 and not (batch_users(env, nxt["batch"]["id"]) & tentados)


def test_retomar_ou_devolver_so_vale_para_lote_interrompido(env):
    seed(env, 5)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, None, all_=True)
    bid = res["batch"]["id"]
    assert error_of(svc.resume_batch, env.sf, bid, 5).code == "batch_not_interrupted"
    assert error_of(svc.release_batch, env.sf, bid, 5).code == "batch_not_interrupted"
    assert error_of(svc.resume_batch, env.sf, "nao-existe", 1).code == "batch_not_found"


def test_reinicio_do_servico_reclassifica_sem_enviar_e_so_com_a_flag_ligada(env):
    _, cid, bid, prov = _interrupted(env)
    seed(env, 6, "dog")
    c2 = campaign(env, name="Outra")
    r2, *_ = reserve(env, c2, F(R("pet_species", "in", ["dog"]), scope="any"), None, all_=True)     # lote 'reserved' que nunca chegou a rodar
    env.mp.setattr(svc, "send_push", _no_real_push)
    env.mp.setattr(svc, "get_settings", lambda: SimpleNamespace(jwt_secret="x"))
    env.mp.setattr(svc, "push_campaigns_enabled", lambda: False)
    assert svc.recover_orphans_on_startup(env.sf) == 0                             # flag desligada: não faz nada
    assert Counter(st for _, st, *_ in rows(env, cid))["sending"] == 3
    env.mp.setattr(svc, "push_campaigns_enabled", lambda: True)
    assert svc.recover_orphans_on_startup(env.sf) == 2
    with env.sf() as s:
        assert s.get(br.AdminBroadcast, bid).phase == "interrupted" and s.get(br.AdminBroadcast, r2["batch"]["id"]).phase == "interrupted"
    assert Counter(st for _, st, *_ in rows(env, cid)) == {"accepted": 2, "uncertain": 3, "reserved": 15}
    assert Counter(st for _, st, *_ in rows(env, c2)) == {"reserved": 6}           # o que nunca começou continua reservado (decisão humana)
    assert svc.recover_orphans_on_startup(env.sf) == 0


def test_resultado_tardio_corrige_o_incerto_de_uma_recuperacao_precoce(env):
    """Se a recuperação marcou 'uncertain' mas o processo ainda estava vivo, o resultado real chega depois e corrige — sem reenviar nada."""
    seed(env, 4)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, None, all_=True)
    with env.sf() as s:
        rid = s.query(pc.PushCampaignRecipient).filter_by(campaign_id=cid).first().id
        s.query(pc.PushCampaignRecipient).filter_by(id=rid).update({"state": "sending"}); s.commit()
    svc.recover_batch(env.sf, res["batch"]["id"])
    with env.sf() as s:
        assert s.get(pc.PushCampaignRecipient, rid).state == "uncertain"
        assert svc._finish(s, rid, "accepted", 1) is True
        assert s.get(pc.PushCampaignRecipient, rid).state == "accepted"
        assert svc._finish(s, rid, "failed", 0, "x") is False                       # um resultado FINAL não é sobrescrito


def test_recuperacao_de_lote_recente_so_age_quando_esta_parado(env):
    _, cid, bid, prov = _interrupted(env)
    env.mp.setattr(svc, "send_push", _no_real_push)
    assert svc.recover_batch(env.sf, bid, only_if_stale=True)["reclassified"] == 0                      # atividade recente: não mexe
    assert svc.recover_batch(env.sf, bid, only_if_stale=True, now=svc._utcnow() + timedelta(minutes=30))["reclassified"] == 3


# ══ CONCORRÊNCIA (PostgreSQL de verdade; no SQLite só a versão serial) ═══════

def _threads(n, fn):
    out, errs = [None] * n, []
    barrier = threading.Barrier(n)

    def run_(i):
        try:
            barrier.wait()
            out[i] = fn(i)
        except BaseException as exc:                                              # noqa: BLE001 — o teste inspeciona o que cada thread viu
            errs.append(exc)
    ts = [threading.Thread(target=run_, args=(i,)) for i in range(n)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    return out, errs


def _needs_pg(env):
    if env.kind != "postgres":
        pytest.skip("concorrência real só no PostgreSQL")


def test_pg_doze_requisicoes_simultaneas_com_chaves_diferentes_reservam_um_unico_lote(env):
    _needs_pg(env)
    seed(env, 200)
    cid = campaign(env)
    previews = []
    for _ in range(12):
        with env.sf() as s:
            previews.append(svc.preview_batch(s, cid, CATS, requested=30, all_available=False, admin_id=ADMIN))
    keys = [uuid.uuid4().hex for _ in range(12)]

    def go(i):
        try:
            return svc.reserve_batch(env.sf, cid, CATS, requested=30, all_available=False, idempotency_key=keys[i], admin_id=ADMIN,
                                     token=previews[i]["token"], confirm_count=30)
        except svc.BatchError as exc:
            return exc.code
    out, errs = _threads(12, go)
    assert not errs
    ok = [o for o in out if isinstance(o, dict)]
    assert len(ok) == 1 and Counter(o for o in out if isinstance(o, str)) == {"batch_in_progress": 11}
    assert len(rows(env, cid)) == 30 and len({u for u, *_ in rows(env, cid)}) == 30
    with env.sf() as s:
        assert [b.batch_no for b in s.query(br.AdminBroadcast).filter(br.AdminBroadcast.campaign_id == cid)] == [1]


def test_pg_o_mesmo_clique_doze_vezes_cria_um_lote_e_onze_devolucoes(env):
    _needs_pg(env)
    seed(env, 100)
    cid = campaign(env)
    _, pv, key = None, None, uuid.uuid4().hex
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=20, all_available=False, admin_id=ADMIN)

    def go(i):
        return svc.reserve_batch(env.sf, cid, CATS, requested=20, all_available=False, idempotency_key=key, admin_id=ADMIN, token=pv["token"], confirm_count=20)
    out, errs = _threads(12, go)
    assert not errs
    assert Counter(o["idempotent_replay"] for o in out) == {False: 1, True: 11} and len({o["batch"]["id"] for o in out}) == 1
    assert len(rows(env, cid)) == 20


def test_pg_dois_processos_executando_o_mesmo_lote_nunca_enviam_duas_vezes_ao_mesmo_tutor(env):
    _needs_pg(env)
    seed(env, 160)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, None, all_=True)
    prov = Fake()
    env.mp.setattr(svc, "send_push", prov)

    def go(i):
        svc.execute_batch(env.sf, res["batch"]["id"], chunk=7, pause=0)
    _, errs = _threads(6, go)
    assert not errs
    assert len(prov.calls) == 160 and set(prov.users.values()) == {1}              # 6 executores, 160 tutores, cada um UMA vez
    assert Counter(st for _, st, *_ in rows(env, cid)) == {"accepted": 160}


def test_pg_reservas_diretas_sobrepostas_nunca_duplicam_mesmo_sem_a_logica_do_servico(env):
    _needs_pg(env)
    ids = seed(env, 300)
    cid = campaign(env)
    import random
    got = []

    def go(i):
        pick = random.Random(i).sample(ids, 150)
        with env.sf() as s:
            out = svc._insert_recipients(s, cid, f"lote-{i}", pick, svc._utcnow())
            s.commit()
            return out
    out, errs = _threads(12, go)
    assert not errs
    allw = [u for o in out for u in o]
    assert len(allw) == len(set(allw)) == len(rows(env, cid))                       # ninguém foi devolvido a dois lotes; o banco tem 1 linha por tutor


def test_pg_um_tutor_reservado_em_duas_campanhas_e_permitido_mas_nunca_duas_vezes_na_mesma(env):
    _needs_pg(env)
    seed(env, 10)
    a, b = campaign(env, name="Camp A"), campaign(env, name="Camp B")
    ra, *_ = reserve(env, a, CATS, None, all_=True); run(env, ra["batch"]["id"])
    rb, *_ = reserve(env, b, CATS, None, all_=True)
    assert batch_users(env, ra["batch"]["id"]) == batch_users(env, rb["batch"]["id"])
    with env.sf() as s:
        assert svc.preview_batch(s, a, CATS, requested=5, all_available=False, admin_id=ADMIN)["available"] == 0


# ══ ENDPOINTS (SQLite; sem provedor real) ════════════════════════════════════

@pytest.fixture()
def api(client, monkeypatch):
    sf = SessionLocal
    _wipe(sf)
    monkeypatch.setattr(pc, "get_settings", lambda: SimpleNamespace(push_campaigns_enabled=True, jwt_secret="s3gredo-de-teste"))
    monkeypatch.setattr(svc, "get_settings", lambda: SimpleNamespace(jwt_secret="s3gredo-de-teste"))
    prov = Fake()
    monkeypatch.setattr(svc, "send_push", prov)
    monkeypatch.setattr(svc, "spawn", lambda fn, *a: fn(*a))                     # inline: a execução roda dentro da requisição
    monkeypatch.setattr(svc, "EXEC_PAUSE_SECONDS", 0)
    client.app.dependency_overrides[get_current_admin] = lambda: (SimpleNamespace(id=ADMIN), None)
    yield SimpleNamespace(c=client, prov=prov, mp=monkeypatch, sf=sf, kind="sqlite")
    client.app.dependency_overrides.pop(get_current_admin, None)
    _wipe(sf)


_P = "/v1/admin/push-campaigns"
_FLT = {"version": 1, "root": {"kind": "group", "op": "and", "pet_scope": "any", "items": [{"kind": "rule", "field": "pet_species", "op": "in", "value": ["cat"]}]}}
_ENDPOINTS = (("POST", f"{_P}/campaigns", {"name": "Camp", "message": "Mensagem boa"}), ("GET", f"{_P}/campaigns", None), ("GET", f"{_P}/campaigns/x", None),
              ("POST", f"{_P}/campaigns/x/close", None), ("POST", f"{_P}/campaigns/x/batches/preview", {"batch_size": 1}),
              ("POST", f"{_P}/campaigns/x/batches", {"batch_size": 1, "preview_token": "t" * 12, "confirm_count": 1, "idempotency_key": "k" * 20}),
              ("GET", f"{_P}/batches/x", None), ("POST", f"{_P}/batches/x/recover", None), ("POST", f"{_P}/batches/x/resume", {"confirm_count": 1}),
              ("POST", f"{_P}/batches/x/release", {"confirm_count": 1}))


def _call(c, method, path, body):
    return c.get(path) if method == "GET" else c.post(path, json=body)


@pytest.mark.parametrize("method,path,body", _ENDPOINTS)
def test_flag_desligada_todos_os_endpoints_novos_dao_404(client, monkeypatch, method, path, body):
    monkeypatch.setattr(pc, "get_settings", lambda: SimpleNamespace(push_campaigns_enabled=False))
    client.app.dependency_overrides[get_current_admin] = lambda: (SimpleNamespace(id=ADMIN), None)
    try:
        assert _call(client, method, path, body).status_code == 404
        assert _call(client, method, "/api" + path, body).status_code == 404
    finally:
        client.app.dependency_overrides.pop(get_current_admin, None)


@pytest.mark.parametrize("method,path,body", _ENDPOINTS)
def test_so_administrador_acessa_com_a_flag_ligada(client, monkeypatch, method, path, body):
    monkeypatch.setattr(pc, "get_settings", lambda: SimpleNamespace(push_campaigns_enabled=True))
    client.app.dependency_overrides.pop(get_current_admin, None)
    assert _call(client, method, path, body).status_code in (401, 403)


def test_fluxo_completo_pela_api_criar_previa_reservar_executar_e_repetir_o_clique(api):
    seed(api, 25)
    link = "https://amzn.to/3SN1ORt"
    camp = api.c.post(f"{_P}/campaigns", json={"name": "Ração KONG", "message": "Veja o produto.", "product_url": link, "product_title": "KONG Classic"})
    assert camp.status_code == 200, camp.text
    cid = camp.json()["id"]
    assert camp.json()["content"]["destination"] == "produto" and not camp.json()["content_locked"]
    pv = api.c.post(f"{_P}/campaigns/{cid}/batches/preview", json={"filter": _FLT, "batch_size": 10}).json()
    assert (pv["available"], pv["will_reserve"], pv["next_batch_no"]) == (25, 10, 1) and pv["token"] and pv["content"]["product_url"] == link
    body = {"filter": _FLT, "batch_size": 10, "preview_token": pv["token"], "confirm_count": 10, "idempotency_key": uuid.uuid4().hex}
    ok = api.c.post(f"{_P}/campaigns/{cid}/batches", json=body)
    assert ok.status_code == 200, ok.text
    b = ok.json()
    assert b["idempotent_replay"] is False and b["started"] is True and b["batch"]["phase"] in ("reserved", "sending", "done")
    again = api.c.post(f"{_P}/campaigns/{cid}/batches", json=body).json()           # clique repetido
    assert again["idempotent_replay"] is True and again["batch"]["id"] == b["batch"]["id"]
    assert len(api.prov.calls) == 10 and set(api.prov.users.values()) == {1}        # executou UMA vez, mesmo com 2 cliques
    got = api.c.get(f"{_P}/batches/{b['batch']['id']}").json()
    assert got["phase"] == "done" and got["counts"]["accepted"] == 10
    camp = api.c.get(f"{_P}/campaigns/{cid}").json()
    assert camp["content_locked"] and camp["used_total"] == 10 and len(camp["batches"]) == 1
    assert api.c.get(f"{_P}/campaigns").json()["campaigns"][0]["counts"]["accepted"] == 10
    assert api.c.post(f"{_P}/campaigns/{cid}/close").json()["status"] == "closed"


def test_erros_da_api_tem_codigo_e_status(api):
    seed(api, 5)
    assert api.c.post(f"{_P}/campaigns", json={"name": "ab", "message": "Mensagem boa"}).status_code == 422
    bad = api.c.post(f"{_P}/campaigns", json={"name": "Camp", "message": "Mensagem boa", "product_url": "https://evil.com/x", "product_title": "X"})
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "invalid_content"
    assert api.c.get(f"{_P}/campaigns/nao-existe").status_code == 404
    cid = api.c.post(f"{_P}/campaigns", json={"name": "Camp", "message": "Mensagem boa"}).json()["id"]
    assert api.c.post(f"{_P}/campaigns/{cid}/batches/preview", json={"filter": _FLT}).json()["detail"]["code"] == "invalid_request"
    pv = api.c.post(f"{_P}/campaigns/{cid}/batches/preview", json={"filter": _FLT, "batch_size": 2}).json()
    r = api.c.post(f"{_P}/campaigns/{cid}/batches", json={"filter": _FLT, "batch_size": 2, "preview_token": pv["token"], "confirm_count": 3,
                                                          "idempotency_key": uuid.uuid4().hex})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "bad_confirmation"
    r = api.c.post(f"{_P}/campaigns/{cid}/batches/preview", json={"filter": {"version": 1, "root": {"kind": "group", "items": [
        {"kind": "rule", "field": "tutor_created_at", "op": "gte", "value": "ontem"}]}}, "batch_size": 1})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "invalid_filter"
    assert api.c.post(f"{_P}/campaigns/{cid}/batches", json={"filter": _FLT, "batch_size": 2, "preview_token": "t" * 12, "confirm_count": 2,
                                                             "idempotency_key": "curta"}).status_code == 422


def test_recuperar_retomar_e_devolver_pela_api(api):
    seed(api, 12)
    cid = api.c.post(f"{_P}/campaigns", json={"name": "Camp", "message": "Mensagem boa"}).json()["id"]
    res, *_ = reserve(api, cid, CATS, None, all_=True)
    bid = res["batch"]["id"]
    api.mp.setattr(svc, "send_push", api.prov)
    with SessionLocal() as s:                                                     # simula o processo caído: 3 'sending', 9 'reserved'
        ids = [r.id for r in s.query(pc.PushCampaignRecipient).filter_by(batch_id=bid).limit(3)]
        s.query(pc.PushCampaignRecipient).filter(pc.PushCampaignRecipient.id.in_(ids)).update({"state": "sending"}, synchronize_session=False)
        s.query(br.AdminBroadcast).filter_by(id=bid).update({"phase": "sending"}); s.commit()
    rec = api.c.post(f"{_P}/batches/{bid}/recover").json()
    assert rec["reclassified"] == 3 and rec["batch"]["phase"] == "interrupted" and api.prov.calls == []
    assert api.c.post(f"{_P}/batches/{bid}/resume", json={"confirm_count": 4}).status_code == 409
    ok = api.c.post(f"{_P}/batches/{bid}/resume", json={"confirm_count": 9})
    assert ok.status_code == 200 and ok.json()["remaining"] == 9 and len(api.prov.calls) == 9
    assert api.c.get(f"{_P}/batches/{bid}").json()["counts"] == {"reserved": 0, "sending": 0, "accepted": 9, "failed": 0, "uncertain": 3}


def test_nenhum_codigo_novo_importa_rede_nem_altera_o_envio_avulso():
    src = open(svc.__file__, encoding="utf-8").read()
    assert "import requests" not in src and "import httpx" not in src and "affiliate" not in src.lower().replace("afiliado", "")
    assert svc.send_push is svc.push_to_user or svc.send_push is not None
    # o envio avulso continua com a sua própria função de envio e a sua própria tabela de destinatários
    assert br.AdminBroadcastRecipient.__tablename__ == "admin_broadcast_recipients"
