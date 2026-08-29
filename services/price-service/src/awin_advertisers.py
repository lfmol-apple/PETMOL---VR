"""
Configuração central dos advertisers Awin por merchant — nenhum ID
espalhado pelo código (ver docs/AFFILIATES.md para a tabela de
compliance completa). Awin é REDE (network); cada entrada aqui é um
MERCHANT dentro dela (Cobasi, Petz, Zee Now, Zee Dog).

Situação real em 22/08/2026: publisher PETMOL cadastrado (ID 3032803).
Cobasi (17870) foi APROVADA — confirmado no painel Awin (Anunciantes →
Meus Programas → "Seus Anunciantes"), com feed ativo (fid 48117, 8.398
produtos) já sincronizado em AffiliateFeedOffer. Zee Dog (127555) e Zee
Now (127557) também foram aprovadas, com feeds ativos (fid 116649 e
116779). Petz continua "pending". Não mudar `enabled=True` para nenhum
outro sem confirmação real de aprovação (ver §33 do documento de
arquitetura interno).

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
            "Aprovada 13/08/2026. Feed usado só pra busca/catálogo "
            "(nome/foto/preço, GET /commerce/awin-search) e enriquecimento "
            "interno de GTIN — decisão de produto em 29/08/2026: Cobasi "
            "nunca monetiza via Awin. Quem gera o link de compra é o "
            "programa MAIS/UTM próprio da Cobasi (cobasi_provider.py, "
            "cobasi_affiliate_mode=\"utm\") — ver AWIN_SELLABLE_MERCHANTS "
            "(sempre vazio) e merchant_routes.py."
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
        commercial_status="approved",
        feed_available=True,
        enabled=True,
        cookie_days=1,
        cpa_percent=3.0,
        feed_id="116779",
        notes=(
            "Inscrito em 19/08/2026; programa lançado em 31/07/2026. "
            "Modelo: Last Click Awin, cookie 1 dia/24h, CPA 3% para "
            "demais categorias (cashback 4%). Painel Awin informa "
            "Otimizado para Celular=Sim e Rastreamento de App=Sim; por "
            "isso o clique deve permanecer browser-side/app-tracking, sem "
            "forçar resolução server-side como Cobasi. ShopWindow: 13.839 "
            "produtos, última atualização hoje no painel informado; feed "
            "116779 observado com aw_deep_link monetizado para publisher "
            "3032803 e advertiser 127557. Restrições: search direto/"
            "indireto, e-mail marketing e pessoa física não permitidos."
        ),
    ),
    "zeedog": AwinAdvertiser(
        merchant="zeedog",
        advertiser_id="127555",
        commercial_status="approved",
        feed_available=True,
        enabled=True,
        cookie_days=14,
        cpa_percent=3.0,
        feed_id="116649",
        notes=(
            "Aprovada 22/08/2026. Feed 116649 observado com 1.799 "
            "produtos e 100% de GTINs válidos/únicos. aw_deep_link já "
            "vem monetizado com publisher 3032803 e advertiser 127555; "
            "feed real usa in_stock=1 com stock_status vazio. "
            "Rastreamento de app: não. Cookie/CPA preservados conforme "
            "configuração anterior; confirmar em relatório antes de "
            "otimizar preferência comercial."
        ),
    ),
    "araujo": AwinAdvertiser(
        merchant="araujo",
        advertiser_id="17919",
        commercial_status="pending",
        # SEM Product Feed (ShopWindow: 0 produtos observados) — nunca
        # deve entrar em awin_merchants_with_feed()/receber um
        # AwinFeedProvider (checado explicitamente em
        # is_awin_merchant_publicly_servable). Uma futura integração
        # exigiria uma fonte de discovery/preço separada da rota de
        # monetização Awin — não inventar catálogo, não fazer scraping.
        feed_available=False,
        enabled=False,
        cookie_days=1,
        cpa_percent=3.1,
        notes=(
            "Não permite pessoa física. Rastreamento de app: não. "
            "Otimização para celular: não. Sem Product Feed — "
            "discovery de produto/preço precisaria vir de outra fonte "
            "autorizada; monetization_route continuaria awin (link "
            "afiliado), mas nunca via AwinFeedProvider genérico."
        ),
    ),
}

# Merchants Awin cujo feed pode alimentar a BUSCA pública por nome/marca
# (GET /commerce/awin-search — nome, foto, preço de catálogo). Zee Now e
# Zee Dog permanecem cadastrados acima para sync/enriquecimento interno de
# catálogo/GTIN (ajudar a casar produto/preço em OUTRAS lojas), mas não
# entram aqui — não são um resultado de busca navegável.
#
# IMPORTANTE: isto NUNCA decide quem pode monetizar/vender — só o que
# aparece como resultado de busca com nome/foto/preço. Quem pode gerar um
# link de compra de verdade é AWIN_SELLABLE_MERCHANTS, abaixo (hoje vazio
# de propósito — ver docstring lá).
AWIN_PUBLIC_COMMERCE_MERCHANTS = frozenset({"cobasi"})

# Merchants Awin cujo feed pode gerar o link de COMPRA (monetizado) via
# AwinFeedProvider — ver commerce_offers.py::build_default_engine().
#
# Decisão de produto em 29/08/2026: PETMOL nunca monetiza através da rede
# Awin, pra nenhum merchant. Awin fica restrito a nome/foto/preço (ver
# AWIN_PUBLIC_COMMERCE_MERCHANTS acima e awin_feed_sync.py) — o clique de
# "Comprar" sempre usa o programa de afiliados PRÓPRIO daquela loja
# (Cobasi → painel MAIS via CobasiProvider/cobasi_utm.py; Petz → storefront
# fixa; Mercado Livre/Shopee → link de afiliado próprio — ver
# homeShoppingPartners.ts). Motivo: cookie de atribuição Awin mais curto e
# comissão nominal ainda não confirmada por venda real, contra o programa
# direto de cada loja, que é confirmado/mais previsível — ver
# merchant_routes.py e cobasi_provider.py.
#
# Deixar este conjunto vazio (em vez de simplesmente apagar o mecanismo) é
# proposital: mantém o "circuit breaker" pronto pra religar Awin como rota
# de venda pra um merchant específico só mudando esta linha, sem reescrever
# lógica, se essa decisão for revisitada.
AWIN_SELLABLE_MERCHANTS: frozenset[str] = frozenset()


def get_awin_advertiser(merchant: str) -> Optional[AwinAdvertiser]:
    return AWIN_ADVERTISERS.get(merchant)


def is_awin_merchant_enabled(merchant: str) -> bool:
    """Status TÉCNICO por merchant, isolado do master gate global (ver
    is_awin_merchant_publicly_servable). Usado por código interno/sync que
    precisa saber "este merchant está pronto tecnicamente" sem se importar
    com awin_enabled/awin_shadow_mode (ex: decidir se vale a pena rodar o
    sync). NUNCA usar isto sozinho pra decidir se algo é exposto ao tutor
    — qualquer caminho que possa chegar numa resposta HTTP pública precisa
    de is_awin_merchant_publicly_servable()."""
    advertiser = AWIN_ADVERTISERS.get(merchant)
    return bool(advertiser and advertiser.enabled)


def is_awin_merchant_publicly_servable(merchant: str) -> bool:
    """O único ponto de decisão pra "este merchant pode gerar uma oferta
    Awin visível/clicável pelo tutor agora". Exige TODOS:
      1. master gate global (config.awin_enabled=True);
      2. não estar em shadow mode (config.awin_shadow_mode=False) — shadow
         é sempre mais restritivo, nunca uma liberação parcial;
      3. o merchant estar individualmente enabled=True em AWIN_ADVERTISERS;
      4. o merchant ter Product Feed (feed_available=True) — sem feed não
         há AffiliateFeedOffer possível (ex: Araújo), então nunca pode ser
         "servable" mesmo que alguém marque enabled=True por engano.
    Usado por build_default_engine() (registro do AwinFeedProvider) e por
    GET /commerce/awin-search — os dois únicos caminhos que podem colocar
    um link Awin na frente de um tutor real. Um `merchant=` explícito não
    pode contornar isto (ver main.py)."""
    from .config import get_settings

    settings = get_settings()
    if not settings.awin_enabled or settings.awin_shadow_mode:
        return False
    if not is_awin_merchant_enabled(merchant):
        return False
    advertiser = AWIN_ADVERTISERS.get(merchant)
    return bool(advertiser and advertiser.feed_available)


def awin_merchants_with_feed() -> list[str]:
    """Merchants cujo programa Awin oferece Product Feed — pré-requisito
    pra popular AffiliateFeedOffer via sync (quando aprovado)."""
    return [m for m, a in AWIN_ADVERTISERS.items() if a.feed_available]


def awin_merchants_publicly_servable() -> list[str]:
    """Merchants que podem aparecer pro tutor agora mesmo — combina o
    master gate global com o status técnico de cada merchant. Lista vazia
    sempre que awin_enabled=False ou awin_shadow_mode=True, mesmo que
    algum merchant esteja enabled=True individualmente."""
    return [m for m in AWIN_ADVERTISERS if is_awin_merchant_publicly_servable(m)]


def awin_merchants_publicly_searchable() -> list[str]:
    """Subset de merchants Awin que podem aparecer como resultado de busca
    por nome/marca (nome, foto, preço de catálogo — GET /commerce/awin-
    search). NÃO decide quem pode gerar link de compra — ver
    AWIN_SELLABLE_MERCHANTS/awin_merchants_publicly_sellable() pra isso.
    Não altera sync/feed interno."""
    return [
        merchant
        for merchant in AWIN_PUBLIC_COMMERCE_MERCHANTS
        if is_awin_merchant_publicly_servable(merchant)
    ]


def awin_merchants_publicly_sellable() -> list[str]:
    """Subset de merchants Awin que podem gerar um link de COMPRA
    monetizado via AwinFeedProvider — ver commerce_offers.py e a docstring
    de AWIN_SELLABLE_MERCHANTS (hoje sempre vazio: Awin nunca monetiza).
    Distinto de "buscável" (awin_merchants_publicly_searchable) — um
    merchant pode aparecer na busca por nome/preço sem nunca vender por
    aqui."""
    return [
        merchant
        for merchant in AWIN_SELLABLE_MERCHANTS
        if is_awin_merchant_publicly_servable(merchant)
    ]


def is_awin_merchant_registrable(merchant: str) -> bool:
    """Decide se AwinFeedProvider(merchant) vale a pena ser INSTANCIADO em
    build_default_engine() — mais permissivo que
    is_awin_merchant_publicly_servable() de propósito, porque também
    cobre o mecanismo de teste por GTIN único (config.awin_test_gtin, ver
    docs/AFFILIATES.md §7): mesmo com awin_enabled=False, se houver um
    GTIN de teste configurado, o provider precisa existir pra poder
    resolver JUSTO aquele produto — mas cada chamada de find_offer()/
    monetize() ainda revalida por conta própria se É o GTIN de teste ou
    se o merchant está publicamente liberado (ver awin_feed_provider.py).
    Sem isso, "registrável" nunca significa "aberto pro catálogo inteiro"
    — só "vale a pena consultar"."""
    from .config import get_settings

    if is_awin_merchant_publicly_servable(merchant):
        return True
    settings = get_settings()
    if not settings.awin_test_gtin:
        return False
    return is_awin_merchant_enabled(merchant) and bool(
        (advertiser := AWIN_ADVERTISERS.get(merchant)) and advertiser.feed_available
    )
