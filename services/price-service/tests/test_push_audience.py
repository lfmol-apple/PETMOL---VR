"""Campanhas push — ETAPA 2: motor de segmentação e contagem (SOMENTE LEITURA).

1) Teste DIFERENCIAL: o motor (conjuntos) contra um avaliador de referência independente (tutor por tutor), em 300 filtros aleatórios.
2) Casos nomeados: vários pets, escopos any/all/same, nulos, push, opt-out, GPS, acentos, E/OU, atividade, campanha, avisos.
3) Provas de que a contagem NÃO escreve, de que a flag desligada dá 404 e de que só administradores acessam.
4) Desempenho com a escala atual (≈2.500 tutores)."""
import random
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import event

import src.admin.push_audience as pa
import src.admin.push_campaigns as pc
from src.admin.activation_campaign_router import ActivationOptOut
from src.admin.deps import get_current_admin
from src.analytics.models import AnalyticsProductEvent
from src.db import SessionLocal, engine
from src.events.models import Event
from src.health.models import FeedingPlan
from src.notifications import NativePushToken, PushSubscription
from src.pets.grooming_models import GroomingRecord
from src.pets.models import Pet
from src.pets.parasite_models import ParasiteControlRecord
from src.pets.vaccine_models import VaccineRecord
from src.user_auth.models import User
from tests import push_audience_reference as ref

NOW = ref.NOW


# ── dados ────────────────────────────────────────────────────────────────────

_TABLES = (pc.PushCampaignRecipient, pc.PushCampaign, ActivationOptOut, PushSubscription, NativePushToken, VaccineRecord,
           ParasiteControlRecord, GroomingRecord, FeedingPlan, Event, AnalyticsProductEvent, Pet, User)


def _wipe(db):
    for m in _TABLES:
        db.query(m).delete()
    db.commit()


@pytest.fixture()
def db():
    with SessionLocal() as s:
        _wipe(s)
        yield s
        s.rollback()
        _wipe(s)


class World:
    """Monta um cenário pequeno e nomeado direto no banco."""
    def __init__(self, db):
        self.db = db

    def user(self, name="T", *, web=False, ios=False, android=False, disabled=(), optout=False, created=None, city=None, state=None,
             lat=None, lng=None, source=None):
        uid = str(uuid.uuid4())
        self.db.add(User(id=uid, email=f"{uid[:8]}@t.example", name=name, password_hash="x", created_at=created or NOW - timedelta(days=5),
                         city=city, state=state, lat=lat, lng=lng, location_source=source))
        self.db.flush()
        for plat, on in (("web", web), ("ios", ios), ("android", android)):
            if not on:
                continue
            off = NOW if plat in disabled else None
            if plat == "web":
                self.db.add(PushSubscription(id=str(uuid.uuid4()), user_id=uid, endpoint=f"https://p/{uid}", p256dh="k", auth="a", disabled_at=off))
            else:
                self.db.add(NativePushToken(id=str(uuid.uuid4()), user_id=uid, platform=plat, token=f"tok-{uid}-{plat}", disabled_at=off))
        if optout:
            self.db.add(ActivationOptOut(user_id=uid))
        self.db.flush()
        return uid

    def pet(self, uid, species="dog", **kw):
        pid = str(uuid.uuid4())
        self.db.add(Pet(id=pid, user_id=uid, name=kw.pop("name", "Pet"), species=species, **kw))
        self.db.flush()
        return pid

    def plan(self, pid, brand=None, deleted=False, **kw):
        self.db.add(FeedingPlan(pet_id=pid, species="dog", country_code="BR", food_brand=brand, deleted_at=NOW if deleted else None, **kw))
        self.db.flush()

    def vaccine(self, pid, deleted=False):
        self.db.add(VaccineRecord(pet_id=pid, vaccine_name="V10", applied_date=NOW, next_dose_date=NOW, deleted_at=NOW if deleted else None))
        self.db.flush()

    def evt(self, uid, ago, region=None, city=None):
        self.db.add(AnalyticsProductEvent(event_id=str(uuid.uuid4()), event_name="screen_view", user_id=uid, received_at=NOW - ago, region=region, city=city))
        self.db.flush()


def R(field, op, value, ack=False):
    r = {"kind": "rule", "field": field, "op": op, "value": value}
    if ack:
        r["approximate_ack"] = True
    return r


def G(*items, op="and", scope=None):
    g = {"kind": "group", "op": op, "items": list(items)}
    if scope:
        g["pet_scope"] = scope
    return g


def F(*items, op="and", scope=None):
    return pc.AudienceFilter.model_validate({"version": 1, "root": G(*items, op=op, scope=scope)})


def run(db, flt, **kw):
    return pa.compute_audience(db, flt, now=NOW, **kw)


def ids_of(db, flt):
    r = pa.resolve_audience(db, flt, now=NOW)
    return r.matches, r.reachable


# ══ 1) TESTE DIFERENCIAL ═════════════════════════════════════════════════════

def _seed_synthetic(db, users):
    for u in users:
        db.add(User(id=u["id"], email=f"{u['id'][:8]}@t.example", name="Sintético", password_hash="x", created_at=u["created_at"], city=u["city"],
                    state=u["state"], lat=u["lat"], lng=u["lng"], location_source=u["loc_source"]))
    db.flush()
    for u in users:
        if u["web"]:
            db.add(PushSubscription(id=str(uuid.uuid4()), user_id=u["id"], endpoint=f"https://p/{u['id']}", p256dh="k", auth="a",
                                    disabled_at=NOW if u["web_disabled"] else None))
        for plat in ("ios", "android"):          # aparelho marcado; alguns desativados (token inválido) para provar que não contam
            if u[plat]:
                db.add(NativePushToken(id=str(uuid.uuid4()), user_id=u["id"], platform=plat, token=f"t-{u['id']}-{plat}",
                                       disabled_at=NOW if u[plat + "_disabled"] else None))
        if u["opted_out"]:
            db.add(ActivationOptOut(user_id=u["id"]))
        if u["medication"]:
            pet0 = u["pets"][0]["id"] if u["pets"] else str(uuid.uuid4())
            db.add(Event(user_id=u["id"], pet_id=pet0, type="medication", title="m", scheduled_at=NOW))
        for t in u["events"]:
            if t not in [rt for rt, _ in u["regions"]]:
                db.add(AnalyticsProductEvent(event_id=str(uuid.uuid4()), event_name="screen_view", user_id=u["id"], received_at=t))
        rc = dict(u["rcities"])
        for t, r in u["regions"]:
            db.add(AnalyticsProductEvent(event_id=str(uuid.uuid4()), event_name="screen_view", user_id=u["id"], received_at=t, region=r, city=rc.get(t)))
        for p in u["pets"]:
            db.add(Pet(id=p["id"], user_id=u["id"], name="P", species=p["species"], sex=p["sex"], breed=p["breed"], birth_date=p["birth"],
                       weight_value=p["weight"], weight_unit=p["unit"], neutered=p["neutered"]))
    db.flush()
    for u in users:
        for p in u["pets"]:
            pl = p["plan"]
            if pl:
                db.add(FeedingPlan(pet_id=p["id"], species="dog", country_code="BR", food_brand=pl["brand"], items_json=pl["items_json"],
                                   duration_days=pl["duration"], estimated_end_date=pl["end"], mode=pl["mode"] or "kibble",
                                   no_consumption_control=pl["no_ctrl"], deleted_at=NOW if pl["deleted"] else None))
            for dele in p["vaccines"]:
                db.add(VaccineRecord(pet_id=p["id"], vaccine_name="V", applied_date=NOW, next_dose_date=NOW, deleted_at=NOW if dele else None))
            for _ in range(p["parasites"]):
                db.add(ParasiteControlRecord(pet_id=p["id"], type="dewormer", product_name="x", date_applied=NOW))
            for _ in range(p["groomings"]):
                db.add(GroomingRecord(pet_id=p["id"], type="bath", date=NOW))
    db.commit()


def test_diferencial_300_filtros_aleatorios_motor_igual_ao_avaliador_de_referencia(db):
    rng = random.Random(20261112)
    users = ref.make_users(rng, 120)
    _seed_synthetic(db, users)
    assert sum(1 for u in users if ref.reachable(u)) > 20              # o cenário tem público de verdade

    nao_vazios = 0
    for i in range(300):
        raw = ref.gen_filter(rng)
        flt = pc.AudienceFilter.model_validate(raw)                     # o gerador só produz filtros válidos
        exp_matches, exp_reachable = ref.evaluate(users, raw)
        got = pa.resolve_audience(db, flt, now=NOW)
        assert got.matches == exp_matches, f"filtro #{i} diverge em 'matches': {raw}"
        assert got.reachable == exp_reachable, f"filtro #{i} diverge em 'reachable': {raw}"
        out = pa.compute_audience(db, flt, now=NOW)
        assert out["matches"] == len(exp_matches) and out["reachable"] == len(exp_reachable)
        nao_vazios += bool(exp_reachable)
    assert nao_vazios > 60                                              # o teste não é trivial (muitos filtros devolvem gente)


def test_diferencial_cobre_todos_os_campos_disponiveis():
    assert set(ref.ALL_FIELDS) == set(pc.FILTER_FIELDS)


# ══ 2) CASOS NOMEADOS ════════════════════════════════════════════════════════

def test_tutor_com_cinco_pets_aparece_uma_vez_e_com_varios_aparelhos(db):
    w = World(db)
    t = w.user("Cinco", web=True, ios=True, android=True)
    for _ in range(5):
        w.pet(t, "dog")
    w.user("Sem pet", web=True)
    r = run(db, F(R("pet_species", "in", ["dog"]), scope="any"))
    assert (r["matches"], r["reachable"]) == (1, 1)
    assert r["by_platform"] == {"ios": 1, "android": 1, "web": 1, "mais_de_um_canal": 1}     # 3 aparelhos, 1 tutor


def test_escopos_algum_o_mesmo_e_todos_os_pets(db):
    w = World(db)
    a = w.user("A", ios=True)                    # 1 cão fêmea + 1 gato macho
    w.pet(a, "dog", sex="female"); w.pet(a, "cat", sex="male")
    b = w.user("B", ios=True)                    # 1 cão macho
    w.pet(b, "dog", sex="male")
    c = w.user("C", ios=True)                    # 2 cães machos
    w.pet(c, "dog", sex="male"); w.pet(c, "dog", sex="male")
    cão_e_macho = [R("pet_species", "in", ["dog"]), R("pet_sex", "eq", "male")]
    assert ids_of(db, F(*cão_e_macho, scope="any"))[0] == {a, b, c}       # A: cão (pet1) E macho (pet2) — pets diferentes
    assert ids_of(db, F(*cão_e_macho, scope="same"))[0] == {b, c}         # o MESMO pet é cão e macho
    assert ids_of(db, F(*cão_e_macho, scope="all"))[0] == {b, c}          # todos os pets são cão macho
    cão_ou_gato = [R("pet_species", "in", ["dog"]), R("pet_species", "in", ["cat"])]
    assert ids_of(db, F(*cão_ou_gato, op="or", scope="all"))[0] == {a, b, c}   # todos os pets são cão ou gato


def test_todos_os_pets_exige_pelo_menos_um_pet(db):
    w = World(db)
    w.user("Sem pet", ios=True)
    t = w.user("Com pet", ios=True); w.pet(t, "dog")
    assert ids_of(db, F(R("pet_species", "in", ["dog"]), scope="all"))[0] == {t}     # sem pet não passa por vacuidade


def test_valores_ausentes_nunca_casam(db):
    w = World(db)
    t = w.user("T", ios=True)
    w.pet(t, "dog")                                                      # sem nascimento, sem peso, sem raça, sem sexo, castrado nulo
    w.pet(t, "dog", weight_value=10, weight_unit=None)                   # peso sem unidade
    w.pet(t, "dog", weight_value=10, weight_unit="stone")                # unidade desconhecida
    w.pet(t, "dog", breed="")
    for f in (R("pet_age_months", "gte", 0), R("pet_weight_kg", "gte", 0), R("pet_breed_contains", "contains", "po"), R("pet_sex", "eq", "male"),
              R("pet_neutered_yes", "eq", True)):
        assert ids_of(db, F(f, scope="any"))[0] == set(), f["field"]
    r = run(db, F(R("pet_weight_kg", "gte", 0), scope="any"))
    assert any(w_["code"] == "weight_without_unit" for w_ in r["warnings"])


def test_peso_em_libras_converte_e_idade_em_meses(db):
    w = World(db)
    t = w.user("T", ios=True)
    w.pet(t, "dog", weight_value=22.0, weight_unit="lb", birth_date=date(2025, 11, 12))       # ≈ 9,98 kg ; exatamente 12 meses
    assert ids_of(db, F(R("pet_weight_kg", "between", [9.9, 10.1]), scope="any"))[0] == {t}
    assert ids_of(db, F(R("pet_weight_kg", "gte", 10.1), scope="any"))[0] == set()
    assert ids_of(db, F(R("pet_age_months", "between", [12, 12]), scope="any"))[0] == {t}
    assert pa.age_in_months(date(2025, 11, 13), date(2026, 11, 12)) == 11                      # ainda não completou
    assert pa.age_in_months(date(2030, 1, 1), date(2026, 11, 12)) is None                      # nascimento no futuro = dado errado


def test_sem_push_aparelho_desativado_e_opt_out_nao_sao_alcancaveis(db):
    w = World(db)
    ok = w.user("Ok", ios=True)
    w.user("Sem push")
    w.user("Token desativado", ios=True, disabled=("ios",))
    w.user("Web desativado", web=True, disabled=("web",))
    w.user("Pediu para parar", ios=True, optout=True)
    r = run(db, F())
    assert (r["matches"], r["reachable"]) == (5, 1)
    assert r["not_reachable"] == {"no_push": 3, "opt_out": 1}
    assert ids_of(db, F())[1] == {ok}


def test_filtro_de_plataforma_so_conta_aparelho_ativo(db):
    w = World(db)
    a = w.user("A", ios=True); b = w.user("B", android=True); c = w.user("C", web=True); d = w.user("D", ios=True, disabled=("ios",))
    assert ids_of(db, F(R("platform", "in", ["ios"])))[0] == {a}
    assert ids_of(db, F(R("platform", "in", ["android", "web"])))[0] == {b, c}
    assert d not in ids_of(db, F(R("platform", "in", ["ios", "android", "web"])))[0]


def test_gps_raio_fronteira_e_origem_gps_somente(db):
    w = World(db)
    centro = (-19.9200, -43.9400)
    dentro = w.user("Dentro", ios=True, lat=-19.93, lng=-43.94, source="gps")
    borda = w.user("Borda", ios=True, lat=-19.90, lng=-43.94, source="gps")
    fora = w.user("Fora", ios=True, lat=-19.60, lng=-43.94, source="gps")
    cidade = w.user("Cidade digitada", ios=True, lat=-19.93, lng=-43.94, source="city")      # coordenada de cidade ≠ GPS
    sem = w.user("Sem posição", ios=True)
    km_borda = pa.haversine_km(*centro, -19.90, -43.94)
    rule = lambda km: R("location_gps_radius", "within_km", {"lat": centro[0], "lng": centro[1], "km": km}, ack=True)
    assert ids_of(db, F(rule(km_borda)))[0] == {dentro, borda}                                   # a borda exata ENTRA (≤)
    assert ids_of(db, F(rule(km_borda - 0.01)))[0] == {dentro}
    assert ids_of(db, F(rule(100)))[0] == {dentro, borda, fora}                                  # fora de 'city' e 'sem posição'
    assert cidade not in ids_of(db, F(rule(500)))[0] and sem not in ids_of(db, F(rule(500)))[0]


def test_texto_com_acento_e_maiuscula_estado_por_nome_e_cidade(db):
    w = World(db)
    a = w.user("A", ios=True, city="São Paulo", state="sp")
    b = w.user("B", ios=True, city="SAO PAULO", state="São Paulo")
    c = w.user("C", ios=True, city="Curitiba", state="PR")
    d = w.user("D", ios=True, city=None, state="")
    assert ids_of(db, F(R("location_registered_state", "in", ["SP"])))[0] == {a, b}
    assert ids_of(db, F(R("location_registered_state", "in", ["são paulo"])))[0] == {a, b}
    assert ids_of(db, F(R("location_registered_city", "in", ["sao paulo"])))[0] == {a, b}
    assert ids_of(db, F(R("location_registered_city", "in", ["CURITIBA"])))[0] == {c}
    pa_ = w.pet(a, "cat", breed="Siamês")
    assert ids_of(db, F(R("pet_breed_contains", "contains", "siames"), scope="any"))[0] == {a}
    assert ids_of(db, F(R("pet_breed_contains", "contains", "SIAMÊS"), scope="any"))[0] == {a}
    assert db.get(Pet, pa_).breed == "Siamês"                                                     # o valor cadastrado NÃO foi alterado
    assert d not in ids_of(db, F(R("location_registered_state", "in", ["SP", "PR"])))[0]


def test_geoip_usa_a_regiao_mais_recente_e_e_aproximado(db):
    w = World(db)
    t = w.user("Viajou", ios=True)
    w.evt(t, timedelta(days=40), region="Minas Gerais")
    w.evt(t, timedelta(days=2), region="São Paulo")                  # a mais recente
    u = w.user("Só antiga", ios=True)
    w.evt(u, timedelta(days=40), region="Minas Gerais")
    sp = R("location_geoip_region", "in", ["sp"], ack=True)
    mg = R("location_geoip_region", "in", ["MG"], ack=True)
    assert ids_of(db, F(sp))[0] == {t}
    assert ids_of(db, F(mg))[0] == {u}                                # "qualquer região já vista" NÃO vale
    r = run(db, F(sp))
    assert [x["origin"] for x in r["warnings"] if x["code"] == "location_approximate"] == ["geoip"]
    assert "não representa a residência" in next(x["text"] for x in r["warnings"] if x["code"] == "location_approximate").lower()


def test_origens_de_localizacao_diferentes_geram_aviso_e_nada_e_misturado_em_silencio(db):
    w = World(db)
    w.user("T", ios=True, state="SP", lat=-23.5, lng=-46.6, source="gps")
    so_cadastro = run(db, F(R("location_registered_state", "in", ["SP"])))
    assert not any(x["code"] in ("location_origins_mixed", "location_approximate") for x in so_cadastro["warnings"])
    mix = run(db, F(R("location_registered_state", "in", ["SP"]), R("location_gps_radius", "within_km", {"lat": -23.5, "lng": -46.6, "km": 50}, ack=True)))
    codes = [x["code"] for x in mix["warnings"]]
    assert "location_origins_mixed" in codes and "location_approximate" in codes
    assert {r["field"]: r["origin"] for r in mix["rules"]}["location_gps_radius"] == "gps"


def test_atividade_quatro_faixas_distintas_e_sem_evento_nao_e_inativo(db):
    w = World(db)
    sete = w.user("7d", ios=True); w.evt(sete, timedelta(days=7))                       # exatamente 7 dias → últimos 7
    oito = w.user("8d", ios=True); w.evt(oito, timedelta(days=7, seconds=1))
    trinta = w.user("30d", ios=True); w.evt(trinta, timedelta(days=30))                 # exatamente 30 → 8–30
    trinta_um = w.user("31d", ios=True); w.evt(trinta_um, timedelta(days=30, seconds=1))
    nunca = w.user("nunca", ios=True)
    futuro = w.user("evento no futuro", ios=True); w.evt(futuro, timedelta(days=-3))    # depois da data de referência: não conta
    ativo_e_antigo = w.user("misto", ios=True); w.evt(ativo_e_antigo, timedelta(days=90)); w.evt(ativo_e_antigo, timedelta(hours=1))
    got = lambda band: ids_of(db, F(R("tutor_activity", "eq", band)))[0]
    assert got("last_7d") == {sete, ativo_e_antigo}
    assert got("d8_30") == {oito, trinta}
    assert got("over_30d") == {trinta_um}
    assert got("no_events") == {nunca, futuro}                                          # nunca teve evento ≠ "mais de 30 dias"
    assert got("over_30d") & got("no_events") == set()
    r = run(db, F(R("tutor_activity", "eq", "no_events")))
    assert any(x["code"] == "activity_is_events" and "não necessariamente login" in x["text"] for x in r["warnings"])


def test_data_de_cadastro_inclusiva_e_contagem_de_pets_inclui_zero(db):
    w = World(db)
    antigo = w.user("Antigo", ios=True, created=datetime(2026, 1, 10, 23, 59, tzinfo=timezone.utc))
    novo = w.user("Novo", ios=True, created=datetime(2026, 11, 1, 0, 0, tzinfo=timezone.utc))
    w.pet(novo, "dog")
    assert ids_of(db, F(R("tutor_created_at", "lte", "2026-01-10")))[0] == {antigo}          # o dia final inteiro entra
    assert ids_of(db, F(R("tutor_created_at", "gte", "2026-11-01")))[0] == {novo}
    assert ids_of(db, F(R("tutor_created_at", "between", ["2026-01-10", "2026-11-01"])))[0] == {antigo, novo}
    assert ids_of(db, F(R("tutor_pet_count", "eq", 0)))[0] == {antigo}
    assert ids_of(db, F(R("tutor_pet_count", "gte", 1)))[0] == {novo}


def test_mistura_de_especies_do_tutor(db):
    w = World(db)
    so_cao = w.user("a", ios=True); w.pet(so_cao, "dog")
    so_gato = w.user("b", ios=True); w.pet(so_gato, "cat")
    ambos = w.user("c", ios=True); w.pet(ambos, "dog"); w.pet(ambos, "cat")
    cao_e_peixe = w.user("d", ios=True); w.pet(cao_e_peixe, "dog"); w.pet(cao_e_peixe, "fish")
    w.user("e", ios=True)
    m = lambda *v: ids_of(db, F(R("tutor_species_mix", "in", list(v))))[0]
    assert m("dog_only") == {so_cao} and m("cat_only") == {so_gato} and m("dog_and_cat") == {ambos}
    assert m("has_cat") == {so_gato, ambos} and m("has_dog") == {so_cao, ambos, cao_e_peixe}
    assert m("has_cat", "dog_only") == {so_cao, so_gato, ambos}


def test_e_ou_e_grupos_aninhados(db):
    w = World(db)
    a = w.user("a", ios=True); w.pet(a, "cat", sex="female")
    b = w.user("b", android=True); w.pet(b, "cat", sex="male")
    c = w.user("c", ios=True); w.pet(c, "dog", sex="female")
    gata = G(R("pet_species", "in", ["cat"]), R("pet_sex", "eq", "female"), scope="same")
    assert ids_of(db, F(gata))[0] == {a}
    assert ids_of(db, F(gata, R("platform", "in", ["android"]), op="or"))[0] == {a, b}
    assert ids_of(db, F(gata, R("platform", "in", ["ios"])))[0] == {a}
    assert ids_of(db, F(G(R("platform", "in", ["ios"]), G(R("pet_species", "in", ["dog"]), scope="any")), op="and"))[0] == {c}
    assert ids_of(db, pc.AudienceFilter())[0] == {a, b, c}                                    # sem filtro = todos


def test_registros_apagados_nao_contam_e_racao_cadastrada_segue_a_definicao_do_produto(db):
    w = World(db)
    t1 = w.user("t1", ios=True); p1 = w.pet(t1); w.plan(p1, brand="Premier Ração Cães")                   # tem marca: configurada
    t2 = w.user("t2", ios=True); p2 = w.pet(t2); w.plan(p2, brand="Premier", deleted=True)                 # plano apagado
    t3 = w.user("t3", ios=True); p3 = w.pet(t3); w.plan(p3)                                                # plano vazio: NÃO é ração cadastrada
    t4 = w.user("t4", ios=True); p4 = w.pet(t4); w.vaccine(p4, deleted=True)                               # vacina apagada
    t5 = w.user("t5", ios=True); p5 = w.pet(t5); w.vaccine(p5)
    assert ids_of(db, F(R("feeding_registered", "eq", True), scope="any"))[0] == {t1}
    assert ids_of(db, F(R("feeding_brand_contains", "contains", "premier"), scope="any"))[0] == {t1}       # apagado não entra
    assert ids_of(db, F(R("care_vaccine", "eq", True), scope="any"))[0] == {t5}


def test_medicacao_e_cuidados_basicos(db):
    w = World(db)
    t = w.user("t", ios=True); p = w.pet(t)
    db.add(Event(user_id=t, pet_id=p, type="medicacao", title="x", scheduled_at=NOW))
    u = w.user("u", ios=True); q = w.pet(u)
    db.add(Event(user_id=u, pet_id=q, type="medication", title="x", scheduled_at=NOW, deleted_at=NOW))      # apagada
    db.add(GroomingRecord(pet_id=q, type="bath", date=NOW)); db.add(ParasiteControlRecord(pet_id=p, type="flea_tick", product_name="x", date_applied=NOW))
    db.flush()
    assert ids_of(db, F(R("care_medication", "eq", True)))[0] == {t}
    assert ids_of(db, F(R("care_grooming", "eq", True), scope="any"))[0] == {u}
    assert ids_of(db, F(R("care_parasite", "eq", True), scope="any"))[0] == {t}


def test_contagens_da_campanha_usado_disponivel_e_proximo_lote(db):
    w = World(db)
    us = [w.user(f"u{i}", ios=True) for i in range(10)]
    for u in us:
        w.pet(u, "cat")
    camp = pc.PushCampaign(name="C", message="m", content_hash="h")
    db.add(camp); db.flush()
    for u in us[:4]:                                                                    # 4 já reservados em lotes anteriores
        db.add(pc.PushCampaignRecipient(campaign_id=camp.id, user_id=u, batch_id="b1", state="accepted"))
    db.add(pc.PushCampaignRecipient(campaign_id=camp.id, user_id="fora-do-publico", batch_id="b1"))
    db.flush()
    flt = F(R("pet_species", "in", ["cat"]), scope="any")
    r = run(db, flt, campaign_id=camp.id, batch_size=3)
    assert (r["matches"], r["reachable"], r["used"], r["available"], r["next_batch"]) == (10, 10, 4, 6, 3)
    assert r["used_in_campaign_total"] == 5                                              # inclui quem não está neste público
    assert run(db, flt, campaign_id=camp.id, batch_size=50)["next_batch"] == 6          # pediu mais que o disponível
    assert any(x["code"] == "batch_larger_than_available" for x in run(db, flt, campaign_id=camp.id, batch_size=50)["warnings"])
    assert run(db, flt, campaign_id=camp.id, all_available=True)["next_batch"] == 6
    assert run(db, flt, batch_size=3)["used"] == 0 and run(db, flt, batch_size=3)["available"] == 10     # sem campanha
    # a regra de repetição é POR CAMPANHA: outra campanha alcança os mesmos tutores
    outra = pc.PushCampaign(name="D", message="m", content_hash="h"); db.add(outra); db.flush()
    assert run(db, flt, campaign_id=outra.id)["available"] == 10
    # mudar os filtros não "devolve" quem já foi usado
    assert run(db, F(), campaign_id=camp.id)["available"] == 6
    with pytest.raises(pa.CampaignNotFound):
        run(db, flt, campaign_id="nao-existe")


def test_quem_ja_foi_reservado_em_qualquer_estado_nunca_volta_a_ficar_disponivel(db):
    """Falhou, incerto, reservado e enviando também saem do público: o incerto jamais é reenviado, e o resto não é substituído."""
    w = World(db)
    us = {est: w.user(est, ios=True) for est in pc.RECIPIENT_STATES}
    livre = w.user("livre", ios=True)
    camp = pc.PushCampaign(name="C", message="m", content_hash="h"); db.add(camp); db.flush()
    for est, u in us.items():
        db.add(pc.PushCampaignRecipient(campaign_id=camp.id, user_id=u, batch_id="b1", state=est))
    db.flush()
    r = run(db, F(), campaign_id=camp.id, all_available=True)
    assert (r["reachable"], r["used"], r["available"], r["next_batch"]) == (6, 5, 1, 1)
    assert pa.resolve_audience(db, F(), now=NOW).reachable == set(us.values()) | {livre}      # o motor em si não filtra por campanha


def test_avisos_de_dados_incompletos_e_castracao_e_marca(db):
    w = World(db)
    for i in range(10):
        t = w.user(f"t{i}", ios=True)
        w.pet(t, "dog", neutered=(i == 0), breed=("Poodle" if i < 2 else None))
    r = run(db, F(R("pet_breed_contains", "contains", "poodle"), R("pet_neutered_yes", "eq", True), scope="any"))
    low = [x for x in r["warnings"] if x["code"] == "low_coverage"]
    assert len(low) == 1 and low[0]["field"] == "pet_breed_contains" and "20.0%" in low[0]["text"]            # raça: 2 de 10 pets
    assert any(x["code"] == "neutered_only_yes" for x in r["warnings"])
    assert all(rr["field"] != "pet_neutered_no" for rr in r["rules"])
    r2 = run(db, F(R("feeding_brand_contains", "contains", "premier"), scope="any"))
    assert any(x["code"] == "brand_free_text" for x in r2["warnings"]) and any(x["code"] == "empty_audience" for x in r2["warnings"])


def test_determinismo_e_lista_ordenada_para_a_reserva(db):
    w = World(db)
    for i in range(15):
        w.pet(w.user(f"u{i}", ios=True), "dog")
    flt = F(R("pet_species", "in", ["dog"]), scope="any")
    a, b = pa.resolve_audience_ids(db, flt, now=NOW), pa.resolve_audience_ids(db, flt, now=NOW)
    assert a == b == sorted(a) and len(a) == 15
    assert run(db, flt) == run(db, flt)                                                  # mesma entrada, mesma saída


def test_valores_invalidos_sao_recusados(db):
    bad = [
        F(R("tutor_created_at", "gte", "ontem")), F(R("tutor_pet_count", "gte", -1)), F(R("tutor_pet_count", "gte", 1.5)),
        F(R("tutor_created_at", "between", ["2026-12-01", "2026-01-01"])), F(R("pet_weight_kg", "between", [10, 5]), scope="any"),
        F(R("pet_age_months", "gte", "x"), scope="any"),
        F(R("location_registered_state", "in", [])), F(R("location_registered_city", "in", ["  "])),
        F(R("location_registered_state", "in", ["SP"] * 31)),
    ]
    for flt in bad:
        with pytest.raises(pa.FilterError):
            pa.resolve_audience(db, flt, now=NOW)


def test_teto_de_escala_recusa_em_vez_de_ficar_lento(db, monkeypatch):
    World(db).user("t", ios=True)
    monkeypatch.setattr(pa, "MAX_USERS_IN_MEMORY", 0)
    with pytest.raises(pa.AudienceTooLarge):
        run(db, F())


# ── sugestões de marca ───────────────────────────────────────────────────────

def test_sugestoes_de_marca_agregadas_com_grafia_original_e_sem_dado_individual(db):
    w = World(db)
    for i in range(6):
        t = w.user(f"p{i}", ios=True); w.plan(w.pet(t), brand="Premier Ração para cães adultos")
    for i in range(5):
        t = w.user(f"f{i}", ios=True); w.plan(w.pet(t), brand="Ração Fórmula Natural Fresh Meat")         # "Ração" é palavra genérica: pula
    for i in range(2):
        t = w.user(f"r{i}", ios=True); w.plan(w.pet(t), brand="Rara Marca")                                # poucos tutores: não sugere
    t = w.user("apagado", ios=True); w.plan(w.pet(t), brand="Premier", deleted=True)                       # plano apagado não conta
    got = pa.brand_suggestions(db, min_tutors=5)
    assert [(s["text"], s["search"], s["tutors"]) for s in got] == [("Premier", "premier", 6), ("Fórmula", "formula", 5)]
    assert set(got[0]) == {"text", "search", "plans", "tutors"}                                              # só contagens


# ══ 3) SOMENTE LEITURA, FLAG E ACESSO ════════════════════════════════════════

def _statements(fn):
    seen = []

    def before(conn, cursor, statement, params, context, executemany):
        seen.append(statement)
    event.listen(engine, "before_cursor_execute", before)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", before)
    return seen


def test_a_contagem_so_faz_select_e_nao_suja_a_sessao(db):
    w = World(db)
    for i in range(6):
        t = w.user(f"u{i}", ios=True, state="SP", lat=-23.5, lng=-46.6, source="gps"); p = w.pet(t, "cat"); w.plan(p, brand="Premier"); w.vaccine(p)
        w.evt(t, timedelta(days=i), region="São Paulo")
    db.commit()
    camp = pc.PushCampaign(name="C", message="m", content_hash="h"); db.add(camp); db.commit()
    flt = F(R("tutor_activity", "eq", "last_7d"), R("location_geoip_region", "in", ["SP"], ack=True),
            R("location_gps_radius", "within_km", {"lat": -23.5, "lng": -46.6, "km": 30}, ack=True), R("care_medication", "eq", True),
            R("pet_species", "in", ["cat"]), R("feeding_registered", "eq", True), R("feeding_brand_contains", "contains", "prem"),
            R("care_vaccine", "eq", True), R("care_parasite", "eq", True), R("care_grooming", "eq", True), R("pet_age_months", "gte", 0), scope="any")
    stmts = _statements(lambda: (pa.compute_audience(db, flt, campaign_id=camp.id, now=NOW), pa.brand_suggestions(db), pa.describe_fields()))
    assert stmts and all(s.lstrip().upper().startswith(("SELECT", "WITH", "PRAGMA")) for s in stmts), [s[:60] for s in stmts if not s.lstrip().upper().startswith("SELECT")]
    assert not db.new and not db.dirty and not db.deleted


@pytest.fixture()
def api(client, db, monkeypatch):
    monkeypatch.setattr(pc, "get_settings", lambda: SimpleNamespace(push_campaigns_enabled=True))
    client.app.dependency_overrides[get_current_admin] = lambda: (SimpleNamespace(id="admin"), None)
    yield client
    client.app.dependency_overrides.pop(get_current_admin, None)


_ENDPOINTS = (("GET", "/v1/admin/push-campaigns/fields", None), ("GET", "/v1/admin/push-campaigns/suggestions/brands", None),
              ("POST", "/v1/admin/push-campaigns/audience/count", {"filter": {"version": 1, "root": {"kind": "group", "op": "and", "items": []}}}))


def _call(c, method, path, body):
    return c.get(path) if method == "GET" else c.post(path, json=body)


@pytest.mark.parametrize("method,path,body", _ENDPOINTS)
def test_flag_desligada_os_endpoints_novos_dao_404(client, monkeypatch, method, path, body):
    monkeypatch.setattr(pc, "get_settings", lambda: SimpleNamespace(push_campaigns_enabled=False))
    client.app.dependency_overrides[get_current_admin] = lambda: (SimpleNamespace(id="admin"), None)
    try:
        assert _call(client, method, path, body).status_code == 404
        assert _call(client, method, "/api" + path, body).status_code == 404
    finally:
        client.app.dependency_overrides.pop(get_current_admin, None)


@pytest.mark.parametrize("method,path,body", _ENDPOINTS)
def test_so_administrador_acessa_mesmo_com_a_flag_ligada(client, monkeypatch, method, path, body):
    monkeypatch.setattr(pc, "get_settings", lambda: SimpleNamespace(push_campaigns_enabled=True))
    client.app.dependency_overrides.pop(get_current_admin, None)
    assert _call(client, method, path, body).status_code in (401, 403)


def test_endpoint_de_contagem_responde_e_valida(api, db):
    w = World(db)
    t = w.user("t", ios=True); w.pet(t, "cat")
    db.commit()
    ok = api.post("/v1/admin/push-campaigns/audience/count", json={"filter": {"version": 1, "root": {"kind": "group", "op": "and", "pet_scope": "any", "items": [
        {"kind": "rule", "field": "pet_species", "op": "in", "value": ["cat"]}]}}, "batch_size": 5})
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert (body["matches"], body["reachable"], body["available"], body["next_batch"]) == (1, 1, 1, 1)
    assert api.post("/api/v1/admin/push-campaigns/audience/count", json={"filter": {"version": 1, "root": {"kind": "group", "items": []}}}).status_code == 200
    # filtro inexistente / valor inválido / campanha desconhecida / lote inválido
    assert api.post("/v1/admin/push-campaigns/audience/count", json={"filter": {"version": 1, "root": {"kind": "group", "items": [
        {"kind": "rule", "field": "tutor_sex", "op": "eq", "value": "f"}]}}}).status_code == 422
    r = api.post("/v1/admin/push-campaigns/audience/count", json={"filter": {"version": 1, "root": {"kind": "group", "items": [
        {"kind": "rule", "field": "tutor_created_at", "op": "gte", "value": "ontem"}]}}})
    assert r.status_code == 422 and "data válida" in r.text
    assert api.post("/v1/admin/push-campaigns/audience/count", json={"campaign_id": "x"}).status_code == 404
    assert api.post("/v1/admin/push-campaigns/audience/count", json={"batch_size": 0}).status_code == 422


def test_endpoint_de_contagem_nao_tem_efeito_colateral(api, db):
    w = World(db)
    t = w.user("t", ios=True); w.pet(t, "cat")
    db.commit()
    antes = (db.query(pc.PushCampaignRecipient).count(), db.query(pc.PushCampaign).count(), db.query(User).count())
    stmts = _statements(lambda: api.post("/v1/admin/push-campaigns/audience/count", json={"filter": {"version": 1, "root": {"kind": "group", "items": []}}}))
    assert stmts and all(s.lstrip().upper().startswith(("SELECT", "WITH", "PRAGMA")) for s in stmts)
    assert (db.query(pc.PushCampaignRecipient).count(), db.query(pc.PushCampaign).count(), db.query(User).count()) == antes


def test_catalogo_de_campos_so_traz_o_que_funciona(api):
    body = api.get("/v1/admin/push-campaigns/fields").json()
    campos = {f["field"]: f for f in body["fields"]}
    assert set(campos) == set(pc.FILTER_FIELDS)
    assert not {"tutor_sex", "tutor_age", "feeding_days_remaining", "pet_neutered_no", "litter"} & set(campos)
    assert campos["pet_neutered_yes"]["values"] == [True]                                  # só a opção afirmativa
    assert campos["tutor_activity"]["values"] == ["last_7d", "d8_30", "over_30d", "no_events"]
    assert campos["location_gps_radius"]["approximate"] and campos["location_geoip_region"]["approximate"]
    assert not campos["location_registered_state"]["approximate"]
    assert {campos[k]["origin"] for k in ("location_registered_state", "location_gps_radius", "location_geoip_region")} == {"cadastro", "gps", "geoip"}
    assert "não necessariamente login" in body["activity_note"]


def test_endpoint_de_sugestoes_de_marca(api, db):
    w = World(db)
    for i in range(5):
        t = w.user(f"p{i}", ios=True); w.plan(w.pet(t), brand="Premier Ração")
    db.commit()
    got = api.get("/v1/admin/push-campaigns/suggestions/brands").json()["suggestions"]
    assert got and got[0]["search"] == "premier" and got[0]["tutors"] == 5


def test_teto_de_escala_vira_503_no_endpoint(api, db, monkeypatch):
    World(db).user("t", ios=True); db.commit()
    monkeypatch.setattr(pa, "MAX_USERS_IN_MEMORY", 0)
    assert api.post("/v1/admin/push-campaigns/audience/count", json={}).status_code == 503


def test_so_ha_endpoints_de_leitura_e_nenhum_envia():
    rotas = {(tuple(sorted(r.methods)), r.path) for r in pa.router.routes}
    assert rotas == {(("GET",), "/v1/admin/push-campaigns/fields"), (("GET",), "/v1/admin/push-campaigns/suggestions/brands"),
                     (("GET",), "/v1/admin/push-campaigns/audience/location-coverage"), (("POST",), "/v1/admin/push-campaigns/audience/count")}
    src = open(pa.__file__, encoding="utf-8").read()
    assert "push_to_user" not in src and "_spawn" not in src and "db.commit" not in src and "db.add" not in src


def test_catalogo_e_regras_cobrem_exatamente_os_mesmos_campos():
    assert set(pa._RULES) == set(pc.FILTER_FIELDS) == set(pa.FIELD_META)


# ══ 4) DESEMPENHO (escala atual: ≈2.500 tutores, ≈2.700 pets) ═════════════════

def test_desempenho_com_a_escala_atual(db):
    rng = random.Random(7)
    uids = [str(uuid.uuid4()) for _ in range(2500)]
    db.execute(User.__table__.insert(), [dict(id=u, email=f"{u[:10]}@p.example", name="P", password_hash="x", created_at=NOW - timedelta(days=rng.randint(0, 300)),
                                              city=rng.choice([None, "BH", "SP"]), state=rng.choice([None, "MG", "SP"]),
                                              lat=rng.uniform(-24, -19), lng=rng.uniform(-47, -43), location_source=rng.choice(["gps", None])) for u in uids])
    pets = [(str(uuid.uuid4()), rng.choice(uids)) for _ in range(2700)]
    db.execute(Pet.__table__.insert(), [dict(id=p, user_id=u, name="x", species=rng.choice(["dog", "dog", "cat"]), sex=rng.choice(["male", "female", None]),
                                             breed=rng.choice(["SRD", "Poodle", None]), birth_date=date(2020, 1, 1), weight_value=rng.uniform(2, 40), weight_unit="kg",
                                             neutered=rng.choice([True, None])) for p, u in pets])
    db.execute(PushSubscription.__table__.insert(), [dict(id=str(uuid.uuid4()), user_id=u, endpoint=f"https://p/{u}", p256dh="k", auth="a") for u in uids[:300]])
    db.execute(NativePushToken.__table__.insert(), [dict(id=str(uuid.uuid4()), user_id=u, platform=rng.choice(["ios", "android"]), token=f"t{u}") for u in uids[300:1300]])
    db.execute(AnalyticsProductEvent.__table__.insert(), [dict(event_id=str(uuid.uuid4()), event_name="screen_view", user_id=rng.choice(uids),
                                                              received_at=NOW - timedelta(hours=rng.randint(0, 24 * 90)), region=rng.choice([None, "Minas Gerais", "São Paulo"]))
                                                         for _ in range(30000)])
    db.execute(FeedingPlan.__table__.insert(), [dict(id=str(uuid.uuid4()), pet_id=p, species="dog", country_code="BR", food_brand=rng.choice(["Premier", "Golden", None]),
                                                    mode="kibble", enabled=True, safety_buffer_days=3, no_consumption_control=False, reminder_source="calculated",
                                                    items_json="[]") for p, _ in pets[:1500]])
    db.commit()
    flt = F(R("tutor_activity", "eq", "last_7d"), R("location_geoip_region", "in", ["MG"], ack=True), R("location_gps_radius", "within_km", {"lat": -19.9, "lng": -43.9, "km": 200}, ack=True),
            R("pet_species", "in", ["dog"]), R("pet_age_months", "gte", 12), R("pet_weight_kg", "between", [3, 35]), R("feeding_registered", "eq", True),
            R("feeding_brand_contains", "contains", "prem"), R("tutor_species_mix", "in", ["has_dog"]), R("platform", "in", ["ios", "android"]), scope="any")
    t0 = time.perf_counter()
    out = pa.compute_audience(db, flt, now=NOW)
    elapsed = time.perf_counter() - t0
    assert out["matches"] >= 0 and elapsed < 3.0, f"contagem complexa levou {elapsed:.2f}s"


# ── Faixas de idade/peso da tela de segmentação: cada valor pertence a UMA faixa (sem lacuna nem sobreposição) ──────────────────

AGE_BANDS = {"filhote": (0, 11), "jovem": (12, 35), "adulto": (36, 95), "senior": (96, 600)}
WEIGHT_BANDS = {"pequeno": (0, 9.99), "medio": (10, 24.99), "grande": (25, 500)}


def _band_members(db, field, bands):
    return {k: ids_of(db, F(R(field, "between", [lo, hi]), scope="any"))[0] for k, (lo, hi) in bands.items()}


def test_faixas_de_peso_particionam_sem_lacuna_nem_sobreposicao_inclusive_com_libras(db):
    w = World(db)
    pesos = [("kg", v) for v in (0.5, 9.99, 10.0, 10.01, 24.99, 25.0, 25.01, 40.0, 9.994, 9.996, 24.994, 24.996)] + \
            [("lb", v) for v in (22.0, 22.04623, 22.0462, 22.1, 55.0, 55.115, 55.12)]          # 22,04623 lb ≈ 9,999999… kg (cairia numa lacuna sem o arredondamento)
    donos = {}
    for unit, v in pesos:
        t = w.user(f"t{unit}{v}", ios=True)
        w.pet(t, "dog", weight_value=v, weight_unit=unit)
        donos[t] = (unit, v)
    faixas = _band_members(db, "pet_weight_kg", WEIGHT_BANDS)
    for t, (unit, v) in donos.items():
        em = [k for k, ids in faixas.items() if t in ids]
        assert len(em) == 1, (unit, v, em)                      # exatamente UMA faixa para cada peso
    assert set().union(*faixas.values()) == set(donos)           # nenhum peso ficou de fora
    assert faixas["pequeno"] & faixas["medio"] == set() and faixas["medio"] & faixas["grande"] == set()


def test_faixas_de_idade_particionam_em_meses_completos(db):
    w = World(db)
    hoje = NOW.date()
    donos = {}
    for meses in (0, 1, 11, 12, 13, 35, 36, 37, 95, 96, 97, 300):
        t = w.user(f"m{meses}", ios=True)
        ano, mes = divmod(hoje.year * 12 + hoje.month - 1 - meses, 12)
        w.pet(t, "dog", birth_date=date(ano, mes + 1, 1))
        donos[t] = meses
    faixas = _band_members(db, "pet_age_months", AGE_BANDS)
    for t, meses in donos.items():
        em = [k for k, ids in faixas.items() if t in ids]
        assert len(em) == 1, (meses, em)
    assert {m for t, m in donos.items() if t in faixas["filhote"]} == {0, 1, 11}
    assert {m for t, m in donos.items() if t in faixas["jovem"]} == {12, 13, 35}
    assert {m for t, m in donos.items() if t in faixas["adulto"]} == {36, 37, 95}
    assert {m for t, m in donos.items() if t in faixas["senior"]} == {96, 97, 300}


# ══ 5) LOCALIZAÇÃO POR ORIGEM (cadastro · IP direto · IP do aparelho · GPS) ═══

def aevt(db, anon, uid, ago, region=None, city=None, platform="ios_capacitor"):
    db.add(AnalyticsProductEvent(event_id=str(uuid.uuid4()), event_name="screen_view", user_id=uid, anonymous_id=anon, platform=platform,
                                 received_at=NOW - ago, region=region, city=city))
    db.flush()


def rule_ids(db, field, values):
    return ids_of(db, F(R(field, "in", values, ack=True)))[0]


def test_geo_br_conversao_offline_e_casos_de_borda():
    from src.admin.geo_br import nearest_municipality as nm
    assert nm(-23.5505, -46.6333)[:2] == ("São Paulo", "SP")
    assert nm(-19.9167, -43.9345)[:2] == ("Belo Horizonte", "MG")
    assert nm(-3.1190, -60.0217)[:2] == ("Manaus", "AM")
    assert nm(40.7128, -74.0060) is None                      # Nova York: fora do Brasil
    assert nm(0.0, 0.0) is None                               # oceano
    assert nm(None, -43.0) is None and nm(-19.0, None) is None
    assert nm(float("nan"), -43.0) is None and nm(95.0, 0.0) is None and nm("x", 1) is None


def test_gps_vira_cidade_estado_sem_alterar_coordenadas_e_so_com_source_gps(db):
    w = World(db)
    g = w.user("GPS", ios=True, lat=-19.9167, lng=-43.9345, source="gps")
    c = w.user("Coord de cidade (não GPS)", ios=True, lat=-19.9167, lng=-43.9345, source="city")
    ny = w.user("Fora do Brasil", ios=True, lat=40.7, lng=-74.0, source="gps")
    assert rule_ids(db, "location_gps_city", ["belo horizonte"]) == {g}
    assert rule_ids(db, "location_gps_state", ["mg"]) == {g}
    assert c not in rule_ids(db, "location_gps_state", ["MG"]) and ny not in rule_ids(db, "location_gps_state", ["NY", "MG"])
    u = db.get(User, g)
    assert (u.lat, u.lng, u.location_source, u.city, u.state) == (-19.9167, -43.9345, "gps", None, None)   # nada foi gravado de volta
    r = run(db, F(R("location_gps_city", "in", ["belo horizonte"], ack=True)))
    rule = next(x for x in r["rules"] if x["field"] == "location_gps_city")
    assert rule["origin"] == "gps_municipio" and "aproximada" in rule["precision"] and rule["origin_breakdown"] == {"gps": 1}


def test_cadastro_vence_ip_e_ip_vence_gps_na_melhor_localizacao(db):
    w = World(db)
    a = w.user("A", ios=True, state="RJ", city="Niterói", lat=-23.55, lng=-46.63, source="gps")
    b = w.user("B", ios=True, lat=-23.55, lng=-46.63, source="gps")
    c = w.user("C", ios=True, lat=-19.92, lng=-43.94, source="gps")
    aevt(db, "dev-a", a, timedelta(days=1), "São Paulo", "Campinas")
    aevt(db, "dev-b", b, timedelta(days=2), "Minas Gerais", "Uberlândia")
    assert rule_ids(db, "location_best_state", ["RJ"]) == {a}                  # cadastro > IP > GPS
    assert rule_ids(db, "location_best_state", ["MG"]) == {b, c}               # b pelo IP (MG), c pelo GPS (MG)
    assert rule_ids(db, "location_best_state", ["SP"]) == set()                # GPS de b é SP, mas o IP dele vem antes
    assert rule_ids(db, "location_best_city", ["uberlandia"]) == {b}
    r = run(db, F(R("location_best_state", "in", ["MG"], ack=True)))
    assert next(x for x in r["rules"] if x["field"] == "location_best_state")["origin_breakdown"] == {"ip_direto": 1, "gps": 1}


def test_ip_do_aparelho_so_vale_para_aparelho_de_um_tutor_e_uma_plataforma(db):
    w = World(db)
    solo = w.user("Solo", ios=True)
    aevt(db, "dev-solo", solo, timedelta(days=1))                              # login (sem geo) — o aparelho é do tutor
    aevt(db, "dev-solo", None, timedelta(days=9), "Bahia", "Salvador")        # evento anônimo anterior ao login
    assert rule_ids(db, "location_ip_state", ["BA"]) == {solo}
    r = run(db, F(R("location_ip_state", "in", ["BA"], ack=True)))
    assert next(x for x in r["rules"] if x["field"] == "location_ip_state")["origin_breakdown"] == {"ip_aparelho": 1}


def test_aparelho_compartilhado_nao_mistura_contas(db):
    w = World(db)
    a, b = w.user("A", ios=True), w.user("B", ios=True)
    aevt(db, "dev-x", a, timedelta(days=3))
    aevt(db, "dev-x", b, timedelta(days=2))
    aevt(db, "dev-x", None, timedelta(days=9), "Ceará", "Fortaleza")
    assert rule_ids(db, "location_ip_state", ["CE"]) == set()                  # ninguém recebe o dado do aparelho dividido
    assert rule_ids(db, "location_ip_city", ["fortaleza"]) == set()
    aevt(db, "dev-x", a, timedelta(days=1), "Paraná", "Curitiba")             # o dado marcado com o tutor continua sendo DELE
    assert rule_ids(db, "location_ip_state", ["PR"]) == {a}
    assert b not in rule_ids(db, "location_ip_state", ["PR", "CE"])


def test_mudanca_de_titularidade_invalida_eventos_anonimos_antigos(db):
    w = World(db)
    a, b = w.user("A", ios=True), w.user("B", ios=True)
    aevt(db, "dev-t", a, timedelta(days=30))
    aevt(db, "dev-t", None, timedelta(days=40), "Goiás", "Goiânia")
    assert rule_ids(db, "location_ip_city", ["goiania"]) == {a}               # hoje o aparelho é só do A
    aevt(db, "dev-t", b, timedelta(days=1))                                    # surge um 2º tutor no aparelho
    assert rule_ids(db, "location_ip_city", ["goiania"]) == set()              # os eventos anônimos antigos deixam de valer
    # no passado (antes do 2º tutor existir) o aparelho ainda era seguro: o corte é pelo "agora" da consulta
    past = pa.resolve_audience(db, F(R("location_ip_city", "in", ["goiania"], ack=True)), now=NOW - timedelta(days=10))
    assert past.matches == {a}


def test_aparelho_com_duas_plataformas_e_excluido(db):
    w = World(db)
    t = w.user("T", ios=True)
    aevt(db, "dev-m", t, timedelta(days=1), platform="ios_capacitor")
    aevt(db, "dev-m", None, timedelta(days=5), "Pará", "Belém", platform="web")
    assert rule_ids(db, "location_ip_state", ["PA"]) == set()


def test_dados_ausentes_e_divergencia_geografica(db):
    w = World(db)
    nada = w.user("Sem nada", ios=True)
    so_regiao = w.user("Só região", ios=True)
    div = w.user("Diverge", ios=True, state="SP", city="Santos", lat=-19.9167, lng=-43.9345, source="gps")
    aevt(db, "dev-r", so_regiao, timedelta(days=1), "Rio Grande do Sul", None)
    aevt(db, "dev-d", div, timedelta(days=1), "Minas Gerais", "Uberlândia")
    aevt(db, "dev-n", nada, timedelta(days=1), "", "")                         # evento sem geo: não conta como dado
    assert rule_ids(db, "location_best_state", ["RS"]) == {so_regiao}
    assert rule_ids(db, "location_best_city", ["santos"]) == {div}            # divergência: cadastro (Santos) vence IP (Uberlândia) e GPS (BH)
    assert rule_ids(db, "location_ip_city", ["uberlandia"]) == {div}          # mas cada origem continua selecionável SEPARADAMENTE
    assert rule_ids(db, "location_gps_city", ["belo horizonte"]) == {div}
    assert nada not in rule_ids(db, "location_best_state", ["SP", "RS", "MG"])
    assert rule_ids(db, "location_ip_city", ["x"]) == set() and so_regiao not in rule_ids(db, "location_ip_city", ["porto alegre"])


def test_atualizacao_dos_eventos_muda_o_resultado(db):
    w = World(db)
    t = w.user("T", ios=True)
    aevt(db, "dev-u", t, timedelta(days=5), "São Paulo", "São Paulo")
    assert rule_ids(db, "location_ip_state", ["SP"]) == {t}
    aevt(db, "dev-u", t, timedelta(days=1), "Pernambuco", "Recife")           # sessão mais nova de outro lugar
    assert rule_ids(db, "location_ip_state", ["SP"]) == set() and rule_ids(db, "location_ip_state", ["PE"]) == {t}
    aevt(db, "dev-u", None, timedelta(hours=1), "Bahia", "Salvador")          # anônimo MAIS NOVO no aparelho seguro do tutor
    assert rule_ids(db, "location_ip_state", ["BA"]) == {t}
    aevt(db, "dev-u", None, timedelta(days=-2), "Acre", "Rio Branco")         # evento no futuro: ignorado
    assert rule_ids(db, "location_ip_state", ["AC"]) == set()


def test_contagem_previa_e_reserva_usam_a_mesma_funcao_de_selecao(db):
    """compute_audience (contagem/prévia) e a reserva chamam resolve_audience: mesma regra, inclusive para a localização por aparelho."""
    import inspect
    from src.admin import push_campaign_batches as pb
    w = World(db)
    t = w.user("T", ios=True)
    aevt(db, "dev-s", t, timedelta(days=1))
    aevt(db, "dev-s", None, timedelta(days=4), "Santa Catarina", "Joinville")
    flt = F(R("location_best_city", "in", ["joinville"], ack=True))
    assert pa.resolve_audience(db, flt, now=NOW).matches == {t}
    assert run(db, flt)["matches"] == 1
    assert "resolve_audience" in inspect.getsource(pb) and "resolve_audience" in inspect.getsource(pa.compute_audience)


def test_cobertura_por_origem_so_entre_alcancaveis_e_sem_confundir_com_precisao(db):
    w = World(db)
    a = w.user("A", ios=True, state="SP", city="Campinas")
    b = w.user("B", ios=True, lat=-19.9167, lng=-43.9345, source="gps")
    c = w.user("C", ios=True)
    d = w.user("D", ios=True)
    w.user("Sem push (fora)", state="MG", city="Betim")
    aevt(db, "dev-c", c, timedelta(days=1)); aevt(db, "dev-c", None, timedelta(days=7), "Bahia", "Salvador")   # só via aparelho
    aevt(db, "dev-d", d, timedelta(days=1), "Ceará", "Fortaleza")                                                # IP direto
    cov = pa.location_coverage(db, now=NOW)
    by = {o["key"]: o for o in cov["origins"]}
    assert cov["reachable"] == 4 and "não a precisão" in cov["approximate_note"].replace("a precisão geográfica", "a precisão") or "precisão" in cov["approximate_note"]
    assert by["cadastro"]["state"] == 1 and by["cadastro"]["city"] == 1 and by["cadastro"]["approximate"] is False
    assert by["ip_direto"]["tutors"] == 1 and by["ip_aparelho"]["tutors"] == 1 and by["ip_aparelho"]["additional_tutors"] == 1
    assert by["ip_aparelho"]["union_tutors"] == 2 and by["ip_aparelho"]["union_percent"] == 50.0       # direto (d) + só aparelho (c), sem duplicar
    assert by["gps"]["state"] == 1 and by["gps"]["city"] == 1 and by["gps"]["approximate"] is True
    assert by["melhor"]["state"] == 4 and by["melhor"]["city"] == 4 and by["melhor"]["state_percent"] == 100.0
    assert b is not None and a is not None


def test_diferencial_de_aparelhos_contra_referencia_independente(db):
    """Mundo aleatório de aparelhos (compartilhados, multiplataforma, eventos futuros) × implementação de referência em Python puro."""
    rng = random.Random(2026)
    w = World(db)
    users = [w.user(f"U{i}", ios=True) for i in range(14)]
    anons = [f"a{i}" for i in range(18)]
    plats = ["ios_capacitor", "android_capacitor", "web"]
    states = [("São Paulo", "Campinas"), ("Minas Gerais", "Betim"), ("Bahia", "Salvador"), ("Paraná", "Curitiba"), (None, "Recife"), ("Goiás", None), (None, None)]
    world = []
    for k in range(140):
        anon = rng.choice(anons)
        uid = rng.choice(users + [None, None])
        plat = rng.choice(plats[:1] * 4 + plats[1:]) if rng.random() < 0.9 else rng.choice(plats)
        ago = timedelta(hours=rng.randint(-72, 24 * 60), seconds=k)
        reg, city = rng.choice(states)
        aevt(db, anon, uid, ago, reg, city, plat)
        world.append({"anon": anon, "user": uid, "t": NOW - ago, "region": reg, "city": city, "platform": plat})
    live = [e for e in world if e["t"] <= NOW]
    dev: dict = {}
    for e in live:
        d = dev.setdefault(e["anon"], {"users": set(), "plats": set()})
        if e["user"]:
            d["users"].add(e["user"])
        d["plats"].add(e["platform"])
    safe = {a: next(iter(d["users"])) for a, d in dev.items() if len(d["users"]) == 1 and len(d["plats"]) <= 1}
    expect: dict[str, tuple] = {}
    for e in sorted((e for e in live if e["region"] or e["city"]), key=lambda e: (e["t"], 0 if e["user"] else -1)):
        owner = e["user"] or safe.get(e["anon"])
        if owner is None:
            continue
        cur = expect.get(owner)
        direct = bool(e["user"])
        if cur is None or e["t"] > cur[0] or (e["t"] == cur[0] and direct):
            expect[owner] = (e["t"], e["region"], e["city"])
    for st_, ct_ in (("SP", "campinas"), ("MG", "betim"), ("BA", "salvador"), ("PR", "curitiba"), ("GO", "recife")):
        want_s = {u for u, (_, r, _c) in expect.items() if r and pa.norm_state(r) == st_}
        want_c = {u for u, (_, _r, c) in expect.items() if c and pa.norm_text(c) == ct_}
        assert rule_ids(db, "location_ip_state", [st_]) == want_s, st_
        assert rule_ids(db, "location_ip_city", [ct_]) == want_c, ct_


def test_empate_de_horario_prefere_o_dado_do_proprio_tutor_e_origem_fica_correta(db):
    w = World(db)
    t = w.user("T", ios=True)
    aevt(db, "dev-e", t, timedelta(days=2), "Paraná", "Curitiba")             # evento do próprio tutor
    aevt(db, "dev-e", None, timedelta(days=2), "Bahia", "Salvador")           # anônimo no MESMO instante
    assert rule_ids(db, "location_ip_state", ["PR"]) == {t} and rule_ids(db, "location_ip_state", ["BA"]) == set()
    r = run(db, F(R("location_ip_state", "in", ["PR"], ack=True)))
    assert next(x for x in r["rules"] if x["field"] == "location_ip_state")["origin_breakdown"] == {"ip_direto": 1}   # não é "do aparelho"
