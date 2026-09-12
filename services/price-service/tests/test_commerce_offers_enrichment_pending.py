"""
Matriz de cenários pro contrato status="ready"|"enrichment_pending" de
get_commerce_offers_with_status() (ver commerce_offers.py e
test_commerce_offers_enrichment_timeout.py pro histórico do bug).

Cobre especificamente os casos que a correção anterior (PR #358) não
testava: produto já enriquecido (caminho feliz, sem custo extra), produto
genuinamente sem oferta (não pode virar "pending" pra sempre), e o caso
central do bug — enriquecimento mais lento que o prazo de uma chamada,
mas que se resolve sozinho numa chamada seguinte (o que o retry do
frontend em useCommerceOffers.ts dispara automaticamente) SEM disparar
uma segunda thread de enriquecimento duplicada (asyncio.shield).
"""
import asyncio
import time
from datetime import datetime, timezone

import pytest

from src.commerce_offers import ENRICHMENT_WAIT_TIMEOUT_SECONDS, get_commerce_offers_with_status
import src.commerce_offers as commerce_offers_module
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog

GTIN_ENRICHED = "7891111111111"
GTIN_NO_EVIDENCE = "7892222222222"
GTIN_SLOW = "7893333333333"


def _register_product(gtin: str, *, enriched: bool) -> None:
    db = SessionLocal()
    try:
        db.add(ProductCatalog(
            barcode=gtin,
            barcode_normalized=gtin,
            name="Produto Teste",
            brand="Marca Teste",
            identity_enriched_at=datetime.now(timezone.utc) if enriched else None,
        ))
        db.commit()
    finally:
        db.close()


@pytest.mark.asyncio
async def test_already_enriched_product_never_touches_enrichment(monkeypatch):
    """1) Produto já enriquecido: uma única chamada rápida, status=ready,
    e o enriquecimento nem é tentado (senão seria custo desperdiçado em
    TODA consulta, pra sempre)."""
    _register_product(GTIN_ENRICHED, enriched=True)

    def _must_not_run(product_id: int) -> None:
        raise AssertionError("enriquecimento não deveria rodar de novo pra produto já enriquecido")

    monkeypatch.setattr("src.commerce_offers._enrich_catalog_blocking", _must_not_run)

    db = SessionLocal()
    try:
        started = time.monotonic()
        offers, status = await get_commerce_offers_with_status(db, gtin=GTIN_ENRICHED)
        elapsed = time.monotonic() - started
    finally:
        db.close()

    assert status == "ready"
    assert offers == []  # sem link/feed cadastrado pra este GTIN — só confirma que não travou
    assert elapsed < 1.0


@pytest.mark.asyncio
async def test_product_with_no_feed_evidence_resolves_fast_as_ready_not_pending():
    """2/4) Produto genuinamente sem oferta (sem nenhuma linha de feed Awin
    pro GTIN): o enriquecimento roda, não encontra evidência, TERMINA
    RÁPIDO (não trava até o timeout) — então o status tem que ser "ready"
    definitivo, nunca "enrichment_pending" (senão o frontend ficaria
    fazendo retry pra sempre num produto que nunca vai ter oferta)."""
    _register_product(GTIN_NO_EVIDENCE, enriched=False)
    # Nenhum AffiliateFeedOffer cadastrado pra este GTIN — merge_product_
    # catalog_identity encontra zero evidência e retorna rápido (skip).

    db = SessionLocal()
    try:
        started = time.monotonic()
        offers, status = await get_commerce_offers_with_status(db, gtin=GTIN_NO_EVIDENCE)
        elapsed = time.monotonic() - started
    finally:
        db.close()

    assert status == "ready", "sem evidência é definitivo, não pode ficar pendente pra sempre"
    assert offers == []
    assert elapsed < 1.0, "sem evidência a checagem é uma única query — não devia nem chegar perto do timeout"


@pytest.mark.asyncio
async def test_slow_enrichment_that_finishes_between_two_calls_resolves_automatically(monkeypatch):
    """3) O cenário central do bug: enriquecimento mais lento que o prazo
    de UMA chamada, mas que termina pouco depois. Simula exatamente o que
    o retry automático do frontend faz — chama de novo pouco depois — e
    prova que a 2ª chamada:
      a) reaproveita a MESMA tarefa em voo (nunca dispara enriquecimento
         duplicado — a trava de asyncio.shield em _ensure_enriched_within);
      b) devolve status="ready" assim que o enriquecimento (que nunca foi
         cancelado) efetivamente termina.
    Isso é o que faz o preço aparecer sozinho, na MESMA abertura do app,
    sem exigir fechar/reabrir."""
    _register_product(GTIN_SLOW, enriched=False)
    calls = []

    def _slow_enrich(product_id: int) -> None:
        calls.append(product_id)
        time.sleep(ENRICHMENT_WAIT_TIMEOUT_SECONDS * 1.6)  # mais lento que UMA chamada, mas finito

    monkeypatch.setattr("src.commerce_offers._enrich_catalog_blocking", _slow_enrich)

    db1 = SessionLocal()
    try:
        offers1, status1 = await get_commerce_offers_with_status(db1, gtin=GTIN_SLOW)
    finally:
        db1.close()

    assert status1 == "enrichment_pending", "1ª chamada tem que sinalizar pendente, nunca fingir 'ready, sem oferta'"
    assert offers1 == []

    # Retry automático do frontend (useCommerceOffers.ts) chegaria pouco
    # depois — o enriquecimento (rodando desde a 1ª chamada, nunca
    # cancelado) já deve ter terminado a essa altura.
    db2 = SessionLocal()
    try:
        offers2, status2 = await get_commerce_offers_with_status(db2, gtin=GTIN_SLOW)
    finally:
        db2.close()

    assert status2 == "ready", "o enriquecimento já devia ter terminado sozinho — preço aparece na mesma sessão"
    assert len(calls) == 1, (
        "só UMA thread de enriquecimento deveria ter rodado pro mesmo produto — "
        "a 2ª chamada reaproveitou a tarefa em voo (asyncio.shield), não disparou outra"
    )


@pytest.mark.asyncio
async def test_enrichment_task_registry_is_cleaned_up_after_completion(monkeypatch):
    """Higiene: depois que a tarefa termina (com sucesso ou não), o
    registro em memória (_enrichment_tasks) não deve crescer pra sempre —
    senão seria um leak de longa duração num serviço que fica no ar por
    dias."""
    gtin = "7894444444444"
    _register_product(gtin, enriched=False)

    async def _run():
        db = SessionLocal()
        try:
            return await get_commerce_offers_with_status(db, gtin=gtin)
        finally:
            db.close()

    from src.product_catalog_lookup import ProductCatalog as PC
    from sqlalchemy import select
    db = SessionLocal()
    product_id = db.scalar(select(PC.id).where(PC.barcode_normalized == gtin))
    db.close()

    await _run()
    await asyncio.sleep(0.05)  # dá tempo do `finally` do _ensure_enriched_within rodar
    assert product_id not in commerce_offers_module._enrichment_tasks
