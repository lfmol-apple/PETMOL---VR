"""Campanhas push — ETAPA 1 (estrutura). Nada aqui envia push nem reserva destinatário: testa as tabelas e restrições, a flag, a
estrutura dos filtros, o conteúdo fixo, a exclusão de conta e a compatibilidade com o envio avulso atual."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

import src.admin.broadcast_router as br
import src.admin.push_campaigns as pc
from src.admin.deps import get_current_admin
from src.db import Base, SessionLocal
from src.user_auth.models import User
from tests.test_admin_broadcast import _mk_pet, _mk_user, adm  # noqa: F401  (fixture reaproveitada)


def _campaign(db, name="Camp A", **kw):
    data = dict(name=name, message="Oferta de ração", destination="produto", product_url="https://amzn.to/x", product_title="KONG",
                title="{tutor}, olha", goal="link_produto")
    data.update(kw)
    c = pc.PushCampaign(content_hash=pc.compute_content_hash(data["title"], data["message"], data["destination"], data["goal"],
                                                             data["product_url"], data["product_title"]), **data)
    db.add(c)
    db.commit()
    return c


@pytest.fixture()
def clean():
    with SessionLocal() as db:
        db.query(pc.PushCampaignRecipient).delete()
        db.query(pc.PushCampaign).delete()
        db.commit()
    yield


# ── tabelas e restrições ─────────────────────────────────────────────────────

def test_tabelas_e_colunas_existem():
    insp = inspect(SessionLocal().get_bind())
    assert {"push_campaign", "push_campaign_recipient"} <= set(insp.get_table_names())
    cols = {c["name"] for c in insp.get_columns("push_campaign_recipient")}
    assert {"campaign_id", "user_id", "batch_id", "state", "reserved_at", "attempted_at", "finished_at", "accepted_devices", "error_code"} <= cols
    bcols = {c["name"] for c in insp.get_columns("admin_broadcasts")}
    assert {"campaign_id", "batch_no", "idempotency_key", "filters_json", "filters_hash", "requested_n", "reserved_n",
            "link_url", "link_title"} <= bcols       # as colunas antigas continuam lá


def test_o_banco_recusa_o_mesmo_tutor_duas_vezes_na_mesma_campanha(clean):
    with SessionLocal() as db:
        c = _campaign(db)
        db.add(pc.PushCampaignRecipient(campaign_id=c.id, user_id="u1", batch_id="b1"))
        db.commit()
        db.add(pc.PushCampaignRecipient(campaign_id=c.id, user_id="u1", batch_id="b2"))      # outro lote, mesmo tutor
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        assert db.query(pc.PushCampaignRecipient).count() == 1


def test_campanhas_diferentes_podem_alcancar_o_mesmo_tutor(clean):
    with SessionLocal() as db:
        a, b = _campaign(db, "A"), _campaign(db, "B")
        db.add_all([pc.PushCampaignRecipient(campaign_id=a.id, user_id="u1", batch_id="b1"),
                    pc.PushCampaignRecipient(campaign_id=b.id, user_id="u1", batch_id="b2")])
        db.commit()
        assert db.query(pc.PushCampaignRecipient).count() == 2          # sem bloqueio global entre campanhas


def test_duas_sessoes_independentes_nao_duplicam(clean):
    """Dois 'processos' (sessões separadas) tentando reservar o mesmo tutor: só um entra, o outro é recusado pelo banco."""
    with SessionLocal() as db1, SessionLocal() as db2:
        c = _campaign(db1)
        db1.add(pc.PushCampaignRecipient(campaign_id=c.id, user_id="u9", batch_id="b1"))
        db1.commit()
        db2.add(pc.PushCampaignRecipient(campaign_id=c.id, user_id="u9", batch_id="b2"))
        with pytest.raises(IntegrityError):
            db2.commit()
        db2.rollback()


def test_insert_on_conflict_do_nothing_devolve_so_quem_entrou(clean):
    """É o primitivo da reserva (etapa 3): só os realmente inseridos são devolvidos."""
    from sqlalchemy.dialects.sqlite import insert
    with SessionLocal() as db:
        c = _campaign(db)
        db.add(pc.PushCampaignRecipient(campaign_id=c.id, user_id="u1", batch_id="b1"))
        db.commit()
        rows = [dict(id=str(uuid.uuid4()), campaign_id=c.id, user_id=u, batch_id="b2", state="reserved") for u in ("u1", "u2", "u3")]
        stmt = insert(pc.PushCampaignRecipient).values(rows).on_conflict_do_nothing(index_elements=["campaign_id", "user_id"]) \
            .returning(pc.PushCampaignRecipient.user_id)
        got = {r[0] for r in db.execute(stmt).all()}
        db.commit()
        assert got == {"u2", "u3"}                                       # u1 já estava: não volta, logo não seria enviado


@pytest.mark.parametrize("estado", ["entregue", "delivered", "", "ACCEPTED", "pending"])
def test_estado_invalido_do_destinatario_e_recusado(clean, estado):
    with SessionLocal() as db:
        c = _campaign(db)
        db.add(pc.PushCampaignRecipient(campaign_id=c.id, user_id="u1", batch_id="b1", state=estado))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_nao_existe_estado_entregue():
    assert "delivered" not in pc.RECIPIENT_STATES and "entregue" not in pc.RECIPIENT_STATES
    assert set(pc.RECIPIENT_STATES) == {"reserved", "sending", "accepted", "failed", "uncertain"}
    assert pc.RECIPIENT_STATE_LABELS["accepted"] == "Aceito pelo provedor"
    assert "uncertain" in pc.RECIPIENT_FINAL_STATES                       # incerto nunca volta a ser tentado sozinho


def test_status_invalido_da_campanha_e_recusado(clean):
    with SessionLocal() as db:
        db.add(pc.PushCampaign(name="x", message="m", content_hash="h", status="enviada"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_lotes_idempotencia_e_numero_do_lote_sao_unicos_mas_envio_avulso_nao_e_afetado(adm):
    with SessionLocal() as db:
        db.query(br.AdminBroadcastRecipient).delete()
        db.query(br.AdminBroadcast).delete()
        db.commit()
        # envios avulsos (sem campanha): vários, todos com as colunas novas nulas — não colidem entre si
        for _ in range(3):
            db.add(br.AdminBroadcast(message="avulso", audience_kind="test", recipients_total=1, phase="done"))
        db.commit()
        assert db.query(br.AdminBroadcast).count() == 3
        db.add(br.AdminBroadcast(message="lote", audience_kind="count", campaign_id="c1", batch_no=1, idempotency_key="k1"))
        db.commit()
        db.add(br.AdminBroadcast(message="lote repetido", audience_kind="count", campaign_id="c1", batch_no=2, idempotency_key="k1"))
        with pytest.raises(IntegrityError):
            db.commit()                                                   # mesma chave de idempotência
        db.rollback()
        db.add(br.AdminBroadcast(message="lote 1 de novo", audience_kind="count", campaign_id="c1", batch_no=1, idempotency_key="k2"))
        with pytest.raises(IntegrityError):
            db.commit()                                                   # mesmo número de lote na mesma campanha
        db.rollback()
        db.add(br.AdminBroadcast(message="outra campanha", audience_kind="count", campaign_id="c2", batch_no=1, idempotency_key="k3"))
        db.commit()


# ── compatibilidade com o envio avulso atual ─────────────────────────────────

def test_envio_avulso_continua_igual_e_nao_toca_nas_tabelas_novas(adm, clean):
    with SessionLocal() as db:
        _mk_pet(db, adm.admin_id, "Baby")
    body = {"message": "cadastre a ração de {pets}.", "segment": "todos", "audience": {"kind": "test"}}
    prev = adm.client.post("/v1/admin/broadcast/preview", json=body).json()
    assert prev["will_send"] >= 1 and "campaign" not in prev
    r = adm.client.post("/v1/admin/broadcast/send", json={**body, "confirm_count": prev["will_send"]})
    assert r.status_code == 200, r.text
    with SessionLocal() as db:
        row = db.query(br.AdminBroadcast).order_by(br.AdminBroadcast.created_at.desc()).first()
        assert (row.campaign_id, row.batch_no, row.idempotency_key, row.filters_json, row.requested_n, row.reserved_n) == (None,) * 6
        assert db.query(pc.PushCampaignRecipient).count() == 0 and db.query(pc.PushCampaign).count() == 0
    hist = adm.client.get("/v1/admin/broadcast/history").json()["items"]
    assert hist and hist[0]["phase"] == "done"
    assert "campaigns_enabled" not in adm.client.get("/v1/admin/broadcast/segments").json()       # resposta do envio avulso intacta


# ── flag ─────────────────────────────────────────────────────────────────────

def test_flag_desligada_por_padrao():
    from src.config import Settings
    assert Settings().push_campaigns_enabled is False


def test_dependencia_da_flag_devolve_404_quando_desligada_e_passa_quando_ligada(monkeypatch):
    monkeypatch.setattr(pc, "get_settings", lambda: SimpleNamespace(push_campaigns_enabled=False))
    with pytest.raises(HTTPException) as e:
        pc.require_push_campaigns()
    assert e.value.status_code == 404
    monkeypatch.setattr(pc, "get_settings", lambda: SimpleNamespace(push_campaigns_enabled=True))
    assert pc.require_push_campaigns() is None


def test_endpoint_de_config_informa_a_flag_e_exige_admin(adm, monkeypatch):
    monkeypatch.setattr(pc, "get_settings", lambda: SimpleNamespace(push_campaigns_enabled=False))
    assert adm.client.get("/v1/admin/push-campaigns/config").json() == {"enabled": False}
    monkeypatch.setattr(pc, "get_settings", lambda: SimpleNamespace(push_campaigns_enabled=True))
    assert adm.client.get("/v1/admin/push-campaigns/config").json() == {"enabled": True}
    assert adm.client.get("/api/v1/admin/push-campaigns/config").status_code == 200            # também com o prefixo /api
    adm.client.app.dependency_overrides.pop(get_current_admin, None)
    assert adm.client.get("/v1/admin/push-campaigns/config").status_code in (401, 403)


def test_so_existe_o_endpoint_de_config_nesta_etapa():
    rotas = {(r.path, tuple(sorted(r.methods))) for r in pc.router.routes}
    assert rotas == {("/v1/admin/push-campaigns/config", ("GET",))}


# ── conteúdo fixo ────────────────────────────────────────────────────────────

def test_hash_do_conteudo_e_estavel_e_muda_com_qualquer_campo_comercial():
    base = ("Título", "Mensagem", "produto", "link_produto", "https://amzn.to/x", "KONG")
    h = pc.compute_content_hash(*base)
    assert h == pc.compute_content_hash("  Título ", "Mensagem\n", "produto", "link_produto", "https://amzn.to/x ", "KONG")   # espaços não contam
    for i, novo in enumerate(("T2", "M2", "home", "abrir", "https://amzn.to/y", "OUTRO")):
        alt = list(base); alt[i] = novo
        assert pc.compute_content_hash(*alt) != h, f"campo {i} não entrou no hash"


def test_conteudo_fica_fixo_depois_do_primeiro_lote(clean):
    with SessionLocal() as db:
        c = _campaign(db)
        c.message = "ainda pode mudar antes do 1º lote"                    # sem lote: livre
        db.commit()
        c.content_locked_at = datetime.now(timezone.utc)
        db.commit()
        for campo, valor in (("message", "outra"), ("title", "outro"), ("product_url", "https://amzn.to/z"), ("destination", "home"),
                             ("goal", "abrir"), ("product_title", "Y"), ("content_hash", "0" * 64)):
            setattr(c, campo, valor)
            with pytest.raises(ValueError, match="fixo depois do primeiro lote"):
                db.commit()
            db.rollback()
            db.refresh(c)
        c.status = "closed"                                                  # estado da campanha pode mudar; conteúdo não
        c.closed_at = datetime.now(timezone.utc)
        c.name = "Nome interno pode mudar"
        db.commit()


# ── estrutura dos filtros ────────────────────────────────────────────────────

def _f(items, **kw):
    return pc.AudienceFilter(root=dict(kind="group", op=kw.pop("op", "and"), items=items, **kw))


def test_filtros_validos_combinados_e_ou():
    f = _f([
        {"kind": "rule", "field": "tutor_species_mix", "op": "in", "value": ["has_cat"]},
        {"kind": "rule", "field": "platform", "op": "in", "value": ["ios", "android"]},
        {"kind": "rule", "field": "tutor_activity", "op": "eq", "value": "last_7d"},
        {"kind": "group", "op": "or", "pet_scope": "same", "items": [
            {"kind": "rule", "field": "pet_species", "op": "in", "value": ["cat"]},
            {"kind": "rule", "field": "pet_sex", "op": "eq", "value": "female"},
            {"kind": "rule", "field": "pet_neutered_yes", "op": "eq", "value": True},
        ]},
    ])
    assert len(f.filters_hash()) == 64
    assert pc.AudienceFilter().root.items == []                              # sem filtro = todos (com push, sem opt-out)


@pytest.mark.parametrize("campo", ["tutor_sex", "tutor_age", "litter_brand", "pet_neutered_no", "feeding_days_remaining", "senha", ""])
def test_campos_inexistentes_ou_nao_confiaveis_sao_recusados(campo):
    with pytest.raises(ValueError, match="Filtro indisponível"):
        _f([{"kind": "rule", "field": campo, "op": "eq", "value": "x"}])


def test_castrado_so_aceita_o_afirmativo_e_atividade_so_as_tres_faixas():
    with pytest.raises(ValueError):
        _f([{"kind": "rule", "field": "pet_neutered_yes", "op": "eq", "value": False}], pet_scope="any")
    with pytest.raises(ValueError):
        _f([{"kind": "rule", "field": "tutor_activity", "op": "eq", "value": "last_90d"}])
    _f([{"kind": "rule", "field": "tutor_activity", "op": "eq", "value": "d8_30"}])


def test_grupo_com_regra_de_pet_exige_o_escopo_dos_pets():
    regra = {"kind": "rule", "field": "pet_species", "op": "in", "value": ["dog"]}
    with pytest.raises(ValueError, match="algum pet, todos os pets ou o mesmo pet"):
        _f([regra])
    for escopo in ("any", "all", "same"):
        _f([regra], pet_scope=escopo)
    with pytest.raises(ValueError):
        _f([regra], pet_scope="metade")


def test_localizacao_aproximada_exige_confirmar_que_nao_e_residencia():
    gps = {"kind": "rule", "field": "location_gps_radius", "op": "within_km", "value": {"lat": -19.92, "lng": -43.94, "km": 30}}
    with pytest.raises(ValueError, match="aproximado"):
        _f([gps])
    _f([{**gps, "approximate_ack": True}])
    ip = {"kind": "rule", "field": "location_geoip_region", "op": "in", "value": ["Minas Gerais"]}
    with pytest.raises(ValueError, match="aproximado"):
        _f([ip])
    _f([{**ip, "approximate_ack": True}])
    for ruim in ({"lat": 99, "lng": 0, "km": 10}, {"lat": 0, "lng": 0, "km": 0}, {"lat": 0, "lng": 0, "km": 900}, {"lat": 0}):
        with pytest.raises(ValueError):
            _f([{**gps, "value": ruim, "approximate_ack": True}])


def test_operacoes_e_valores_invalidos():
    for ruim in (
        {"field": "pet_sex", "op": "eq", "value": "outro"},
        {"field": "pet_sex", "op": "gte", "value": "male"},
        {"field": "pet_age_months", "op": "between", "value": [1]},
        {"field": "platform", "op": "in", "value": "ios"},
        {"field": "pet_breed_contains", "op": "contains", "value": "a"},
        {"field": "pet_breed_contains", "op": "contains", "value": "x" * 61},
        {"field": "platform", "op": "in", "value": ["windows"]},
    ):
        with pytest.raises(ValueError):
            _f([{"kind": "rule", **ruim}], pet_scope="any")


def test_limites_de_profundidade_e_quantidade():
    g = {"kind": "group", "op": "and", "items": []}
    for _ in range(pc.MAX_FILTER_DEPTH):
        g = {"kind": "group", "op": "and", "items": [g]}
    with pytest.raises(ValueError, match="aninhados"):
        pc.AudienceFilter(root=g)
    regras = [{"kind": "rule", "field": "tutor_pet_count", "op": "gte", "value": i} for i in range(pc.MAX_FILTER_RULES + 1)]
    with pytest.raises(ValueError, match="Filtros demais"):
        _f(regras)


def test_hash_dos_filtros_e_canonico_ordem_nao_importa_conteudo_importa():
    a = {"kind": "rule", "field": "platform", "op": "in", "value": ["ios"]}
    b = {"kind": "rule", "field": "tutor_activity", "op": "eq", "value": "last_7d"}
    assert _f([a, b]).filters_hash() == _f([b, a]).filters_hash()
    assert _f([a, b]).filters_hash() != _f([a, b], op="or").filters_hash()                 # E ≠ OU
    assert _f([a]).filters_hash() != _f([{**a, "value": ["android"]}]).filters_hash()
    assert pc.AudienceFilter().filters_hash() != _f([a]).filters_hash()


def test_so_campos_com_dado_real_estao_na_lista():
    proibidos = {"tutor_sex", "tutor_age", "feeding_days_remaining", "pet_neutered_no", "litter", "tutor_gender"}
    assert not (proibidos & set(pc.FILTER_FIELDS))
    assert all(spec.get("approximate") for k, spec in pc.FILTER_FIELDS.items() if k in ("location_gps_radius", "location_geoip_region"))


# ── exclusão de conta (LGPD) ─────────────────────────────────────────────────

def test_excluir_conta_apaga_as_linhas_de_destinatario_do_tutor(clean):
    from src.user_auth.purge import purge_user_data
    with SessionLocal() as db:
        uid = _mk_user(db, "Tutor Saindo")
        outro = _mk_user(db, "Outro")
        c = _campaign(db)
        db.add_all([pc.PushCampaignRecipient(campaign_id=c.id, user_id=uid, batch_id="b1"),
                    pc.PushCampaignRecipient(campaign_id=c.id, user_id=outro, batch_id="b1")])
        db.commit()
        purge_user_data(db, db.query(User).filter(User.id == uid).first())
        db.commit()
        restantes = {r.user_id for r in db.query(pc.PushCampaignRecipient).all()}
        assert restantes == {outro}


# ── migração (banco antigo → novo), idempotente ──────────────────────────────

def test_migracao_sqlite_leva_o_banco_antigo_ao_novo_e_e_idempotente(tmp_path):
    from src.migrations import run_sqlite_migrations
    eng = create_engine(f"sqlite:///{tmp_path/'antigo.db'}")
    Base.metadata.create_all(eng)
    with eng.begin() as c:                                                                  # recria admin_broadcasts como era em produção
        c.execute(text("DROP TABLE admin_broadcasts"))
        c.execute(text("""CREATE TABLE admin_broadcasts (id VARCHAR(36) PRIMARY KEY, created_at DATETIME, created_by VARCHAR(36),
            message TEXT NOT NULL, segment VARCHAR(20) NOT NULL, audience_kind VARCHAR(10) NOT NULL, audience_requested INTEGER,
            goal VARCHAR(20), recipients_total INTEGER NOT NULL, delivered_total INTEGER NOT NULL, phase VARCHAR(12) NOT NULL,
            finished_at DATETIME, link_url TEXT, link_title TEXT)"""))
        c.execute(text("INSERT INTO admin_broadcasts (id, message, segment, audience_kind, recipients_total, delivered_total, phase) "
                       "VALUES ('old1','antigo','todos','all',10,9,'done')"))
    for _ in range(2):                                                                      # 2ª rodada = idempotente
        run_sqlite_migrations(eng)
    insp = inspect(eng)
    cols = {c["name"] for c in insp.get_columns("admin_broadcasts")}
    assert {"campaign_id", "batch_no", "idempotency_key", "filters_json", "filters_hash", "requested_n", "reserved_n"} <= cols
    idx = {i["name"] for i in insp.get_indexes("admin_broadcasts")}
    assert {"uq_admin_broadcasts_idempotency_key", "uq_admin_broadcasts_campaign_batch", "ix_admin_broadcasts_campaign_id"} <= idx
    with eng.connect() as c:                                                                # o dado antigo continua intacto
        row = c.execute(text("SELECT message, delivered_total, campaign_id, idempotency_key FROM admin_broadcasts WHERE id='old1'")).one()
        assert tuple(row) == ("antigo", 9, None, None)
    eng.dispose()
