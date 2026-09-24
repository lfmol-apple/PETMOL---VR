"""Decide aprovar/rejeitar/revisar a partir da classificação estruturada
da IA. A decisão é determinística em Python — a IA só descreve o que vê
(ver `VisionService.moderate_pet_photo`); quem aplica a política do
PETMOL é este módulo, auditável e testável sem precisar chamar a IA de
verdade a cada teste.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Optional

logger = logging.getLogger(__name__)

APPROVED = "approved"
REJECTED = "rejected"
PENDING = "pending"  # == REVIEW_REQUIRED da tarefa: aguarda revisão humana

# Abaixo desse limiar de confiança, mesmo uma classificação "limpa" vai pra
# revisão humana em vez de aprovar sozinha — evita decisão automática
# barata sobre foto ambígua.
MIN_CONFIDENCE_FOR_AUTO_APPROVE = 0.55
# image_type que só é rejeitado automaticamente com confiança alta; abaixo
# disso vira revisão (a IA pode estar errada sobre "parece desenho").
NOT_A_REAL_PHOTO_TYPES = {"drawing", "meme", "synthetic", "collage", "screenshot", "other"}
REJECT_TYPE_MIN_CONFIDENCE = 0.6


@dataclass
class Decision:
    status: str          # approved | rejected | pending
    reason: str
    ai_decision: str      # o rótulo cru pré-revisão humana — igual a `status` na hora da classificação


# Flags de conteúdo sensível: foto recusada por qualquer uma delas NUNCA é guardada
# (nem em área privada) — minimização e segurança: não retemos nudez, violência
# nem imagem envolvendo menores.
SENSITIVE_FLAGS = (
    "inappropriate_content_involving_minors",
    "nudity_or_sexual_content",
    "graphic_violence_or_animal_cruelty",
)


def is_sensitive(classification: Optional[dict[str, Any]]) -> bool:
    return any(bool((classification or {}).get(f)) for f in SENSITIVE_FLAGS)


def decide(classification: dict[str, Any]) -> Decision:
    # Flags de conteúdo impróprio têm prioridade absoluta — mesmo com um
    # pet real e visível na foto, isso nunca aprova (pedido explícito da
    # tarefa: "uma imagem imprópria contendo um cachorro ao fundo continua
    # sendo imprópria").
    if classification.get("inappropriate_content_involving_minors"):
        return _reject("conteúdo impróprio envolvendo menores")
    if classification.get("nudity_or_sexual_content"):
        return _reject("nudez ou conteúdo sexual")
    if classification.get("graphic_violence_or_animal_cruelty"):
        return _reject("violência gráfica ou crueldade animal")

    if not classification.get("animal_present"):
        return _reject("nenhum pet identificável na imagem")

    image_type = str(classification.get("image_type") or "other").lower()
    confidence = float(classification.get("confidence") or 0.0)

    if image_type in NOT_A_REAL_PHOTO_TYPES:
        if confidence >= REJECT_TYPE_MIN_CONFIDENCE:
            return _reject(f"imagem classificada como '{image_type}', não uma fotografia real")
        return _review(f"possível '{image_type}', confiança insuficiente pra decidir sozinho")

    if not classification.get("pet_is_main_subject"):
        return _review("pet presente na imagem, mas não é claramente o assunto principal")

    if confidence < MIN_CONFIDENCE_FOR_AUTO_APPROVE:
        return _review("confiança da classificação abaixo do necessário pra aprovar automaticamente")

    reason = classification.get("reason") or "fotografia real de pet, sem conteúdo impróprio identificado"
    return Decision(status=APPROVED, reason=reason, ai_decision=APPROVED)


def _reject(reason: str) -> Decision:
    return Decision(status=REJECTED, reason=reason, ai_decision=REJECTED)


def _review(reason: str) -> Decision:
    return Decision(status=PENDING, reason=reason, ai_decision=PENDING)


def _get_gemini_api_key() -> Optional[str]:
    return os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")


async def classify_and_decide(image_bytes: bytes) -> tuple[Decision, dict[str, Any], bool]:
    """Chama a IA e decide. Retorna (decisão, classificação_bruta,
    ia_indisponível). Quando a IA falha ou não está configurada, a decisão
    é SEMPRE "pending" (nunca aprova sem verificação) e `ia_indisponível`
    vem True, pro chamador registrar isso na auditoria."""
    api_key = _get_gemini_api_key()
    if not api_key:
        logger.warning("Moderação de foto: GEMINI_API_KEY/GOOGLE_API_KEY não configurada — indo pra revisão.")
        return (
            Decision(status=PENDING, reason="IA de moderação não configurada", ai_decision=PENDING),
            {},
            True,
        )

    try:
        from ..vision.service import VisionService

        service = VisionService(api_key)
        classification = await service.moderate_pet_photo(image_bytes)
    except Exception as exc:
        logger.warning("Moderação de foto: IA indisponível/falhou (%s) — indo pra revisão.", exc)
        return (
            Decision(status=PENDING, reason="Não foi possível verificar esta imagem agora", ai_decision=PENDING),
            {},
            True,
        )

    return decide(classification), classification, False


def flags_json(classification: dict[str, Any]) -> str:
    flags = {
        k: classification.get(k)
        for k in (
            "nudity_or_sexual_content",
            "graphic_violence_or_animal_cruelty",
            "inappropriate_content_involving_minors",
            "animal_present",
            "pet_is_main_subject",
        )
    }
    return json.dumps(flags, ensure_ascii=False)
