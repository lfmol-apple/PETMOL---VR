"""Avaliador de REFERÊNCIA dos filtros de campanha push — escrito de forma INDEPENDENTE do motor (src/admin/push_audience.py).

O motor combina CONJUNTOS (uma consulta por regra). Aqui a decisão é TUTOR POR TUTOR, com booleanos, sobre dados em Python puro
(sem banco). Se as duas formulações divergirem em qualquer das centenas de filtros aleatórios do teste diferencial, há defeito
em uma delas. Não importa nada de src/admin/push_audience.py (de propósito)."""
from __future__ import annotations

import math
import random
import unicodedata
import uuid
from datetime import date, datetime, timedelta, timezone

NOW = datetime(2026, 11, 12, 4, 15, tzinfo=timezone.utc)

# ── normalização independente ────────────────────────────────────────────────

def n(s):
    s = unicodedata.normalize("NFD", s or "")
    return " ".join("".join(c for c in s if unicodedata.category(c) != "Mn").lower().split())


STATE = {"sp": "SP", "sao paulo": "SP", "mg": "MG", "minas gerais": "MG", "rj": "RJ", "rio de janeiro": "RJ", "pr": "PR", "parana": "PR",
         "ba": "BA", "bahia": "BA", "rs": "RS", "rio grande do sul": "RS"}


def st(s):
    k = n(s)
    return STATE.get(k, k)


def hav(lat1, lng1, lat2, lng2):
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def species_of(s):
    k = n(s)
    return k if k in ("dog", "cat") else "other"


# ── regras (cada uma recebe o tutor `u` ou o pet `p` e devolve bool) ─────────

def activity_bucket(u):
    evs = [t for t in u["events"] if t <= NOW]
    if not evs:
        return "no_events"
    age = (NOW - max(evs)).total_seconds()
    if age <= 7 * 86400:
        return "last_7d"
    if age <= 30 * 86400:
        return "d8_30"
    return "over_30d"


def latest_region(u):
    rs = [(t, r) for t, r in u["regions"] if t <= NOW and r]
    return max(rs)[1] if rs else None


def configured(plan):
    if not plan or plan["deleted"]:
        return False
    items = bool(plan["items_json"] and plan["items_json"] not in ("[]", "", "null"))
    non_kibble = bool(plan["no_ctrl"] and plan["mode"] and plan["mode"] != "kibble" and not plan["brand"])
    return bool(items or plan["brand"] or plan["duration"] is not None or plan["end"] is not None or non_kibble)


def age_months(p):
    b = p["birth"]
    if b is None:
        return None
    t = NOW.date()
    m = (t.year * 12 + t.month) - (b.year * 12 + b.month)
    if t.day < b.day:
        m -= 1
    return m if m >= 0 else None


def weight_kg(p):
    w, unit = p["weight"], n(p["unit"])
    if not w or w <= 0:
        return None
    return float(w) if unit in ("kg", "kgs") else float(w) * 0.45359237 if unit in ("lb", "lbs") else None


def cmp(op, v, x):
    return {"eq": lambda: x == v, "gte": lambda: x >= v, "lte": lambda: x <= v, "between": lambda: v[0] <= x <= v[1]}[op]()


def rule_tutor(u, r):
    f, op, v = r["field"], r["op"], r["value"]
    if f == "tutor_created_at":
        d = u["created_at"].astimezone(timezone.utc).date()
        iso = lambda s: date.fromisoformat(str(s)[:10])
        return d >= iso(v) if op == "gte" else d <= iso(v) if op == "lte" else iso(v[0]) <= d <= iso(v[1])
    if f == "tutor_pet_count":
        return cmp(op, v, len(u["pets"]))
    if f == "tutor_species_mix":
        sp = {species_of(p["species"]) for p in u["pets"]}
        dog, cat, other = "dog" in sp, "cat" in sp, "other" in sp
        facts = {"has_dog": dog, "has_cat": cat, "dog_and_cat": dog and cat, "dog_only": dog and not cat and not other, "cat_only": cat and not dog and not other}
        return any(facts[x] for x in v)
    if f == "tutor_activity":
        return activity_bucket(u) == (v if isinstance(v, str) else v[0])
    if f == "platform":
        have = {p: active(u, p) for p in ("web", "ios", "android")}
        return any(have[x] for x in v)
    if f == "location_registered_state":
        return bool(n(u["state"])) and st(u["state"]) in {st(x) for x in v}
    if f == "location_registered_city":
        return bool(n(u["city"])) and n(u["city"]) in {n(x) for x in v}
    if f == "location_gps_radius":
        return u["loc_source"] == "gps" and u["lat"] is not None and u["lng"] is not None and hav(v["lat"], v["lng"], u["lat"], u["lng"]) <= v["km"]
    if f == "location_geoip_region":
        reg = latest_region(u)
        return reg is not None and st(reg) in {st(x) for x in v}
    if f == "care_medication":
        return u["medication"]
    raise AssertionError(f)


def rule_pet(p, r):
    f, op, v = r["field"], r["op"], r["value"]
    if f == "pet_species":
        return species_of(p["species"]) in v
    if f == "pet_sex":
        return n(p["sex"]) == v
    if f == "pet_breed_contains":
        return bool(n(p["breed"])) and n(v) in n(p["breed"])
    if f == "pet_age_months":
        m = age_months(p)
        return m is not None and cmp(op, v, m)
    if f == "pet_weight_kg":
        kg = weight_kg(p)
        return kg is not None and cmp(op, v, kg)
    if f == "pet_neutered_yes":
        return p["neutered"] is True
    if f == "feeding_registered":
        return configured(p["plan"])
    if f == "feeding_brand_contains":
        pl = p["plan"]
        return bool(pl) and not pl["deleted"] and bool(n(pl["brand"])) and n(v) in n(pl["brand"])
    if f == "care_vaccine":
        return any(not d for d in p["vaccines"])
    if f == "care_parasite":
        return p["parasites"] > 0
    if f == "care_grooming":
        return p["groomings"] > 0
    raise AssertionError(f)


PET_FIELDS = {"pet_species", "pet_sex", "pet_breed_contains", "pet_age_months", "pet_weight_kg", "pet_neutered_yes", "feeding_registered",
              "feeding_brand_contains", "care_vaccine", "care_parasite", "care_grooming"}


def holds(u, g):
    items = g["items"]
    if not items:
        return True
    combine = all if g.get("op", "and") == "and" else any
    flags = []
    pet_rules = []
    for it in items:
        if it["kind"] == "group":
            flags.append(holds(u, it))
        elif it["field"] in PET_FIELDS:
            pet_rules.append(it)
        else:
            flags.append(rule_tutor(u, it))
    if pet_rules:
        scope, pets = g["pet_scope"], u["pets"]
        if scope == "any":
            flags += [any(rule_pet(p, r) for p in pets) for r in pet_rules]
        elif scope == "same":
            flags.append(any(combine(rule_pet(p, r) for r in pet_rules) for p in pets))
        else:   # all: precisa ter pelo menos um pet
            flags.append(bool(pets) and all(combine(rule_pet(p, r) for r in pet_rules) for p in pets))
    return combine(flags)


def active(u, plat):
    return bool(u[plat]) and not u[plat + "_disabled"]


def reachable(u):
    return any(active(u, p) for p in ("web", "ios", "android")) and not u["opted_out"]


def evaluate(users, filt):
    matches = {u["id"] for u in users if holds(u, filt["root"])}
    return matches, {u["id"] for u in users if u["id"] in matches and reachable(u)}


# ── gerador de dados sintéticos ─────────────────────────────────────────────

CITIES = ["São Paulo", "sao paulo", "Belo Horizonte", "BELO HORIZONTE", "Curitiba", "Salvador", None, "", "  "]
STATES = ["SP", "sp", "Minas Gerais", "MG", "Rio de Janeiro", "PR", "Bahia", None, ""]
REGIONS = ["São Paulo", "Minas Gerais", "Rio de Janeiro", "Paraná", "Bahia", "Ontario", None]
SPECIES = ["dog", "Dog", "CAT", "cat", "hamster", "fish", "dog "]
BREEDS = ["Shih-tzu", "Pinscher", "Siamês", "Sem raça definida", "Golden Retriever", "SRD", "", None, "Persa"]
BRANDS = ["Premier Ração Cães", "Fórmula Natural Fresh", "golden gatos", "Ração Special Dog", "", None, "Quatree"]


def make_users(rng: random.Random, n_users=120):
    users = []
    for i in range(n_users):
        pets = []
        for j in range(rng.choice([0, 0, 1, 1, 1, 2, 2, 3, 5])):
            has_plan = rng.random() < 0.6
            pets.append({
                "id": str(uuid.uuid4()), "species": rng.choice(SPECIES), "sex": rng.choice(["male", "female", "Male", None, "", "male", "female"]),
                "breed": rng.choice(BREEDS),
                "birth": rng.choice([None, date(2026, 11, 12), date(2026, 10, 13), date(2024, 5, 31), date(2019, 1, 1), date(2015, 7, 20), date(2030, 1, 1)]),
                "weight": rng.choice([None, 0, 2.5, 7.0, 12.3, 30, 45]), "unit": rng.choice(["kg", "KG", "lb", None, "", "stone"]),
                "neutered": rng.choice([True, False, False, None]),
                "plan": ({"brand": rng.choice(BRANDS), "items_json": rng.choice(["[]", "[]", '[{"a":1}]', None, "null"]),
                          "duration": rng.choice([None, None, 30]), "end": rng.choice([None, date(2026, 12, 1)]),
                          "mode": rng.choice(["kibble", "natural", None]), "no_ctrl": rng.random() < 0.4, "deleted": rng.random() < 0.2}
                         if has_plan else None),
                "vaccines": [rng.random() < 0.3 for _ in range(rng.choice([0, 0, 1, 2]))],
                "parasites": rng.choice([0, 0, 1]), "groomings": rng.choice([0, 0, 0, 1]),
            })
        loc = rng.choice(["gps", "gps", "city", None])
        evs = sorted(NOW - timedelta(hours=rng.choice([1, 24, 24 * 6 + 23, 24 * 7, 24 * 7 + 1, 24 * 20, 24 * 30, 24 * 30 + 1, 24 * 90, -5]) + k)
                     for k in range(rng.choice([0, 0, 1, 3])))
        users.append({
            "id": str(uuid.uuid4()), "created_at": NOW - timedelta(days=rng.choice([0, 1, 10, 30, 100, 400])),
            "city": rng.choice(CITIES), "state": rng.choice(STATES), "loc_source": loc,
            "lat": (None if loc is None else -19.92 + rng.uniform(-1.5, 1.5)), "lng": (None if loc is None else -43.94 + rng.uniform(-1.5, 1.5)),
            "web": rng.random() < 0.35, "ios": rng.random() < 0.3, "android": rng.random() < 0.25,
            "web_disabled": rng.random() < 0.2, "ios_disabled": rng.random() < 0.15, "android_disabled": rng.random() < 0.15,
            "opted_out": rng.random() < 0.12,
            "pets": pets, "events": evs,
            "regions": [(t, rng.choice(REGIONS)) for t in evs[:2]], "medication": rng.random() < 0.15,
        })
        # eventos com a mesma data não podem empatar entre regiões (a escolha do "mais recente" precisa ser única)
        users[-1]["regions"] = [(t + timedelta(seconds=idx), r) for idx, (t, r) in enumerate(users[-1]["regions"])]
        users[-1]["events"] += [t for t, _ in users[-1]["regions"]]
    return users


def gen_rule(rng: random.Random, field: str) -> dict:
    ack = {"approximate_ack": True}
    if field == "tutor_created_at":
        op = rng.choice(["gte", "lte", "between"])
        d = ["2026-11-12", "2026-11-01", "2026-08-01", "2025-10-08"]
        return {"kind": "rule", "field": field, "op": op, "value": rng.choice(d) if op != "between" else sorted(rng.sample(d, 2))}
    if field == "tutor_pet_count":
        op = rng.choice(["eq", "gte", "lte", "between"])
        return {"kind": "rule", "field": field, "op": op, "value": rng.randint(0, 4) if op != "between" else sorted([rng.randint(0, 2), rng.randint(2, 5)])}
    if field == "tutor_species_mix":
        return {"kind": "rule", "field": field, "op": "in", "value": rng.sample(["dog_only", "cat_only", "dog_and_cat", "has_dog", "has_cat"], rng.randint(1, 3))}
    if field == "tutor_activity":
        return {"kind": "rule", "field": field, "op": "eq", "value": rng.choice(["last_7d", "d8_30", "over_30d", "no_events"])}
    if field == "platform":
        return {"kind": "rule", "field": field, "op": "in", "value": rng.sample(["ios", "android", "web"], rng.randint(1, 3))}
    if field == "location_registered_state":
        return {"kind": "rule", "field": field, "op": "in", "value": rng.sample(["SP", "sao paulo", "Minas Gerais", "rj", "BAHIA"], rng.randint(1, 3))}
    if field == "location_registered_city":
        return {"kind": "rule", "field": field, "op": "in", "value": rng.sample(["Sao Paulo", "belo horizonte", "CURITIBA", "Salvador"], rng.randint(1, 3))}
    if field == "location_gps_radius":
        return {"kind": "rule", "field": field, "op": "within_km", "value": {"lat": -19.92 + rng.uniform(-0.5, 0.5), "lng": -43.94 + rng.uniform(-0.5, 0.5), "km": rng.choice([5, 50, 120, 300])}, **ack}
    if field == "location_geoip_region":
        return {"kind": "rule", "field": field, "op": "in", "value": rng.sample(["São Paulo", "minas gerais", "RJ", "Ontario", "Paraná"], rng.randint(1, 2)), **ack}
    if field == "care_medication":
        return {"kind": "rule", "field": field, "op": "eq", "value": True}
    if field == "pet_species":
        return {"kind": "rule", "field": field, "op": "in", "value": rng.sample(["dog", "cat", "other"], rng.randint(1, 2))}
    if field == "pet_sex":
        return {"kind": "rule", "field": field, "op": "eq", "value": rng.choice(["male", "female"])}
    if field == "pet_breed_contains":
        return {"kind": "rule", "field": field, "op": "contains", "value": rng.choice(["siam", "SHIH", "pinsc", "sem raca", "xyzw", "golden", "SRD"])}
    if field == "pet_age_months":
        op = rng.choice(["gte", "lte", "between"])
        return {"kind": "rule", "field": field, "op": op, "value": rng.choice([0, 1, 12, 60, 120]) if op != "between" else sorted([rng.randint(0, 20), rng.randint(20, 200)])}
    if field == "pet_weight_kg":
        op = rng.choice(["gte", "lte", "between"])
        return {"kind": "rule", "field": field, "op": op, "value": rng.choice([1, 3, 10, 30]) if op != "between" else sorted([rng.randint(0, 5), rng.randint(5, 50)])}
    if field == "pet_neutered_yes":
        return {"kind": "rule", "field": field, "op": "eq", "value": True}
    if field == "feeding_registered":
        return {"kind": "rule", "field": field, "op": "eq", "value": True}
    if field == "feeding_brand_contains":
        return {"kind": "rule", "field": field, "op": "contains", "value": rng.choice(["premier", "FORMULA", "golden", "racao", "quatree", "zzzz"])}
    if field in ("care_vaccine", "care_parasite", "care_grooming"):
        return {"kind": "rule", "field": field, "op": "eq", "value": True}
    raise AssertionError(field)


ALL_FIELDS = sorted(PET_FIELDS | {"tutor_created_at", "tutor_pet_count", "tutor_species_mix", "tutor_activity", "platform", "location_registered_state",
                                  "location_registered_city", "location_gps_radius", "location_geoip_region", "care_medication"})


def gen_group(rng: random.Random, depth=1) -> dict:
    items = []
    for _ in range(rng.randint(0, 4)):
        if depth < 3 and rng.random() < 0.2:
            items.append(gen_group(rng, depth + 1))
        else:
            items.append(gen_rule(rng, rng.choice(ALL_FIELDS)))
    g = {"kind": "group", "op": rng.choice(["and", "or"]), "items": items}
    if any(i["kind"] == "rule" and i["field"] in PET_FIELDS for i in items):
        g["pet_scope"] = rng.choice(["any", "same", "all"])
    return g


def gen_filter(rng: random.Random) -> dict:
    return {"version": 1, "root": gen_group(rng)}
