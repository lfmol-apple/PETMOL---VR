"""Etapa 6.1 — PARADA segura de lote (R1) e TETO de destinatários por lote (R2).

Roda nos dois bancos (SQLite e PostgreSQL; o PostgreSQL é obrigatório no CI). Provedor SEMPRE falso: nenhum teste envia push real.
Reaproveita os auxiliares/fixtures dos testes de reserva (mesmo `env`, `Fake`, `seed`…).
"""
import threading
import time
import uuid
from collections import Counter
from datetime import timedelta

import pytest

import src.admin.broadcast_router as br
import src.admin.push_campaign_batches as svc
import src.admin.push_campaigns as pc
from tests.test_push_campaign_batches import (  # noqa: F401  (fixtures e auxiliares; nada de test_* é reimportado)
    ADMIN, CATS, Crash, Fake, api, campaign, env, error_of, nothing_reserved, pg_engine, reserve, rows, run, seed, _P, _FLT,
)

ADMIN_2 = "admin-2"


@pytest.fixture(autouse=True)
def _limite_alto_por_padrao(monkeypatch):
    monkeypatch.setattr(svc, "max_batch_limit", lambda: 1_000_000)


def snap(env, bid):
    with env.sf() as s:
        return svc.serialize_batch(s, s.get(br.AdminBroadcast, bid))


def states(env, bid):
    with env.sf() as s:
        return dict(Counter(r.state for r in s.query(pc.PushCampaignRecipient).filter(pc.PushCampaignRecipient.batch_id == bid).all()))


def reserved_batch(env, n, limit_check=False):
    seed(env, n)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, n)
    return cid, res["batch"]["id"]


# ══ R1 — PARADA ══════════════════════════════════════════════════════════════

def test_parada_antes_do_primeiro_envio_nao_chama_o_provedor_e_deixa_todos_reservados(env):
    cid, bid = reserved_batch(env, 8)
    out = svc.request_stop(env.sf, bid, ADMIN)
    assert out["already_requested"] is False and out["batch"]["stop"]["state"] == "requested"
    prov = run(env, bid)
    assert prov.calls == []                                                   # nenhum destinatário foi reivindicado nem enviado
    b = snap(env, bid)
    assert b["phase"] == "interrupted" and b["stop"]["state"] == "acknowledged" and b["counts"]["reserved"] == 8 and b["counts"]["sending"] == 0
    # as regras de recuperação existentes valem: continuar envia todos, uma vez cada, e a parada antiga não volta a travar
    svc.resume_batch(env.sf, bid, 8)
    prov2 = run(env, bid)
    assert len(prov2.calls) == 8 and set(prov2.users.values()) == {1}
    assert snap(env, bid)["phase"] == "done" and snap(env, bid)["counts"]["accepted"] == 8


def test_parada_durante_o_processamento_ninguem_novo_e_reivindicado_e_o_nao_tentado_volta_a_reservado(env):
    cid, bid = reserved_batch(env, 10)
    prov = Fake()
    def hook(_uid):
        if len(prov.calls) == 3:
            svc.request_stop(env.sf, bid, ADMIN)
    prov.hook = hook
    run(env, bid, prov, chunk=5)                                              # pedaço de 5: 2 já reivindicados e ainda não tentados
    assert len(prov.calls) == 3
    c = snap(env, bid)["counts"]
    assert c["accepted"] == 3 and c["reserved"] == 7 and c["sending"] == 0 and c["uncertain"] == 0 and c["failed"] == 0
    with env.sf() as s:
        untried = s.query(pc.PushCampaignRecipient).filter(pc.PushCampaignRecipient.batch_id == bid, pc.PushCampaignRecipient.state == "reserved").all()
        assert len(untried) == 7 and all(r.attempted_at is None for r in untried)   # comprovadamente nunca tentados
    b = snap(env, bid)
    assert b["phase"] == "interrupted" and b["stop"]["state"] == "acknowledged"


def test_parada_com_chamada_ao_provedor_em_andamento_o_resultado_dela_e_registrado_nao_cancelado(env):
    cid, bid = reserved_batch(env, 6)
    entered, gate = threading.Event(), threading.Event()
    prov = Fake()
    def hook(_uid):
        entered.set()
        gate.wait(10)                                                         # a chamada fica "no ar" até liberarmos
    prov.hook = hook
    env.mp.setattr(svc, "send_push", prov)
    t = threading.Thread(target=svc.execute_batch, args=(env.sf, bid), kwargs=dict(chunk=1, pause=0))
    t.start()
    assert entered.wait(10)
    out = svc.request_stop(env.sf, bid, ADMIN)                                # parada pedida COM a chamada em andamento
    assert out["batch"]["stop"]["state"] == "requested" and out["batch"]["phase"] == "sending"
    assert states(env, bid).get("sending") == 1                               # a chamada em curso NÃO foi dada como cancelada
    gate.set()
    t.join(15)
    assert not t.is_alive()
    assert len(prov.calls) == 1                                               # só essa; mais nenhuma depois da parada
    st = states(env, bid)
    assert st == {"accepted": 1, "reserved": 5}                               # o resultado real da chamada foi registrado
    assert snap(env, bid)["stop"]["state"] == "acknowledged"


def test_chamada_em_andamento_que_dá_timeout_vira_incerto_e_nunca_e_reenviada_ao_retomar(env):
    cid, bid = reserved_batch(env, 5)
    entered, gate = threading.Event(), threading.Event()
    prov = Fake()
    first = {}
    def hook(uid):
        first.setdefault("uid", uid)
        entered.set()
        gate.wait(10)
        raise TimeoutError("o provedor não respondeu")                        # resultado desconhecido
    prov.hook = hook
    env.mp.setattr(svc, "send_push", prov)
    t = threading.Thread(target=svc.execute_batch, args=(env.sf, bid), kwargs=dict(chunk=1, pause=0))
    t.start(); assert entered.wait(10)
    svc.request_stop(env.sf, bid, ADMIN)
    gate.set(); t.join(15)
    assert states(env, bid) == {"uncertain": 1, "reserved": 4}
    svc.resume_batch(env.sf, bid, 4)
    prov2 = Fake()
    run(env, bid, prov2)
    assert first["uid"] not in prov2.users                                    # o incerto NUNCA é reenviado
    assert len(prov2.calls) == 4 and snap(env, bid)["counts"]["uncertain"] == 1


@pytest.mark.parametrize("threads", [2, 6])
def test_parada_pedida_ao_mesmo_tempo_por_varios_administradores_gera_um_unico_pedido(env, threads):
    if env.kind != "postgres" and threads > 2:
        pytest.skip("concorrência ampla só no PostgreSQL")
    cid, bid = reserved_batch(env, 5)
    barrier, results, errors = threading.Barrier(threads), [], []
    def go(i):
        try:
            barrier.wait(10)
            results.append(svc.request_stop(env.sf, bid, f"admin-{i}"))
        except Exception as exc:                                              # noqa: BLE001
            errors.append(exc)
    ts = [threading.Thread(target=go, args=(i,)) for i in range(threads)]
    [t.start() for t in ts]; [t.join(20) for t in ts]
    assert not errors
    assert len(results) == threads and sum(1 for r in results if r["already_requested"] is False) == 1     # exatamente 1 gravou o pedido
    with env.sf() as s:
        b = s.get(br.AdminBroadcast, bid)
        req = b.stop_requested_at
        assert b.stop_requested_by in {f"admin-{i}" for i in range(threads)}
    assert svc.request_stop(env.sf, bid, ADMIN_2)["already_requested"] is True      # mais um clique depois: idempotente, não muda nada
    with env.sf() as s:
        assert s.get(br.AdminBroadcast, bid).stop_requested_at == req


def test_reinicio_da_api_com_parada_pendente_recupera_sem_enviar_e_nao_trava_a_retomada(env):
    cid, bid = reserved_batch(env, 6)
    prov = Fake()
    def hook(_uid):
        if len(prov.calls) == 3:
            svc.request_stop(env.sf, bid, ADMIN)                              # parada pedida…
            raise Crash()                                                     # …e o processo morre antes de reconhecê-la
    prov.hook = hook
    env.mp.setattr(svc, "send_push", prov)
    with pytest.raises(Crash):
        svc.execute_batch(env.sf, bid, chunk=1, pause=0)
    assert states(env, bid) == {"accepted": 2, "sending": 1, "reserved": 3} and snap(env, bid)["stop"]["state"] == "requested"
    calls_before = len(prov.calls)
    env.mp.setattr(svc, "push_campaigns_enabled", lambda: True)
    assert svc.recover_orphans_on_startup(env.sf) == 1                        # "partida" da API
    assert len(prov.calls) == calls_before                                    # a recuperação não chamou o provedor
    b = snap(env, bid)
    assert b["phase"] == "interrupted" and b["stop"]["state"] == "acknowledged" and b["counts"] == {"reserved": 3, "sending": 0, "accepted": 2, "failed": 0, "uncertain": 1}
    svc.resume_batch(env.sf, bid, 3)
    prov2 = Fake()
    run(env, bid, prov2)
    assert len(prov2.calls) == 3 and snap(env, bid)["phase"] == "done"        # a parada antiga não interrompeu a retomada
    assert all(c == 1 for c in (prov.users + prov2.users).values())          # ninguém recebeu duas vezes (o incerto também não)


def test_parada_pendente_com_a_flag_desligada_na_partida_nao_faz_nada(env):
    cid, bid = reserved_batch(env, 4)
    svc.request_stop(env.sf, bid, ADMIN)
    env.mp.setattr(svc, "push_campaigns_enabled", lambda: False)
    assert svc.recover_orphans_on_startup(env.sf) == 0
    assert snap(env, bid)["stop"]["state"] == "requested"                     # nada reclassifica sem a flag; nada envia


def test_devolver_os_nunca_tentados_depois_da_parada_e_as_regras_de_recuperacao_valem(env):
    cid, bid = reserved_batch(env, 8)
    prov = Fake()
    prov.hook = lambda _u: svc.request_stop(env.sf, bid, ADMIN) if len(prov.calls) == 2 else None
    run(env, bid, prov, chunk=1)
    left = snap(env, bid)["counts"]["reserved"]
    assert left == 6
    out = svc.release_batch(env.sf, bid, left)
    assert out["released"] == 6 and snap(env, bid)["phase"] == "done"
    with env.sf() as s:                                                       # os 2 enviados continuam registrados e fora do público; os 6 voltaram
        pv = svc.preview_batch(s, cid, CATS, requested=None, all_available=True, admin_id=ADMIN)
    assert pv["available"] == 6


def test_parada_depois_do_ultimo_envio_o_lote_conclui_como_finished_before_stop(env):
    cid, bid = reserved_batch(env, 2)
    prov = Fake()
    prov.hook = lambda _u: svc.request_stop(env.sf, bid, ADMIN) if len(prov.calls) == 2 else None      # pedida durante o ÚLTIMO envio
    run(env, bid, prov, chunk=1)
    b = snap(env, bid)
    assert b["phase"] == "done" and b["counts"]["accepted"] == 2 and b["stop"]["state"] == "finished_before_stop"


def test_parada_so_vale_para_lote_em_andamento_e_e_idempotente_depois_de_reconhecida(env):
    cid, bid = reserved_batch(env, 3)
    run(env, bid)                                                             # termina
    e = error_of(svc.request_stop, env.sf, bid, ADMIN)
    assert e.code == "batch_not_running" and e.status == 409
    cid2, bid2 = reserved_batch(env, 3)
    svc.request_stop(env.sf, bid2, ADMIN); run(env, bid2)                     # parada reconhecida
    again = svc.request_stop(env.sf, bid2, ADMIN_2)
    assert again["already_requested"] is True and again["already_stopped"] is True
    assert error_of(svc.request_stop, env.sf, "nao-existe", ADMIN).code == "batch_not_found"


def test_lote_de_envio_avulso_nao_pode_ser_parado_por_aqui_e_a_parada_libera_o_avulso(env):
    with env.sf() as s:
        av = br.AdminBroadcast(message="avulso", segment="todos", audience_kind="all", recipients_total=1, delivered_total=0, phase="sending", created_by=ADMIN)
        s.add(av); s.commit(); avid = av.id
    assert error_of(svc.request_stop, env.sf, avid, ADMIN).code == "batch_not_found"        # só lotes de campanha
    cid, bid = reserved_batch(env, 4)
    def avulso_bloqueado():                                                   # a MESMA consulta que o /send do avulso faz
        from datetime import datetime, timezone
        with env.sf() as s:
            return s.query(br.AdminBroadcast.id).filter(br.AdminBroadcast.campaign_id.is_not(None), br.AdminBroadcast.phase == "sending",
                                                       br.AdminBroadcast.created_at >= datetime.now(timezone.utc) - timedelta(minutes=30)).first() is not None
    with env.sf() as s:
        b = s.get(br.AdminBroadcast, bid); b.phase = "sending"; s.commit()
    assert avulso_bloqueado()
    svc.request_stop(env.sf, bid, ADMIN); run(env, bid)
    assert not avulso_bloqueado()                                             # parado = fase 'interrupted': não bloqueia mais o avulso
    with env.sf() as s:                                                       # e o lote avulso não foi tocado
        assert s.get(br.AdminBroadcast, avid).stop_requested_at is None


@pytest.mark.skipif(False, reason="")
def test_concorrencia_parada_x_reserva_x_continuacao_nunca_duplica_nem_perde_registro(env):
    """15 rodadas: retomar e parar disputam o mesmo lote interrompido; reservas concorrentes devem ser recusadas. Invariantes: ninguém recebe 2×,
    nenhum destinatário fica 'sending' sem executor, e o resultado final é consistente."""
    if env.kind != "postgres":
        pytest.skip("disputa real só no PostgreSQL")
    for _ in range(15):
        seed(env, 6)
        cid = campaign(env)
        res, *_ = reserve(env, cid, CATS, 6); bid = res["batch"]["id"]
        svc.request_stop(env.sf, bid, ADMIN); run(env, bid)                   # interrompido, 6 reservados, parada reconhecida
        barrier, out = threading.Barrier(3), {}
        def t_resume():
            barrier.wait(10)
            try: out["resume"] = svc.resume_batch(env.sf, bid, 6)
            except svc.BatchError as e: out["resume"] = e.code
        def t_stop():
            barrier.wait(10)
            try: out["stop"] = svc.request_stop(env.sf, bid, ADMIN_2)
            except svc.BatchError as e: out["stop"] = e.code
        def t_reserve():
            barrier.wait(10)
            try:
                with env.sf() as s:
                    pv = svc.preview_batch(s, cid, CATS, requested=None, all_available=True, admin_id=ADMIN)
                out["reserve"] = pv["can_reserve"]                            # lote interrompido ainda bloqueia nova reserva
            except svc.BatchError as e: out["reserve"] = e.code
        ts = [threading.Thread(target=f) for f in (t_resume, t_stop, t_reserve)]
        [t.start() for t in ts]; [t.join(30) for t in ts]
        assert out["reserve"] in (False, "batch_in_progress")
        prov = Fake()
        env.mp.setattr(svc, "send_push", prov)
        if snap(env, bid)["phase"] == "sending":
            svc.execute_batch(env.sf, bid, chunk=1, pause=0)                  # quem retomou executa (a thread da API faria o mesmo)
        b = snap(env, bid)
        assert max(prov.users.values(), default=0) <= 1
        assert b["counts"]["sending"] == 0
        assert b["phase"] in ("done", "interrupted")
        if b["phase"] == "done":
            assert b["counts"]["accepted"] == 6 and len(prov.calls) == 6
        else:                                                                 # parada venceu a retomada: nada enviado, tudo reservado
            assert b["counts"]["reserved"] == 6 and len(prov.calls) == 0
        with env.sf() as s:
            assert s.query(pc.PushCampaignRecipient).filter(pc.PushCampaignRecipient.batch_id == bid).count() == 6


# ══ R2 — TETO POR LOTE ═══════════════════════════════════════════════════════

@pytest.mark.parametrize("limit", [1, 5, 50])
def test_teto_por_lote_na_previa_na_reserva_e_em_todos_os_disponiveis(env, limit):
    env.mp.setattr(svc, "max_batch_limit", lambda: limit)
    seed(env, limit + 30)
    cid = campaign(env)
    with env.sf() as s:
        ok = svc.preview_batch(s, cid, CATS, requested=limit, all_available=False, admin_id=ADMIN)
    assert ok["will_reserve"] == limit and ok["max_batch"] == limit and ok["token"]
    with env.sf() as s:
        e = error_of(svc.preview_batch, s, cid, CATS, requested=limit + 1, all_available=False, admin_id=ADMIN)
    assert e.code == "batch_limit_exceeded" and e.status == 422 and e.extra["limit"] == limit       # recusa: não reduz em silêncio
    with env.sf() as s:
        e = error_of(svc.preview_batch, s, cid, CATS, requested=None, all_available=True, admin_id=ADMIN)
    assert e.code == "batch_limit_exceeded" and str(limit) in str(e)                                    # "todos" acima do teto também recusa
    res, *_ = reserve(env, cid, CATS, limit)                                                            # exatamente no teto: passa
    assert res["batch"]["reserved"] == limit
    assert len(rows(env, cid)) == limit                                                                 # e não foi dividido em vários lotes


def test_pedido_acima_do_teto_e_recusado_mesmo_quando_ha_menos_disponiveis_que_o_teto(env):
    """Pedir 100 com teto 5 e só 3 disponíveis NÃO pode virar, em silêncio, um lote de 3: o pedido em si excede o teto."""
    env.mp.setattr(svc, "max_batch_limit", lambda: 5)
    seed(env, 3)
    cid = campaign(env)
    with env.sf() as s:
        e = error_of(svc.preview_batch, s, cid, CATS, requested=100, all_available=False, admin_id=ADMIN)
    assert e.code == "batch_limit_exceeded" and e.extra["requested"] == 100 and e.extra["limit"] == 5


def test_todos_os_disponiveis_abaixo_do_teto_passa(env):
    env.mp.setattr(svc, "max_batch_limit", lambda: 5)
    seed(env, 3)
    cid = campaign(env)
    res, pv, _ = reserve(env, cid, CATS, None, all_=True)
    assert res["batch"]["reserved"] == 3 and pv["max_batch"] == 5


def test_a_reserva_confere_o_teto_de_novo_mesmo_com_uma_previa_gerada_antes(env):
    seed(env, 20)
    cid = campaign(env)
    with env.sf() as s:                                                       # prévia gerada quando o teto era alto
        pv = svc.preview_batch(s, cid, CATS, requested=15, all_available=False, admin_id=ADMIN)
    env.mp.setattr(svc, "max_batch_limit", lambda: 10)                        # o teto é reduzido depois (ou a API é chamada direto)
    e = error_of(svc.reserve_batch, env.sf, cid, CATS, requested=15, all_available=False, idempotency_key=uuid.uuid4().hex, admin_id=ADMIN,
                 token=pv["token"], confirm_count=15)
    assert e.code == "batch_limit_exceeded" and nothing_reserved(env, cid)
    with env.sf() as s:
        pv_all = svc.preview_batch(s, cid, CATS, requested=None, all_available=True, admin_id=ADMIN) if False else None
    env.mp.setattr(svc, "max_batch_limit", lambda: 1_000_000)
    with env.sf() as s:
        pv_all = svc.preview_batch(s, cid, CATS, requested=None, all_available=True, admin_id=ADMIN)
    env.mp.setattr(svc, "max_batch_limit", lambda: 10)
    e = error_of(svc.reserve_batch, env.sf, cid, CATS, requested=None, all_available=True, idempotency_key=uuid.uuid4().hex, admin_id=ADMIN,
                 token=pv_all["token"], confirm_count=pv_all["will_reserve"])
    assert e.code == "batch_limit_exceeded" and nothing_reserved(env, cid)


def test_repeticao_idempotente_de_um_lote_ja_criado_nao_e_barrada_pelo_teto(env):
    seed(env, 6)
    cid = campaign(env)
    res, pv, key = reserve(env, cid, CATS, 5)
    env.mp.setattr(svc, "max_batch_limit", lambda: 1)
    again = svc.reserve_batch(env.sf, cid, CATS, requested=5, all_available=False, idempotency_key=key, admin_id=ADMIN, token=pv["token"], confirm_count=5)
    assert again["idempotent_replay"] is True and again["batch"]["id"] == res["batch"]["id"]


def test_continuar_considera_o_que_ainda_poderia_ser_enviado_e_respeita_o_teto(env):
    cid, bid = reserved_batch(env, 10)
    svc.request_stop(env.sf, bid, ADMIN); run(env, bid)                       # interrompido com 10 nunca tentados
    env.mp.setattr(svc, "max_batch_limit", lambda: 5)
    e = error_of(svc.resume_batch, env.sf, bid, 10)
    assert e.code == "batch_limit_exceeded" and e.extra["remaining"] == 10 and snap(env, bid)["phase"] == "interrupted"
    out = svc.release_batch(env.sf, bid, 10)                                  # devolver continua possível
    assert out["released"] == 10
    cid2, bid2 = reserved_batch(env, 4)
    svc.request_stop(env.sf, bid2, ADMIN); run(env, bid2)
    assert svc.resume_batch(env.sf, bid2, 4)["remaining"] == 4                # 4 ≤ 5: passa


def test_limite_invalido_ou_zero_cai_no_padrao_conservador(monkeypatch):
    from types import SimpleNamespace
    monkeypatch.undo()
    for bad in (0, -3, "abc", None):
        monkeypatch.setattr(svc, "get_settings", lambda bad=bad: SimpleNamespace(push_campaigns_max_batch=bad))
        assert svc.max_batch_limit() == svc.DEFAULT_MAX_BATCH == 50
    monkeypatch.setattr(svc, "get_settings", lambda: SimpleNamespace(push_campaigns_max_batch=1))
    assert svc.max_batch_limit() == 1


# ══ Endpoints (HTTP) ═════════════════════════════════════════════════════════

def test_api_teto_vale_para_chamada_direta_e_para_todos(api):
    from tests.test_push_campaign_batches import seed as _seed
    api.mp.setattr(svc, "max_batch_limit", lambda: 2)
    ctx = type("E", (), {"sf": api.sf, "kind": "sqlite", "mp": api.mp})()
    _seed(ctx, 6)
    cid = api.c.post(f"{_P}/campaigns", json={"name": "Camp teto", "message": "Mensagem boa"}).json()["id"]
    r = api.c.post(f"{_P}/campaigns/{cid}/batches/preview", json={"filter": _FLT, "batch_size": 3})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "batch_limit_exceeded"
    r = api.c.post(f"{_P}/campaigns/{cid}/batches/preview", json={"filter": _FLT, "all_available": True})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "batch_limit_exceeded"
    r = api.c.post(f"{_P}/campaigns/{cid}/batches", json={"filter": _FLT, "batch_size": 3, "preview_token": "t" * 20, "confirm_count": 3, "idempotency_key": "k" * 20})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "batch_limit_exceeded"       # nem com token falso a API direta passa do teto
    assert api.prov.calls == []
    r = api.c.post(f"{_P}/campaigns/{cid}/batches/preview", json={"filter": _FLT, "batch_size": 2})
    assert r.status_code == 200 and r.json()["max_batch"] == 2
    assert api.c.get(f"{_P}/campaigns/{cid}").json()["max_batch"] == 2


def test_api_parar_exige_confirmacao_e_e_idempotente(api):
    from tests.test_push_campaign_batches import seed as _seed
    ctx = type("E", (), {"sf": api.sf, "kind": "sqlite", "mp": api.mp})()
    _seed(ctx, 4)
    api.mp.setattr(svc, "max_batch_limit", lambda: 1_000_000)
    api.mp.setattr(svc, "spawn", lambda fn, *a: None)                         # reserva sem executar: o lote fica em andamento
    cid = api.c.post(f"{_P}/campaigns", json={"name": "Camp parar", "message": "Mensagem boa"}).json()["id"]
    pv = api.c.post(f"{_P}/campaigns/{cid}/batches/preview", json={"filter": _FLT, "batch_size": 4}).json()
    bid = api.c.post(f"{_P}/campaigns/{cid}/batches", json={"filter": _FLT, "batch_size": 4, "preview_token": pv["token"], "confirm_count": 4,
                                                           "idempotency_key": uuid.uuid4().hex}).json()["batch"]["id"]
    assert api.c.post(f"{_P}/batches/{bid}/stop", json={}).status_code == 422                       # sem confirmação explícita
    assert api.c.post(f"{_P}/batches/{bid}/stop", json={"confirm": False}).status_code == 422
    r1 = api.c.post(f"{_P}/batches/{bid}/stop", json={"confirm": True}); r2 = api.c.post(f"{_P}/batches/{bid}/stop", json={"confirm": True})
    assert r1.status_code == r2.status_code == 200 and r1.json()["already_requested"] is False and r2.json()["already_requested"] is True
    assert r1.json()["batch"]["stop"]["state"] == "requested"
    assert api.c.post(f"{_P}/batches/nao-existe/stop", json={"confirm": True}).status_code == 404
    assert api.prov.calls == []
