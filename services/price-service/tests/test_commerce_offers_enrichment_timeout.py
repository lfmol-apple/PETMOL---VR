"""
Bug encontrado em produção 11/09/2026: preço "não carrega de primeira" na
Loja do Pet, mas funciona na segunda chamada pro MESMO produto. Causa raiz:
get_commerce_offers() rodava o enriquecimento de identidade (sob demanda,
só na 1ª vez que um produto é consultado) com `await` sem limite de tempo
nenhum (ver commerce_offers.py). Quando esse enriquecimento demorava mais
que o timeout de 5s que o app usa pra essa chamada, o app desistia — vazio
na tela — mas o enriquecimento terminava sozinho em background e gravava
no banco; a 2ª chamada (já enriquecido) vinha rápida e certa.

Este teste prova que get_commerce_offers() agora nunca fica preso além do
limite (asyncio.wait_for) mesmo quando o enriquecimento trava/demora muito
— a resposta sai rápido de qualquer forma, self-healing pra próxima vez.
"""
import asyncio
import time

import pytest

from src.commerce_offers import get_commerce_offers
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
    junto com o enriquecimento."""
    _register_unenriched_product()

    def _slow_enrich(product_id: int) -> None:
        time.sleep(6)  # bem mais que os 2.5s do wait_for em commerce_offers.py

    monkeypatch.setattr("src.commerce_offers._enrich_catalog_blocking", _slow_enrich)

    db = SessionLocal()
    try:
        started = time.monotonic()
        offers = await asyncio.wait_for(
            get_commerce_offers(db, gtin=GTIN),
            timeout=4.0,  # se o bug voltasse, isso estouraria (a chamada ia querer 6s+)
        )
        elapsed = time.monotonic() - started
    finally:
        db.close()

    assert elapsed < 4.0, f"get_commerce_offers travou junto com o enriquecimento lento ({elapsed:.1f}s)"
    assert offers == []  # sem enriquecimento a tempo, sem identidade — mas rápido e seguro
