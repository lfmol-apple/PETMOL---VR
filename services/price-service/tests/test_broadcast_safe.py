"""Envio avulso SEGURO (aba Gratuito): estado por destinatário, sem reenvio automático, janela de silêncio e barra fiel.
Banco de teste + provedor SIMULADO: nenhum push real. Cenários exigidos pelo dono (21/11/2026)."""
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import src.admin.broadcast_router as br
import src.admin.broadcast_safe as bs
from src.admin.activation_campaign_router import ActivationCampaignContact
from src.analytics.models import AnalyticsProductEvent
from src.db import SessionLocal
from tests.test_admin_broadcast import adm, _mk_user, _body  # noqa: F401  (fixture `adm`)

R, B = br.AdminBroadcastRecipient, br.AdminBroadcast
NOON_UTC = datetime(2026, 11, 21, 15, 0, tzinfo=timezone.utc)      # 12h em Brasília: dentro de qualquer janela


class Crash(BaseException):
    """Simula a morte do processo (SIGKILL/deploy): atravessa todos os `except Exception`."""


@pytest.fixture()
def clock(monkeypatch):
    c = SimpleNamespace(t=NOON_UTC)
    monkeypatch.setattr(bs, "_now", lambda: c.t)
    monkeypatch.setattr(bs, "PAUSE_SECONDS", 0)
    return c


@pytest.fixture()
def prov(monkeypatch, adm):
    """Provedor falso: registra TODA chamada. `mode[uid]` decide o resultado; padrão = aceita."""
    calls: list[str] = []
    mode: dict = {}

    def fake(uid, payload):
        calls.append(uid)
        m = mode.get(uid)
        if callable(m):
            return m()
        if m == "reject":
            return 0
        if m == "boom":
            raise RuntimeError("apns 503")
        if m == "die_after":
            raise Crash()
        return 1

    monkeypatch.setattr(br, "push_to_user", fake)
    monkeypatch.setattr(br, "_spawn", lambda fn, *a: None)                 # a criação NÃO executa: cada teste executa à mão
    return SimpleNamespace(calls=calls, mode=mode)


def _users(n):
    with SessionLocal() as db:
        return [_mk_user(db, f"Tutor {i}") for i in range(n)]


def _create(adm, n_expected, **extra):
    body = _body(goal="atalho", segment="todos", **extra)
    pv = adm.client.post("/v1/admin/broadcast/preview", json=body).json()
    assert pv["will_send"] == n_expected, pv
    r = adm.client.post("/v1/admin/broadcast/send", json={**body, "confirm_count": pv["will_send"]})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _order(bid):
    """user_ids na ordem em que a execução os processa (R.id)."""
    with SessionLocal() as db:
        return [str(u) for (u,) in db.query(R.user_id).filter(R.broadcast_id == bid).order_by(R.id).all()]


def _sleep(seconds):
    threading.Event().wait(seconds)                       # `adm` troca time.sleep por no-op: espera REAL


def _states(bid=None):
    with SessionLocal() as db:
        q = db.query(R.user_id, R.state)
        if bid:
            q = q.filter(R.broadcast_id == bid)
        return {str(u): s for u, s in q.all()}


def _counts(bid):
    with SessionLocal() as db:
        return bs.count_states(db, bid)


def _progress(adm):
    return adm.client.get("/v1/admin/broadcast/progress/latest", params={"goal": "atalho"}).json()


def _run_until_crash(bid):
    try:
        bs.run_broadcast(bid)
    except Crash:
        pass
    finally:
        with bs._RUN_LOCK:
            bs._RUNNING.discard(bid)            # o "processo" morreu: nenhuma thread dele continua


# ══ 1–3. REINÍCIO, QUEDA ANTES/DEPOIS DO PROVEDOR, RETOMADA ═══════════════════════════════

def test_demonstracao_reinicio_nenhum_aceito_ou_incerto_e_reenviado(adm, prov, clock):
    """O cenário da auditoria: queda no meio do envio. Depois do 'reinício', ninguém com envio aceito ou incerto é reenviado."""
    _users(11)                                                                # + admin = 12 destinatários
    bid = _create(adm, 12)
    order = _order(bid)
    prov.mode[order[7]] = "die_after"                                         # o provedor ACEITA o 8º e o processo morre antes de gravar
    _run_until_crash(bid)
    st = _states(bid)
    accepted_before = {u for u, s in st.items() if s == "accepted"}
    assert len(accepted_before) == 7 and st[order[7]] == "sending"           # 7 gravados como aceitos; o 8º ficou "em envio"
    sent_before = list(prov.calls)
    assert order[7] in sent_before                                            # o 8º JÁ recebeu o push (por isso nunca pode repetir)

    # ── REINÍCIO: a thread morreu; passam-se 10 min sem sinal de vida; a partida reclassifica (sem enviar nada)
    clock.t = NOON_UTC + timedelta(minutes=10)
    assert bs.recover_stale() == 1
    assert prov.calls == sent_before                                          # recuperar NÃO chamou o provedor
    st = _states(bid)
    assert st[order[7]] == "uncertain" and {u for u, s in st.items() if s == "accepted"} == accepted_before
    assert [u for u, s in st.items() if s == "reserved"] == order[8:] or set(u for u, s in st.items() if s == "reserved") == set(order[8:])
    pr = _progress(adm)
    assert pr["phase"] == "interrupted" and pr["accepted"] == 7 and pr["uncertain"] == 1 and pr["queued"] == 4 and pr["can_resume"]

    # ── RETOMADA explícita: só os 4 nunca tentados; nenhum aceito nem incerto volta a receber
    r = adm.client.post(f"/v1/admin/broadcast/{bid}/resume", json={"confirm_count": 4})
    assert r.status_code == 200 and r.json()["resuming"] == 4
    prov.mode.clear()
    bs.run_broadcast(bid)
    resent = [u for u in prov.calls[len(sent_before):]]
    assert sorted(resent) == sorted(order[8:])                                # só os 4 que nunca tinham sido tentados
    assert not (set(resent) & (accepted_before | {order[7]}))                 # NENHUM aceito nem incerto foi reenviado
    assert max(prov.calls.count(u) for u in order) == 1                       # cada pessoa recebeu no máximo UMA vez
    pr = _progress(adm)
    print(f"\nDEMONSTRAÇÃO: aceitos={pr['accepted']} incertos={pr['uncertain']} fila={pr['queued']} fase={pr['phase']} | chamadas ao provedor por pessoa: máx {max(prov.calls.count(u) for u in order)}")
    assert pr["accepted"] == 11 and pr["uncertain"] == 1 and pr["phase"] == "done"


def test_queda_antes_da_chamada_ao_provedor_vira_incerto_e_nao_e_reenviado(adm, prov, clock, monkeypatch):
    _users(2)
    bid = _create(adm, 3)
    monkeypatch.setattr(bs, "_call_provider", lambda uid, payload: (_ for _ in ()).throw(Crash()))   # morre antes de falar com o provedor
    _run_until_crash(bid)
    assert prov.calls == []                                                   # o provedor nem foi chamado
    assert list(_states(bid).values()).count("sending") == 1
    clock.t = NOON_UTC + timedelta(minutes=6)
    bs.recover_stale()
    monkeypatch.undo()
    st = _states(bid)
    assert sorted(st.values()) == ["reserved", "reserved", "uncertain"]       # não sabemos: incerto (nem entregue, nem reenviado sozinho)
    assert _progress(adm)["accepted"] == 0 and _progress(adm)["uncertain"] == 1


def test_recuperacao_nunca_chama_o_provedor_e_partida_tambem(adm, prov, clock):
    _users(3)
    bid = _create(adm, 4)
    first = _order(bid)[0]
    prov.mode[first] = "die_after"
    _run_until_crash(bid)
    n = len(prov.calls)
    clock.t = NOON_UTC + timedelta(minutes=9)
    br._recover_broadcasts_on_startup()                                       # gancho da partida
    assert len(prov.calls) == n and _progress(adm)["phase"] == "interrupted"


def test_barra_nao_fica_presa_em_enviando_e_novo_envio_so_depois_de_resolver(adm, prov, clock):
    _users(2)
    bid = _create(adm, 3)
    prov.mode[_order(bid)[0]] = "die_after"
    _run_until_crash(bid)
    assert _progress(adm)["phase"] == "sending"                               # sinal de vida recente: ainda parece em andamento
    clock.t = NOON_UTC + timedelta(minutes=6)
    assert _progress(adm)["phase"] == "interrupted"                           # sem sinal de vida: a barra para de dizer "enviando"
    body = _body(goal="atalho", segment="todos")
    assert adm.client.post("/v1/admin/broadcast/send", json={**body, "confirm_count": 1}).status_code == 409   # há envio aberto
    c = _counts(bid)
    assert adm.client.post(f"/v1/admin/broadcast/{bid}/release", json={"confirm_count": c["reserved"]}).status_code == 200
    assert _progress(adm)["phase"] == "done" and _progress(adm)["released"] == c["reserved"]


def test_continuar_exige_a_contagem_certa_e_nao_roda_enquanto_executa(adm, prov, clock):
    _users(2)
    bid = _create(adm, 3)
    first = _order(bid)[0]
    prov.mode[first] = "die_after"
    _run_until_crash(bid)
    assert adm.client.post(f"/v1/admin/broadcast/{bid}/resume", json={"confirm_count": 2}).status_code == 409     # ainda "enviando" (vivo)
    clock.t = NOON_UTC + timedelta(minutes=6)
    bad = adm.client.post(f"/v1/admin/broadcast/{bid}/resume", json={"confirm_count": 99})
    assert bad.status_code == 409 and bad.json()["detail"]["code"] == "count_changed"
    assert adm.client.post(f"/v1/admin/broadcast/{bid}/resume", json={"confirm_count": 2}).status_code == 200


# ══ 4. DUAS EXECUÇÕES SIMULTÂNEAS ═════════════════════════════════════════════════════════

def test_duas_execucoes_simultaneas_nunca_enviam_duas_vezes_a_mesma_pessoa(adm, prov, clock):
    _users(15)
    bid = _create(adm, 16)
    prov.mode.update({u: (lambda: (_sleep(0.01), 1)[1]) for u in _states(bid)})
    barrier = threading.Barrier(2)

    def worker():
        barrier.wait()
        bs._run(SessionLocal, bid)                                            # contorna o registro em processo: prova o claim por linha
    ts = [threading.Thread(target=worker) for _ in range(2)]
    [t.start() for t in ts]; [t.join() for t in ts]
    assert len(prov.calls) == 16 and len(set(prov.calls)) == 16               # cada pessoa UMA vez, mesmo com duas execuções
    assert set(_states(bid).values()) == {"accepted"}


def test_segundo_run_no_mesmo_processo_e_ignorado(adm, prov, clock):
    _users(1)
    bid = _create(adm, 2)
    with bs._RUN_LOCK:
        bs._RUNNING.add(bid)
    bs.run_broadcast(bid)
    with bs._RUN_LOCK:
        bs._RUNNING.discard(bid)
    assert prov.calls == []


def test_duas_criacoes_ao_mesmo_tempo_geram_um_unico_envio(adm, prov, clock):
    _users(3)
    body = _body(goal="atalho", segment="todos")
    pv = adm.client.post("/v1/admin/broadcast/preview", json=body).json()
    res = []
    barrier = threading.Barrier(2)

    def go():
        barrier.wait()
        res.append(adm.client.post("/v1/admin/broadcast/send", json={**body, "confirm_count": pv["will_send"]}).status_code)
    ts = [threading.Thread(target=go) for _ in range(2)]
    [t.start() for t in ts]; [t.join() for t in ts]
    assert sorted(res) == [200, 409]
    with SessionLocal() as db:
        assert db.query(B).filter(B.goal == "atalho").count() == 1


# ══ 5. REENVIO MANUAL × RETRY AUTOMÁTICO ═════════════════════════════════════════════════

def test_reenvio_manual_exige_confirmacao_explicita_e_e_um_envio_novo(adm, prov, clock):
    _users(3)
    first = _create(adm, 4)
    bs.run_broadcast(first)
    assert set(_states(first).values()) == {"accepted"}
    n = len(prov.calls)
    body = _body(goal="atalho", segment="todos")
    assert adm.client.post("/v1/admin/broadcast/preview", json=body).json()["will_send"] == 0              # padrão: ninguém repete
    pv = adm.client.post("/v1/admin/broadcast/preview", json={**body, "include_already": True}).json()
    assert pv["will_send"] == 4 and pv["resend"] is True and pv["already_breakdown"]["accepted"] == 4
    sem = adm.client.post("/v1/admin/broadcast/send", json={**body, "include_already": True, "confirm_count": 4})
    assert sem.status_code == 409 and sem.json()["detail"]["code"] == "resend_not_confirmed"               # sem confirmação: recusado
    assert len(prov.calls) == n
    ok = adm.client.post("/v1/admin/broadcast/send", json={**body, "include_already": True, "resend_confirmed": True, "confirm_count": 4})
    assert ok.status_code == 200 and ok.json()["resend"] is True
    second = ok.json()["id"]
    assert second != first and set(_states(second).values()) == {"reserved"}
    bs.run_broadcast(second)
    assert len(prov.calls) == n + 4
    with SessionLocal() as db:
        assert db.get(B, second).is_resend is True and not db.get(B, first).is_resend
    assert set(_states(first).values()) == {"accepted"}                                                     # o envio original não foi tocado


def test_retry_automatico_indevido_nao_reenvia_ninguem(adm, prov, clock):
    _users(3)
    bid = _create(adm, 4)
    bs.run_broadcast(bid)
    n = len(prov.calls)
    bs.run_broadcast(bid)                                                                                   # "retry" cego da mesma execução
    bs._run(SessionLocal, bid)
    assert len(prov.calls) == n                                                                             # nada reservado = nada enviado
    clock.t = NOON_UTC + timedelta(hours=1)
    r = adm.client.post(f"/v1/admin/broadcast/{bid}/resume", json={"confirm_count": 4})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "nothing_to_resume"
    assert adm.client.post("/v1/admin/broadcast/send", json={**_body(goal="atalho", segment="todos"), "confirm_count": 1}).status_code in (409, 422)
    assert len(prov.calls) == n


def test_incerto_e_em_curso_ficam_de_fora_do_novo_envio_e_so_entram_no_reenvio(adm, prov, clock):
    _users(2)
    bid = _create(adm, 3)
    first = next(iter(_states(bid)))
    prov.mode[first] = "boom"                                                                               # erro do provedor = incerto
    bs.run_broadcast(bid)
    st = _states(bid)
    assert st[first] == "uncertain" and list(st.values()).count("accepted") == 2
    body = _body(goal="atalho", segment="todos")
    pv = adm.client.post("/v1/admin/broadcast/preview", json=body).json()
    assert pv["will_send"] == 0 and pv["already_received"] == 3                                             # o incerto NÃO é reenviado por padrão
    assert pv["already_breakdown"] == {"accepted": 2, "uncertain": 1, "in_progress": 0}
    rs = adm.client.post("/v1/admin/broadcast/preview", json={**body, "include_already": True}).json()
    assert rs["will_send"] == 3                                                                             # só o reenvio manual o inclui


# ══ 6. HORÁRIO DE SILÊNCIO ═══════════════════════════════════════════════════════════════

@pytest.mark.parametrize("hour_utc,minute,tz,expected", [
    (2, 0, "America/Sao_Paulo", False),      # 23:00 em Brasília
    (10, 59, "America/Sao_Paulo", False),    # 07:59
    (11, 0, "America/Sao_Paulo", True),      # 08:00 abre
    (0, 59, "America/Sao_Paulo", True),      # 21:59 ainda pode
    (1, 0, "America/Sao_Paulo", False),      # 22:00 fecha
    (12, 0, "America/Manaus", True),         # 08:00 em Manaus (UTC−4)
    (11, 0, "America/Manaus", False),        # 07:00 em Manaus enquanto já são 08:00 em Brasília: fuso local manda
    (13, 0, "America/Rio_Branco", True),     # 08:00 no Acre (UTC−5)
    (7, 0, "America/New_York", False),       # 02:00 em Nova York (EST)
    (15, 0, "America/New_York", True),       # 10:00
])
def test_janela_por_fuso_conhecido(hour_utc, minute, tz, expected):
    ok, nxt = bs.window_status(datetime(2026, 11, 21, hour_utc, minute, tzinfo=timezone.utc), tz)
    assert ok is expected and (nxt is None) == expected
    if not expected:
        assert nxt > datetime(2026, 11, 21, hour_utc, minute, tzinfo=timezone.utc) and nxt.astimezone(bs.valid_tz(tz)).hour == 8


@pytest.mark.parametrize("hour_utc,expected", [(12, False), (13, True), (23, True), (0, False), (3, False)])
def test_fuso_desconhecido_usa_a_janela_conservadora_valida_em_todo_o_brasil(hour_utc, expected):
    ok, nxt = bs.window_status(datetime(2026, 11, 21, hour_utc, 30, tzinfo=timezone.utc), None)
    assert ok is expected
    if expected:                                                      # dentro da janela: é dia em TODOS os fusos do Brasil (UTC−5…UTC−2)
        for off in (-5, -4, -3, -2):
            assert 8 <= (hour_utc + off) % 24 < 22
    else:
        assert nxt.hour == 13
    assert bs.window_status(datetime(2026, 11, 21, 1, 0, tzinfo=timezone.utc), "unknown")[0] is False          # "unknown" do app = desconhecido


def test_pendentes_por_silencio_nao_sao_descartados_e_so_saem_com_confirmacao(adm, prov, clock):
    ids = _users(3)
    with SessionLocal() as db:
        for uid, tz in zip(ids, ("America/Sao_Paulo", "America/Manaus", "America/Sao_Paulo")):
            db.add(AnalyticsProductEvent(event_id=uuid.uuid4().hex, event_name="app_open", user_id=uid, timezone=tz, received_at=NOON_UTC))
        db.commit()
    clock.t = datetime(2026, 11, 22, 1, 30, tzinfo=timezone.utc)              # 22:30 Brasília, 21:30 Manaus
    body = _body(goal="atalho", segment="todos")
    pv = adm.client.post("/v1/admin/broadcast/preview", json=body).json()
    q = pv["quiet"]
    assert pv["will_send"] == 4 and q["send_now"] == 1 and q["pending"] == 3 and q["unknown_tz"] == 1       # admin = fuso desconhecido
    assert q["next_open"] and "22h" in q["rule"]
    bid = adm.client.post("/v1/admin/broadcast/send", json={**body, "confirm_count": 4}).json()["id"]
    bs.run_broadcast(bid)
    st = _states(bid)
    assert sorted(st.values()) == ["accepted", "pending_quiet", "pending_quiet", "pending_quiet"] or sorted(st.values()) == ["accepted", "pending_quiet", "pending_quiet", "pending_quiet"]
    assert len(prov.calls) == 1                                               # só Manaus (21h30 local) recebeu agora
    pr = _progress(adm)
    assert pr["phase"] == "waiting" and pr["quiet_pending"] == 3 and pr["quiet_next_open"] and pr["total"] == 4   # NADA foi descartado
    assert adm.client.post(f"/v1/admin/broadcast/{bid}/resume", json={"confirm_count": 3}).status_code == 422      # janela ainda fechada
    clock.t = datetime(2026, 11, 22, 11, 30, tzinfo=timezone.utc)             # 08:30 Brasília
    assert _progress(adm)["quiet_due_now"] >= 2 and _progress(adm)["can_resume"]
    n_due = _progress(adm)["quiet_due_now"]
    assert adm.client.post(f"/v1/admin/broadcast/{bid}/resume", json={"confirm_count": 99}).status_code == 409    # contagem digitada
    assert adm.client.post(f"/v1/admin/broadcast/{bid}/resume", json={"confirm_count": n_due}).status_code == 200
    bs.run_broadcast(bid)
    assert _progress(adm)["accepted"] == 1 + n_due


def test_teste_so_eu_nao_segue_a_janela_de_silencio(adm, prov, clock):
    clock.t = datetime(2026, 11, 22, 5, 0, tzinfo=timezone.utc)               # 02:00 em Brasília
    body = _body(goal="atalho", segment="todos", audience={"kind": "test"})
    assert adm.client.post("/v1/admin/broadcast/preview", json=body).json().get("quiet") is None
    bid = adm.client.post("/v1/admin/broadcast/send", json={**body, "confirm_count": 1}).json()["id"]
    bs.run_broadcast(bid)
    assert list(_states(bid).values()) == ["accepted"]


def test_teste_so_eu_nao_e_barrado_por_envio_parado_ou_aguardando_mas_e_por_envio_em_andamento(adm, prov, clock):
    _users(2)
    bid = _create(adm, 3)
    test = _body(goal="atalho", segment="todos", audience={"kind": "test"})
    assert adm.client.post("/v1/admin/broadcast/send", json={**test, "confirm_count": 1}).status_code == 409       # envio em andamento barra tudo
    prov.mode[_order(bid)[0]] = "die_after"
    _run_until_crash(bid)
    clock.t = NOON_UTC + timedelta(minutes=6)
    assert _progress(adm)["phase"] == "interrupted"
    assert adm.client.post("/v1/admin/broadcast/send", json={**test, "confirm_count": 1}).status_code == 200      # interrompido: o teste passa
    assert adm.client.post("/v1/admin/broadcast/send", json={**_body(goal="atalho", segment="todos"), "confirm_count": 1}).status_code == 409   # novo envio REAL segue barrado


def test_metas_nao_protegidas_nao_sofrem_janela_nem_exclusao(adm, prov, clock):
    _users(2)
    clock.t = datetime(2026, 11, 22, 5, 0, tzinfo=timezone.utc)
    body = _body(goal="racao", segment="todos")
    assert "quiet" not in adm.client.post("/v1/admin/broadcast/preview", json=body).json()
    bid = adm.client.post("/v1/admin/broadcast/send", json={**body, "confirm_count": 3}).json()["id"]
    bs.run_broadcast(bid)
    assert set(_states(bid).values()) == {"accepted"}


# ══ 7. FALHAS E TIMEOUTS DO PROVEDOR ═════════════════════════════════════════════════════

def test_falha_definitiva_excecao_e_timeout_do_provedor(adm, prov, clock, monkeypatch):
    ids = _users(3)
    bid = _create(adm, 4)
    monkeypatch.setattr(bs, "PROVIDER_TIMEOUT_SECONDS", 0.05)
    prov.mode[ids[0]] = "reject"                                              # nenhum aparelho aceitou = falha definitiva
    prov.mode[ids[1]] = "boom"                                                # exceção = incerto
    prov.mode[ids[2]] = lambda: (_sleep(0.3), 1)[1]                           # timeout = incerto (nem aceito, nem falho)
    bs.run_broadcast(bid)
    st = _states(bid)
    assert st[ids[0]] == "failed" and st[ids[1]] == "uncertain" and st[ids[2]] == "uncertain"
    pr = _progress(adm)
    assert (pr["accepted"], pr["failed"], pr["uncertain"]) == (1, 1, 2) and pr["processed"] == 4 and pr["phase"] == "done"
    with SessionLocal() as db:
        details = {str(r.user_id): r.detail for r in db.query(R).filter(R.broadcast_id == bid).all()}
        assert "RuntimeError" in details[ids[1]] and "sem resposta" in details[ids[2]]
        assert db.query(R).filter(R.broadcast_id == bid, R.delivered.is_(True)).count() == 1                # incerto NUNCA conta como entregue
    n = len(prov.calls)
    bs.run_broadcast(bid)
    assert len(prov.calls) == n                                               # falho/incerto não voltam a ser tentados


# ══ 8. CONSISTÊNCIA DA BARRA ═════════════════════════════════════════════════════════════

def test_barra_sempre_soma_o_total_e_bate_com_o_banco(adm, prov, clock):
    ids = _users(9)
    bid = _create(adm, 10)
    prov.mode[_order(bid)[0]] = "reject"; prov.mode[_order(bid)[1]] = "boom"
    prov.mode[_order(bid)[3]] = "die_after"
    _run_until_crash(bid)
    for moment in (0, 6):
        clock.t = NOON_UTC + timedelta(minutes=moment)
        p = _progress(adm)
        assert p["total"] == p["processed"] + p["queued"] + p["in_flight"] + p["quiet_pending"] + p["released"] == 10
        assert p["processed"] == p["accepted"] + p["failed"] + p["uncertain"]
        with SessionLocal() as db:
            assert p["accepted"] == db.query(R).filter(R.broadcast_id == bid, R.delivered.is_(True)).count()
            assert p["accepted"] == (db.get(B, bid).delivered_total if p["phase"] != "sending" else p["accepted"])
    assert p["phase"] == "interrupted" and p["in_flight"] == 0


def test_envio_antigo_sem_estado_ainda_aparece_e_nao_fica_preso(adm, clock):
    with SessionLocal() as db:
        u = _mk_user(db, "Antigo")
        b = B(created_by=adm.admin_id, message="x", segment="todos", audience_kind="all", goal="atalho", recipients_total=5, delivered_total=0,
              phase="sending", created_at=NOON_UTC - timedelta(hours=2))
        db.add(b); db.flush()
        db.add(R(broadcast_id=b.id, user_id=u, delivered=True)); db.commit()
    p = _progress(adm)
    assert p["legacy"] and p["phase"] == "interrupted" and p["accepted"] == 1 and p["total"] == 5


# ══ 9. PUSH × E-MAIL SEPARADOS; SEM LIMITE SEMANAL ═══════════════════════════════════════

def test_push_nao_grava_nem_le_contato_de_email_e_nao_tem_limite_semanal(adm, prov, clock):
    ids = _users(2)
    with SessionLocal() as db:
        for uid in ids:                                                       # os dois "receberam" o e-mail Gratuito agora mesmo
            db.add(ActivationCampaignContact(campaign="ec_gratuito", user_id=uid, sent_at=NOON_UTC))
        db.commit()
        before = db.query(ActivationCampaignContact).count()
    bid = _create(adm, 3)                                                     # NÃO há limite de 7 dias: e-mail recente não barra o push
    bs.run_broadcast(bid)
    assert set(_states(bid).values()) == {"accepted"}
    with SessionLocal() as db:
        assert db.query(ActivationCampaignContact).count() == before          # o push não escreve no registro do e-mail


def test_envio_de_email_nao_toca_o_livro_do_push_nem_segue_a_janela(client, adm, monkeypatch, clock):
    import src.admin.email_campaigns as ec
    import src.mailer as mailer
    sent = []
    monkeypatch.setattr(mailer, "send_mail", lambda **kw: sent.append(kw) or True)
    monkeypatch.setattr(ec, "PAUSE_SECONDS", 0)
    monkeypatch.setattr(ec.threading, "Thread", lambda target, args, daemon: SimpleNamespace(start=lambda: target(*args)))
    clock.t = datetime(2026, 11, 22, 5, 0, tzinfo=timezone.utc)               # 02:00 Brasília: silêncio do PUSH
    with SessionLocal() as db:
        _mk_user(db, "Sem notificacao", push=False)
        n_before = db.query(R).count()
    g = client.get("/v1/admin/gratuito/summary").json()["email"]
    body = {"segment": "gratuito_dia0", "audience": {"kind": "all"}}
    pv = client.post(f"/v1/admin/email-campaigns/{g['campaign_id']}/preview", json=body).json()
    assert pv["will_send"] >= 1
    r = client.post(f"/v1/admin/email-campaigns/{g['campaign_id']}/send", json={**body, "confirm_count": pv["will_send"]})
    assert r.status_code == 200 and len(sent) == pv["will_send"]              # e-mail às 2h: a janela é só do push
    with SessionLocal() as db:
        assert db.query(R).count() == n_before                                # nenhuma linha do livro do push foi criada
    assert "broadcast_safe" not in open(ec.__file__, encoding="utf-8").read()  # módulos independentes
