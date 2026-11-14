"""Campanhas push — ETAPA 2: motor de segmentação e contagem de destinatários. SOMENTE LEITURA.

Nada aqui envia notificação, reserva destinatário, cria campanha ou escreve no banco. Os endpoints ficam atrás da flag
`push_campaigns_enabled` (desligada por padrão ⇒ 404).

SEMÂNTICA (documentada para a etapa 3 reutilizar EXATAMENTE a mesma função, `resolve_audience`, na reserva do lote):

1. O motor trabalha com CONJUNTOS. Cada regra vira uma consulta simples que devolve um conjunto de tutores (regra de tutor) ou de
   pets (regra de pet); o E/OU combina conjuntos. Resultado determinístico: mesmos dados + mesma data de referência ⇒ mesmo conjunto.
2. TUTOR ÚNICO: o resultado é um conjunto de ids de tutor. Vários pets ou vários aparelhos nunca contam duas vezes.
3. Grupo vazio = sem restrição (todos os tutores). Grupo E = interseção; grupo OU = união.
4. VÁRIOS PETS — num grupo com regras de pet, `pet_scope` decide:
     any  — "algum pet atende": cada regra de pet é satisfeita por ALGUM pet (podem ser pets diferentes); E=interseção dos tutores, OU=união.
     same — "o MESMO pet atende": um único pet cumpre todas as regras do grupo (E) ou alguma delas (OU).
     all  — "TODOS os pets atendem": todos os pets do tutor cumprem todas as regras (E) ou ao menos uma (OU). Exige ≥ 1 pet:
            tutor sem pet NÃO entra por vacuidade.
5. VALOR AUSENTE NUNCA CASA: idade sem nascimento, peso sem unidade (ou com unidade desconhecida), raça vazia, região sem registro etc.
   não satisfazem nenhuma condição positiva. (Não existe condição negativa nesta etapa: "castrado = não" e "dias restantes" ficam de fora.)
6. UNIVERSO ALCANÇÁVEL (fixo, igual ao do envio avulso): tutor com push ativo (navegador ou app) e que NÃO pediu para parar (opt-out).
   `matches` = quem atende aos filtros entre TODOS os tutores; `reachable` = matches ∩ universo alcançável.
7. CONTAGENS: matches · reachable · used (já na campanha, dentro deste público) · available = reachable − TODOS os já reservados na campanha
   (a regra de repetição é por campanha e independe dos filtros do lote) · next_batch.
8. LOCALIZAÇÃO — três origens DIFERENTES, nunca misturadas em silêncio (cada regra informa a origem e a precisão; combinar origens gera aviso):
     cadastro  — cidade/estado que o próprio tutor digitou (declarado; só ~6% dos tutores têm);
     gps       — última posição de GPS enviada pelo aparelho (`location_source='gps'`); aproximada, pode estar desatualizada;
     geoip     — região da ÚLTIMA sessão pelo IP; APROXIMADA, JAMAIS residência.
9. ATIVIDADE = eventos registrados no app (`analytics_product_events` com o tutor), NÃO necessariamente login. Faixas distintas:
   last_7d · d8_30 · over_30d · no_events (nunca teve evento — não é "inativo há mais de 30 dias").
   Faixas pela data do ÚLTIMO evento até a data de referência: [agora−7d, agora] · [agora−30d, agora−7d) · antes de agora−30d.
10. Texto (marca, raça, cidade…): sem diferenciar maiúsculas/minúsculas nem acentos; o valor cadastrado NUNCA é alterado (só a comparação normaliza).
11. DEFINIÇÕES DO PRODUTO reaproveitadas: "ração cadastrada" = `_feeding_configured_pet_ids` (o mesmo do painel); registros apagados (`deleted_at`) não contam.

LIMITES (documentados, não presumir que valem para sempre): o motor carrega tutores, pets e conjuntos de ids em memória a cada consulta.
Com ~2.500 tutores custa dezenas de ms. Há um teto explícito (`MAX_USERS_IN_MEMORY`); acima dele o motor RECUSA em vez de ficar lento.
Otimizações futuras, se a base crescer: cache curto dos conjuntos-base, pré-agregação da atividade por tutor, e empurrar para SQL as regras
mais seletivas (mantendo esta mesma semântica e o teste diferencial como guarda).
"""
from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from functools import cached_property
from typing import Callable, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, text

from ..db import SessionLocal
from ..events.models import Event
from ..health.models import FeedingPlan
from ..notifications import NativePushToken, PushSubscription
from ..pets.grooming_models import GroomingRecord
from ..pets.models import Pet
from ..pets.parasite_models import ParasiteControlRecord
from ..pets.vaccine_models import VaccineRecord
from ..analytics.models import AnalyticsProductEvent
from ..user_auth.models import User
from .activation_campaign_router import opted_out_ids
from .analytics.permissions_bi import has_any_push
from .analytics.queries import _feeding_configured_pet_ids
from .deps import get_current_admin
from .push_campaigns import (
    FILTER_FIELDS, AudienceFilter, FilterGroup, FilterRule, PushCampaign, PushCampaignRecipient, require_push_campaigns,
)

MAX_USERS_IN_MEMORY = 50_000
EARTH_RADIUS_KM = 6371.0088
LB_TO_KG = 0.45359237


class FilterError(ValueError):
    """Valor de filtro inválido (mensagem em português para o painel)."""


class AudienceTooLarge(RuntimeError):
    """Base acima do teto em que este motor (em memória) é seguro."""


class CampaignNotFound(LookupError):
    pass


# ── Normalização (só para COMPARAR; o dado original não muda) ────────────────

def norm_text(value: Optional[str]) -> str:
    s = unicodedata.normalize("NFKD", str(value or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s.casefold()).strip()


_STATES = {
    "ac": "AC", "acre": "AC", "al": "AL", "alagoas": "AL", "ap": "AP", "amapa": "AP", "am": "AM", "amazonas": "AM", "ba": "BA", "bahia": "BA",
    "ce": "CE", "ceara": "CE", "df": "DF", "distrito federal": "DF", "es": "ES", "espirito santo": "ES", "go": "GO", "goias": "GO",
    "ma": "MA", "maranhao": "MA", "mt": "MT", "mato grosso": "MT", "ms": "MS", "mato grosso do sul": "MS", "mg": "MG", "minas gerais": "MG",
    "pa": "PA", "para": "PA", "pb": "PB", "paraiba": "PB", "pr": "PR", "parana": "PR", "pe": "PE", "pernambuco": "PE", "pi": "PI", "piaui": "PI",
    "rj": "RJ", "rio de janeiro": "RJ", "rn": "RN", "rio grande do norte": "RN", "rs": "RS", "rio grande do sul": "RS", "ro": "RO", "rondonia": "RO",
    "rr": "RR", "roraima": "RR", "sc": "SC", "santa catarina": "SC", "sp": "SP", "sao paulo": "SP", "se": "SE", "sergipe": "SE", "to": "TO", "tocantins": "TO",
}


def norm_state(value: Optional[str]) -> str:
    """'São Paulo' e 'sp' → 'SP'. Texto que não é estado brasileiro fica normalizado (ex.: região estrangeira do geo-IP)."""
    n = norm_text(value)
    return _STATES.get(n, n)


def _species(value: Optional[str]) -> str:
    n = norm_text(value)
    return n if n in ("dog", "cat") else "other"


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def age_in_months(birth, today) -> Optional[int]:
    """Meses completos. Nascimento no futuro (dado errado) → None (não casa)."""
    if birth is None:
        return None
    months = (today.year - birth.year) * 12 + (today.month - birth.month) - (1 if today.day < birth.day else 0)
    return months if months >= 0 else None


# ── Metadados dos campos (origem e grupo na tela) ────────────────────────────

FIELD_META: dict[str, dict] = {
    "tutor_created_at": {"group": "Tutor", "origin": "Cadastro do tutor", "precision": "exata"},
    "tutor_pet_count": {"group": "Tutor", "origin": "Pets cadastrados", "precision": "exata"},
    "tutor_species_mix": {"group": "Tutor", "origin": "Pets cadastrados", "precision": "exata"},
    "tutor_activity": {"group": "Engajamento", "origin": "Eventos registrados no app (não é login)", "precision": "registro de eventos"},
    "platform": {"group": "Engajamento", "origin": "Aparelho com push ativo", "precision": "exata"},
    "pet_species": {"group": "Pet", "origin": "Cadastro do pet", "precision": "exata"},
    "pet_sex": {"group": "Pet", "origin": "Cadastro do pet", "precision": "declarada"},
    "pet_breed_contains": {"group": "Pet", "origin": "Cadastro do pet (texto livre)", "precision": "declarada"},
    "pet_age_months": {"group": "Pet", "origin": "Data de nascimento cadastrada", "precision": "declarada"},
    "pet_weight_kg": {"group": "Pet", "origin": "Peso cadastrado (kg ou lb)", "precision": "declarada"},
    "pet_neutered_yes": {"group": "Pet", "origin": "Cadastro do pet (só 'sim' é confiável)", "precision": "declarada"},
    "location_registered_state": {"group": "Localização", "origin": "cadastro", "precision": "declarada pelo tutor"},
    "location_registered_city": {"group": "Localização", "origin": "cadastro", "precision": "declarada pelo tutor"},
    "location_gps_radius": {"group": "Localização", "origin": "gps", "precision": "aproximada (última posição do GPS)"},
    "location_geoip_region": {"group": "Localização", "origin": "geoip", "precision": "aproximada (IP, não é residência)"},
    "feeding_registered": {"group": "Alimentação", "origin": "Ração cadastrada (definição do produto)", "precision": "declarada"},
    "feeding_brand_contains": {"group": "Alimentação", "origin": "Campo 'marca' da ração (texto livre: marca + produto)", "precision": "declarada"},
    "care_vaccine": {"group": "Cuidados", "origin": "Registros de vacina", "precision": "declarada"},
    "care_parasite": {"group": "Cuidados", "origin": "Registros de vermífugo/antipulgas/coleira", "precision": "declarada"},
    "care_grooming": {"group": "Cuidados", "origin": "Registros de banho e tosa", "precision": "declarada"},
    "care_medication": {"group": "Cuidados", "origin": "Medicações cadastradas", "precision": "declarada"},
}
_LOCATION_ORIGINS = {"location_registered_state": "cadastro", "location_registered_city": "cadastro",
                     "location_gps_radius": "gps", "location_geoip_region": "geoip"}
_ORIGIN_LABEL = {"cadastro": "cidade/estado digitados pelo tutor", "gps": "GPS do aparelho (última posição enviada)",
                 "geoip": "região aproximada pelo IP da última sessão"}
assert set(FIELD_META) == set(FILTER_FIELDS), "FIELD_META precisa cobrir exatamente os filtros disponíveis"


# ── Validação dos VALORES (a forma já é validada por AudienceFilter) ─────────

def _to_dt(value, label: str) -> datetime:
    try:
        raw = str(value).strip()
        dt = datetime.fromisoformat(raw[:10]) if len(raw) <= 10 else datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        raise FilterError(f"{label}: use uma data válida (AAAA-MM-DD).")
    return _aware(dt)  # type: ignore[return-value]


def _num(value, label: str, *, integer: bool = False, minimum: float = 0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise FilterError(f"{label}: informe um número.")
    if value < minimum or (integer and int(value) != value):
        raise FilterError(f"{label}: valor inválido.")
    return value


def validate_filter_values(flt: AudienceFilter) -> None:
    """Confere os valores de cada regra (datas, números, listas de texto). Levanta FilterError."""
    for rule in _iter_rules(flt.root):
        spec = FILTER_FIELDS[rule.field]
        label = spec["label"]
        if rule.field == "tutor_created_at":
            for v in (rule.value if isinstance(rule.value, list) else [rule.value]):
                _to_dt(v, label)
        elif rule.field in ("tutor_pet_count",):
            for v in (rule.value if isinstance(rule.value, list) else [rule.value]):
                _num(v, label, integer=True)
        elif rule.field in ("pet_age_months", "pet_weight_kg"):
            for v in (rule.value if isinstance(rule.value, list) else [rule.value]):
                _num(v, label)
        elif rule.field in ("location_registered_state", "location_registered_city", "location_geoip_region"):
            vals = rule.value if isinstance(rule.value, list) else []
            if not vals or len(vals) > 30 or any(not isinstance(v, str) or not norm_text(v) or len(v) > 80 for v in vals):
                raise FilterError(f"{label}: informe de 1 a 30 valores de texto.")
        elif rule.op == "contains" and len(norm_text(rule.value)) < 2:
            raise FilterError(f"{label}: texto curto demais.")
        if rule.op == "between":
            lo, hi = rule.value
            if rule.field == "tutor_created_at":
                if _to_dt(lo, label) > _to_dt(hi, label):
                    raise FilterError(f"{label}: o início vem depois do fim.")
            elif lo > hi:
                raise FilterError(f"{label}: o mínimo é maior que o máximo.")


def _iter_rules(group: FilterGroup):
    for it in group.items:
        if isinstance(it, FilterGroup):
            yield from _iter_rules(it)
        else:
            yield it


# ── Contexto: cada tabela é lida UMA vez por consulta ───────────────────────

@dataclass
class _Cov:
    with_data: int
    total: int
    unit: str   # "tutores" | "pets"


class AudienceContext:
    def __init__(self, db, now: Optional[datetime] = None):
        self.db = db
        self.now = _aware(now) or _utcnow()

    @cached_property
    def users(self) -> list:
        rows = self.db.query(User.id, User.created_at, User.city, User.state, User.lat, User.lng, User.location_source).all()
        if len(rows) > MAX_USERS_IN_MEMORY:
            raise AudienceTooLarge(f"{len(rows)} tutores: acima do teto de {MAX_USERS_IN_MEMORY} deste motor.")
        return rows

    @cached_property
    def all_users(self) -> set[str]:
        return {str(r[0]) for r in self.users}

    @cached_property
    def pets(self) -> list:
        # Colunas explícitas: NUNCA carregar `photo` (base64 grande).
        return [r for r in self.db.query(Pet.id, Pet.user_id, Pet.species, Pet.sex, Pet.breed, Pet.birth_date,
                                         Pet.weight_value, Pet.weight_unit, Pet.neutered).all()]

    @cached_property
    def pets_by_user(self) -> dict[str, list]:
        out: dict[str, list] = defaultdict(list)
        for p in self.pets:
            out[str(p.user_id)].append(p)
        return out

    @cached_property
    def pet_owner(self) -> dict[str, str]:
        return {str(p.id): str(p.user_id) for p in self.pets}

    @cached_property
    def push_users(self) -> set[str]:
        return {str(u) for (u,) in self.db.query(User.id).filter(has_any_push(User.id)).all()}

    @cached_property
    def opted_out(self) -> set[str]:
        return {str(u) for u in opted_out_ids(self.db)}

    @cached_property
    def reachable_universe(self) -> set[str]:
        return (self.push_users - self.opted_out) & self.all_users

    def platform_users(self, platform: str) -> set[str]:
        if platform == "web":
            q = self.db.query(PushSubscription.user_id).filter(PushSubscription.disabled_at.is_(None))
        else:
            q = self.db.query(NativePushToken.user_id).filter(NativePushToken.disabled_at.is_(None), NativePushToken.platform == platform)
        return {str(u) for (u,) in q.distinct().all()}

    @cached_property
    def last_event(self) -> dict[str, datetime]:
        rows = (self.db.query(AnalyticsProductEvent.user_id, func.max(AnalyticsProductEvent.received_at))
                .filter(AnalyticsProductEvent.user_id.is_not(None), AnalyticsProductEvent.received_at <= self.now)
                .group_by(AnalyticsProductEvent.user_id).all())
        return {str(u): _aware(m) for u, m in rows if m is not None}

    def users_with_any_pet_in(self, pet_ids: set[str]) -> set[str]:
        return {self.pet_owner[p] for p in pet_ids if p in self.pet_owner}

    def users_with_all_pets_in(self, pet_ids: set[str]) -> set[str]:
        return {u for u, plist in self.pets_by_user.items() if plist and all(str(p.id) in pet_ids for p in plist)}


@dataclass
class _Outcome:
    kind: str                       # "tutor" (ids = tutores) | "pet" (ids = pets)
    ids: set[str]
    cov: Optional[_Cov] = None
    extra: dict = field(default_factory=dict)


def _cmp(op: str, value, x) -> bool:
    if op == "eq":
        return x == value
    if op == "gte":
        return x >= value
    if op == "lte":
        return x <= value
    if op == "between":
        return value[0] <= x <= value[1]
    raise FilterError("Operação inválida.")


def _scalar_bounds(rule: FilterRule, conv: Callable):
    v = rule.value
    return [conv(i) for i in v] if isinstance(v, list) else conv(v)


# ── Regras: uma por filtro ──────────────────────────────────────────────────

def _r_tutor_created_at(ctx: AudienceContext, rule: FilterRule) -> _Outcome:
    def lo(v):   # data inicial inclusive (00:00 UTC)
        return _to_dt(v, "data")

    def hi(v):   # data final inclusive (até o fim do dia)
        return _to_dt(v, "data") + timedelta(days=1)
    ids = set()
    for r in ctx.users:
        c = _aware(r[1])
        if c is None:
            continue
        if rule.op == "gte":
            ok = c >= lo(rule.value)
        elif rule.op == "lte":
            ok = c < hi(rule.value)
        else:
            ok = lo(rule.value[0]) <= c < hi(rule.value[1])
        if ok:
            ids.add(str(r[0]))
    return _Outcome("tutor", ids, _Cov(sum(1 for r in ctx.users if r[1] is not None), len(ctx.users), "tutores"))


def _r_tutor_pet_count(ctx: AudienceContext, rule: FilterRule) -> _Outcome:
    v = _scalar_bounds(rule, int)
    return _Outcome("tutor", {u for u in ctx.all_users if _cmp(rule.op, v, len(ctx.pets_by_user.get(u, [])))},
                    _Cov(len(ctx.all_users), len(ctx.all_users), "tutores"))


def _r_tutor_species_mix(ctx: AudienceContext, rule: FilterRule) -> _Outcome:
    wanted = set(rule.value)
    ids = set()
    for u, plist in ctx.pets_by_user.items():
        sp = {_species(p.species) for p in plist}
        has_dog, has_cat, has_other = "dog" in sp, "cat" in sp, "other" in sp
        facts = {"has_dog": has_dog, "has_cat": has_cat, "dog_and_cat": has_dog and has_cat,
                 "dog_only": has_dog and not has_cat and not has_other, "cat_only": has_cat and not has_dog and not has_other}
        if any(facts[w] for w in wanted):
            ids.add(u)
    return _Outcome("tutor", ids & ctx.all_users, _Cov(len(ctx.pets_by_user), len(ctx.all_users), "tutores"))


def _bucket(last: Optional[datetime], now: datetime) -> str:
    if last is None:
        return "no_events"
    if last >= now - timedelta(days=7):
        return "last_7d"
    if last >= now - timedelta(days=30):
        return "d8_30"
    return "over_30d"


def _r_tutor_activity(ctx: AudienceContext, rule: FilterRule) -> _Outcome:
    want = rule.value if isinstance(rule.value, str) else rule.value[0]
    ids = {u for u in ctx.all_users if _bucket(ctx.last_event.get(u), ctx.now) == want}
    return _Outcome("tutor", ids, _Cov(len(ctx.last_event), len(ctx.all_users), "tutores"))


def _r_platform(ctx: AudienceContext, rule: FilterRule) -> _Outcome:
    ids: set[str] = set()
    for p in rule.value:
        ids |= ctx.platform_users(p)
    return _Outcome("tutor", ids & ctx.all_users, _Cov(len(ctx.push_users), len(ctx.all_users), "tutores"))


def _r_state(ctx: AudienceContext, rule: FilterRule) -> _Outcome:
    wanted = {norm_state(v) for v in rule.value}
    ids = {str(r[0]) for r in ctx.users if norm_text(r[3]) and norm_state(r[3]) in wanted}
    return _Outcome("tutor", ids, _Cov(sum(1 for r in ctx.users if norm_text(r[3])), len(ctx.users), "tutores"))


def _r_city(ctx: AudienceContext, rule: FilterRule) -> _Outcome:
    wanted = {norm_text(v) for v in rule.value}
    ids = {str(r[0]) for r in ctx.users if norm_text(r[2]) and norm_text(r[2]) in wanted}
    return _Outcome("tutor", ids, _Cov(sum(1 for r in ctx.users if norm_text(r[2])), len(ctx.users), "tutores"))


def _r_gps(ctx: AudienceContext, rule: FilterRule) -> _Outcome:
    c = rule.value
    gps = [r for r in ctx.users if r[6] == "gps" and r[4] is not None and r[5] is not None]
    ids = {str(r[0]) for r in gps if haversine_km(c["lat"], c["lng"], float(r[4]), float(r[5])) <= c["km"]}
    return _Outcome("tutor", ids, _Cov(len(gps), len(ctx.users), "tutores"))


def _latest_region_by_user(ctx: AudienceContext) -> dict[str, str]:
    db = ctx.db
    sub = (db.query(AnalyticsProductEvent.user_id.label("uid"), func.max(AnalyticsProductEvent.received_at).label("m"))
           .filter(AnalyticsProductEvent.user_id.is_not(None), AnalyticsProductEvent.region.is_not(None),
                   AnalyticsProductEvent.region != "", AnalyticsProductEvent.received_at <= ctx.now)
           .group_by(AnalyticsProductEvent.user_id).subquery())
    rows = (db.query(AnalyticsProductEvent.user_id, AnalyticsProductEvent.region)
            .join(sub, (AnalyticsProductEvent.user_id == sub.c.uid) & (AnalyticsProductEvent.received_at == sub.c.m))
            .filter(AnalyticsProductEvent.region.is_not(None), AnalyticsProductEvent.region != "").all())
    out: dict[str, str] = {}
    for uid, region in sorted(rows, key=lambda r: (str(r[0]), norm_text(r[1]))):   # empate de horário: escolha determinística
        out.setdefault(str(uid), region)
    return out


def _r_geoip(ctx: AudienceContext, rule: FilterRule) -> _Outcome:
    wanted = {norm_state(v) for v in rule.value}
    latest = _latest_region_by_user(ctx)
    ids = {u for u, region in latest.items() if norm_state(region) in wanted} & ctx.all_users
    return _Outcome("tutor", ids, _Cov(len(latest), len(ctx.all_users), "tutores"))


def _r_care_medication(ctx: AudienceContext, rule: FilterRule) -> _Outcome:
    rows = ctx.db.query(Event.user_id).filter(Event.type.in_(("medication", "medicacao")), Event.deleted_at.is_(None)).distinct().all()
    ids = {str(u) for (u,) in rows} & ctx.all_users
    return _Outcome("tutor", ids, _Cov(len(ids), len(ctx.all_users), "tutores"))


def _pet_cov(ctx: AudienceContext, with_data: int) -> _Cov:
    return _Cov(with_data, len(ctx.pets), "pets")


def _r_pet_species(ctx, rule):
    wanted = set(rule.value)
    return _Outcome("pet", {str(p.id) for p in ctx.pets if _species(p.species) in wanted}, _pet_cov(ctx, len(ctx.pets)))


def _r_pet_sex(ctx, rule):
    ids = {str(p.id) for p in ctx.pets if norm_text(p.sex) == rule.value}
    return _Outcome("pet", ids, _pet_cov(ctx, sum(1 for p in ctx.pets if norm_text(p.sex) in ("male", "female"))))


def _r_pet_breed(ctx, rule):
    needle = norm_text(rule.value)
    ids = {str(p.id) for p in ctx.pets if norm_text(p.breed) and needle in norm_text(p.breed)}
    return _Outcome("pet", ids, _pet_cov(ctx, sum(1 for p in ctx.pets if norm_text(p.breed))))


def _r_pet_age(ctx, rule):
    v = _scalar_bounds(rule, float)
    today = ctx.now.date()
    ids, with_data = set(), 0
    for p in ctx.pets:
        m = age_in_months(p.birth_date, today)
        if m is None:
            continue
        with_data += 1
        if _cmp(rule.op, v, m):
            ids.add(str(p.id))
    return _Outcome("pet", ids, _pet_cov(ctx, with_data))


def _weight_kg(p) -> Optional[float]:
    if p.weight_value is None or p.weight_value <= 0:
        return None
    unit = norm_text(p.weight_unit)
    if unit in ("kg", "kgs"):
        kg = float(p.weight_value)
    elif unit in ("lb", "lbs"):
        kg = float(p.weight_value) * LB_TO_KG
    else:
        return None        # sem unidade (ou desconhecida): ausente, não casa
    return round(kg, 2)    # o peso vale com 2 casas (0,01 kg): as faixas da tela (…9,99 | 10…24,99 | 25…) nunca deixam lacuna nem se sobrepõem


def _r_pet_weight(ctx, rule):
    v = _scalar_bounds(rule, float)
    ids, with_data = set(), 0
    for p in ctx.pets:
        kg = _weight_kg(p)
        if kg is None:
            continue
        with_data += 1
        if _cmp(rule.op, v, kg):
            ids.add(str(p.id))
    without_unit = sum(1 for p in ctx.pets if p.weight_value and p.weight_value > 0 and _weight_kg(p) is None)
    return _Outcome("pet", ids, _pet_cov(ctx, with_data), {"weight_without_unit": without_unit})


def _r_pet_neutered(ctx, rule):
    ids = {str(p.id) for p in ctx.pets if p.neutered is True}
    return _Outcome("pet", ids, _pet_cov(ctx, len(ids)))


def _r_feeding_registered(ctx, rule):
    ids = {str(p) for p in _feeding_configured_pet_ids(ctx.db)} & set(ctx.pet_owner)
    return _Outcome("pet", ids, _pet_cov(ctx, len(ids)))


def _r_feeding_brand(ctx, rule):
    needle = norm_text(rule.value)
    plans = ctx.db.query(FeedingPlan.pet_id, FeedingPlan.food_brand).filter(FeedingPlan.deleted_at.is_(None)).all()
    ids = {str(pid) for pid, brand in plans if norm_text(brand) and needle in norm_text(brand)} & set(ctx.pet_owner)
    return _Outcome("pet", ids, _Cov(sum(1 for _, b in plans if norm_text(b)), len(plans), "planos de ração"))


def _care_ids(ctx, model) -> set[str]:
    q = ctx.db.query(model.pet_id)
    if hasattr(model, "deleted_at"):
        q = q.filter(model.deleted_at.is_(None))
    return {str(p) for (p,) in q.distinct().all()} & set(ctx.pet_owner)


def _r_care(model):
    def run(ctx, rule):
        ids = _care_ids(ctx, model)
        return _Outcome("pet", ids, _pet_cov(ctx, len(ids)))
    return run


_RULES: dict[str, Callable[[AudienceContext, FilterRule], _Outcome]] = {
    "tutor_created_at": _r_tutor_created_at, "tutor_pet_count": _r_tutor_pet_count, "tutor_species_mix": _r_tutor_species_mix,
    "tutor_activity": _r_tutor_activity, "platform": _r_platform,
    "pet_species": _r_pet_species, "pet_sex": _r_pet_sex, "pet_breed_contains": _r_pet_breed, "pet_age_months": _r_pet_age,
    "pet_weight_kg": _r_pet_weight, "pet_neutered_yes": _r_pet_neutered,
    "location_registered_state": _r_state, "location_registered_city": _r_city, "location_gps_radius": _r_gps, "location_geoip_region": _r_geoip,
    "feeding_registered": _r_feeding_registered, "feeding_brand_contains": _r_feeding_brand,
    "care_vaccine": _r_care(VaccineRecord), "care_parasite": _r_care(ParasiteControlRecord), "care_grooming": _r_care(GroomingRecord),
    "care_medication": _r_care_medication,
}
assert set(_RULES) == set(FILTER_FIELDS), "todo filtro disponível precisa de uma regra (e vice-versa)"


# ── Combinação E/OU ──────────────────────────────────────────────────────────

def _eval_group(ctx: AudienceContext, g: FilterGroup, outcomes: list) -> set[str]:
    if not g.items:
        return set(ctx.all_users)                         # grupo vazio = sem restrição
    parts: list[set[str]] = []
    pet_outcomes: list[_Outcome] = []
    for it in g.items:
        if isinstance(it, FilterGroup):
            parts.append(_eval_group(ctx, it, outcomes))
            continue
        out = _RULES[it.field](ctx, it)
        outcomes.append((it, out))
        if out.kind == "tutor":
            parts.append(out.ids)
        else:
            pet_outcomes.append(out)
    if pet_outcomes:
        sets = [o.ids for o in pet_outcomes]
        scope = g.pet_scope or "any"
        if scope == "any":
            parts += [ctx.users_with_any_pet_in(s) for s in sets]
        else:
            pets_ok = set.intersection(*sets) if g.op == "and" else set.union(*sets)
            parts.append(ctx.users_with_any_pet_in(pets_ok) if scope == "same" else ctx.users_with_all_pets_in(pets_ok))
    return set.intersection(*parts) if g.op == "and" else set.union(*parts)


@dataclass
class Resolved:
    matches: set[str]
    reachable: set[str]
    ctx: AudienceContext
    outcomes: list


def resolve_audience(db, flt: AudienceFilter, *, now: Optional[datetime] = None) -> Resolved:
    """ÚNICO ponto de entrada da semântica: a contagem (etapa 2) e a reserva do lote (etapa 3) usam esta função."""
    validate_filter_values(flt)
    ctx = AudienceContext(db, now)
    outcomes: list = []
    matches = _eval_group(ctx, flt.root, outcomes) & ctx.all_users
    return Resolved(matches=matches, reachable=matches & ctx.reachable_universe, ctx=ctx, outcomes=outcomes)


def resolve_audience_ids(db, flt: AudienceFilter, *, now: Optional[datetime] = None) -> list[str]:
    """Alcançáveis, em ordem estável (para a etapa 3 sortear/reservar a partir de uma lista determinística)."""
    return sorted(resolve_audience(db, flt, now=now).reachable)


# ── Contagem ─────────────────────────────────────────────────────────────────

def _pct(c: _Cov) -> Optional[float]:
    return round(100 * c.with_data / c.total, 1) if c.total else None


def compute_audience(db, flt: AudienceFilter, *, campaign_id: Optional[str] = None, batch_size: Optional[int] = None,
                     all_available: bool = False, now: Optional[datetime] = None) -> dict:
    res = resolve_audience(db, flt, now=now)
    ctx = res.ctx
    campaign_users: set[str] = set()
    if campaign_id:
        if db.get(PushCampaign, campaign_id) is None:
            raise CampaignNotFound(campaign_id)
        campaign_users = {str(u) for (u,) in db.query(PushCampaignRecipient.user_id).filter(PushCampaignRecipient.campaign_id == campaign_id).all()}
    used_here = res.reachable & campaign_users
    available = res.reachable - campaign_users
    next_batch = len(available) if all_available else (min(batch_size, len(available)) if batch_size else None)

    ios, android, web = (res.reachable & ctx.platform_users(p) for p in ("ios", "android", "web"))
    native = ios | android
    by_platform = {"ios": len(ios), "android": len(android), "web": len(web), "mais_de_um_canal": len(
        (ios & android) | (ios & web) | (android & web))}
    matched_push = res.matches & ctx.push_users

    rules, warnings = [], []
    origins: list[str] = []
    for rule, out in res.outcomes:
        meta = FIELD_META[rule.field]
        cov = out.cov
        rules.append({"field": rule.field, "label": FILTER_FIELDS[rule.field]["label"], "group": meta["group"], "origin": meta["origin"],
                      "precision": meta["precision"], "coverage": None if cov is None else
                      {"with_data": cov.with_data, "total": cov.total, "unit": cov.unit, "percent": _pct(cov)}})
        if rule.field in _LOCATION_ORIGINS:
            origins.append(_LOCATION_ORIGINS[rule.field])
        if cov is not None and cov.total and cov.with_data / cov.total < 0.5 and rule.field not in ("pet_neutered_yes", "feeding_registered"):
            warnings.append({"code": "low_coverage", "level": "attention", "field": rule.field,
                             "text": f"Dados incompletos: só {_pct(cov)}% dos {cov.unit} têm esse dado ({cov.with_data} de {cov.total}). "
                                     f"Quem não preencheu fica de fora do filtro."})
        if rule.field == "pet_weight_kg" and out.extra.get("weight_without_unit"):
            warnings.append({"code": "weight_without_unit", "level": "info", "field": rule.field,
                             "text": f"{out.extra['weight_without_unit']} pets têm peso sem unidade e não entram neste filtro."})
    fields_used = {r["field"] for r in rules}
    for origin in sorted(set(o for o in origins if o != "cadastro")):
        warnings.append({"code": "location_approximate", "level": "attention", "origin": origin,
                         "text": f"Localização APROXIMADA ({_ORIGIN_LABEL[origin]}). Não representa a residência do tutor."})
    if len(set(origins)) > 1:
        warnings.append({"code": "location_origins_mixed", "level": "attention",
                         "text": "Este filtro combina origens de localização diferentes (" + "; ".join(_ORIGIN_LABEL[o] for o in sorted(set(origins))) +
                                 "). Cada uma tem precisão própria: confira cada condição."})
    if "tutor_activity" in fields_used:
        warnings.append({"code": "activity_is_events", "level": "info",
                         "text": "Atividade = eventos registrados no app, não necessariamente login. 'Sem atividade registrada' é diferente de 'mais de 30 dias'."})
    if "pet_neutered_yes" in fields_used:
        warnings.append({"code": "neutered_only_yes", "level": "info",
                         "text": "Só 'castrado: sim' é confiável. Quem não aparece aqui NÃO é necessariamente 'não castrado'."})
    if "feeding_brand_contains" in fields_used:
        warnings.append({"code": "brand_free_text", "level": "info",
                         "text": "A marca é um texto livre (marca + produto no mesmo campo): a busca encontra o texto, não uma marca normalizada."})
    if not res.reachable:
        warnings.append({"code": "empty_audience", "level": "attention", "text": "Nenhum tutor alcançável atende a estes filtros."})
    elif campaign_id and not available:
        warnings.append({"code": "campaign_exhausted", "level": "attention", "text": "Todos os alcançáveis deste público já foram usados nesta campanha."})
    if next_batch is not None and batch_size and batch_size > len(available):
        warnings.append({"code": "batch_larger_than_available", "level": "info",
                         "text": f"Você pediu {batch_size}, mas só há {len(available)} disponíveis: o lote seria de {len(available)}."})

    return {
        "matches": len(res.matches), "reachable": len(res.reachable),
        "not_reachable": {"no_push": len(res.matches - ctx.push_users), "opt_out": len(matched_push & ctx.opted_out)},
        "used": len(used_here), "used_in_campaign_total": len(campaign_users), "available": len(available),
        "next_batch": next_batch, "by_platform": by_platform,
        "native_channel_users": len(native), "filters_hash": flt.filters_hash(), "evaluated_at": ctx.now.isoformat(),
        "rules": rules, "warnings": warnings,
    }


# ── Catálogo e sugestões ─────────────────────────────────────────────────────

def describe_fields() -> list[dict]:
    out = []
    for key, spec in FILTER_FIELDS.items():
        meta = FIELD_META[key]
        out.append({"field": key, "label": spec["label"], "group": meta["group"], "scope": spec["scope"], "ops": list(spec["ops"]),
                    "values": list(spec["values"]) if spec.get("values") is not None else None,
                    "approximate": bool(spec.get("approximate")), "origin": meta["origin"], "precision": meta["precision"]})
    return out


_BRAND_STOP = {"racao", "alimento", "alimentacao", "petisco", "comida", "sache", "para", "de", "da", "do"}


def brand_suggestions(db, *, limit: int = 15, min_tutors: int = 5) -> list[dict]:
    """Marcas mais frequentes no texto livre da ração: só contagens agregadas (nunca dado individual). A sugestão mostra a grafia
    original mais comum; a busca compara sem acento/maiúscula."""
    rows = (db.query(FeedingPlan.pet_id, FeedingPlan.food_brand, Pet.user_id)
            .join(Pet, Pet.id == FeedingPlan.pet_id).filter(FeedingPlan.deleted_at.is_(None)).all())
    plans: Counter = Counter()
    tutors: dict[str, set] = defaultdict(set)
    spell: dict[str, Counter] = defaultdict(Counter)
    for _pid, brand, uid in rows:
        words = [w for w in re.split(r"[^\w&]+", str(brand or "")) if w]
        key_word = next((w for w in words if norm_text(w) not in _BRAND_STOP and len(norm_text(w)) >= 3 and not norm_text(w).isdigit()), None)
        if not key_word:
            continue
        k = norm_text(key_word)
        plans[k] += 1
        tutors[k].add(str(uid))
        spell[k][key_word] += 1
    ranked = sorted(((k, len(tutors[k])) for k in plans if len(tutors[k]) >= min_tutors), key=lambda kv: (-kv[1], kv[0]))[:limit]
    return [{"text": spell[k].most_common(1)[0][0], "search": k, "plans": plans[k], "tutors": n} for k, n in ranked]


# ── Endpoints (somente leitura; atrás da flag) ───────────────────────────────

router = APIRouter(prefix="/v1/admin/push-campaigns", tags=["Admin Push Campaigns"], dependencies=[Depends(require_push_campaigns)])


class AudienceCountIn(BaseModel):
    filter: AudienceFilter = Field(default_factory=AudienceFilter)
    campaign_id: Optional[str] = Field(default=None, max_length=36)
    batch_size: Optional[int] = Field(default=None, ge=1, le=1_000_000)
    all_available: bool = False


def _read_only_session():
    db = SessionLocal()
    if db.get_bind().dialect.name == "postgresql":      # a contagem NUNCA escreve: o próprio banco recusa qualquer escrita
        db.execute(text("SET TRANSACTION READ ONLY"))
        db.execute(text("SET LOCAL statement_timeout = 8000"))
    return db


@router.get("/fields")
def list_fields(current=Depends(get_current_admin)):
    return {"fields": describe_fields(),
            "activity_note": "Atividade = eventos registrados no app, não necessariamente login.",
            "location_origins": _ORIGIN_LABEL}


@router.get("/suggestions/brands")
def brand_suggestions_endpoint(limit: int = 15, current=Depends(get_current_admin)):
    db = _read_only_session()
    try:
        return {"suggestions": brand_suggestions(db, limit=max(1, min(limit, 40)))}
    finally:
        db.rollback()
        db.close()


@router.post("/audience/count")
def audience_count(payload: AudienceCountIn, current=Depends(get_current_admin)):
    db = _read_only_session()
    try:
        return compute_audience(db, payload.filter, campaign_id=payload.campaign_id, batch_size=payload.batch_size,
                                all_available=payload.all_available)
    except FilterError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except CampaignNotFound:
        raise HTTPException(status_code=404, detail="Campanha não encontrada.")
    except AudienceTooLarge as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    finally:
        db.rollback()
        db.close()
