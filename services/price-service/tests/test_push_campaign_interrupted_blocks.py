"""Lote `interrupted` que aguarda decisão BLOQUEIA nova reserva, prévia que autorize reserva e encerramento — na API, como já era na interface.

`BATCH_ACTIVE_PHASES` (execução/recuperação/parada) NÃO mudou; o bloqueio usa `_blocking_batch` (execução ativa OU interrupted com nunca tentados).
Os testes são DETERMINÍSTICOS: quem vence a corrida não altera o resultado esperado. Provedor sempre falso."""
import itertools
import random
import threading
import time
import uuid
from collections import Counter

import pytest

import src.admin.broadcast_router as br
import src.admin.push_campaign_batches as svc
import src.admin.push_campaigns as pc
from tests.test_push_campaign_batches import (  # noqa: F401
    ADMIN, CATS, Fake, campaign, env, error_of, pg_engine, reserve, rows, run, seed,
)

BLOCKING = ("batch_in_progress", "batch_awaiting_decision")


@pytest.fixture(autouse=True)
def _teto_alto(monkeypatch):
    monkeypatch.setattr(svc, "max_batch_limit", lambda: 1_000_000)


def snap(env, bid):
    with env.sf() as s:
        return svc.serialize_batch(s, s.get(br.AdminBroadcast, bid))


def free_token(env, cid, n=3):
    with env.sf() as s:
        return svc.preview_batch(s, cid, CATS, requested=n, all_available=False, admin_id=ADMIN)


def direct_reserve(env, cid, pv, n=3, all_=False):
    return svc.reserve_batch(env.sf, cid, CATS, requested=None if all_ else n, all_available=all_, idempotency_key=uuid.uuid4().hex, admin_id=ADMIN,
                             token=pv["token"], confirm_count=pv["will_reserve"])


def interrupted(env, users=8):
    """Campanha com um lote interrompido (parada antes do 1º envio): `users` destinatários reservados e NUNCA tentados. Devolve também uma prévia
    gerada ANTES (token livre), para provar que a reserva direta é recusada mesmo assim."""
    seed(env, users + 12)
    cid = campaign(env)
    pv_livre = free_token(env, cid)
    res, *_ = reserve(env, cid, CATS, users)
    bid = res["batch"]["id"]
    svc.request_stop(env.sf, bid, ADMIN)
    run(env, bid)
    b = snap(env, bid)
    assert b["phase"] == "interrupted" and b["counts"]["reserved"] == users and b["stop"]["state"] == "acknowledged"
    return cid, bid, pv_livre


def n_batches(env, cid):
    with env.sf() as s:
        return s.query(br.AdminBroadcast).filter(br.AdminBroadcast.campaign_id == cid).count()


def no_duplicates(env, cid):
    r = rows(env, cid)
    return len({u for u, *_ in r}) == len(r)


# ── bloqueios ────────────────────────────────────────────────────────────────

def test_previa_com_lote_interrompido_nao_emite_token_nem_autoriza_reserva(env):
    cid, bid, _ = interrupted(env)
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=3, all_available=False, admin_id=ADMIN)
        pv_all = svc.preview_batch(s, cid, CATS, requested=None, all_available=True, admin_id=ADMIN)
    for p in (pv, pv_all):
        assert p["can_reserve"] is False and p["token"] is None and p["expires_at"] is None
        assert p["blocking_batch"] == {"id": bid, "batch_no": 1, "phase": "interrupted"}
        assert p["available"] > 0                                           # há público; o que bloqueia é o lote pendente de decisão


def test_reserva_direta_com_lote_interrompido_e_recusada_mesmo_com_token_de_antes(env):
    cid, bid, pv_livre = interrupted(env)
    antes = (n_batches(env, cid), len(rows(env, cid)))
    e = error_of(direct_reserve, env, cid, pv_livre)
    assert e.code == "batch_awaiting_decision" and e.extra["batch_no"] == 1 and "aguarda sua decisão" in str(e)
    assert (n_batches(env, cid), len(rows(env, cid))) == antes                # nada foi criado


def test_encerramento_com_lote_interrompido_e_recusado(env):
    cid, bid, _ = interrupted(env)
    e = error_of(svc.close_campaign, env.sf, cid)
    assert e.code == "batch_awaiting_decision"
    with env.sf() as s:
        assert s.get(pc.PushCampaign, cid).status != "closed"


def test_continuar_o_proprio_lote_e_permitido_e_depois_libera_nova_reserva(env):
    cid, bid, pv_livre = interrupted(env, users=6)
    out = svc.resume_batch(env.sf, bid, 6)                                    # a continuação NÃO é bloqueada pelo próprio bloqueio
    assert out["remaining"] == 6
    assert error_of(direct_reserve, env, cid, pv_livre).code == "batch_in_progress"      # enquanto 'sending', segue bloqueado (agora por execução ativa)
    prov = run(env, bid)
    assert len(prov.calls) == 6 and set(prov.users.values()) == {1} and snap(env, bid)["phase"] == "done"
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=3, all_available=False, admin_id=ADMIN)
    assert pv["can_reserve"] is True and pv["token"] and pv["blocking_batch"] is None   # resolvido: libera
    res = direct_reserve(env, cid, pv)
    assert res["batch"]["batch_no"] == 2 and no_duplicates(env, cid)


def test_devolver_os_nunca_tentados_e_permitido_e_depois_libera_nova_reserva(env):
    cid, bid, _ = interrupted(env, users=5)
    out = svc.release_batch(env.sf, bid, 5)
    assert out["released"] == 5 and snap(env, bid)["phase"] == "done"
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=None, all_available=True, admin_id=ADMIN)
    assert pv["can_reserve"] is True and pv["token"]
    res = direct_reserve(env, cid, pv, all_=True)
    assert no_duplicates(env, cid) and res["batch"]["batch_no"] == 2         # devolvidos podem voltar a ser escolhidos, uma vez só


def test_encerrar_depois_de_resolver_o_lote_e_permitido(env):
    cid, bid, _ = interrupted(env, users=4)
    svc.release_batch(env.sf, bid, 4)
    assert svc.close_campaign(env.sf, cid)["status"] == "closed"


def test_interrompido_sem_nunca_tentados_nao_tem_o_que_decidir_e_nao_bloqueia(env):
    seed(env, 10)
    cid = campaign(env)
    res, *_ = reserve(env, cid, CATS, 3)
    bid = res["batch"]["id"]
    run(env, bid, Fake(default="ok"))
    with env.sf() as s:                                                       # lote que terminou de enviar mas ficou marcado 'interrupted' (falha do executor)
        b = s.get(br.AdminBroadcast, bid); b.phase = "interrupted"; s.commit()
    with env.sf() as s:
        pv = svc.preview_batch(s, cid, CATS, requested=2, all_available=False, admin_id=ADMIN)
    assert pv["can_reserve"] is True                                          # sem destinatários pendentes: nenhum impasse eterno
    assert svc.close_campaign(env.sf, cid)["status"] == "closed"


def test_lote_em_envio_continua_bloqueando_com_o_codigo_de_andamento(env):
    seed(env, 10)
    cid = campaign(env)
    pv_livre = free_token(env, cid)
    reserve(env, cid, CATS, 4)                                                # fase 'reserved' (execução não iniciada)
    assert error_of(direct_reserve, env, cid, pv_livre).code == "batch_in_progress"
    assert error_of(svc.close_campaign, env.sf, cid).code == "batch_in_progress"


def test_a_recuperacao_na_partida_e_a_parada_continuam_usando_so_a_execucao_ativa(env):
    """BATCH_ACTIVE_PHASES não foi alterada: um lote interrompido não é 'executado' de novo pela recuperação nem aceita novo pedido de parada."""
    assert svc.BATCH_ACTIVE_PHASES == ("reserved", "sending")
    cid, bid, _ = interrupted(env, users=4)
    env.mp.setattr(svc, "push_campaigns_enabled", lambda: True)
    assert svc.recover_orphans_on_startup(env.sf) == 0                         # interrupted não é reclassificado de novo
    again = svc.request_stop(env.sf, bid, ADMIN)
    assert again["already_stopped"] is True
    assert snap(env, bid)["phase"] == "interrupted" and snap(env, bid)["counts"]["reserved"] == 4


# ── ordem controlada e concorrência (independentes de quem vence) ────────────

OPS = ("stop", "resume", "reserve")


def _apply(env, op, cid, bid, pv_livre, log):
    try:
        if op == "stop":
            log.append(("stop", svc.request_stop(env.sf, bid, "admin-2")["already_requested"]))
        elif op == "resume":
            log.append(("resume", svc.resume_batch(env.sf, bid, env_left(env, bid))["remaining"]))
        else:
            with env.sf() as s:
                pv = svc.preview_batch(s, cid, CATS, requested=3, all_available=False, admin_id=ADMIN)
            assert pv["can_reserve"] is False and pv["token"] is None
            try:
                direct_reserve(env, cid, pv_livre)
                log.append(("reserve", "SUCESSO"))                             # NUNCA pode acontecer enquanto o lote não for resolvido
            except svc.BatchError as e:
                log.append(("reserve", e.code))
    except svc.BatchError as e:
        log.append((op, e.code))


def env_left(env, bid):
    return snap(env, bid)["counts"]["reserved"]


@pytest.mark.parametrize("order", list(itertools.permutations(OPS)))
def test_ordem_controlada_parada_continuacao_reserva(env, order):
    cid, bid, pv_livre = interrupted(env, users=6)
    log = []
    for op in order:
        _apply(env, op, cid, bid, pv_livre, log)
    assert ("reserve", "SUCESSO") not in log                                   # em QUALQUER ordem a nova reserva é recusada
    assert all(code in BLOCKING for op, code in log if op == "reserve")
    assert n_batches(env, cid) == 1
    prov = Fake()
    env.mp.setattr(svc, "send_push", prov)
    if snap(env, bid)["phase"] == "sending":
        svc.execute_batch(env.sf, bid, chunk=1, pause=0)                       # quem retomou executa (a thread da API faria o mesmo)
    b = snap(env, bid)
    assert b["counts"]["sending"] == 0 and b["phase"] in ("done", "interrupted") and max(prov.users.values(), default=0) <= 1
    if b["phase"] == "interrupted":
        assert b["counts"]["reserved"] == 6 and len(prov.calls) == 0           # a parada valeu antes de qualquer envio
        svc.release_batch(env.sf, bid, 6)
    else:
        assert b["counts"]["accepted"] == 6 and len(prov.calls) == 6
    assert no_duplicates(env, cid)
    with env.sf() as s:                                                       # resolvido por completo: nova reserva permitida
        assert svc.preview_batch(s, cid, CATS, requested=3, all_available=False, admin_id=ADMIN)["can_reserve"] is True


def test_concorrencia_real_parada_continuacao_reserva_independe_de_quem_vence(env):
    if env.kind != "postgres":
        pytest.skip("disputa real só no PostgreSQL (a ordem controlada acima roda nos dois bancos)")
    for rnd in range(25):
        rnd_ = random.Random(rnd)                                              # atrasos reprodutíveis: varia a ordem de chegada sem depender do acaso do agendador
        cid, bid, pv_livre = interrupted(env, users=6)
        barrier, log, lock = threading.Barrier(3), [], threading.Lock()
        delays = {op: rnd_.choice([0, 0.002, 0.01, 0.03]) for op in OPS}
        def worker(op):
            barrier.wait(10); time.sleep(delays[op])
            local = []
            _apply(env, op, cid, bid, pv_livre, local)
            with lock: log.extend(local)
        ts = [threading.Thread(target=worker, args=(op,)) for op in OPS]
        [t.start() for t in ts]; [t.join(30) for t in ts]
        assert not any(t.is_alive() for t in ts)
        assert ("reserve", "SUCESSO") not in log, (rnd, delays, log)             # o lote antigo não foi resolvido durante a disputa → reserva SEMPRE recusada
        assert n_batches(env, cid) == 1 and no_duplicates(env, cid)
        prov = Fake(); env.mp.setattr(svc, "send_push", prov)
        if snap(env, bid)["phase"] == "sending":
            svc.execute_batch(env.sf, bid, chunk=1, pause=0)
        b = snap(env, bid)
        assert b["counts"]["sending"] == 0 and b["phase"] in ("done", "interrupted") and max(prov.users.values(), default=0) <= 1
        assert (b["counts"]["accepted"] == 6 and len(prov.calls) == 6) if b["phase"] == "done" else (b["counts"]["reserved"] == 6 and not prov.calls)
