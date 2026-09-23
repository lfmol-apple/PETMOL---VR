"""Moderação de fotografias por IA.

Camada obrigatória entre "usuário enviou uma imagem" e "essa imagem fica
pública no app" — perfil do pet, Pet Sumido (foto de referência do alerta),
avistamento (foto de quem achou o pet). Nenhum desses fluxos publica uma
URL definitiva antes da foto passar por aqui.

Fluxo: UPLOAD -> sanitização real (Pillow decode + remove EXIF/GPS) ->
classificação por IA (Gemini, reaproveita o VisionService já usado pra
carteirinha de vacina/produto) -> decisão (aprovar/rejeitar/revisar) ->
some pra armazenamento privado até aprovar -> promove pro caminho público
só depois de aprovado (automático ou por um admin).
"""
from .classifier import APPROVED, PENDING, REJECTED  # noqa: F401
from .models import PhotoModerationDecision  # noqa: F401
from .service import (  # noqa: F401
    ModerationOutcome,
    ModerationRejected,
    PENDING_MESSAGE,
    REJECTED_MESSAGE,
    moderate_upload,
)
