"""Moderação de fotografias por IA — decisão determinística (classifier.py),
sanitização real do arquivo (sanitize.py) e orquestração (service.py).

Todo teste aqui mocka `VisionService.moderate_pet_photo` — a fronteira
exata com a rede/Gemini. Nenhum teste chama a IA de verdade (consistente
com o resto da suíte: hermético, sem rede)."""
from __future__ import annotations

import io
import json

import pytest
from PIL import Image

from src.moderation.classifier import APPROVED, PENDING, REJECTED, decide
from src.moderation.sanitize import sanitize_image
from src.moderation.service import ModerationRejected, moderate_upload
from src.moderation.models import PhotoModerationDecision
from src.db import SessionLocal


# ── Fixtures de imagem ───────────────────────────────────────────────────

def _make_jpeg(*, width=800, height=600, with_exif=False) -> bytes:
    img = Image.new("RGB", (width, height), color=(120, 170, 90))
    out = io.BytesIO()
    if with_exif:
        # Tag EXIF simples (Make) — a garantia da sanitização não é
        # "sabe reconhecer o tag de GPS e apagar só ele", é mais forte:
        # a imagem final é reescrita do zero e NUNCA copia bloco de
        # metadado nenhum do original, então isso cobre GPS junto com
        # qualquer outro EXIF sem precisar simular uma sub-IFD de GPS
        # válida (frágil de montar só pra teste).
        exif = img.getexif()
        exif[0x010F] = "TestCam GPS-Enabled"  # tag "Make"
        img.save(out, format="JPEG", exif=exif)
    else:
        img.save(out, format="JPEG")
    return out.getvalue()


REAL_DOG_PHOTO = _make_jpeg()


# ═══════════════════════════════════════════════════════════════════════
#  1) DECISÃO DETERMINÍSTICA (classifier.decide) — matriz de cenários
#     pedida explicitamente na tarefa (item 9, TESTES OBRIGATÓRIOS)
# ═══════════════════════════════════════════════════════════════════════

def _classification(**overrides):
    base = {
        "animal_present": True,
        "species": "dog",
        "pet_is_main_subject": True,
        "nudity_or_sexual_content": False,
        "graphic_violence_or_animal_cruelty": False,
        "inappropriate_content_involving_minors": False,
        "image_type": "real_photo",
        "confidence": 0.9,
        "reason": "cachorro real, bem enquadrado",
    }
    base.update(overrides)
    return base


def test_cachorro_real_aprova():
    d = decide(_classification(species="dog"))
    assert d.status == APPROVED


def test_gato_real_aprova():
    d = decide(_classification(species="cat"))
    assert d.status == APPROVED


def test_pet_com_tutor_aprova_quando_pet_e_o_assunto_principal():
    d = decide(_classification(pet_is_main_subject=True))
    assert d.status == APPROVED


def test_pet_com_crianca_ao_fundo_aprova():
    # a IA não tem uma flag separada pra "criança ao fundo" — isso é
    # normal e não deve acionar NENHUMA flag de conteúdo impróprio; o que
    # importa é o pet continuar sendo o assunto principal.
    d = decide(_classification(pet_is_main_subject=True, reason="cão no colo do tutor, criança ao fundo brincando"))
    assert d.status == APPROVED


def test_pet_doente_sem_violencia_grafica_aprova():
    d = decide(_classification(reason="cão idoso, visivelmente doente, sem nenhuma violência"))
    assert d.status == APPROVED


def test_animal_com_ferimento_nao_grafico_aprova():
    d = decide(_classification(graphic_violence_or_animal_cruelty=False, reason="pata enfaixada, sem nada gráfico"))
    assert d.status == APPROVED


def test_pessoa_sem_pet_rejeita():
    d = decide(_classification(animal_present=False, pet_is_main_subject=False, species=None))
    assert d.status == REJECTED
    assert "pet" in d.reason.lower()


def test_paisagem_sem_animal_rejeita():
    d = decide(_classification(animal_present=False, species=None))
    assert d.status == REJECTED


def test_meme_com_confianca_alta_rejeita():
    d = decide(_classification(image_type="meme", confidence=0.85))
    assert d.status == REJECTED
    assert "meme" in d.reason.lower()


def test_desenho_de_cachorro_com_confianca_alta_rejeita():
    d = decide(_classification(image_type="drawing", confidence=0.8))
    assert d.status == REJECTED
    assert "drawing" in d.reason.lower()


def test_imagem_sintetica_de_cachorro_com_confianca_alta_rejeita():
    d = decide(_classification(image_type="synthetic", confidence=0.75))
    assert d.status == REJECTED


def test_conteudo_sexual_rejeita_mesmo_com_pet_presente():
    # regra explícita da tarefa: pet no quadro não salva conteúdo impróprio
    d = decide(_classification(nudity_or_sexual_content=True, animal_present=True, pet_is_main_subject=True, confidence=0.95))
    assert d.status == REJECTED
    assert "sexual" in d.reason.lower() or "nudez" in d.reason.lower()


def test_violencia_grafica_rejeita():
    d = decide(_classification(graphic_violence_or_animal_cruelty=True))
    assert d.status == REJECTED


def test_conteudo_envolvendo_menores_tem_prioridade_absoluta():
    d = decide(_classification(
        inappropriate_content_involving_minors=True,
        nudity_or_sexual_content=True,
        animal_present=True,
    ))
    assert d.status == REJECTED
    assert "menor" in d.reason.lower()


def test_tipo_incerto_com_confianca_baixa_vai_pra_revisao_em_vez_de_rejeitar():
    d = decide(_classification(image_type="synthetic", confidence=0.3))
    assert d.status == PENDING


def test_pet_pouco_visivel_nao_e_assunto_principal_vai_pra_revisao():
    d = decide(_classification(pet_is_main_subject=False))
    assert d.status == PENDING


def test_confianca_geral_baixa_vai_pra_revisao_em_vez_de_aprovar():
    d = decide(_classification(confidence=0.4))
    assert d.status == PENDING


def test_baixa_confianca_nunca_vira_rejeicao_permanente():
    """Regra explícita: decisão automática de baixa confiança nunca é
    usada como justificativa pra excluir uma foto legítima — o pior que
    acontece é ir pra revisão humana, nunca reprovar direto."""
    d = decide(_classification(confidence=0.1, image_type="real_photo"))
    assert d.status == PENDING
    assert d.status != REJECTED


# ═══════════════════════════════════════════════════════════════════════
#  2) SANITIZAÇÃO — validação real de arquivo + remoção de EXIF/GPS
# ═══════════════════════════════════════════════════════════════════════

def test_sanitize_aceita_jpeg_real():
    out = sanitize_image(REAL_DOG_PHOTO)
    assert out.content_type == "image/jpeg"
    assert out.width > 0 and out.height > 0


def test_sanitize_remove_exif_gps():
    original = _make_jpeg(with_exif=True)
    assert dict(Image.open(io.BytesIO(original)).getexif())  # confirma que o EXIF de teste pegou
    out = sanitize_image(original)
    reloaded = Image.open(io.BytesIO(out.bytes_))
    assert not dict(reloaded.getexif())  # nenhum EXIF sobrevive à reescrita — GPS incluso


def test_sanitize_rejeita_arquivo_invalido():
    with pytest.raises(Exception) as exc:
        sanitize_image(b"isto nao e uma imagem, e um payload qualquer disfarcado")
    assert getattr(exc.value, "status_code", None) == 400


def test_sanitize_rejeita_arquivo_grande_demais():
    huge = b"\xff\xd8\xff" + (b"0" * (9 * 1024 * 1024))  # 9MB, acima do teto de 8MB
    with pytest.raises(Exception) as exc:
        sanitize_image(huge)
    assert getattr(exc.value, "status_code", None) == 413


def test_sanitize_rejeita_dimensoes_absurdas():
    absurd = _make_jpeg(width=5000, height=5000)
    with pytest.raises(Exception) as exc:
        sanitize_image(absurd)
    assert getattr(exc.value, "status_code", None) == 400


# ═══════════════════════════════════════════════════════════════════════
#  3) ORQUESTRAÇÃO (moderate_upload) — sanitiza -> classifica -> decide ->
#     publica (só se aprovado). VisionService mockado na fronteira exata
#     com a rede.
# ═══════════════════════════════════════════════════════════════════════

def _mock_vision(monkeypatch, classification: dict | None, *, raise_error: bool = False):
    async def _fake(self, image_bytes):
        if raise_error:
            raise RuntimeError("Gemini indisponível (simulado)")
        return classification
    monkeypatch.setattr("src.vision.service.VisionService.moderate_pet_photo", _fake)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-fake")


def test_upload_direto_pela_api_sem_moderacao_nao_e_possivel(client):
    """O endpoint real de upload de foto do pet SEMPRE passa pela
    moderação — não existe caminho que grave a foto sem isso (a garantia
    é estrutural: `upload_pet_photo` chama `moderate_upload` antes de
    qualquer `db.commit()` na foto)."""
    import inspect
    from src.pets import router as pets_router_module

    source = inspect.getsource(pets_router_module.upload_pet_photo)
    assert "moderate_upload" in source
    assert source.index("moderate_upload") < source.index("pet.photo = outcome.public_key")


# ═══════════════════════════════════════════════════════════════════════
#  4) IA INDISPONÍVEL — nunca aprova sozinha (item 9 + item 6 da tarefa)
# ═══════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_ia_indisponivel_nunca_aprova_automaticamente(monkeypatch):
    _mock_vision(monkeypatch, None, raise_error=True)
    db = SessionLocal()
    try:
        outcome = await moderate_upload(REAL_DOG_PHOTO, context="pet_profile", db=db, entity_type="pet", entity_id="pet-x")
        assert outcome.status == PENDING
        decision = db.query(PhotoModerationDecision).filter(PhotoModerationDecision.id == outcome.decision_id).first()
        assert decision.ai_unavailable is True
    finally:
        db.close()


@pytest.mark.asyncio
async def test_sem_chave_gemini_configurada_tambem_vai_pra_revisao(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    db = SessionLocal()
    try:
        outcome = await moderate_upload(REAL_DOG_PHOTO, context="pet_profile", db=db, entity_type="pet", entity_id="pet-y")
        assert outcome.status == PENDING
    finally:
        db.close()


@pytest.mark.asyncio
async def test_moderate_upload_aprovado_promove_arquivo_pro_caminho_publico(monkeypatch, tmp_path):
    _mock_vision(monkeypatch, _classification())
    db = SessionLocal()
    try:
        outcome = await moderate_upload(REAL_DOG_PHOTO, context="pet_profile", db=db, entity_type="pet", entity_id="pet-z")
        assert outcome.status == APPROVED
        assert outcome.public_key.startswith("pets/")
        from pathlib import Path
        assert (Path("uploads") / outcome.public_key).exists()
        # não sobra cópia na área de revisão depois de promovida
        key_only = outcome.public_key.split("/", 1)[1]
        assert not (Path("moderation_review") / key_only).exists()
    finally:
        db.close()
        try:
            (__import__("pathlib").Path("uploads") / outcome.public_key).unlink()
        except Exception:
            pass


@pytest.mark.asyncio
async def test_moderate_upload_rejeitado_nao_salva_nada_publico(monkeypatch):
    _mock_vision(monkeypatch, _classification(animal_present=False, species=None))
    db = SessionLocal()
    try:
        with pytest.raises(ModerationRejected):
            await moderate_upload(REAL_DOG_PHOTO, context="pet_profile", db=db, entity_type="pet", entity_id="pet-w")
        decisions = db.query(PhotoModerationDecision).filter(PhotoModerationDecision.entity_id == "pet-w").all()
        assert len(decisions) == 1
        assert decisions[0].status == REJECTED
    finally:
        db.close()


@pytest.mark.asyncio
async def test_moderate_upload_pendente_nao_gera_url_publica(monkeypatch):
    _mock_vision(monkeypatch, _classification(pet_is_main_subject=False))
    db = SessionLocal()
    try:
        outcome = await moderate_upload(REAL_DOG_PHOTO, context="missing_pet_alert", db=db, entity_type="missing_pet", entity_id="mp-1")
        assert outcome.status == PENDING
        assert outcome.public_key is None
        assert outcome.public_url_path is None
        decision = db.query(PhotoModerationDecision).filter(PhotoModerationDecision.id == outcome.decision_id).first()
        assert decision.final_public_key is None  # nunca ganhou URL pública
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════════
#  5) Abuso — tentativas repetidas de contornar a moderação
# ═══════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_tentativas_repetidas_de_upload_recusado_sao_bloqueadas(monkeypatch):
    from src.moderation import service as service_mod

    service_mod._rejection_events.clear()
    _mock_vision(monkeypatch, _classification(animal_present=False, species=None))
    db = SessionLocal()
    try:
        for _ in range(service_mod.REJECTION_LOCKOUT_THRESHOLD):
            with pytest.raises(ModerationRejected):
                await moderate_upload(REAL_DOG_PHOTO, context="pet_profile", db=db, uploader_ip="9.9.9.9")

        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            await moderate_upload(REAL_DOG_PHOTO, context="pet_profile", db=db, uploader_ip="9.9.9.9")
        assert exc.value.status_code == 429
    finally:
        service_mod._rejection_events.clear()
        db.close()
