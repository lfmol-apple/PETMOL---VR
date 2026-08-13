"""
Configuração central dos advertisers Awin por merchant — nenhum ID
espalhado pelo código (ver docs/AFFILIATES.md para a tabela de
compliance completa). Awin é REDE (network); cada entrada aqui é um
MERCHANT dentro dela (Cobasi, Petz, Zee Now, Zee Dog).

Situação real em 13/08/2026: publisher PETMOL cadastrado (ID 3032803).
Cobasi (17870) foi APROVADA — confirmado no painel Awin (Anunciantes →
Meus Programas → "Seus Anunciantes"), com feed ativo (fid 48117, 8.398
produtos) já sincronizado em AffiliateFeedOffer. Petz/Zee Now/Zee Dog
continuam "pending". Não mudar `enabled=True` para nenhum sem
confirmação real de aprovação (ver §33 do documento de arquitetura
interno).

`enabled=True` na Cobasi habilita o `AwinFeedProvider` a encontrar/
monetizar ofertas SE ele estiver registrado em build_default_engine() —
hoje ainda não está, então isto sozinho não muda nada pro tutor (ver
awin_feed_provider.py). Quando for registrado, o dedupe por merchant
(merchant_routes.py) continua preferindo a rota "mais" até a comissão
Awin ser validada com uma compra real — Cobasi aprovada não é o mesmo
que Cobasi pronta pra decidir o link que o tutor vê.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class AwinAdvertiser:
    merchant: str
    advertiser_id: str
    # "pending" | "approved" | "active" | "disabled" — status comercial
    # real do programa, independente de termos ligado algo em código.
    commercial_status: str
    feed_available: bool
    # Produção só deve ler/exibir ofertas deste merchant via Awin quando
    # True — e só deve virar True após validação (ver §29 shadow mode).
    enabled: bool
    cookie_days: int
    cpa_percent: Optional[float] = None
    # ID do feed de produto (fid) usado na URL de download da Awin — não é
    # segredo (é só um identificador de catálogo, como advertiser_id), mas
    # só existe quando feed_available=True. A chave de API (secreta) fica
    # em config.awin_datafeed_key, nunca aqui.
    feed_id: Optional[str] = None
    notes: str = ""


AWIN_ADVERTISERS: dict[str, AwinAdvertiser] = {
    "cobasi": AwinAdvertiser(
        merchant="cobasi",
        advertiser_id="17870",
        commercial_status="approved",
        feed_available=True,
        enabled=True,
        cookie_days=1,
        cpa_percent=8.5,
        feed_id="48117",
        notes=(
            "Aprovada 13/08/2026. Cobasi já monetiza hoje via MAIS/UTM "
            "(cobasi_provider.py, cobasi_affiliate_mode). Awin é a rota "
            "preferida quando validada; MAIS/UTM continua fallback — "
            "nunca remover MAIS só porque a Awin foi aprovada (ver §28 do "
            "documento de arquitetura interno: transição em fases, "
            "shadow mode antes de exibir ao tutor)."
        ),
    ),
    "petz": AwinAdvertiser(
        merchant="petz",
        advertiser_id="127553",
        commercial_status="pending",
        feed_available=False,
        enabled=False,
        cookie_days=14,
        cpa_percent=3.0,
        notes=(
            "Sem Product Feed no programa Awin — precisa de outra fonte "
            "de discovery se/quando ativado. Petz também tem programa "
            "próprio (~7%, cadastro em andamento, fora da Awin) — "
            "discovery e monetization_route podem divergir aqui; não "
            "implementar sem dados reais de nenhum dos dois."
        ),
    ),
    "zeenow": AwinAdvertiser(
        merchant="zeenow",
        advertiser_id="127557",
        commercial_status="pending",
        feed_available=True,
        enabled=False,
        cookie_days=1,
        cpa_percent=3.0,
        notes="13.746 produtos observados no ShopWindow Awin. Rastreamento de app: sim.",
    ),
    "zeedog": AwinAdvertiser(
        merchant="zeedog",
        advertiser_id="127555",
        commercial_status="pending",
        feed_available=True,
        enabled=False,
        cookie_days=14,
        cpa_percent=3.0,
        notes="1.742 produtos observados no ShopWindow Awin. Rastreamento de app: não.",
    ),
}


def get_awin_advertiser(merchant: str) -> Optional[AwinAdvertiser]:
    return AWIN_ADVERTISERS.get(merchant)


def is_awin_merchant_enabled(merchant: str) -> bool:
    advertiser = AWIN_ADVERTISERS.get(merchant)
    return bool(advertiser and advertiser.enabled)


def awin_merchants_with_feed() -> list[str]:
    """Merchants cujo programa Awin oferece Product Feed — pré-requisito
    pra popular AffiliateFeedOffer via sync (quando aprovado)."""
    return [m for m, a in AWIN_ADVERTISERS.items() if a.feed_available]
