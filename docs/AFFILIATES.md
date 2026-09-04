# Afiliados / Comércio monetizado

Regra definitiva: o PETMOL não manda tráfego comercial gratuito para
varejista/marketplace em produção. Uma loja só aparece como opção de
compra quando existe caminho monetizável real para aquele contexto —
produto específico, oferta de marketplace, ou storefront geral. Clique
afiliado não é receita garantida (venda pode não ocorrer, ficar fora da
janela de atribuição, ser atribuída a outro afiliado, ser cancelada ou
sofrer chargeback) — por isso a terminologia interna é `monetizable` /
`affiliate_eligible` / `affiliate_link`, nunca "comissão garantida".

## Princípio

- O PETMOL possui o **produto** (GTIN, catálogo próprio).
- O **varejista** (retailer) possui a oferta daquele produto.
- O **marketplace** possui publicações/ofertas de vendedores — não é a
  mesma coisa que o produto, e a oferta pode expirar sem afetar o produto.
- O **afiliado** possui um caminho monetizável (link) para aquela oferta.

Essas quatro coisas nunca são confundidas no código: ASIN/listing_id de
marketplace é referência externa, nunca substitui o GTIN; um anúncio
Shopee/ML nunca se torna a identidade do produto.

Desde 01/09/2026, essa separação é codificada explicitamente em
`Product Identity` / `Merchant Match` / `Price`:

- **Product Identity** vem de `products_catalog` (GTIN, nome/marca
  canônicos e atributos de SKU como peso, volume, cm, faixa de peso do
  pet, comprimidos, porte, espécie e linha terapêutica).
- **Merchant Match** é uma decisão auditável (`EXACT`,
  `HIGH_CONFIDENCE`, `AMBIGUOUS`, `CONFLICT`, `NO_MATCH`) gravada junto
  da oferta quando aplicável.
- **Price** é só valor volátil de uma oferta já casada; preço nunca prova
  que duas variações são o mesmo produto.

Detalhes operacionais: `docs/PRODUCT_IDENTITY.md`.

## Lançamento (2026-08-30): **Cobasi + Shopee**

O app lança com **Cobasi** e **Shopee** como lojas ativas. **Petz**
reativou 04/09/2026 (PR #210) como card fixo de Loja Parceira — ver
§Petz. **Mercado Livre** e **Amazon** entram *depois*, quando os
respectivos afiliados forem ligados. Ver `docs/LAUNCH.md` para o
checklist de go-live (flags de produção, sync de ofertas, smoke tests,
rollback).

| Loja | No lançamento | Gate |
|---|---|---|
| Cobasi | **ativa** — discovery de preço + storefront MAIS/UTM (7%, confirmado) | `cobasi_affiliate_mode="utm"` (default); frontend `affiliateStatus: 'active'` |
| Shopee | **ativa** — vitrine (shortlink afiliado) + ofertas por produto | `shopee_affiliate_enabled=True` (default; ficou `False` por ~1 dia no lançamento, voltou após o projeto de precisão #120); frontend `affiliateStatus: 'active'` |
| Petz | **ativa (reativada 04/09/2026)** — card de Loja Parceira fixa (`/parceiro/pettmol`) + cupom, E "Ver na Petz" por produto específico (recompra, busca, item sheets) | frontend `affiliateStatus: 'active'`; backend `petz_publicly_disabled=False` (default desde 04/09/2026, junto com `petz_affiliate_enabled=True` e `petz_coupon_attribution_verified=True`) |
| Mercado Livre | **desativado** (entra depois) | `mercadolivre_affiliate_enabled=False` + `mercadolivre_public_offers_enabled=False` + frontend `affiliateStatus: 'disabled'` |
| Amazon | **desativado** (entra depois) | sem `amazon_associate_tag`; nunca reintroduzido nas superfícies |

## Status por merchant (visão executiva)

Atualizado em 22/08/2026 (lançamento em 30/08 — ver acima). "Discovery" =
como o preço/produto é encontrado; "Monetização" = qual link é de fato
exibido ao tutor hoje (não confundir com feed disponível ou aprovação
comercial — nenhuma das duas por si só libera exposição, ver seção Awin
abaixo).

| Merchant | Rede/programa | Discovery | Monetização real hoje | Feed Awin | Estado |
|---|---|---|---|---|---|
| Cobasi | MAIS/UTM (7%, confirmado) + Awin (advertiser 17870, approved, 8,5% nominal) | API pública VTEX (dinâmico) + Awin feed (GTIN exato) | `route=awin` preferida desde 14/08/2026 (decisão de produto, comissão Awin ainda não validada por venda real); `route=mais` é o fallback e **sempre** vence quando há link cadastrado manualmente (`is_manually_cached`), independente de preferência | sim, 8.398 produtos sincronizados | monetização real ligada; exposição ainda depende de `AWIN_ENABLED=true` em produção |
| Zee Now | Awin (advertiser 127557, approved) | Awin feed (GTIN exato) | nenhuma até sync/exposição produtiva; quando houver linha válida usa `aw_deep_link`, nunca link direto | sim (fid 116779, 13.835 produtos observados; 13.605 GTINs válidos diretos, 152 UPC-11 corrigíveis, 78 inválidos e 9 grupos duplicados em 22/08/2026) | aprovado; preparado para sync genérico `sync_awin_feed.py zeenow`, exposição depende dos gates Awin |
| Zee Dog | Awin (advertiser 127555, approved) | Awin feed (GTIN exato) | nenhuma até sync/exposição produtiva; quando houver linha válida usa `aw_deep_link`, nunca link direto | sim (fid 116649, 1.799 produtos observados, 100% GTIN válido/único em 22/08/2026) | aprovado; preparado para sync genérico `sync_awin_feed.py zeedog`, exposição depende dos gates Awin |
| Petz | Awin (advertiser 127553, pending) + programa próprio "Loja Parceira" | `PetzProductMapping` — aprendizado por produto, confirmação humana (ver §Petz) | **ATIVA (card de Loja Parceira + "Ver na Petz" por produto, reativados 04/09/2026, PR #210 e PR de reativação do gate)** — comissão via cookie `petzPartner` (grava ao abrir `/parceiro/pettmol`, sempre o destino, não importa o que `/commerce/petz-direct-link` devolva) + cupom `PETTMOL` | não | tudo ativo; `petz_affiliate_enabled`/`petz_coupon_attribution_verified`/`petz_publicly_disabled` = True/True/False por padrão |
| Shopee | Shopee Affiliates | `MarketplaceOffer`/`MarketplaceOfferProvider` (busca textual + GTIN como 1ª keyword — API não tem lookup por GTIN) + discovery on-demand por GTIN quando o tutor abre a Loja (background, cooldown por GTIN) | **ATIVA** — vitrine (shortlink) + ofertas por produto. `shopee_affiliate_enabled=True`. Rede de segurança: oferta >36h → sem preço-número ("Conferir preço na loja"), link afiliado preservado. Sync noturno `source=active_products` descobre/revalida ofertas; refresh de preço roda separado em `petmol-commerce-price-refresh.timer` e nunca troca `external_listing_id`. Ver `docs/LAUNCH.md` §7 e `docs/PRODUCT_IDENTITY.md` | n/a | Product Identity Engine ativo; conflito de variação bloqueia preço/oferta em vez de escolher pelo menor preço |
| Mercado Livre | ML Afiliados | `MarketplaceOffer`/`mercadolivre_link_validator.py` — ponte manual controlada | **nenhuma — FORA DO LANÇAMENTO** (`mercadolivre_affiliate_enabled=false`, `mercadolivre_public_offers_enabled=false`, frontend `disabled`); entra depois | n/a | shadow mode; bridge manual pronta (`export_ml_link_candidates.py`/`import_ml_offers.py`); ver PR #56 |
| Amazon | Amazon Associates encerrado em 22/08/2026 (`petmol-20`) | nenhum | nenhum; integração temporariamente removida das superfícies públicas | n/a | disabled — reativação proibida até nova aprovação e nova tag válida |
| Petlove Produtos | — | nenhum | nenhuma | n/a | disabled deliberadamente |
| Petlove Plano de Saúde | — | n/a (service, não produto) | nenhuma | n/a | pending — possível duplicata de DogLife, não confirmado |
| DogLife | — | n/a (service, não produto) | nenhuma | n/a | pending — mesma pendência de esclarecimento |

"Feed disponível" e "commercial_status=approved" **não** implicam
exposição — ver "O gate real: publicly_servable vs registrable" na seção
Awin abaixo para os dois únicos fatores que de fato decidem isso.

## Discovery vs monetização (CommerceEngine)

A busca de produto/preço (`find_offer`) é **sempre dinâmica** e nunca
depende de cadastro manual prévio. Cadastro manual (`ProductAffiliateLink`)
é uma **estratégia de monetização** (`monetize`), não uma pré-condição
para o produto ser encontrado. Isso significa: o PETMOL não precisa
cadastrar milhares de links como pré-requisito de lançamento — a
descoberta funciona pra qualquer produto desde o primeiro dia; só a
comissão fica pendente de cadastro (ou de UTM confirmada) enquanto isso.

Fluxo por provider, sempre nesta ordem:

```
DISCOVERY → MONETIZATION → FILTER (descarta sem monetização) → SORT (menor preço primeiro)
```

Nunca o inverso — nunca "existe link cadastrado? então busca o produto".

- `services/price-service/src/commerce_provider.py` — `ProductContext`
  (identidade: gtin/name/brand/weight_kg/query + campos canônicos),
  `DiscoveredOffer`
  (resultado de `find_offer`), `MonetizedOffer` (resultado final, com
  URL+link_type), `CommerceProvider` (protocolo: `find_offer`+`monetize`),
  `CommerceEngine` (orquestra providers → filtra → ordena por preço).
  `product_name`/`brand` de saída preferem a identidade canônica PETMOL;
  `merchant_product_name` fica só para auditoria.
- `services/price-service/src/cobasi_provider.py` — `CobasiProvider`:
  - `find_offer()`: chama `commerce_pricing.fetch_cobasi_price` (API
    pública VTEX da Cobasi, ao vivo) — roda para qualquer produto.
  - `monetize()`: **link cadastrado manualmente (`ProductAffiliateLink`)
    sempre tem prioridade**, em qualquer modo != `disabled` — trocar
    `cobasi_affiliate_mode` nunca abandona silenciosamente um link já
    comprovado (ex: `mais.app/IvUCAG`). Sem link cadastrado, o modo
    (`cobasi_affiliate_mode`, config.py) decide o resto do catálogo:
    - `cached` (padrão) — sem link, em dev cai pro link cru da Cobasi
      (`link_type=direct`), em prod não monetiza.
    - `utm` — sem link, gera URL com UTM dinamicamente (`cobasi_utm.py`).
      **Não ativado por padrão** — precisa confirmação formal da
      Cobasi/MAIS de que UTM sozinho gera comissão (não confirmado;
      painel MAIS gera `mais.app/...`, não uma URL com UTM simples — ver
      seção "UTM Cobasi" abaixo).
    - `api` — reservado para API oficial futura. Não implementado.
    - `disabled` — Cobasi nunca monetiza (nem link cadastrado é usado).
  - Toda oferta monetizada retorna com `route="mais"` (ver "Rota/dedupe
    por merchant" abaixo) — o mecanismo do programa Minha Loja/MAIS,
    distinto de uma futura rota `"awin"` pro mesmo merchant.
- `services/price-service/src/commerce_offers.py` —
  `build_default_engine(db)` (lista central de providers ativos — hoje só
  `CobasiProvider`; novo provider = uma linha aqui), `get_commerce_offers()`
  (lista completa, ordenada), `resolve_cobasi_product_offer()` (wrapper de
  compatibilidade, primeiro item da lista — usado por
  `/commerce/product-offer`).
- `GET /commerce/offers?q=...&weight_kg=...` — lista de ofertas
  monetizáveis, menor preço primeiro. Contrato multi-provider desde já:
  Shopee/ML/Petz aparecem na mesma lista quando aprovados, sem
  mudar o contrato nem o frontend.
- `GET /commerce/product-offer?q=...&weight_kg=...` — mantido por
  compatibilidade (mesmo formato de sempre, `found`/`url`/`link_type`),
  internamente usa o mesmo `CommerceEngine`.
- `services/price-service/src/merchant_routes.py` —
  `MERCHANT_ROUTE_POLICIES: dict[str, MerchantRoutePolicy]` (hoje só
  `{"cobasi": MerchantRoutePolicy(preferred_route="awin",
  fallback_routes=("mais",))}` — **invertido em 14/08/2026**: Awin (8,5%
  nominal) virou a rota preferida sobre MAIS (7%, confirmado), decisão de
  produto que aceita o risco de a comissão Awin ainda não ter sido
  validada por uma venda real e ter cookie de só 1 dia. Isso sozinho não
  expõe nada — `AWIN_ENABLED=false` no master gate global continua
  controlando se qualquer oferta Awin existe. `PREFERRED_ROUTE_BY_MERCHANT`
  (dict derivado, mantido por compatibilidade) e
  `CommerceEngine._dedupe_by_merchant` (chamado dentro de `get_offers`,
  entre FILTER e SORT): se mais de um provider resolver oferta pro mesmo
  merchant (ex: `CobasiProvider` route="mais" e `AwinFeedProvider("cobasi")`
  route="awin"), mantém só a da rota preferida — nunca mostra "Cobasi"
  duas vezes como se fossem duas lojas. Link cadastrado manualmente
  (`is_manually_cached`) sempre vence os dois, independente de
  preferência — proteção testada explicitamente (ver
  `test_manually_cached_link_survives_even_with_awin_preferred`).
  `fallback_routes` é a rota aceita quando a preferida não resolveu nada
  (ex: produto fora do catálogo Awin sincronizado) — o merchant não some
  do resultado só porque a rota preferida ficou vazia; o dedupe já se
  comporta assim naturalmente (mantém a única oferta que existir),
  `fallback_routes` só torna essa intenção explícita e testável. Sem
  preferência configurada para um merchant, mantém a primeira oferta
  encontrada (ordem de registro em `build_default_engine`).

## UTM Cobasi — por que não está ativada

O painel Minha Loja/MAIS gera links no formato `mais.app/XXXXXX`
(shortlink próprio), não uma URL da Cobasi com UTM simples. Não está
confirmado que anexar `utm_source=mais&utm_medium=maisplataforma&
utm_campaign=lojapetmol` diretamente a uma URL de produto Cobasi (sem
passar pelo painel) gera comissão do mesmo jeito — testes manuais no
painel MAIS (Relatório de Vendas, Dashboard) foram inconclusivos (nenhum
mostra métrica de clique/venda sem uma compra real completa).

**Atualização 01/09/2026 — o que o `mais.app` realmente faz:** resolvi o
shortlink comprovado do Baby (`mais.app/IvUCAG`) pela própria API do MAIS
(`GET api-encurtador.mais.network/Conversion/ConvertUrl/IvUCAG`). Destino:
`https://www.cobasi.com.br/racao-royal-canin-...-3827380/p?utm_source=mais&utm_medium=maisplataforma&utm_campaign=lojapetmol`.
O `mais.app` é só um encurtador — o `scripts.js` faz `fetch(destino)` →
`window.location.href`. A "tela laranja" não carimba atribuição nenhuma; a
atribuição são os 3 UTM numa URL `www.cobasi.com.br` (o painel emite em
`www`, **não** em `minhaloja`). Por isso o PR #145 reverteu a reescrita
forçada pra `minhaloja` do #143 — `build_cobasi_affiliate_url` volta a
preservar o host `www.cobasi.com.br`, idêntico ao link comprovado.

**Ponte `/go/loja` (Android nativo):** `assetlinks.json` de
`www.cobasi.com.br` e `minhaloja.cobasi.com.br` reivindicam `/*` pro app
Android da Cobasi (`com.root.cobasi.Activities`). Um Chrome Custom Tab
pode saltar pro app e a compra lá dentro não carrega o cookie da UTM →
comissão perdida. `navigateToPartnerUrl` (homeShoppingPartners.ts) roteia
link Cobasi/`mais.app` por `petmol.com.br/go/loja` **só no Android
nativo** — a ponte redireciona por JS (`location.replace`), que não é
elegível a App Link, então o Custom Tab não salta. iOS
(SFSafariViewController nunca abre Universal Link) e web/PWA vão direto.
Mesmo princípio da ponte `/go/petz`. **Benefício não medido em device
real ainda** — validar numa compra Android antes de confiar.

Decisão de produto (11/08/2026): usar o link longo com UTM como **ponte
temporária** enquanto uma compra real de teste via PETMOL valida a
atribuição de comissão de fato — não como confirmação formal do
mecanismo. Por isso:

- `build_cobasi_affiliate_url` (`cobasi_utm.py`) existe, é testada, e
  ativar em produção é só `COBASI_AFFILIATE_MODE=utm` no ambiente, sem
  tocar em código/frontend.
- Mesmo com `utm` ativado, **nunca** deixa de usar um link `cached` já
  cadastrado e comprovado (ver "link cadastrado sempre tem prioridade"
  acima) — UTM só cobre produtos sem link manual ainda.
- Ativação em produção passa pelo gate de push/deploy deste documento
  (ver seção "Testes"), não é automática só por este documento existir.
- Awin (ver seção abaixo) já é a rota preferida da Cobasi desde 14/08/2026
  (`merchant_routes.MERCHANT_ROUTE_POLICIES`, não via reescrita do
  `CommerceEngine`) — decisão tomada com a comissão nominal (8,5%) ainda
  não confirmada por venda real, então UTM/MAIS segue relevante como
  fallback pra quando a Awin não resolver algo (produto fora do catálogo
  sincronizado, feed desatualizado, etc.).

## Como funciona (infra de suporte)

- `apps/web/src/features/commerce/homeShoppingPartners.ts` — capacidades de
  cada merchant: `merchantType` (`retailer` | `marketplace` |
  `service`), `affiliateStatus` (`pending` | `approved` | `active` |
  `disabled` — **somente `active` pode aparecer em produção**),
  `affiliateMode`, `supportsProductDeepLink`, `supportsStorefrontAffiliate`,
  `storefrontAffiliateUrl`. `AFFILIATE_ONLY_COMMERCE` decide se o fallback
  sem afiliado é permitido (só em dev).
- `services/price-service/src/affiliate_links.py`:
  - `ProductAffiliateLink` (tabela `product_affiliate_links`) — override/
    cache da estratégia `cached` de `CobasiProvider.monetize` (ver seção
    acima), não pré-condição de discovery. Um por produto+merchant
    (`UniqueConstraint`) — é uma relação estável, não uma oferta que expira.
  - `MarketplaceOffer` (tabela `marketplace_offers`) — oferta/publicação de
    um vendedor em um **marketplace** (Shopee, ML) para um produto. Pode
    haver várias por produto+merchant (vendedores diferentes), e cada uma
    pode expirar (`active=false`) sem afetar o produto PETMOL. Nenhuma
    integração real popula esta tabela ainda — existe só para a
    arquitetura já suportar o conceito quando os programas forem
    aprovados (ver "Marketplace — arquitetura pronta" abaixo).
  - `get_monetized_offer(db, merchant, context, product_id)` — a lógica de
    resolução, por `context`:
    - `"product"`: só retorna oferta se existir `ProductAffiliateLink`
      ativo daquele produto específico. Nunca cai para a storefront genérica.
    - `"store"`: só retorna a storefront afiliada fixa do merchant
      (`STOREFRONT_AFFILIATE_URLS`), quando existir.
    - `"marketplace"`: só retorna oferta se existir `MarketplaceOffer`
      ativa daquele produto+merchant.
- `GET /commerce/monetized-offer?merchant=...&context=product|store|marketplace&gtin=...`
  — endpoint público de leitura para testar a resolução acima.
- O casamento produto↔link é pelo campo `ean` que a própria API da Cobasi
  retorna por SKU, cruzado com `products_catalog.barcode_normalized` —
  evita precisar de GTIN vindo do frontend/scanner (não alterado nesta
  tarefa) e evita casar por nome/marca (embalagens diferentes do mesmo
  produto têm GTINs diferentes; ver `_select_item_by_weight` em
  `commerce_pricing.py`).
- `/v1/admin/affiliate-links` (GET/POST/PATCH/DELETE, protegido por
  `get_current_admin`/`get_current_admin_or_readonly_key`) — cadastro
  manual de `ProductAffiliateLink` por GTIN, enquanto `cobasi_affiliate_mode`
  estiver em `cached` (padrão) e não houver API oficial da rede para gerar
  isso automaticamente. `config.affiliate_only_commerce_enforced` amarra a
  aplicação estrita ao `env` (prod → true; dev → fallback direto
  permitido). Não existe ainda admin CRUD para `MarketplaceOffer`
  (nada popula essa tabela hoje — nem deveria, ver seção Marketplace).
- `isPartnerVisibleInStoreArea`/`isPartnerVisibleForSearch`
  (`homeShoppingPartners.ts`) — filtram quais merchants aparecem na área
  geral "Lojas" e no picker de busca manual (`QuickBuyRow`, em
  `HomeShoppingSheet.tsx`) em produção: exigem `affiliateStatus === 'active'`
  E (storefront OU afiliado de busca configurado). Em dev mostram os 8
  sempre, para teste. Distinto de `useCommerceOffers`/`MonetizedOffersList`
  (ofertas auto-descobertas e ranqueadas) — `QuickBuyRow` é a escolha
  manual do tutor entre lojas quando nenhuma oferta automática existe.
- `trackClick`/`AnalyticsEvent.link_type` — todo clique comercial registra
  se o link aberto foi `affiliate_product`, `affiliate_marketplace_offer`,
  `affiliate_store`, `affiliate_service`, `affiliate_search` ou `direct`
  (este último só aparece em dev).
- `apps/web/src/features/commerce/AffiliateCatalogSearch.tsx` (renomeado
  de `CobasiAwinSearch.tsx` em 14/08/2026 — mesmo comportamento, só nome/
  copy neutros) — busca textual no catálogo Awin sincronizado
  (`GET /commerce/awin-search`), sempre que o tutor escolhe "Comprar" manda
  só `gtin` pro `GET /commerce/offers` (nunca texto — ver comentário no
  componente), deixando `AwinFeedProvider` resolver por GTIN exato em vez
  do `CobasiProvider` competir com uma busca textual imprecisa em
  paralelo. Multi-loja por natureza: quando outro merchant Awin virar
  `publicly_servable`, aparece aqui sem mudar o componente.
- **GTIN na ficha de ração** — `FeedingPlanItemEntry.barcode` (escaneado
  pelo tutor) é propagado ponta a ponta desde 14/08/2026:
  `petCareDomain.processFood()` → `PetCareReminder.gtin` →
  `petStoreContent.buildReorderCards()` → `ReorderCard.gtin` →
  `FoodControlTabState.gtin`/`FoodItemSheet` → `MonetizedOffersList` →
  `useCommerceOffers(query, packageSizeKg, gtin)`. Antes disso, todo
  fluxo de "Comprar novamente" mandava só texto, mesmo quando o GTIN já
  era conhecido — nenhum provider estruturado (`AwinFeedProvider`)
  conseguia resolver por essas telas. `ParasiteControl` (antiparasitário)
  **não tem campo estruturado de GTIN** — um código escaneado ali cai em
  `notes` como texto livre; corrigir isso exigiria uma migration de
  schema, fora do escopo desta tarefa (ver "Pendências conhecidas"
  no final deste documento).

## Cadastrar um deep link de retailer (Cobasi) — só o modo "cached"

Isto NÃO é pré-requisito para o produto aparecer na busca — é como
adicionar comissão a um produto que o `CobasiProvider` já encontra e
mostra preço de qualquer forma (`link_type=direct` em dev, ou nada em
prod até cadastrar). Enquanto `cobasi_affiliate_mode=cached` (padrão):

1. Confirme o GTIN já está em `products_catalog` (escaneie o produto no app
   ou use `GET /products/catalog/search?q=...`).
2. No painel Minha Loja Cobasi/MAIS, gere o link afiliado do produto
   específico.
3. `POST /v1/admin/affiliate-links` com `{"gtin": "...", "merchant":
   "cobasi", "affiliate_product_url": "https://..."}` (precisa de sessão
   admin — mesmo login usado no resto do admin).
4. Confirme com `GET /commerce/offers?q=...&weight_kg=...` (ou
   `GET /commerce/monetized-offer?merchant=cobasi&context=product&gtin=...`).

Desativar um link: `PATCH /v1/admin/affiliate-links/{id}` com
`{"active": false}` — some da UI sem deploy de frontend.

## Shopee — API oficial liberada, gate ainda desligado (21/08/2026)

Status real: `petmol.com.br` confirmado como **mídia aprovada** no Portal
do Afiliado, e a Shopee liberou acesso à **Plataforma Aberta de
Afiliados** (API GraphQL real, AppId/Secret próprios) — diferente da
Amazon, aqui não é "link de busca com tag", é uma API estruturada de
verdade, com `productOfferV2`/`shopOfferV2` (preço, comissão, vendas reais
— dado oficial da Shopee, nunca scraping) e `generateShortLink`.
Confirmado por introspecção de schema + busca real contra a API ao vivo
em 21/08/2026 (não só documentação de terceiros).

Diferença importante em relação à Cobasi/Awin: a API da Shopee **não tem
lookup por GTIN exato**, só busca por palavra-chave — por isso existe
`shopee_offer_matcher.py`: marca e peso divergentes são **desqualificação
obrigatória** (nunca "só desconta pontos"), pra nunca publicar a oferta
Shopee de um produto errado no grid de preço de outro. Testado com 27
testes (matcher + client + sync) e validado manualmente contra um produto
real do catálogo (casamento correto, nenhum falso positivo nos casos
adversariais testados).

Ainda **não implementado**, deliberadamente: busca em massa pro catálogo
inteiro (custo de rede + risco de casamento por produto — sync roda por
GTIN específico, nunca "todo mundo de uma vez"), scraping, crawler
automático fora do sync explícito, escolha automática de vendedor sem
passar pelo matcher, ou qualquer modificação da URL que a Shopee retorna
(regras do programa proíbem modificar o link emitido e exigem clique
voluntário — sem redirect automático, sem cookie stuffing).

O que já existe, pronto e testado — `shopee_affiliate_enabled` segue em
`False` até uma decisão explícita de ligar em produção:

- `services/price-service/src/shopee_link_validator.py` —
  `validate_shopee_affiliate_url(url)`: aceita só https + domínio da
  allowlist (`shopee.com.br`, `s.shopee.com.br` — documentada no próprio
  módulo, nunca "qualquer coisa terminando em shopee"), nunca adiciona/
  remove parâmetro, rejeita ataque de prefixo (`shopee.com.br.golpe.com`)
  e de domínio colado (`golpeshopee.com.br`) pela mesma lógica de
  subdomínio real que o validador da Amazon usa no frontend.
- `services/price-service/src/marketplace_offer_provider.py` —
  `MarketplaceOfferProvider(db, merchant)`, um `CommerceProvider` que só
  lê `MarketplaceOffer` (nunca chama a rede da Shopee, nunca gera link).
  `is_marketplace_merchant_publicly_servable(merchant)` é o master gate —
  hoje só cobre `"shopee"`, via `config.shopee_affiliate_enabled`
  (**`False` por padrão**); revalidado a cada `find_offer()`/`monetize()`,
  não só no registro em `build_default_engine()` (defesa em profundidade,
  mesmo padrão do Awin). `monetize()` **revalida o domínio no momento do
  clique** antes de retornar a URL — nunca confia só na validação feita
  no cadastro. Ofertas sem preço nunca aparecem (`CommerceEngine`
  descarta oferta sem preço) — como nunca fazemos scraping de preço, uma
  oferta só é visível quando o admin confirmou um preço real junto do
  link oficial.
- `POST/GET/PATCH/DELETE /v1/admin/marketplace-offers` (admin CRUD,
  `admin/marketplace_offers_router.py`) — cadastra `MarketplaceOffer` a
  partir do link oficial que o Portal do Afiliado emitir; rejeita
  qualquer URL que não passe por `validate_shopee_affiliate_url` (400),
  nunca aceita merchant sem validador próprio configurado. É o único
  jeito de um link Shopee entrar no sistema — nunca por template/UI.
- `merchantType: 'marketplace'` já diferencia Shopee/ML de retailers em
  `homeShoppingPartners.ts` — a entrada `shopee` ali é só o ícone/link
  genérico da área "Lojas" (`directUrl`, sem afiliado), continua
  `affiliateStatus: 'pending'` (invisível em produção pelas mesmas
  checagens de sempre) e **não** é o caminho do link oficial por produto
  — esse vive inteiramente no backend acima.
- `services/price-service/src/shopee_affiliate_client.py` — cliente da
  API GraphQL (`https://open-api.affiliate.shopee.com.br/graphql`),
  assinatura `SHA256(AppId+ts+payload+Secret)` no header `Authorization`.
  Única chamada real à rede da Shopee em todo o código; nunca roda no
  caminho de requisição do tutor.
- `services/price-service/src/shopee_offer_matcher.py` — casamento
  produto↔candidato por marca (obrigatória, se informada) + peso
  (obrigatório se extraível do nome esperado, tolerância 5%) + sobreposição
  de tokens do nome. Retorna `None` (nunca "o menos pior") quando marca ou
  peso não batem, não importa quão parecido o nome pareça.
- `services/price-service/src/shopee_offer_sync.py` +
  `scripts/sync_shopee_offers.py` — busca+casa+upsert em `MarketplaceOffer`
  por GTIN específico (`python3 scripts/sync_shopee_offers.py <gtin> ...`).
  Idempotente (chave: product_id+merchant+external_listing_id); nunca
  desativa uma oferta existente só por não achar candidato confiável nesta
  execução.

### Como ligar a Shopee em produção

Mídia aprovada e API já confirmadas (21/08/2026) — falta só a decisão de
ligar de fato:

1. Rodar `python3 scripts/sync_shopee_offers.py <gtin> ...` pros produtos
   que se quer cobrir (não em massa — GTIN a GTIN, ou uma lista curada).
2. Confirmar com `GET /v1/admin/marketplace-offers?gtin=...` que a oferta
   casada é realmente a certa antes de confiar nela.
3. Setar `SHOPEE_AFFILIATE_ENABLED=true` em produção — antes disso,
   nenhuma oferta aparece a nenhum tutor mesmo com linhas cadastradas.
4. Cadastro manual (`POST /v1/admin/marketplace-offers` com o link exato
   colado do Portal) continua funcionando em paralelo, pros casos em que
   se prefere não depender do casamento automático por palavra-chave.
5. Nunca reescrever a URL retornada pela Shopee — se o formato mudar, o
   procedimento é re-sincronizar (passo 1), não "consertar" a URL antiga.

## Amazon — desativada temporariamente

A conta Amazon Associates vinculada à tag `petmol-20` foi encerrada em
22/08/2026. Essa tag não pode ser tratada como ativa, não pode ser usada
como fallback e não pode ser reutilizada em qualquer superfície pública
do PETMOL.

A integração Amazon está temporariamente desativada no app. Não há card,
botão, fallback, link de busca, link de produto, declaração comercial
específica ou rota pública que deva gerar tráfego para Amazon enquanto
não houver nova candidatura aprovada e nova tag válida emitida.

Reativação futura exige uma nova decisão explícita de produto e código:
criar/validar uma nova fonte central de verdade para o estado do
parceiro, configurar uma nova tag válida e adicionar testes garantindo
que a tag antiga não volte como fallback. Não registrar o conteúdo
integral de comunicações da Amazon neste repositório.

### Variáveis de ambiente — Shopee

Awin já tem as próprias documentadas na seção abaixo.

| Variável | Onde | Default | Efeito |
|---|---|---|---|
| `SHOPEE_AFFILIATE_ENABLED` | backend | `false` | Master gate — `true` só depois do primeiro link oficial validado (ver procedimento acima) |
| `SHOPEE_APPROVED_MEDIA` | backend | `"https://www.petmol.com.br"` | Documentação de qual mídia estamos tentando confirmar no Portal — **não aprova nada sozinho** |

## Awin — rede de afiliados (não merchant)

PETMOL está cadastrado na Awin (Publisher ID `3032803`) como rede de
afiliados. **Awin é a rede — Cobasi, Petz, Zee Now, Zee Dog e Araújo são
merchants (advertisers) dentro dela**, cada um com seu próprio status
comercial, cookie window e comissão; nunca tratados como "a mesma coisa"
por estarem na mesma rede.

Situação real das contas em 22/08/2026 — **Cobasi, Zee Dog e Zee Now aprovadas**
(confirmado no painel Awin: Anunciantes → Meus Programas → "Seus
Anunciantes"); Petz segue `commercial_status=pending`:

| Merchant | advertiser_id | feed disponível | fid | comissão | cookie | status comercial |
|---|---|---|---|---|---|---|
| Cobasi | 17870 | sim (8.398 produtos, sincronizado) | 48117 | 8,5% | 1 dia | **approved** |
| Petz | 127553 | não | — | 3% | 14 dias | pending |
| Zee Now | 127557 | sim (13.835 observados, pronto para sync; `in_stock=1`, `stock_status` vazio, `product_type` como categoria) | 116779 | 3% | 1 dia | **approved** |
| Zee Dog | 127555 | sim (1.799 observados, 100% GTIN válido/único, pronto para sync) | 116649 | 3% | 14 dias | **approved** |

### O gate real: `publicly_servable` vs `registrable`

Status comercial aprovado e feed disponível **não** implicam exposição.
Só dois fatores decidem se um link Awin pode chegar a um tutor real —
ambos em `services/price-service/src/awin_advertisers.py`:

- **`is_awin_merchant_publicly_servable(merchant)`** — o único ponto de
  decisão pra "esse merchant pode gerar uma oferta Awin visível/clicável
  agora". Exige TODOS: (1) `config.awin_enabled=True` (master gate
  global, **`False` por padrão**); (2) `config.awin_shadow_mode=False`
  (shadow é sempre mais restritivo, nunca uma liberação parcial); (3) o
  merchant `enabled=True` em `AWIN_ADVERTISERS`; (4) `feed_available=True`
  (sem feed nunca pode ser servable, mesmo com `enabled=True` por engano
  — ex: Araújo). Consultado em dois pontos, de propósito (defesa em
  profundidade): `build_default_engine()` (registro do provider) e de
  novo dentro de `AwinFeedProvider.find_offer()`/`monetize()` a cada
  chamada — um provider registrado por engano nunca resolve nada sozinho.
  Também é o que `GET /commerce/awin-search` consulta; um `merchant=`
  explícito na query **não** contorna isso (bug real encontrado e
  corrigido em 14/08/2026 — o parâmetro pulava o filtro de merchants
  habilitados por completo).
- **`is_awin_merchant_registrable(merchant)`** — mais permissivo de
  propósito: verdadeiro quando `publicly_servable` já é verdadeiro, OU
  quando `config.awin_test_gtin` está configurado (mecanismo de teste de
  compra real por GTIN único, ver abaixo) e o merchant é tecnicamente
  elegível. Decide só se `AwinFeedProvider(merchant)` vale a pena
  **existir** em `build_default_engine()` — nunca decide sozinho se algo
  é exibido; cada chamada de `find_offer()`/`monetize()` revalida por
  conta própria.

Hoje (`awin_enabled=False`, padrão real): `awin_merchants_publicly_servable()`
retorna lista vazia mesmo com Cobasi `enabled=True` — nenhum link Awin
chega a nenhum tutor. **Bug crítico encontrado e corrigido em 14/08/2026**:
antes desta correção, `AWIN_ENABLED`/`AWIN_SHADOW_MODE` eram config morta
(zero código lia essas variáveis) — quando o contexto de busca não tinha
`query` (exatamente o que a busca por GTIN manda, ver
`AffiliateCatalogSearch.tsx`), `CobasiProvider` não resolvia nada e
`AwinFeedProvider` virava o único resolvedor, vazando o link Awin mesmo
sem nenhuma validação de comissão. Regressão coberta em
`test_awin_never_leaks_when_master_gate_off_even_as_sole_resolver`
(`test_commerce_offers_awin_dedupe.py`).

### Mecanismo de teste por GTIN único (validação de compra real)

`config.awin_test_gtin` (env var, server-side only, nunca frontend/git/
log) permite que **um único produto** resolva via Awin mesmo com
`awin_enabled=False` — pra validar com uma compra real se a comissão de
fato acontece, sem abrir o catálogo inteiro pro resto dos tutores.
`AwinFeedProvider._is_authorized()` aceita resolução quando o merchant é
`publicly_servable` OU quando `context.gtin` normalizado bate
exatamente com `awin_test_gtin` normalizado — nenhum outro GTIN se
beneficia da exceção. Não existe endpoint público que troque essa
variável nem que altere a rota; ativar/desativar é só setar/remover a
env var no VPS e reiniciar o serviço — reversível a qualquer momento,
sem deploy de código.

### Persistência e observabilidade

- `services/price-service/src/awin_advertisers.py` —
  `AWIN_ADVERTISERS: dict[str, AwinAdvertiser]` (chave: `"cobasi"`,
  `"petz"`, `"zeenow"`, `"zeedog"`) com os dados da tabela acima,
  `enabled=True` só para Cobasi.
- `services/price-service/src/affiliate_feed.py` — `AffiliateFeedOffer`
  (tabela `affiliate_feed_offers`, Postgres via `Base.metadata.create_all`
  como todo o resto — **sem** segundo banco/SQLite). Uma linha = uma
  oferta comercial normalizada vinda de um feed externo (network +
  merchant + external_product_id, GTIN, preço, estoque, `affiliate_url`
  pronta). Distinta de `products_catalog` (identidade do produto, nunca a
  oferta) e de `ProductAffiliateLink`/`MarketplaceOffer` (mecanismos de
  monetização existentes, que continuam funcionando do mesmo jeito).
  Também define `AffiliateFeedSyncRun` — uma linha por execução do sync
  (`network`, `merchant`, `status` ∈ `running`/`success`/`empty_feed`/
  `failed`, contadores `rows_seen`/`rows_upserted`/`rows_deactivated`/
  `rows_with_gtin`/`rows_with_affiliate_url`/`rows_in_stock`,
  `error_message` sanitizado — max 300 chars, nunca URL/token/CSV bruto).
  Histórico/observabilidade do job, nunca dado de negócio.
- `services/price-service/src/awin_feed_provider.py` — `AwinFeedProvider(db,
  merchant)`, um `CommerceProvider` por merchant (não um provider genérico
  "awin"). `find_offer()`: exige `context.gtin` (feed estruturado — GTIN é
  o caminho primário, sem fallback textual), só `active=True`+`in_stock=True`,
  escolhe a linha certa entre várias pelo peso (`_select_row_by_weight`).
  `monetize()`: usa `affiliate_url` **da própria linha do feed** — nunca
  gera link, nunca cai pra `merchant_url` limpa em produção. Retorna
  `route="awin"`. **Nunca chama a API/feed da Awin diretamente** — só lê
  o que `awin_feed_sync.py` já gravou (sync em lote → Postgres → leitura
  local por clique). Duas camadas de proteção: `_is_authorized()` (gate +
  exceção de GTIN de teste, ver acima) e `_is_catalog_fresh()` — mesmo
  com o merchant liberado, uma oferta só é considerada se o último sync
  bem-sucedido não estiver mais velho que `config.awin_stale_after_hours`
  (padrão 36h) — catálogo desatualizado nunca vira link silenciosamente.
- `services/price-service/src/feeds/` (`base.py`, `awin.py`, `cityads.py`,
  `database.py`) — código legado/experimental de uma tentativa anterior.
  Zero imports em qualquer caminho alcançável do app real. `database.py`
  criaria um SQLite separado (`data/products.db`) se importado — nunca
  acontece. Não apagado (histórico), não conectado a nada.
- `services/price-service/src/awin_feed_sync.py` — `sync_awin_feed(db,
  merchant)`, a única chamada real à Awin em todo o código. Baixa o
  Product Feed (CSV gzip) via `httpx`, faz parse e **upsert em lote real**
  (uma instrução `INSERT ... ON CONFLICT DO UPDATE` por batch de 500
  linhas via `executemany`, não uma instrução por linha). Lock: uma
  `AffiliateFeedSyncRun` `running` sem `finished_at` bloqueia nova sync
  do mesmo merchant (considerada morta/travada depois de 30min). Feed
  vazio (`rows_seen=0`) marca a run como `empty_feed` e **levanta erro
  sem desativar o catálogo anterior** — nunca esvazia silenciosamente por
  uma falha transitória do feed. Produtos que somem do feed entre duas
  rodadas normais são marcados `active=False` (nunca apagados); voltam a
  `active=True` se reaparecerem. Controlado por
  `config.awin_sync_enabled` (`True` por padrão) — kill switch
  independente do master gate de exposição (sincronizar catálogo ≠
  exibir oferta ao tutor). Roda em lote via
  `scripts/sync_awin_feed.py <merchant>` (cron/job externo, nunca por
  requisição HTTP do frontend). **Primeira rodada real (13/08/2026):
  8.398/8.398 produtos da Cobasi sincronizados com sucesso.**
- `services/price-service/src/affiliate_feed_metrics.py` +
  `GET /v1/admin/affiliate-feed/metrics` (admin-only, nunca público) —
  por merchant: linhas ativas, taxa de cobertura de GTIN, taxa de
  `affiliate_url` presente, taxa em estoque, staleness vs. o último sync
  de sucesso, e `publicly_servable` (o mesmo cálculo real, nunca um
  espelho que possa divergir). Observabilidade pra decidir quando um
  merchant está tecnicamente pronto — nunca gera nem expõe nenhuma
  oferta.
- `config.py`: `awin_publisher_id` (`"3032803"`, não é segredo),
  `awin_datafeed_key` (segredo — baixa o feed; `AWIN_DATAFEED_KEY` server-
  side only), `awin_oauth_token` (segredo — Publisher API/reporting,
  ainda não consumido em código), `awin_enabled` (`False`),
  `awin_shadow_mode` (`False`), `awin_sync_enabled` (`True`),
  `awin_stale_after_hours` (`36`), `awin_test_gtin` (`None`),
  `awin_sync_interval_minutes` (`1440`, batch diário). Ver
  `/opt/petmol/shared/env/api.env` no VPS pro caminho real dos env files
  de produção.
- **Roteiro de ativação da Cobasi:** (1) ✅ token+fid obtidos, sync real
  implementado e rodado; (2) ✅ `enabled=True` pro Cobasi em
  `AWIN_ADVERTISERS`; (3) ✅ master gate real implementado
  (`is_awin_merchant_publicly_servable`), provider registrado
  condicionalmente via `is_awin_merchant_registrable`; (4) ✅ **decisão de
  produto em 14/08/2026** — rota preferida da Cobasi trocada de `mais`
  pra `awin` em `MERCHANT_ROUTE_POLICIES`, aceitando o risco de a
  comissão Awin (8,5% nominal, contra 7% confirmado da MAIS) ainda não
  ter sido validada por uma compra real — cookie de só 1 dia pode reduzir
  o valor realizado abaixo do nominal. Link cadastrado manualmente
  continua protegido independente disso. (5) **pendente** — ligar
  `AWIN_ENABLED=true` em produção (`/opt/petmol/shared/env/api.env`) é o
  que de fato expõe qualquer link Awin a um tutor; até lá, a troca de
  rota acima não tem efeito visível nenhum.
- Zee Dog e Zee Now estão aprovadas e configuradas com `enabled=True`
  (fids 116649 e 116779), mas só devem aparecer depois de sync válido e
  gates Awin autorizados; a resolução continua exclusivamente por GTIN
  exato e `aw_deep_link` monetizado. Araújo permanece `enabled=False`, sem
  sync, sem aprovação e nunca pode virar `AwinFeedProvider`: sem Product
  Feed, exigiria uma fonte de discovery separada, não implementada.
- Nenhum scraping, sem Redis/Elasticsearch, sem armazenar imagens (só a
  URL do feed), sem segundo banco/SQLite pra isso.

## Testes

176 testes relevantes a afiliados/comércio em
`services/price-service/tests/` (de 193 no total do serviço; nenhum chama
API real de Cobasi ou Awin — `fetch_cobasi_price` é sempre monkeypatchado
quando o teste precisa de discovery, `AwinFeedProvider` só lê
`AffiliateFeedOffer` local, e `awin_feed_sync.py` sempre tem
`fetch_feed_csv` monkeypatchado com um CSV fixo em memória — nenhum teste
baixa o feed real):

- `test_affiliate_links.py` (26) — storefront geral (Cobasi aparece, Petz
  não), recompra sem/com deep link, GTIN diferente não reaproveita link
  de outro produto, dev vs prod, desativar link esconde a oferta na hora,
  validação de URL do cadastro admin, matriz de marketplace, contrato do
  endpoint `gtin`/`q` opcionais.
- `test_commerce_provider.py` (9) — `CommerceEngine`: ordena por menor
  preço (3 providers fake), descarta oferta sem monetização, provider sem
  discovery é ignorado, discovery roda sem qualquer cadastro prévio,
  dedupe por merchant mantém a rota preferida (`merchant_routes.py`) e,
  sem preferência configurada, mantém a primeira oferta encontrada.
- `test_commerce_pricing.py` (11) — `_select_item_by_weight`: escolhe o
  SKU certo entre variantes de tamanho (kg e g), sem peso alvo preserva
  comportamento antigo (primeiro item); `_shorten_query_variants`/
  `_select_product_by_port`/`_infer_port`: fallback de query verbosa,
  desambiguação por porte/raça, reconhece "média"/"médias".
- `test_cobasi_utm.py` (9) — `build_cobasi_affiliate_url`: adiciona/
  preserva/remove UTM corretamente, idempotente em chamadas repetidas,
  rejeita não-https/domínio não-Cobasi/`javascript:`.
- `test_cobasi_provider.py` (14) — `CobasiProvider` por modo
  (cached/utm/api/disabled), confirma que o padrão é `cached` mesmo com
  `ENV=prod`, `find_offer()` funciona sem `ProductCatalog`/
  `ProductAffiliateLink` nenhum no banco, **link cadastrado tem
  prioridade mesmo em modo `utm`** (não abandona link comprovado).
- `test_affiliate_feed.py` (3) — `AffiliateFeedOffer`: constraint de
  unicidade (network+advertiser_id+external_product_id), índices.
- `test_awin_advertisers.py` (13) — `AWIN_ADVERTISERS`: dados corretos
  por merchant, Cobasi `approved`+`enabled=True`+`feed_id`, as demais
  `pending`/`enabled=False`, Araújo sem feed nunca `publicly_servable`
  mesmo com master gate ligado e `enabled` forçado por engano, nenhuma
  credencial commitada, `awin_merchants_publicly_servable()` vazia por
  padrão.
- `test_commerce_offers_awin_dedupe.py` (7) — prova, com `CobasiProvider`
  e `AwinFeedProvider` **reais** (não fakes) registrados juntos, que
  link cadastrado manualmente sempre vence os dois, independente de
  preferência de rota; **o bug crítico do master gate** (Awin nunca é a
  única oferta visível com `awin_enabled=false`, mesmo como único
  resolvedor); shadow mode bloqueia mesmo com master gate ligado; Awin
  (rota preferida desde 14/08/2026) resolve quando MAIS não tem nada; e
  a direção inversa — MAIS entra como fallback quando a Awin não resolve
  nada pro GTIN (produto fora do catálogo sincronizado).
- `test_awin_feed_provider.py` (15) — `AwinFeedProvider`: só resolve por
  GTIN exato, ignora inativo/fora de estoque, escolhe linha certa por
  peso entre várias, `monetize()` nunca cai pra `merchant_url` limpa,
  merchant desabilitado nunca encontra nada, catálogo velho (>
  `awin_stale_after_hours`) bloqueia mesmo autorizado, catálogo fresco
  libera, GTIN de teste único autoriza `find_offer`/`monetize` mesmo sem
  `publicly_servable` e nunca abre o resto do catálogo.
- `test_awin_feed_sync.py` (15) — `sync_awin_feed`: upsert em lote real a
  partir do CSV do feed, produto que some do feed vira `active=False`
  (nunca apagado), volta a `active=True` se reaparecer, `stock_status`
  vira `in_stock` corretamente (inclusive `"disponível"`, valor real do
  feed da Cobasi), sync desabilitado (`awin_sync_enabled=False`) nunca
  toca a rede, feed vazio nunca desativa o catálogo anterior, sync
  concorrente do mesmo merchant é bloqueada pelo lock, `AffiliateFeedSyncRun`
  registrada em sucesso e falha (sem vazar URL/token no erro sanitizado).
- `test_merchant_routes.py` (4) — `MerchantRoutePolicy`: Cobasi prefere
  `awin` desde a decisão de 14/08/2026, lista `mais` como fallback,
  merchant desconhecido não tem preferência nem fallback,
  `PREFERRED_ROUTE_BY_MERCHANT` derivado corretamente.
- `test_commerce_awin_search.py` (14) — `GET /commerce/awin-search`:
  master gate desligado bloqueia mesmo com dado real, `merchant=`
  explícito **não contorna** o master gate (o bug corrigido), shadow mode
  bloqueia com master gate ligado, merchant sem feed nunca servable
  mesmo `enabled` por engano, resultado ordenado por preço via SQL
  (`ROW_NUMBER()`/`COUNT()` em janela, não agrupamento em Python).
- `test_affiliate_feed_metrics.py` (5) — endpoint admin-only exige auth,
  lista todo merchant configurado mesmo sem sincronizar nada, taxas de
  cobertura calculadas corretamente, staleness reflete o último sync de
  sucesso real, `publicly_servable` no relatório usa o mesmo cálculo do
  master gate real.
- `test_shopee_link_validator.py` (12) — `validate_shopee_affiliate_url`:
  link oficial passa sem alteração (byte a byte), domínio apex e
  subdomínio aceitos, parâmetros nunca alterados, rejeita http/`javascript:`/
  `data:`, rejeita domínio forjado por prefixo (`shopee.com.br.golpe.com`)
  e por colagem (`golpeshopee.com.br`), rejeita domínio não relacionado/
  vazio/malformado.
- `test_marketplace_offer_provider.py` (10) — `MarketplaceOfferProvider`:
  desligado por padrão nunca encontra nada, resolve por GTIN ou
  `product_id` direto quando ligado, oferta sem preço nunca é inventada
  (fica `None`, quem descarta é o `CommerceEngine`), oferta inativa
  nunca aparece, `monetize()` retorna a URL oficial sem alteração,
  revalida o domínio no clique (rejeita se o dado salvo ficou inválido),
  desligado bloqueia `monetize()` também, merchant marketplace
  desconhecido nunca é "publicly servable".
- `test_marketplace_offers_router.py` (9) — admin CRUD
  `/v1/admin/marketplace-offers`: cria com link oficial válido, rejeita
  domínio Shopee forjado e http, rejeita merchant sem validador
  configurado (nunca aceita "qualquer https://" por omissão), exige
  produto já no catálogo, PATCH com URL inválida não altera o valor
  salvo, desativar/deletar, filtro por gtin/merchant.

Frontend: `apps/web/vitest.config.ts` (setup mínimo de testes do
frontend):
- `homeShoppingPartners.test.ts` — confirma que somente Cobasi, Shopee,
  Zee Now e Zee Dog ficam no cadastro exposto ao app, e que uma variável
  Amazon configurada não recoloca Amazon nem a tag antiga nos links.
- `publicCommercePages.test.ts` — confirma que `/loja`, `/guias` e
  `/guias/[slug]` retornam 404 e que o sitemap não lista essas rotas.

`isPartnerVisibleInStoreArea`/`isPartnerVisibleForSearch` (regra
`affiliateStatus === 'active'`) e o fluxo de GTIN ponta a ponta na ficha
de ração continuam verificados por leitura de código e `tsc --noEmit`
além dos testes acima, não por teste automatizado dedicado.

## Prioridade comercial (estratégia, não hardcode)

1. Cobasi (ativo — MAIS + Awin)
2. Shopee (mídia aprovada + API oficial liberada 21/08/2026; mecanismo pronto e testado, `SHOPEE_AFFILIATE_ENABLED` ainda `false` até decisão de ligar)
3. Zee Now / Zee Dog (Awin aprovado, dependem de sync e gates)
4. Mercado Livre (pending)
5. Petz (pending — após resolução do CNAE)

Petlove Produtos: aguardar programa de catálogo completo adequado.
Petlove Saúde: avaliar posteriormente (critérios próprios de
aprovação/audiência).
DogLife/Araújo: aguardar confirmação de programa real.

## Compliance por merchant

Campos "unknown"/"pending verification" quando não confirmados — nunca
preencher informação desconhecida como se fosse conhecida.

### Awin (rede)

Não é um merchant — não tem `merchant_type`/`affiliate_mode` próprios.
Compliance é por advertiser dentro da rede (tabela abaixo); a rede em si
só tem publisher ID e token de API.

| Campo | Valor |
|---|---|
| network_name | Awin |
| publisher_id | 3032803 (não é segredo) |
| datafeed_key | não commitado; server-side env only (`AWIN_DATAFEED_KEY`), nunca `NEXT_PUBLIC_*` — usado por `awin_feed_sync.py` pra baixar o Product Feed |
| oauth_token | não commitado; server-side env only (`AWIN_OAUTH_TOKEN`) — credencial distinta da anterior, Publisher API (reporting), ainda não consumida em código |
| api_confirmed | sim — sync real do feed implementado e rodado 13/08/2026 (`awin_feed_sync.py`); comissão/API de relatórios ainda não validada |
| sync_strategy | batch (`awin_sync_interval_minutes`, padrão 1440min/diário) → Postgres (`affiliate_feed_offers`) → leitura local; nunca chamada externa por clique |
| last_terms_review | 2026-08-14 |
| notes | Cobasi aprovada e sincronizada; master gate real implementado (`awin_enabled=False` por padrão) — `AwinFeedProvider` é registrado condicionalmente (`is_awin_merchant_registrable`), mas só resolve/monetiza de fato quando `is_awin_merchant_publicly_servable` for `True` (hoje: nunca, exceto GTIN de teste único configurado) |

| Advertiser | advertiser_id | commercial_status | feed_available | fid | cpa | cookie |
|---|---|---|---|---|---|---|
| Cobasi | 17870 | **approved** | sim | 48117 | 8,5% | 1 dia |
| Petz | 127553 | pending | não | — | 3% | 14 dias |
| Zee Now | 127557 | **approved** | sim | 116779 | 3% | 1 dia |
| Zee Dog | 127555 | **approved** | sim | 116649 | 3% | 14 dias |

### Cobasi

| Campo | Valor |
|---|---|
| program_name | Minha Loja Cobasi / Empreendedor MAIS |
| merchant_type | retailer |
| status | active |
| affiliate_mode | product_deeplink (+ storefront fixa para área geral) |
| storefront_available | sim — `https://minhaloja.cobasi.com.br?utm_source=mais&utm_medium=maisplataforma&utm_campaign=lojapetmol` (nunca modificar; não adicionar `q=`) |
| product_deeplink_available | sim, gerado no painel MAIS |
| api_available | não confirmada |
| api_confirmed | não |
| manual_generation | sim — colar URL no painel MAIS, clicar "gerar" |
| cpa | 7% (confirmado) |
| attribution_window | unknown (não documentado nos termos revisados) |
| attribution_model | unknown |
| invoice_requirements | NF de serviços obrigatória |
| paid_media_restrictions | proibido mídia paga com termos da marca Cobasi |
| scraping | forbidden |
| last_terms_review | 2026-08-14 |
| notes | compra programada comissiona só a primeira transação; proibido usar outro programa de marketing Cobasi simultaneamente; não se apresentar como representante da Cobasi; preço real via API pública VTEX (`commerce_pricing.py`) é sinal interno de matching, nunca substitui a checagem de link afiliado; também listada na Awin (advertiser 17870, **approved**, 8,5% nominal — **preferida sobre MAIS desde 14/08/2026**, decisão de produto sem venda de teste confirmada ainda, ver seção Awin) |

### Shopee

| Campo | Valor |
|---|---|
| program_name | Shopee Affiliates |
| merchant_type | marketplace |
| status | **active** — mídia `petmol.com.br` confirmada e API oficial liberada em 21/08/2026 (AppId/Secret da Plataforma Aberta de Afiliados) |
| affiliate_mode | `MarketplaceOffer` populado via busca+match automático (ver abaixo), servido só quando `SHOPEE_AFFILIATE_ENABLED=true` |
| storefront_available | não |
| product_deeplink_available | via `MarketplaceOffer`/`MarketplaceOfferProvider` — mesma tabela/gate de sempre, agora populável de duas formas: manual (`POST /v1/admin/marketplace-offers`, link colado do Portal) ou automática via `shopee_offer_sync.py` |
| api_available | **sim** — Plataforma Aberta de Afiliados da Shopee (GraphQL, `https://open-api.affiliate.shopee.com.br/graphql`), confirmada por introspecção de schema + busca real em 21/08/2026. Sem lookup por GTIN exato — só busca por palavra-chave (`productOfferV2`), por isso o casamento produto↔oferta precisa de `shopee_offer_matcher.py` (marca e peso são desqualificantes obrigatórios, nunca só nome parecido — ver docstring do módulo) antes de qualquer upsert em `MarketplaceOffer`. Autenticação: `Authorization: SHA256 Credential={AppId},Timestamp={ts},Signature={sig}`, `sig=SHA256(AppId+ts+payload+secret)` |
| api_confirmed | sim |
| manual_generation | sim, ainda suportado — colar o link exato do Portal do Afiliado via `POST /v1/admin/marketplace-offers`, rejeitado se o domínio não bater (ver `shopee_link_validator.py`) |
| auto_sync | `python3 scripts/sync_shopee_offers.py <gtin> [<gtin> ...]` — busca por produto específico (nunca em massa pro catálogo inteiro, custo de rede + risco de casamento por produto), casa com `shopee_offer_matcher.py`, faz upsert em `MarketplaceOffer` só quando confiante; nunca desativa uma oferta existente só por falha transitória de busca (desativação continua manual, via admin) |
| attribution_window | 7 dias, último clique |
| attribution_model | último clique |
| invoice_requirements | unknown |
| paid_media_restrictions | Google Ads e Bing Ads não podem promover link afiliado Shopee |
| scraping | forbidden |
| last_terms_review | 2026-08-14 |
| notes | link nunca pode ser modificado (parâmetro adicionado/removido) nem indexado (sitemap/canônico/dados estruturados — confirmado que a geração de sitemap deste repo não toca em URL de afiliado); sem redirecionamento automático, sem cookie stuffing, clique precisa ser ação voluntária; compra do próprio afiliado pelo link pode ser desqualificada; oferta nunca é vínculo permanente com o GTIN (pode expirar sem afetar o produto PETMOL) |

### Mercado Livre

| Campo | Valor |
|---|---|
| program_name | Mercado Livre Afiliados |
| merchant_type | marketplace |
| status | cadastro feito; bridge manual construída e testada; exposição pública ainda desligada |
| affiliate_mode | manual bridge (`ManualAffiliateLinkProvider`-equivalente) — sem API oficial de afiliados ainda |
| storefront_available | n/a — modelo é por produto, não por vitrine |
| product_deeplink_available | não via API — `MarketplaceOffer.affiliate_url` populado manualmente após revisão humana, um link real por vez, no Gerador de Links oficial do ML |
| api_available | Client-Credentials API existe para *discovery* de catálogo/preço (camada A), mas não gera link de afiliado (camada B) — as duas camadas são distintas por princípio, ver seção "Mercado Livre — duas camadas" abaixo |
| api_confirmed | discovery: sim (client-credentials). Afiliação automática: não |
| manual_generation | confirmada — pelo menos um link real gerado manualmente, com `matt_word`/`matt_tool` reais, validado pelo `mercadolivre_link_validator.py` |
| attribution_window | unknown |
| attribution_model | unknown |
| invoice_requirements | unknown |
| paid_media_restrictions | unknown |
| scraping | forbidden — **confirmado por incidente real**: automação de browser pra gerar links em lote resultou no Mercado Livre bloqueando o IP público do usuário (22/08/2026); busca de candidatos usa só WebSearch (motor de busca genérico), nunca requisição direta ao mercadolivre.com.br |
| last_terms_review | 2026-08-11 |
| notes | não presumir que `affId` arbitrário gera comissão real; cada oferta exige `affiliate_url` real e revisada — nunca a URL de origem/candidata (`source_url`); status de match (`candidate`/`ambiguous`/`confirmed`/`rejected`/`affiliate_pending`/`affiliate_ready`) — ambíguo nunca publica sozinho; lote é sob demanda (não é rotina diária fixa), sempre excluindo ofertas/produtos já processados via `--exclude-existing-offers`; gates de produção (`MERCADOLIVRE_PUBLIC_OFFERS_ENABLED`, `MERCADOLIVRE_AFFILIATE_ENABLED`) continuam `false` até existir geração de link comissionado em escala comprovada |

#### Mercado Livre — duas camadas (não confundir)

1. **Discovery de produto/preço** (camada A) — a API pública/client-credentials do ML já funciona tecnicamente hoje para achar produto e preço.
2. **Monetização por afiliado** (camada B) — só existe hoje via geração manual de link no Gerador de Links oficial do ML, um de cada vez, com revisão humana.

A camada A funcionar **não** significa que a oferta pode ser mostrada ao tutor — o PETMOL é `AFFILIATE_ONLY_COMMERCE`: nunca envia tráfego comercial não-monetizado quando o objetivo é monetização. Só a camada B, com `affiliate_url` real e revisada, torna uma oferta elegível para o `CommerceEngine`.

### Amazon

| Campo | Valor |
|---|---|
| program_name | Amazon Associates (Programa de Associados) |
| merchant_type | amazon |
| status | **disabled** — conta/tag `petmol-20` encerrada em 22/08/2026; reativação proibida até nova aprovação e nova tag válida |
| affiliate_mode | none |
| storefront_available | não |
| product_deeplink_available | não |
| api_available | não configurada |
| api_confirmed | não |
| manual_generation | n/a |
| cpa | n/a |
| attribution_window | unknown (não documentado nos termos revisados) |
| attribution_model | unknown |
| invoice_requirements | unknown |
| paid_media_restrictions | unknown |
| scraping | forbidden |
| last_terms_review | 2026-08-22 |
| notes | integração temporariamente desativada; a tag antiga não pode ser reutilizada nem permanecer como fallback |

### Petz

| Campo | Valor |
|---|---|
| program_name | programa próprio ("Loja Parceira", `https://petz.com.br/parceiro/pettmol`) + Awin (advertiser 127553, pending) |
| merchant_type | retailer |
| status | comercial pending — PJ bloqueada por validação de CNAE (CNPJ já tem 7319-0/02, em tratamento); arquitetura de aprendizado por produto pronta (shadow mode) |
| affiliate_mode | none confirmado ainda — nenhuma `ProductAffiliateLink(merchant="petz")` é criada automaticamente |
| storefront_available | sim — `https://petz.com.br/parceiro/pettmol`, cadastrada em `STOREFRONT_AFFILIATE_URLS["petz"]` (confirmado pelo usuário como mecanismo real de atribuição em 25/08/2026 — ver "Ver na Petz" abaixo) |
| product_deeplink_available | não via API/feed — só por confirmação manual, um produto de cada vez (ver abaixo) |
| api_available | unknown — nenhuma API de catálogo/afiliados comprovada |
| api_confirmed | não |
| manual_generation | arquitetura pronta (`admin/petz_router.py`), nenhum link real gerado/confirmado ainda |
| attribution_window | unknown |
| attribution_model | unknown |
| invoice_requirements | unknown |
| paid_media_restrictions | unknown |
| scraping | forbidden — nenhuma função faz busca/crawler automático na Petz (ver abaixo) |
| last_terms_review | 2026-08-24 |
| notes | não presumir Lomadee; não enviar tráfego gratuito enquanto pending; também listada na Awin (advertiser 127553, pending, sem feed disponível — exigiria monetização por texto/API, não por feed estruturado como a Cobasi) — ver seção Awin |

#### Aprendizado por produto (shadow mode, 24/08/2026)

Como a Petz não tem API/feed de catálogo nem de afiliados comprovado,
a integração segue um modelo de APRENDIZADO + CONFIRMAÇÃO + REUTILIZAÇÃO,
nunca cadastro manual em massa nem scraping:

```
produto PETMOL (GTIN)
  → PetzProductMapping (petz_mapping.py) — candidato/query de busca
  → confirmação humana do PRODUTO (admin/petz_router.py .../confirm)
  → match_status: unknown → candidate → confirmed
       (ou: ambiguous/rejected — nunca publicam)
  → link afiliado real confirmado separadamente (.../affiliate-link)
  → ProductAffiliateLink(merchant="petz", affiliate_program="petz_partner")
  → match_status: affiliate_ready
  → PetzProvider (petz_provider.py) → CommerceEngine → frontend
```

Separação deliberada de dois conceitos (nunca confundidos):
- **`PetzProductMapping`** (`petz_mapping.py`, tabela `petz_product_mappings`) — estado de DESCOBERTA: `petz_product_id` (identificador estável no final da URL do produto, ex: `100223` — nunca tratado como substituto do GTIN), `product_url` (URL **direta**, não afiliada), `search_query`, `match_status`, `match_confidence`, `variant_label`/`variant_weight_kg` (uma página Petz pode ter várias apresentações — nunca associa o preço/link de uma variante errada ao GTIN do tutor).
- **`ProductAffiliateLink(merchant="petz")`** (`affiliate_links.py`, reaproveitada, não duplicada) — o link comercial final, só existe depois de confirmação humana explícita e separada da confirmação de produto.

Uma `product_url` confirmada **nunca** vira `affiliate_product_url` sozinha — são dois passos humanos distintos (`.../confirm` depois `.../affiliate-link`), e só `affiliate_ready` pode gerar oferta pública (`PUBLISHABLE_MATCH_STATUSES` em `petz_mapping.py`).

`build_petz_search_query()` só gera texto de busca (GTIN exato > marca+nome+peso > nome) — nenhuma função chama a rede da Petz; toda descoberta de candidato é feita por um humano fora do código (mesma lição aprendida com o Mercado Livre: automação de busca/geração de link na Petz está fora de escopo, ver seção Mercado Livre acima sobre o bloqueio de IP real).

`PetzProvider` (`petz_provider.py`) está sempre registrado no `CommerceEngine`, gated por `PETZ_AFFILIATE_ENABLED` (default `false`). Mesmo com a flag ligada e um link afiliado real confirmado, `find_offer()` sempre retorna `price=None` — não existe fonte de preço Petz confirmada hoje, e nunca inventamos uma; o `CommerceEngine` descarta qualquer oferta sem preço antes de exibi-la, então "não mostrar preço Petz" é garantido estruturalmente, não por uma regra extra.

#### "Petz" (card de Loja Parceira) e "Ver na Petz" por produto (investigação no navegador, 29/08/2026)

> **Card de Loja Parceira: REATIVADO 04/09/2026 (PR #210).** Frontend
> `affiliateStatus: 'active'`. Arquitetura final é mais simples que tudo
> que este registro documenta abaixo: **sempre**
> `https://www.petz.com.br/parceiro/pettmol` — nunca busca, nunca
> produto, nunca two-hop (decisão de produto: reduzir ao máximo o risco
> de perder comissão). Isso é a "Caminho A" abaixo, sem o problema que
> fez ela ser abandonada em 29/08 — esse problema era tentar mostrar o
> PRODUTO na tela também; a versão atual não tenta isso, então two-hop e
> `/produto/*` nunca entram em jogo.
>
> **"Ver na Petz" por produto específico (recompra, resultado de busca,
> item sheets) TAMBÉM REATIVADO 04/09/2026.** `petz_affiliate_enabled` /
> `petz_coupon_attribution_verified` / `petz_publicly_disabled` viraram
> True/True/False por padrão em `config.py` — `is_petz_publicly_servable()`
> agora retorna `True` sem precisar de env var. Isso só ficou seguro
> DEPOIS que `openPetzPartnerStore` (a mesma função do card, PR #210)
> passou a ignorar `direct_product_url`/`search_url` e sempre ir pra Loja
> Parceira: `/commerce/petz-direct-link` continua podendo devolver
> produto/busca no campo `url` (histórico abaixo), mas isso só decide SE
> o botão "Ver na Petz" aparece (`available`), nunca PRA ONDE ele leva —
> os bugs da página de busca da Petz (motivo original da desativação em
> 30/08) não são mais alcançáveis a partir do app. O restante desta
> seção fica como registro do que foi investigado/construído (inclui a
> busca genérica, hoje sem efeito prático no destino).

**Como o Parceiro Petz realmente atribui e aplica o desconto** (verificado
no painel `parceiropetz.com.br/manager` e no checkout `www.petz.com.br`,
teste real até o carrinho, sem finalizar — ver
`docs/PETZ_COMMISSION_VALIDATION.md`):

- Abrir **`https://www.petz.com.br/parceiro/pettmol`** (navegação
  top-level) grava um cookie first-party **`petzPartner`** em
  `www.petz.com.br` (path `/`, SameSite=Lax, ~30 min, renovado a cada
  visita).
- Com esse cookie, o carrinho mostra **"Você está comprando na loja
  pettmol do Parceiro Petz"** (atribuição — vale mesmo sem login), o
  campo de cupom vem **pré-preenchido com `PETTMOL`** e o **desconto de
  10% é aplicado automaticamente** (testado: R$ 99,99 → −R$ 10,00). Não
  acumula com promoção maior do produto.
- **Não existe deep link oficial de produto pela loja parceira.** Painel →
  Divulgação só dá cupom `PETTMOL` + link fixo `petz.com.br/parceiro/pettmol`.
  Negado: `/parceiro/pettmol/produto/<slug>` · `/busca` · `/c/<cat>` → 404;
  `?q` · `?query` · `?term` · `?keyword` · `?busca` · `#termo` → ignorados
  (abre a home); `/busca?q=X&parceiro=pettmol` · `&loja=pettmol` → não
  grava o cookie. **`/parceiro/pettmol` não faz NENHUMA chamada de backend
  de atribuição** — é 100% o `Set-Cookie: petzPartner` no header da
  resposta HTML, **não** account-linked (a mensagem "loja pettmol" aparece
  até deslogado).
- **O desconto de 10% visível depende de login na Petz.** Logado: cupom
  pré-preenchido + 10% automático. **Deslogado (a maioria dos clientes):**
  atribuição fica, mas o cliente precisa digitar `PETTMOL` no carrinho
  (aceito, aplica 10%).

**Decisão de produto (29/08/2026, revisada) — PRODUTO NA TELA + CUPOM.**

O caminho pela Loja Parceira (`/parceiro/pettmol` → cookie `petzPartner`)
foi tentado em duas formas — two-hop web (#106/#108) e two-hop nativo
(#107) — e abandonado (PR #110):
- two-hop web: só funciona numa **aba real** de navegador; na PWA
  instalada e (principalmente) no **app Capacitor** não roda — o iOS
  suspende o JS do WebView enquanto o navegador do sistema está por cima,
  então o cliente ficava preso na home da Loja Parceira sem ver o produto;
- a Petz **não expõe deep link de produto** pela loja parceira, então não
  dava pra combinar "produto na tela" + "cookie de atribuição".

**Comportamento atual (04/09/2026 em diante)** — todo clique em "Petz"
(card da grade, "Ver na Petz" por produto se um dia reativado) copia o
cupom e leva **sempre** pra Loja Parceira, nunca pra busca/produto:

| `openPetzPartnerStore` recebe | Destino (`?to=` da ponte) | Cliente vê |
|---|---|---|
| qualquer coisa (`searchUrl`/`productUrl` presentes ou não) | sem `?to=` | a Loja Parceira (`/parceiro/pettmol`) |

`searchUrl`/`productUrl` continuam aceitos na assinatura da função (só
alimentam o `?q=` — nome do produto exibido na ponte, exibição apenas),
mas não decidem mais o destino. A tabela de destinos condicionais que
existia aqui (busca quando havia `search_url`, loja parceira só como
fallback) foi a arquitetura de 29/08–03/09/2026 — superada.

**Por que NUNCA `/produto/<slug>`** (mesmo com `direct_product_url`): a
**AASA da Petz** (`www.petz.com.br/.well-known/apple-app-site-association`,
verificada 29/08/2026) reivindica `/`, `/produto/*`, `/colecao/*`,
`/minhas-assinaturas/*`. Redirecionar (mesmo por `location.replace` dentro
do SFSafariViewController) pra qualquer um deles → o iOS entrega ao app da
Petz → tela **"DETALHES" quebrada** (bug real reproduzido no iPhone,
30/08). `/busca` e `/parceiro/*` **não** são reivindicados → seguros.
`isPetzAppClaimedUrl()` barra os reivindicados no cliente e na ponte;
`direct_product_url` fica na resposta do backend mas o frontend não usa.

- **Sempre via a ponte `/go/petz?to=<url petz>&q=<nome>`** (`page.tsx`):
  valida `to` com `isRealPetzUrl` **e** `!isPetzAppClaimedUrl` (sem
  open-redirect, sem path da AASA) e faz `window.location.replace(to)` —
  redirect JS, nunca `<a href>`. Vale igual em web, PWA e Capacitor
  (`@capacitor/browser` abre a ponte no navegador do sistema).
- **Cupom `PETTMOL` copiado pro clipboard** no gesto do clique. Como o
  destino agora é sempre `/parceiro/pettmol`, o cookie `petzPartner` É
  gravado (garante a comissão de 7% sozinho, independente de login — ver
  "Caminho A" em `docs/PETZ_COMMISSION_VALIDATION.md`); o clipboard cobre
  o cliente deslogado (a maioria), que não ganha o pré-preenchimento
  automático do cupom no carrinho — só precisa colar em vez de digitar.
- Trade-off aceito (04/09/2026, revisado): nunca mostra o produto exato
  na tela da Petz (a loja parceira não tem deep link de produto) — em
  troca de comissão garantida em 100% dos toques, em qualquer
  plataforma, sem o risco de two-hop quebrado ou de cair no app da Petz.

**Gates são independentes, não um só** (04/09/2026): a ponte `/go/petz`
e `openPetzPartnerStore` (card de Loja Parceira, "Ver na Petz") são
100% frontend — nunca chamam `is_petz_publicly_servable()` nem qualquer
endpoint pra decidir SE mostram o botão ou PRA ONDE ele leva; quem
decide isso é só `affiliateStatus` em `homeShoppingPartners.ts`. Só
`/commerce/petz-direct-link` (descoberta de link por produto específico,
usada por "Ver na Petz" quando esse fluxo estiver ativo) passa por
`petz_provider.is_petz_publicly_servable()` (`petz_affiliate_enabled` E
`petz_coupon_attribution_verified`) no backend.

**Arquitetura:**
- `GET /commerce/petz-direct-link?gtin=...&q=<nome>` devolve
  `partner_program_active`, `direct_product_url` (só com mapping
  confirmado), `search_url` e o nome do produto.
- Frontend: `openPetzPartnerStore({ productUrl, searchUrl, productName })`
  (`homeShoppingPartners.ts`) escolhe o destino (`productUrl` →
  `searchUrl` → Loja Parceira), copia `PETTMOL` e navega pra
  `petzBridgeUrl(target, productName)` → `/go/petz?to=<url petz>&q=<nome>`.
  Usado em `AffiliateCatalogSearch.tsx`, `HomeShoppingSheet.tsx`,
  `MonetizedOffersList.tsx`. Cobasi/Shopee/Mercado Livre **não** passam
  pela ponte.
- `PETZ_PARTNER_STORE_URL` (`homeShoppingPartners.ts`) e
  `STOREFRONT_AFFILIATE_URLS["petz"]` (`affiliate_links.py`) espelham
  `https://www.petz.com.br/parceiro/pettmol` (fallback quando não há
  produto nem busca).

**Abordagem 3 — app nativo da Petz (investigada 29/08/2026, NÃO adotada,
guardada para retomar com aparelhos físicos):**
- iOS AASA (`www.petz.com.br/.well-known/apple-app-site-association`,
  verificado): app `5PN69BWKGT.br.com.petz.hanzo.Petz` abre em `/`,
  `/produto/*`, `/colecao/*`, `/minhas-assinaturas/*`. **`/parceiro/*` NÃO
  está** → sempre navegador. `/produto/*` abre o app só em toque de `<a>`,
  não em redirect JS.
- Android assetlinks: `package br.com.petz`,
  `delegate_permission/common.handle_all_urls` (o manifesto do app decide
  os paths — não obtido; provável espelhar o iOS).
- Sem SDK de deeplink de terceiros (Branch/AppsFlyer) nas páginas.
- **Cookie de navegador NÃO é compartilhado com o app nativo** (regra do
  SO). Abrir o app = perder o cookie `petzPartner` → atribuição perdida.
  No app a atribuição seria só digitar `PETTMOL` no checkout.
- Falta teste físico completo iOS + Android (A–F) para descartar em
  definitivo.

#### Ponte `/go/petz` + interceptação por app instalado (Universal Links)

**Sintoma (iPhone real):** ao abrir a Petz direto, o iOS entrega a URL
ao **app** da Petz instalado → rota "DETALHES" quebrada.

**Causa:** o app da Petz registra Universal Links / App Links para
`petz.com.br`. Abrir a URL direto (SFSafariViewController via
`@capacitor/browser`, ou aba) → o SO entrega ao app.

**Fato técnico (pesquisa):** o iOS **só** dispara Universal Link num
**toque de `<a>`**. NÃO dispara: no load inicial do
SFSafariViewController; nem em redirect por JavaScript (`location.replace`)
/ `<meta refresh>` / 302 (mais restrito ainda no iOS 17/18). Fontes:
Apple Developer Forums (725403, 747131, 780496), openradar rdar://32840565,
linkrunner.io, jessesquires TIL. `@capacitor/browser` /
SFSafariViewController não têm opção pra desligar isso; trocar de plugin
nativo = rebuild + submissão (fora de escopo).

**Ponte `/go/petz` (caminho único):** `petmol.com.br` **não** tem
`associated-domains` (sem AASA — conferido em
`apps/web/ios/App/App/App.entitlements`), então `/go/petz` abre no
navegador / navegador do sistema. A página (`app/go/petz/page.tsx`):
1. mostra o cupom **`PETTMOL`** grande com botão **Copiar** — no app o
   `navigator.clipboard` do WKWebView é instável, mas a ponte roda no
   SFSafariViewController, onde `copyText` funciona **sob gesto** (tap no
   cupom ou no "Ir pra a Petz", que copia antes de redirecionar);
2. lê `?to=<url petz>`, valida com `isRealPetzUrl` **e**
   `!isPetzAppClaimedUrl` (só https de `[www.]petz.com.br`, e o path NÃO
   pode estar na AASA da Petz — `/`, `/produto/*`, `/colecao/*`,
   `/minhas-assinaturas/*`) e faz `window.location.replace(to)` — redirect
   JS, não toque; `to` inválido/reivindicado/ausente → `/parceiro/pettmol`;
3. botão manual navega por JS, nunca `<a href>`.

`AppShell` esconde header/footer em `/go/petz`.

**Limites residuais:** (a) a busca da Petz **não grava** o cookie
`petzPartner` → comissão depende do cliente colar `PETTMOL` no carrinho;
(b) se a *própria* página `/busca` da Petz mostrar um smart-banner que o
cliente toque, aí o app abre — mas é toque do cliente, não interceptação
automática; (c) produto mapeado abre a busca (1º resultado), não a página
exata — `/produto/*` está na AASA e não pode ser usado.

### Petlove Produtos

| Campo | Valor |
|---|---|
| program_name | unknown |
| merchant_type | retailer |
| status | disabled — sem programa de catálogo completo confirmado para o modelo PETMOL |
| affiliate_mode | none |
| storefront_available | não |
| product_deeplink_available | não |
| api_available | unknown |
| api_confirmed | não |
| manual_generation | unknown |
| attribution_window | unknown |
| attribution_model | unknown |
| invoice_requirements | unknown |
| paid_media_restrictions | unknown |
| scraping | forbidden |
| last_terms_review | 2026-08-11 |
| notes | mantido no código, invisível em produção; não confundir com Petlove Plano de Saúde (monetização diferente); reativar exige programa real, não reassociação automática |

### Petlove Plano de Saúde

| Campo | Valor |
|---|---|
| program_name | unknown |
| merchant_type | service |
| status | future/pending — não integrar agora |
| affiliate_mode | none |
| storefront_available | n/a (não é produto/GTIN) |
| product_deeplink_available | n/a |
| api_available | unknown |
| api_confirmed | não |
| manual_generation | unknown |
| attribution_window | unknown |
| attribution_model | unknown |
| invoice_requirements | unknown |
| paid_media_restrictions | unknown |
| scraping | forbidden |
| last_terms_review | 2026-08-11 |
| notes | programa possui critérios próprios de aprovação/mídia/audiência, avaliar quando o PETMOL tiver presença digital adequada; NÃO misturar com "Comprar novamente" (não é oferta de produto) |

### DogLife

| Campo | Valor |
|---|---|
| program_name | unknown |
| merchant_type | service (ver nota) |
| status | pending |
| affiliate_mode | none |
| storefront_available | não |
| product_deeplink_available | não |
| api_available | unknown |
| api_confirmed | não |
| manual_generation | unknown |
| attribution_window | unknown |
| attribution_model | unknown |
| invoice_requirements | unknown |
| paid_media_restrictions | unknown |
| scraping | forbidden |
| last_terms_review | 2026-08-11 |
| notes | **pendência de esclarecimento**: no backend, este ID resolve para `settings.petlove_dog_life_url`/`handoff_doglife` ("plano PetLove Dog Life"), o que sugere ser o MESMO relacionamento comercial listado acima como "Petlove Plano de Saúde" — não confirmado. Não assumir integração automática por associação com Petlove Produtos (linha separada acima, é outra relação). Confirmar com o responsável comercial antes de tratar como merchant distinto. |

## Ativar a próxima loja

1. Confirmar aprovação/termos do programa real do merchant.
2. Implementar um novo `CommerceProvider` (`find_offer`/`monetize`), no
   formato de `cobasi_provider.py` — descoberta dinâmica primeiro,
   monetização depois, nunca o inverso. Registrar em
   `commerce_offers.build_default_engine()` (uma linha).
3. Atualizar a linha do merchant em `homeShoppingPartners.ts`:
   `merchantType`, `affiliateStatus` (só marcar `'active'` quando o
   mecanismo estiver de fato ligado em código, não só aprovado
   comercialmente), `affiliateMode`, `supportsProductDeepLink`/
   `supportsStorefrontAffiliate`, e `storefrontAffiliateUrl` se houver.
4. Retailer com deep link por produto → cadastrar via
   `/v1/admin/affiliate-links` como na Cobasi (estratégia `cached`), ou
   implementar UTM/API dinâmica se o programa confirmar que funciona sem
   cadastro manual.
5. Marketplace com oferta → popular `marketplace_offers` manualmente
   pra testar, sem crawler — nunca como requisito de lançamento (ver
   seção Marketplace).
6. Merchant via feed Awin aprovado → confirmar `feed_available=True` e
   `fid` real (nunca inventar), rodar a primeira sync real e validar
   contadores em `AffiliateFeedSyncRun`/`GET /v1/admin/affiliate-feed/metrics`,
   só então mudar `enabled=True` em `AWIN_ADVERTISERS`
   (`awin_advertisers.py`). O registro em `build_default_engine()` já é
   automático (`is_awin_merchant_registrable` cobre qualquer merchant do
   dict) — não precisa editar `commerce_offers.py`. Exposição real ainda
   depende do master gate (`AWIN_ENABLED=true` em produção, com
   autorização expressa) — `enabled=True` sozinho nunca expõe nada. Se
   outro provider já monetiza o mesmo merchant (ex: `CobasiProvider`),
   atualizar `MERCHANT_ROUTE_POLICIES` em `merchant_routes.py` só depois
   de validar com uma compra real (mecanismo de GTIN único, ver seção
   Awin) que a rota Awin de fato gera comissão — nunca trocar a rota
   preferida só por ter feed/comissão nominal maior.
7. Espelhar a storefront (se houver) em
   `affiliate_links.STOREFRONT_AFFILIATE_URLS` no backend.
8. Atualizar a tabela de compliance deste documento (e a tabela Awin, se
   for um dos cinco advertisers já mapeados).

`GET /commerce/offers` e o frontend (`useCommerceOffers`/
`MonetizedOffersList`) não precisam mudar — a lista já é multi-provider.

## Pendências conhecidas

- **GTIN em `ParasiteControl` (antiparasitário)** — sem campo estruturado
  de GTIN no modelo/tabela; um código de barras escaneado
  (`applyScannedProduct` em `ParasiteItemSheet.tsx`) hoje só é anexado
  como texto livre em `notes`. `MonetizedOffersList` nessa ficha continua
  resolvendo só por texto, mesmo quando o produto foi escaneado. Corrigir
  isso exigiria uma migration de schema (nova coluna) — deliberadamente
  fora do escopo desta tarefa (nenhuma migration/alteração de schema em
  produção foi autorizada). O caminho de ração (`FeedingPlanItemEntry.
  barcode`) já está corrigido, ver seção "Como funciona" acima.
- **UTM Cobasi como confirmação formal** — a ponte UTM (`COBASI_AFFILIATE_MODE=utm`)
  segue não confirmada como geradora de comissão real; só uma compra de
  teste completa (painel MAIS "Relatório de Vendas") confirma isso. Não
  bloqueia nada hoje porque a Cobasi já monetiza pelo link cadastrado.
- **Validação GTIN Awin** — `awin_feed_sync.py` valida GS1 por dígito
  verificador antes de gravar `gtin`: aceita 8/12/13/14 dígitos válidos,
  corrige UPC-11 somente com um zero à esquerda quando o GTIN-12 fica
  válido, e grava `gtin=None` para códigos inválidos. O sync registra
  contadores agregados de válidos/corrigidos/inválidos/duplicados/
  ambíguos, sem guardar feed bruto, URL com chave ou códigos inválidos em
  log. `AwinFeedProvider.find_offer()` também valida o GTIN de entrada e
  bloqueia grupos ambíguos do mesmo merchant+GTIN.
- **`awin_oauth_token`/Publisher API** — credencial reservada em
  `config.py`, nunca consumida em código. Só serviria pra validar
  comissão via API de relatórios (alternativa/complemento à compra de
  teste manual) — não implementado, não fazia parte do escopo desta
  tarefa.
- **Shopee — ligar em produção** — mídia aprovada e API oficial liberadas
  em 21/08/2026 (ver seção "Shopee" acima); mecanismo completo (validador,
  provider, admin CRUD, client GraphQL, matcher, sync) pronto e testado,
  inclusive validado manualmente contra um produto real do catálogo.
  `SHOPEE_AFFILIATE_ENABLED` segue `false` — falta só a decisão de ligar
  em produção (rodar o sync pros produtos desejados, conferir as ofertas
  casadas, então setar a flag).
- **Amazon** — integração desativada em 22/08/2026 após encerramento da
  conta/tag `petmol-20`; não reativar sem nova aprovação e nova tag.
