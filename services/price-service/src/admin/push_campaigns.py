"""Campanhas push manuais (ETAPA 1: SÓ A ESTRUTURA — nenhum envio, nenhuma reserva, nenhum motor de filtros).

O que existe aqui:
  · `PushCampaign`            a campanha: conteúdo FIXO (título, mensagem, destino, link do produto) + hash do conteúdo.
  · `PushCampaignRecipient`   quem foi reservado/tentado/aceito/falhou/ficou incerto, com UNIQUE(campaign_id, user_id):
                              o BANCO garante que o mesmo tutor nunca entra duas vezes na mesma campanha.
  · colunas aditivas em `admin_broadcasts` (ver broadcast_router.AdminBroadcast): cada LOTE continua sendo uma linha de lá,
    então histórico, métricas e o toque `?b=<id>` funcionam sem mudança.
  · `AudienceFilter`          a ESTRUTURA dos filtros combináveis (E/OU, escopo de pets). Só valida e gera o hash canônico;
    quem executa filtros é a etapa 2.
  · a flag `push_campaigns_enabled` (desligada por padrão) e o endpoint `GET /v1/admin/push-campaigns/config`.

O que NÃO existe (de propósito): reserva transacional, envio, recuperação de lotes, interface — etapas 2 a 4. O envio avulso
atual (`broadcast_router`) não foi alterado. Decisões do dono (13/11/2026): a regra de repetição vale POR CAMPANHA (campanhas
diferentes podem alcançar o mesmo tutor); o conteúdo comercial fica fixo após o 1º lote; "entregue" nunca é afirmado — só
"aceito pelo provedor".

Reuso futuro (e-mail): os conceitos (campanha, lote, destinatário com estado, filtro, UNIQUE por campanha) não dependem de
push; não há abstração genérica agora, de propósito.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import CheckConstraint, Column, DateTime, Index, Integer, String, Text, UniqueConstraint, event, inspect

from ..config import get_settings
from ..db import Base
from .deps import get_current_admin

# ── Flag ─────────────────────────────────────────────────────────────────────


def push_campaigns_enabled() -> bool:
    """Interruptor independente da nova ferramenta. DESLIGADO por padrão; ligar = env PUSH_CAMPAIGNS_ENABLED=true + restart
    (mesmo padrão das outras flags do projeto). Desligada, nada novo responde e o envio avulso segue como sempre."""
    return bool(get_settings().push_campaigns_enabled)


def require_push_campaigns() -> None:
    """Dependência de TODO endpoint novo de campanhas: com a flag desligada, o endpoint "não existe" (404)."""
    if not push_campaigns_enabled():
        raise HTTPException(status_code=404, detail="Not Found")


# ── Estados ──────────────────────────────────────────────────────────────────

# Destinatário: reservado (garantido no banco, ainda não tentado) → enviando (tentativa registrada ANTES de chamar o provedor)
# → aceito pelo provedor | falhou (nenhum aparelho aceitou) | incerto (exceção/queda no meio: pode ter sido enviado).
RECIPIENT_STATES = ("reserved", "sending", "accepted", "failed", "uncertain")
# Estados finais que NUNCA são reenviados automaticamente (regra do dono). "uncertain" jamais volta a ser tentado sozinho.
RECIPIENT_FINAL_STATES = ("accepted", "failed", "uncertain")
RECIPIENT_STATE_LABELS = {
    "reserved": "Reservado",
    "sending": "Enviando",
    "accepted": "Aceito pelo provedor",   # NÃO é "entregue": APNs/FCM/Web Push não devolvem recibo de entrega
    "failed": "Falhou",
    "uncertain": "Incerto",
}
CAMPAIGN_STATUSES = ("draft", "active", "closed")
DESTINATIONS = ("home", "loja", "food", "vaccines", "parasites", "medication", "grooming", "produto")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Conteúdo fixo: hash canônico ─────────────────────────────────────────────

_CONTENT_FIELDS = ("title", "message", "destination", "goal", "product_url", "product_title")


def compute_content_hash(title: Optional[str], message: str, destination: Optional[str], goal: Optional[str],
                         product_url: Optional[str], product_title: Optional[str]) -> str:
    """SHA-256 do conteúdo comercial normalizado. Vai no token de confirmação do envio (etapa 3): se o conteúdo mudar entre a
    prévia e o envio, o servidor recusa."""
    norm = {
        "title": (title or "").strip(), "message": (message or "").strip(), "destination": (destination or "home").strip(),
        "goal": (goal or "").strip(), "product_url": (product_url or "").strip(), "product_title": (product_title or "").strip(),
    }
    return hashlib.sha256(json.dumps(norm, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


# ── Tabelas (criadas por Base.metadata.create_all no start; colunas novas de admin_broadcasts vão em migrations.py) ─────

class PushCampaign(Base):
    __tablename__ = "push_campaign"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(120), nullable=False, index=True)
    # Conteúdo comercial: FIXO depois do 1º lote (content_locked_at). Para mudar, cria-se OUTRA campanha ("duplicar").
    title = Column(String(80), nullable=True)
    message = Column(Text, nullable=False)
    goal = Column(String(20), nullable=True)
    destination = Column(String(12), nullable=False, default="home")
    product_url = Column(Text, nullable=True)
    product_title = Column(Text, nullable=True)
    content_hash = Column(String(64), nullable=False)
    content_locked_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(10), nullable=False, default="draft")
    created_by = Column(String(36), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, index=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("status in ('draft','active','closed')", name="ck_push_campaign_status"),
    )


class PushCampaignRecipient(Base):
    """Um tutor dentro de UMA campanha. A restrição UNIQUE(campaign_id, user_id) é a garantia final contra repetição: mesmo
    com cliques repetidos, processos simultâneos, prévia velha ou bug no código, o banco recusa o segundo registro do mesmo
    tutor na mesma campanha. Campanhas diferentes podem alcançar o mesmo tutor (decisão do dono)."""
    __tablename__ = "push_campaign_recipient"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id = Column(String(36), nullable=False, index=True)
    user_id = Column(String(36), nullable=False, index=True)
    batch_id = Column(String(36), nullable=False, index=True)          # = admin_broadcasts.id do lote
    state = Column(String(10), nullable=False, default="reserved")
    reserved_at = Column(DateTime(timezone=True), default=_utcnow)
    attempted_at = Column(DateTime(timezone=True), nullable=True)      # gravado ANTES de chamar o provedor (registro de intenção)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    accepted_devices = Column(Integer, nullable=False, default=0)      # aparelhos que o provedor aceitou (não é entrega)
    error_code = Column(String(40), nullable=True)

    __table_args__ = (
        UniqueConstraint("campaign_id", "user_id", name="uq_push_campaign_recipient_user"),
        CheckConstraint("state in ('reserved','sending','accepted','failed','uncertain')", name="ck_push_campaign_recipient_state"),
        Index("ix_push_campaign_recipient_batch_state", "batch_id", "state"),
    )


@event.listens_for(PushCampaign, "before_update")
def _freeze_commercial_content(_mapper, _connection, target: PushCampaign) -> None:
    """Rede de segurança no nível do modelo: depois do 1º lote (content_locked_at), título, mensagem, destino, objetivo e link
    NÃO mudam. A API (etapa 3) também recusa; aqui vale mesmo se alguém editar por outro caminho."""
    if target.content_locked_at is None:
        return
    state = inspect(target)
    changed = [f for f in (*_CONTENT_FIELDS, "content_hash") if state.attrs[f].history.has_changes()]
    if changed:
        raise ValueError("O conteúdo comercial da campanha é fixo depois do primeiro lote. Crie uma nova campanha.")


# ── Estrutura dos filtros combináveis (SÓ validação; o motor de consulta é da etapa 2) ─────────────────────────────

# Campos com dado real e confiável (medido em 12/11/2026). FORA, de propósito: sexo e idade do tutor, outros produtos (areia…),
# castrado=não (o cadastro grava "não" por padrão) e dias restantes da ração (até comprovar a confiabilidade).
FILTER_FIELDS: dict[str, dict] = {
    # tutor
    "tutor_created_at":       {"scope": "tutor", "ops": ("gte", "lte", "between"), "label": "Data de cadastro do tutor"},
    "tutor_pet_count":        {"scope": "tutor", "ops": ("eq", "gte", "lte", "between"), "label": "Quantidade de pets"},
    "tutor_species_mix":      {"scope": "tutor", "ops": ("in",), "label": "Tipos de pet do tutor", "values": ("dog_only", "cat_only", "dog_and_cat", "has_dog", "has_cat")},
    "tutor_activity":         {"scope": "tutor", "ops": ("eq",), "label": "Atividade registrada no app (não é login)", "values": ("last_7d", "d8_30", "over_30d", "no_events")},
    # engajamento / canal
    "platform":               {"scope": "tutor", "ops": ("in",), "label": "Aparelho com push ativo", "values": ("ios", "android", "web")},
    # pet (escopo de pets obrigatório no grupo: any | all | same)
    "pet_species":            {"scope": "pet", "ops": ("in",), "label": "Espécie", "values": ("dog", "cat", "other")},
    "pet_sex":                {"scope": "pet", "ops": ("eq",), "label": "Sexo do pet", "values": ("male", "female")},
    "pet_breed_contains":     {"scope": "pet", "ops": ("contains",), "label": "Raça contém (texto)"},
    "pet_age_months":         {"scope": "pet", "ops": ("gte", "lte", "between"), "label": "Idade do pet (meses)"},
    "pet_weight_kg":          {"scope": "pet", "ops": ("gte", "lte", "between"), "label": "Peso do pet (kg)"},
    "pet_neutered_yes":       {"scope": "pet", "ops": ("eq",), "label": "Castrado (só 'sim' é confiável)", "values": (True,)},
    # localização — sempre rotulada pela origem; nunca é "residência"
    "location_registered_state": {"scope": "tutor", "ops": ("in",), "label": "Estado cadastrado pelo tutor"},
    "location_registered_city":  {"scope": "tutor", "ops": ("in",), "label": "Cidade cadastrada pelo tutor"},
    "location_gps_radius":    {"scope": "tutor", "ops": ("within_km",), "label": "Perto de um ponto (GPS do aparelho)", "approximate": True},
    "location_geoip_region":  {"scope": "tutor", "ops": ("in",), "label": "Região aproximada pelo IP (não é residência)", "approximate": True},
    # alimentação
    "feeding_registered":     {"scope": "pet", "ops": ("eq",), "label": "Ração cadastrada", "values": (True,)},
    "feeding_brand_contains": {"scope": "pet", "ops": ("contains",), "label": "Marca/produto da ração contém (texto)"},
    # saúde e cuidados
    "care_vaccine":           {"scope": "pet", "ops": ("eq",), "label": "Tem registro de vacina", "values": (True,)},
    "care_parasite":          {"scope": "pet", "ops": ("eq",), "label": "Tem registro de vermífugo/antipulgas/coleira", "values": (True,)},
    "care_grooming":          {"scope": "pet", "ops": ("eq",), "label": "Tem registro de banho e tosa", "values": (True,)},
    "care_medication":        {"scope": "tutor", "ops": ("eq",), "label": "Tem medicação cadastrada", "values": (True,)},
}
FILTER_OPS = ("eq", "in", "gte", "lte", "between", "contains", "within_km")
MAX_FILTER_DEPTH = 3
MAX_FILTER_RULES = 30


class FilterRule(BaseModel):
    """Uma condição. `field` só aceita campos da lista acima: campo inexistente (sexo do tutor, areia…) é recusado."""
    kind: Literal["rule"] = "rule"
    field: str
    op: Literal["eq", "in", "gte", "lte", "between", "contains", "within_km"]
    value: Union[str, int, float, bool, list, dict]
    # Obrigatório nas localizações aproximadas: a tela precisa dizer que não é residência.
    approximate_ack: bool = False

    @model_validator(mode="after")
    def _check(self):
        spec = FILTER_FIELDS.get(self.field)
        if spec is None:
            raise ValueError(f"Filtro indisponível: '{self.field}' não existe no cadastro ou ainda não é confiável.")
        if self.op not in spec["ops"]:
            raise ValueError(f"Operação '{self.op}' não vale para '{self.field}'.")
        values = spec.get("values")
        if values is not None:
            items = self.value if isinstance(self.value, list) else [self.value]
            if not items or any(v not in values for v in items):
                raise ValueError(f"Valor inválido para '{self.field}'.")
        if self.op == "between" and not (isinstance(self.value, list) and len(self.value) == 2):
            raise ValueError("'between' pede dois valores.")
        if self.op == "in" and not isinstance(self.value, list):
            raise ValueError("'in' pede uma lista.")
        if self.op == "contains" and not (isinstance(self.value, str) and 2 <= len(self.value.strip()) <= 60):
            raise ValueError("Texto de busca: de 2 a 60 caracteres.")
        if self.op == "within_km":
            v = self.value
            ok = isinstance(v, dict) and all(isinstance(v.get(k), (int, float)) for k in ("lat", "lng", "km")) \
                and -90 <= v["lat"] <= 90 and -180 <= v["lng"] <= 180 and 1 <= v["km"] <= 500
            if not ok:
                raise ValueError("Raio: lat, lng e km (1 a 500).")
        if spec.get("approximate") and not self.approximate_ack:
            raise ValueError(f"'{spec['label']}' é aproximado: confirme que não representa a residência do tutor.")
        return self


class FilterGroup(BaseModel):
    """Grupo E/OU. Em grupo com regras de PET, `pet_scope` é obrigatório (tutores com vários pets):
       any = algum pet atende · all = todos os pets atendem · same = o MESMO pet atende a todas as condições."""
    kind: Literal["group"] = "group"
    op: Literal["and", "or"] = "and"
    pet_scope: Optional[Literal["any", "all", "same"]] = None
    items: list[Annotated[Union["FilterRule", "FilterGroup"], Field(discriminator="kind")]] = Field(default_factory=list)

    @model_validator(mode="after")
    def _scope(self):
        has_pet = any(isinstance(i, FilterRule) and FILTER_FIELDS[i.field]["scope"] == "pet" for i in self.items)
        if has_pet and self.pet_scope is None:
            raise ValueError("Defina como valem os pets do tutor: algum pet, todos os pets ou o mesmo pet.")
        return self


FilterGroup.model_rebuild()


def _walk(group: FilterGroup, depth: int = 1):
    yield group, depth
    for i in group.items:
        if isinstance(i, FilterGroup):
            yield from _walk(i, depth + 1)


class AudienceFilter(BaseModel):
    version: Literal[1] = 1
    root: FilterGroup = Field(default_factory=FilterGroup)       # grupo vazio = "todos com push, menos opt-out"

    @field_validator("root")
    @classmethod
    def _limits(cls, root: FilterGroup):
        groups = list(_walk(root))
        if max(d for _, d in groups) > MAX_FILTER_DEPTH:
            raise ValueError(f"Grupos aninhados demais (máximo {MAX_FILTER_DEPTH}).")
        rules = sum(isinstance(i, FilterRule) for g, _ in groups for i in g.items)
        if rules > MAX_FILTER_RULES:
            raise ValueError(f"Filtros demais (máximo {MAX_FILTER_RULES}).")
        return root

    def canonical_json(self) -> str:
        """JSON estável (mesma consulta ⇒ mesmo texto), usado no hash que amarra a prévia ao envio."""
        def norm(node):
            if isinstance(node, dict):
                node = {k: norm(v) for k, v in node.items()}
                if node.get("kind") == "group":
                    node["items"] = sorted(node["items"], key=lambda n: json.dumps(n, sort_keys=True, ensure_ascii=False))
                return node
            if isinstance(node, list):
                return [norm(x) for x in node]
            return node
        data = norm(self.model_dump(mode="json"))
        return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))

    def filters_hash(self) -> str:
        return hashlib.sha256(self.canonical_json().encode()).hexdigest()


# ── Endpoint mínimo (flag) ───────────────────────────────────────────────────

router = APIRouter(prefix="/v1/admin/push-campaigns", tags=["Admin Push Campaigns"])


@router.get("/config")
def campaigns_config(current=Depends(get_current_admin)):
    """Sempre responde (para o painel saber se mostra a opção "Campanha"). Só diz se a flag está ligada; nada mais."""
    return {"enabled": push_campaigns_enabled()}
