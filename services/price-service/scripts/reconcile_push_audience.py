#!/usr/bin/env python3
"""Reconcilia o motor de segmentação de campanhas push (src/admin/push_audience.py) com um ORÁCULO em SQL puro, sobre uma CÓPIA do banco.

USO (somente em um banco TEMPORÁRIO local restaurado de um backup; nunca contra a produção):
    createdb zz_push_audience_tmp && gzip -dc backup.sql.gz | psql -q -d zz_push_audience_tmp
    python scripts/reconcile_push_audience.py zz_push_audience_tmp [--now 2026-11-12T04:15:00+00:00]

Tudo roda em transação SOMENTE LEITURA (o script prova, com um controle negativo, que o banco recusa escrita). A saída traz só números
agregados; nenhum dado individual é lido para a tela. Sai com código 1 se motor e oráculo divergirem em qualquer cenário.
"""
import argparse
import os
import statistics
import sys
import time
from datetime import datetime, timezone

ap = argparse.ArgumentParser()
ap.add_argument("database")
ap.add_argument("--now", default="2026-11-12T04:15:00+00:00", help="data de referência (o instante do backup)")
args = ap.parse_args()

os.environ["DATABASE_URL"] = f"postgresql+psycopg2:///{args.database}"
os.environ["ENV"] = "dev"
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import dotenv  # noqa: E402

dotenv.load_dotenv = lambda *a, **k: False
import src.config as _cfg  # noqa: E402

_cfg.Settings.model_config["env_file"] = None
_cfg.get_settings.cache_clear()
from sqlalchemy import text  # noqa: E402
from sqlalchemy.exc import InternalError, ProgrammingError  # noqa: E402

import src.main  # noqa: E402,F401  (registra os modelos)
import src.admin.push_audience as pa  # noqa: E402
import src.admin.push_campaigns as pc  # noqa: E402
from src.db import SessionLocal  # noqa: E402

NOW = datetime.fromisoformat(args.now)
TS = f"timestamptz '{NOW.isoformat()}'"


def R(field, op, value, ack=False):
    r = {"kind": "rule", "field": field, "op": op, "value": value}
    if ack:
        r["approximate_ack"] = True
    return r


def F(*items, op="and", scope=None):
    g = {"kind": "group", "op": op, "items": list(items)}
    if scope:
        g["pet_scope"] = scope
    return pc.AudienceFilter.model_validate({"version": 1, "root": g})


# ── Oráculo: cada consulta devolve ids de TUTOR (formulação independente do motor) ──────────────────────────
REACH = """select u.id from users u where (exists(select 1 from push_subscriptions s where s.user_id=u.id and s.disabled_at is null)
  or exists(select 1 from native_push_tokens t where t.user_id=u.id and t.disabled_at is null))
  and not exists(select 1 from activation_opt_out o where o.user_id=u.id)"""
SP = "lower(trim(species))"
SX = "lower(trim(sex))"
UNACC = lambda col: f"lower(unaccent(trim({col})))"
LAST = f"(select user_id, max(received_at) m from analytics_product_events where user_id is not null and received_at <= {TS} group by 1)"
CONFIGURED = """f.deleted_at is null and ((f.items_json is not null and f.items_json not in ('[]','','null')) or (f.food_brand is not null and f.food_brand<>'')
  or f.duration_days is not null or f.estimated_end_date is not null
  or (f.no_consumption_control and f.mode is not null and f.mode<>'' and f.mode<>'kibble' and (f.food_brand is null or f.food_brand='')))"""
HAV = "2*6371.0088*asin(least(1.0, sqrt(power(sin(radians(({lat})-lat)/2),2)+cos(radians(lat))*cos(radians({lat}))*power(sin(radians(({lng})-lng)/2),2))))"
BH = (-19.9167, -43.9345)
AGE = f"((extract(year from age({TS}::date, birth_date))*12 + extract(month from age({TS}::date, birth_date)))::int)"

SCENARIOS = [
    ("todos os tutores", F(), "select id from users"),
    ("plataforma iPhone", F(R("platform", "in", ["ios"])), "select user_id from native_push_tokens where disabled_at is null and platform='ios'"),
    ("plataforma Android", F(R("platform", "in", ["android"])), "select user_id from native_push_tokens where disabled_at is null and platform='android'"),
    ("plataforma navegador", F(R("platform", "in", ["web"])), "select s.user_id from push_subscriptions s join users u on u.id=s.user_id where s.disabled_at is null"),
    ("tutor com gato", F(R("tutor_species_mix", "in", ["has_cat"])), f"select user_id from pets where {SP}='cat'"),
    ("tutor com cão e gato", F(R("tutor_species_mix", "in", ["dog_and_cat"])),
     f"select user_id from pets group by user_id having bool_or({SP}='dog') and bool_or({SP}='cat')"),
    ("tutor só de cão", F(R("tutor_species_mix", "in", ["dog_only"])),
     f"select user_id from pets group by user_id having bool_or({SP}='dog') and not bool_or({SP}='cat') and not bool_or({SP} not in ('dog','cat'))"),
    ("mais de um pet", F(R("tutor_pet_count", "gte", 2)), "select user_id from pets group by user_id having count(*)>=2"),
    ("sem nenhum pet", F(R("tutor_pet_count", "eq", 0)), "select id from users where id not in (select user_id from pets)"),
    ("gata (o MESMO pet é gato e fêmea)", F(R("pet_species", "in", ["cat"]), R("pet_sex", "eq", "female"), scope="same"),
     f"select user_id from pets where {SP}='cat' and {SX}='female'"),
    ("gato E fêmea (pets podem ser diferentes)", F(R("pet_species", "in", ["cat"]), R("pet_sex", "eq", "female"), scope="any"),
     f"select user_id from pets group by user_id having bool_or({SP}='cat') and bool_or({SX}='female')"),
    ("TODOS os pets são cães", F(R("pet_species", "in", ["dog"]), scope="all"), f"select user_id from pets group by user_id having bool_and({SP}='dog')"),
    ("algum pet castrado = sim", F(R("pet_neutered_yes", "eq", True), scope="any"), "select user_id from pets where neutered is true"),
    ("raça contém 'golden'", F(R("pet_breed_contains", "contains", "golden"), scope="any"), f"select user_id from pets where {UNACC('breed')} like '%golden%'"),
    ("idade ≥ 12 meses", F(R("pet_age_months", "gte", 12), scope="any"), f"select user_id from pets where birth_date is not null and birth_date <= {TS}::date and {AGE} >= 12"),
    ("peso entre 5 e 20 kg", F(R("pet_weight_kg", "between", [5, 20]), scope="any"),
     "select user_id from pets where weight_value>0 and ((lower(trim(weight_unit)) in ('kg','kgs') and weight_value between 5 and 20) "
     "or (lower(trim(weight_unit)) in ('lb','lbs') and weight_value*0.45359237 between 5 and 20))"),
    ("ração cadastrada (definição do produto)", F(R("feeding_registered", "eq", True), scope="any"),
     f"select p.user_id from feeding_plans f join pets p on p.id=f.pet_id where {CONFIGURED}"),
    ("marca da ração contém 'premier'", F(R("feeding_brand_contains", "contains", "premier"), scope="any"),
     f"select p.user_id from feeding_plans f join pets p on p.id=f.pet_id where f.deleted_at is null and {UNACC('f.food_brand')} like '%premier%'"),
    ("tem vacina registrada", F(R("care_vaccine", "eq", True), scope="any"),
     "select p.user_id from vaccine_records v join pets p on p.id=v.pet_id where v.deleted_at is null"),
    ("tem vermífugo/antipulgas/coleira", F(R("care_parasite", "eq", True), scope="any"),
     "select p.user_id from parasite_control_records v join pets p on p.id=v.pet_id"),
    ("tem banho e tosa", F(R("care_grooming", "eq", True), scope="any"), "select p.user_id from grooming_records v join pets p on p.id=v.pet_id"),
    ("tem medicação", F(R("care_medication", "eq", True)), "select user_id from events where type in ('medication','medicacao') and deleted_at is null"),
    ("atividade: últimos 7 dias", F(R("tutor_activity", "eq", "last_7d")), f"select user_id from {LAST} l where m >= {TS} - interval '7 days'"),
    ("atividade: 8 a 30 dias", F(R("tutor_activity", "eq", "d8_30")),
     f"select user_id from {LAST} l where m < {TS} - interval '7 days' and m >= {TS} - interval '30 days'"),
    ("atividade: mais de 30 dias", F(R("tutor_activity", "eq", "over_30d")), f"select user_id from {LAST} l where m < {TS} - interval '30 days'"),
    ("atividade: sem registro", F(R("tutor_activity", "eq", "no_events")), f"select id from users where id not in (select user_id from {LAST} l)"),
    ("estado cadastrado = SP", F(R("location_registered_state", "in", ["SP"])), f"select id from users where upper(trim(state))='SP' or {UNACC('state')}='sao paulo'"),
    ("cidade cadastrada = Belo Horizonte", F(R("location_registered_city", "in", ["Belo Horizonte"])), f"select id from users where {UNACC('city')}='belo horizonte'"),
    ("GPS a até 50 km de BH", F(R("location_gps_radius", "within_km", {"lat": BH[0], "lng": BH[1], "km": 50}, ack=True)),
     "select id from users where location_source='gps' and lat is not null and lng is not null and "
     + HAV.format(lat=BH[0], lng=BH[1]) + " <= 50"),
    ("geo-IP (última região) = São Paulo", F(R("location_geoip_region", "in", ["São Paulo"], ack=True)),
     f"select e.user_id from analytics_product_events e join (select user_id, max(received_at) m from analytics_product_events where user_id is not null "
     f"and region is not null and region<>'' and received_at <= {TS} group by 1) l on l.user_id=e.user_id and l.m=e.received_at "
     f"where e.region is not null and e.region<>'' and ({UNACC('e.region')} in ('sao paulo','sp'))"),
    ("COMBINADO: gato E ativo nos últimos 7 dias", F(R("tutor_species_mix", "in", ["has_cat"]), R("tutor_activity", "eq", "last_7d")),
     f"select user_id from pets where {SP}='cat' intersect select user_id from {LAST} l where m >= {TS} - interval '7 days'"),
    ("COMBINADO (OU): iPhone OU GPS perto de BH", F(R("platform", "in", ["ios"]), R("location_gps_radius", "within_km", {"lat": BH[0], "lng": BH[1], "km": 50}, ack=True), op="or"),
     "select user_id from native_push_tokens where disabled_at is null and platform='ios' union select id from users where location_source='gps' and lat is not null and lng is not null and "
     + HAV.format(lat=BH[0], lng=BH[1]) + " <= 50"),
]


def oracle(db, sql):
    row = db.execute(text(f"with m as ({sql}) select (select count(distinct user_id) from (select * from m) x(user_id)), "
                          f"(select count(distinct user_id) from (select * from m) x(user_id) where user_id in ({REACH}))")).one()
    return int(row[0]), int(row[1])


def one(db, sql):
    return int(db.execute(text(sql)).scalar())


def main() -> int:
    db = SessionLocal()
    db.execute(text("SET TRANSACTION READ ONLY"))
    print(f"banco: {args.database} | referência: {NOW.isoformat()} | transação SOMENTE LEITURA")
    try:                                                              # controle negativo: o banco TEM que recusar escrita
        db.execute(text("create temp table zz_probe(x int)"))
        print("!! ATENÇÃO: o banco aceitou escrita (controle negativo FALHOU)")
        return 2
    except (InternalError, ProgrammingError) as exc:
        db.rollback()
        db.execute(text("SET TRANSACTION READ ONLY"))
        print("controle negativo: escrita recusada pelo banco (read-only transaction) ✔")

    print("\n== 1) MOTOR × ORÁCULO SQL (matches / alcançáveis)")
    bad = 0
    for name, flt, sql in SCENARIOS:
        eng = pa.compute_audience(db, flt, now=NOW)
        o_m, o_r = oracle(db, sql)
        ok = (eng["matches"], eng["reachable"]) == (o_m, o_r)
        bad += not ok
        print(f"  {'✔' if ok else '✘'} {name:48s} motor {eng['matches']:5d}/{eng['reachable']:5d} | oráculo {o_m:5d}/{o_r:5d}")

    orf_web = one(db, "select count(distinct user_id) from push_subscriptions where disabled_at is null and user_id not in (select id from users)")
    orf_nat = one(db, "select count(distinct user_id) from native_push_tokens where disabled_at is null and user_id not in (select id from users)")
    print(f"\n== 1b) HIGIENE: aparelhos ATIVOS de contas que não existem mais: navegador {orf_web}, app {orf_nat} (o motor ignora; a 1ª auditoria contou)")
    print("\n== 2) UNIVERSO")
    base = pa.compute_audience(db, F(), now=NOW)
    print(f"  tutores {base['matches']} | alcançáveis {base['reachable']} | sem push {base['not_reachable']['no_push']} | opt-out com push {base['not_reachable']['opt_out']}")
    print(f"  alcançáveis por canal: {base['by_platform']}")

    print("\n== 3) COMPARAÇÃO COM A PRIMEIRA AUDITORIA (mesma cópia de 12/11)")
    ctx = pa.AudienceContext(db, NOW)
    rule_ids = lambda field, op, val: pa._RULES[field](ctx, pc.FilterRule(kind="rule", field=field, op=op, value=val)).ids
    rows = []
    def m(flt):
        return pa.compute_audience(db, flt, now=NOW)["matches"]
    care_any = pa.compute_audience(db, F(R("care_vaccine", "eq", True), R("care_parasite", "eq", True), R("care_grooming", "eq", True), op="or", scope="any"), now=NOW)["matches"]
    rows += [
        ("tutores", 2551, base["matches"]), ("alcançáveis por push", 1212, base["reachable"]),
        ("push iPhone", 736, m(F(R("platform", "in", ["ios"])))), ("push Android", 459, m(F(R("platform", "in", ["android"])))),
        ("push navegador", 32, m(F(R("platform", "in", ["web"])))),
        ("com gato", 253, m(F(R("tutor_species_mix", "in", ["has_cat"])))),
        ("com gata (fêmea)", 151, m(F(R("pet_species", "in", ["cat"]), R("pet_sex", "eq", "female"), scope="same"))),
        ("cão e gato", 55, m(F(R("tutor_species_mix", "in", ["dog_and_cat"])))), ("mais de um pet", 358, m(F(R("tutor_pet_count", "gte", 2)))),
        ("pets castrados = sim (PETS)", 898, len(rule_ids("pet_neutered_yes", "eq", True))),
        ("ração cadastrada (tutores)", 1259, m(F(R("feeding_registered", "eq", True), scope="any"))),
        ("vacina (tutores)", 591, m(F(R("care_vaccine", "eq", True), scope="any"))),
        ("vermífugo/antipulgas/coleira (tutores)", 473, m(F(R("care_parasite", "eq", True), scope="any"))),
        ("banho e tosa (tutores)", 298, m(F(R("care_grooming", "eq", True), scope="any"))),
        ("medicação (tutores)", 61, m(F(R("care_medication", "eq", True)))), ("algum cuidado (vacina/parasita/banho)", 853, care_any),
        ("cidade cadastrada", 167, sum(1 for r in ctx.users if pa.norm_text(r[2]))), ("estado cadastrado", 149, sum(1 for r in ctx.users if pa.norm_text(r[3]))),
        ("GPS (source=gps)", 822, sum(1 for r in ctx.users if r[6] == "gps" and r[4] is not None and r[5] is not None)),
    ]
    for name, first, now_v in rows:
        diff = now_v - first
        print(f"  {name:42s} 1ª auditoria {first:5d} | motor {now_v:5d} | {'igual' if diff == 0 else f'diferença {diff:+d}'}")
    print("  (a 1ª auditoria ignorou 'apagado' (deleted_at) e usou 'plano ativo' como ração cadastrada; o motor usa as definições do produto)")

    print("\n== 4) ATIVIDADE: quatro faixas distintas (data de referência exata)")
    tot = 0
    for band, label in (("last_7d", "últimos 7 dias"), ("d8_30", "8 a 30 dias"), ("over_30d", "mais de 30 dias"), ("no_events", "sem atividade registrada")):
        v = m(F(R("tutor_activity", "eq", band)))
        tot += v
        print(f"  {label:26s} {v:5d}")
    print(f"  soma {tot} (deve ser igual ao total de tutores: {'✔' if tot == base['matches'] else '✘'}) | 1ª auditoria (≥05/11: 617 · 13/10–04/11: 1107 · antes: 816 · sem evento: 11) usava cortes diferentes")
    bad += tot != base["matches"]

    print("\n== 5) DESEMPENHO (PostgreSQL, cópia local; mediana de 7 execuções)")
    n_events = one(db, "select count(*) from analytics_product_events")
    complex_flt = F(R("tutor_activity", "eq", "last_7d"), R("location_geoip_region", "in", ["São Paulo"], ack=True),
                    R("location_gps_radius", "within_km", {"lat": BH[0], "lng": BH[1], "km": 300}, ack=True), R("care_medication", "eq", True),
                    R("pet_species", "in", ["dog"]), R("pet_age_months", "gte", 6), R("pet_weight_kg", "between", [3, 40]), R("feeding_registered", "eq", True),
                    R("feeding_brand_contains", "contains", "premier"), R("care_vaccine", "eq", True), R("platform", "in", ["ios", "android"]), op="or", scope="any")
    for label, flt in (("sem filtro", F()), ("1 filtro simples (gato)", F(R("tutor_species_mix", "in", ["has_cat"]))), ("11 filtros combinados (OU)", complex_flt)):
        ts = []
        for _ in range(7):
            t0 = time.perf_counter()
            pa.compute_audience(db, flt, now=NOW)
            ts.append(time.perf_counter() - t0)
        print(f"  {label:30s} mediana {statistics.median(ts)*1000:7.0f} ms | máx {max(ts)*1000:7.0f} ms")
    t0 = time.perf_counter()
    sug = pa.brand_suggestions(db)
    print(f"  {'sugestões de marca':30s} {1000*(time.perf_counter()-t0):7.0f} ms ({len(sug)} sugestões) | eventos na tabela: {n_events}")
    print(f"  consultas por contagem complexa: ver transação única; tutores {base['matches']}, pets {len(ctx.pets)}")

    print("\n== 6) SESSÃO SOMENTE LEITURA DO ENDPOINT")
    rs = pa._read_only_session()
    try:
        rs.execute(text("create temp table zz_probe2(x int)"))
        print("  ✘ a sessão do endpoint aceitou escrita")
        bad += 1
    except (InternalError, ProgrammingError):
        print("  ✔ a sessão usada pelos endpoints recusa escrita no próprio banco")
    finally:
        rs.rollback(); rs.close()
    db.rollback()
    db.close()
    print("\nRESULTADO:", "TUDO CONFERE" if bad == 0 else f"{bad} DIVERGÊNCIA(S)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
