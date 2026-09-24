"""
Bug encontrado em produção 11/09/2026: preço "não carrega de primeira" na
Loja do Pet, mas funciona na segunda chamada pro MESMO produto. Causa raiz:
get_commerce_offers() rodava o enriquecimento de identidade (sob demanda,
só na 1ª vez que um produto é consultado) com `await` sem limite de tempo
nenhum (ver commerce_offers.py). Quando esse enriquecimento demorava mais
que o timeout de 5s que o app usa pra essa chamada, o app desistia — vazio
na tela — mas o enriquecimento terminava sozinho em background e gravava
no banco; a 2ª chamada (já enriquecido) vinha rápida e certa.

PR #358 limitou a espera a 2.5s (asyncio.wait_for) — resolveu "a chamada
não trava mais indefinidamente", mas devolvia silenciosamente `offers=[]`
ao estourar o prazo, indistinguível de "produto sem oferta mesmo". O
frontend tratava isso como definitivo e nunca tentava de novo — o sintoma
"funciona só na 2ª abertura do app" continuava.

Fix (11/09/2026, 2ª rodada): get_commerce_offers_with_status() agora
devolve status="enrichment_pending" quando o prazo estoura, em vez de
fingir "ready, sem oferta". Este teste prova que a CHAMADA continua rápida
(nunca trava além do limite) E que o status sinaliza corretamente o estado
transitório — a peça que faltava pro frontend saber que deve tentar de novo
(ver useCommerceOffers.ts e test_commerce_offers_retry.py no frontend/
backend respectivamente).
"""
import asyncio
import threading

import pytest

from src.commerce_offers import get_commerce_offers_with_status
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog

GTIN = "7891234567901"


def _register_unenriched_product(gtin: str = GTIN) -> None:
    db = SessionLocal()
    try:
        db.add(ProductCatalog(
            barcode=gtin,
            barcode_normalized=gtin,
            name="Produto Nunca Enriquecido",
            brand="Marca Teste",
            identity_enriched_at=None,
        ))
        db.commit()
    finally:
        db.close()


@pytest.mark.asyncio
async def test_get_commerce_offers_never_blocks_beyond_enrichment_timeout(monkeypatch):
    """Simula exatamente o bug: enriquecimento trava por muito mais tempo
    que qualquer timeout de frontend razoável. A chamada tem que voltar
    rápido mesmo assim (bem abaixo dos 5s que o app espera), não travar
    junto com o enriquecimento — E tem que sinalizar "enrichment_pending",
    nunca fingir que já é definitivo."""
    _register_unenriched_product()

    # O enriquecimento "trava" até o teste liberar — nada de cronômetro: o que se
    # prova é que a chamada VOLTOU enquanto ele ainda estava travado.
    release = threading.Event()
    finished = threading.Event()

    def _stuck_enrich(product_id: int) -> None:
        release.wait(30)
        finished.set()

    monkeypatch.setattr("src.commerce_offers._enrich_catalog_blocking", _stuck_enrich)

    db = SessionLocal()
    try:
        try:
            offers, status = await asyncio.wait_for(
                get_commerce_offers_with_status(db, gtin=GTIN),
                timeout=20.0,  # só trava de segurança: se o bug voltasse, a chamada esperaria o enriquecimento (30s)
            )
            returned_while_stuck = not finished.is_set()
        finally:
            release.set()    # solta a thread pra ela terminar limpa
    finally:
        db.close()

    assert returned_while_stuck, "get_commerce_offers_with_status esperou o enriquecimento lento terminar"
    assert offers == []
    assert status == "enrichment_pending", (
        "sem esse sinal, o frontend não tem como saber que deve tentar de novo — "
        "é exatamente o bug de 'só funciona na 2ª abertura do app'"
    )
