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

## Status por merchant (visão executiva)

Atualizado em 14/08/2026. "Discovery" = como o preço/produto é encontrado;
"Monetização" = qual link é de fato exibido ao tutor hoje (não confundir
com feed disponível ou aprovação comercial — nenhuma das duas por si só
libera exposição, ver seção Awin abaixo).

| Merchant | Rede/programa | Discovery | Monetização real hoje | Feed Awin | Estado |
|---|---|---|---|---|---|
| Cobasi | MAIS/UTM (7%, confirmado) + Awin (advertiser 17870, approved, 8,5% nominal) | API pública VTEX (dinâmico) + Awin feed (GTIN exato) | `route=awin` preferida desde 14/08/2026 (decisão de produto, comissão Awin ainda não validada por venda real); `route=mais` é o fallback e **sempre** vence quando há link cadastrado manualmente (`is_manually_cached`), independente de preferência | sim, 8.398 produtos sincronizados | monetização real ligada; exposição ainda depende de `AWIN_ENABLED=true` em produção |
| Zee Now | Awin (advertiser 127557, pending) | nenhum (provider só existe se `awin_enabled=true` ou GTIN de teste) | nenhuma | sim (~13.746 produtos observados, **nunca sincronizado**) | preparado, aguardando aprovação comercial |
| Zee Dog | Awin (advertiser 127555, pending) | idem | nenhuma | sim (~1.742 produtos observados, **nunca sincronizado**) | preparado, aguardando aprovação comercial |
| Petz | Awin (advertiser 127553, pending) + programa próprio (CNAE em tratamento) | nenhum | nenhuma | não | pending nos dois caminhos, nenhum ligado |
| Araújo | Awin (advertiser 17919, pending/not_joined) | nenhum | nenhuma | **não** (0 produtos no ShopWindow) | nunca pode virar `AwinFeedProvider` — exigiria outra fonte de discovery |
| Shopee | Shopee Affiliates | nenhum | nenhuma (`MarketplaceOffer`/`MarketplaceOfferProvider` prontos, gated por `SHOPEE_AFFILIATE_ENABLED=false`) | n/a | PJ, fiscal/bancário em avaliação, mídia aprovada e primeiro link oficial ainda pendentes |
| Mercado Livre | ML Afiliados | nenhum | nenhuma | n/a | pending |
| Amazon | Amazon Associates (PJ criada, tag `petmol-20` tecnicamente ativa, 11% categoria Pet Shop — candidatura ainda em análise pela Amazon, **não aprovada definitivamente**; exige 3 vendas qualificadas nos primeiros 180 dias pra Amazon revisar) | nenhum (não passa por `CommerceEngine` — sem preço) | link de busca com tag, validado por domínio/esquema (`amazonAffiliate.ts`), sem Creators API ainda | n/a | **MVP ativo** (link com tag funcionando) desde 14/08/2026, desacoplado do Shopee em 19/08/2026 |
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
  (identidade: gtin/name/brand/weight_kg/query), `DiscoveredOffer`
  (resultado de `find_offer`), `MonetizedOffer` (resultado final, com
  URL+link_type), `CommerceProvider` (protocolo: `find_offer`+`monetize`),
  `CommerceEngine` (orquestra providers → filtra → ordena por preço).
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
  Amazon/Shopee/ML/Petz aparecem na mesma lista quando aprovados, sem
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
  cada merchant: `merchantType` (`retailer` | `marketplace` | `amazon` |
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

## Shopee — preparada, desativada em produção (14/08/2026)

Status real: a conta virou pessoa jurídica, dados fiscais/bancários em
avaliação, Instagram conectado ao Portal do Afiliado — mas ainda falta
confirmar `petmol.com.br` como **mídia aprovada** e obter o **primeiro
link oficial real**. Até isso acontecer, deliberadamente **não
implementado**: busca automática de anúncios, scraping, crawler, fila,
cron, escolha automática de vendedor, geração de link por template, ou
qualquer API não documentada — regras do próprio programa proíbem
modificar o link emitido e exigem clique voluntário (sem redirect
automático, sem cookie stuffing).

O que já existe, pronto e **desligado**:

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

### Como ativar a Shopee quando o link oficial chegar

1. Confirmar `petmol.com.br` como mídia aprovada no Portal do Afiliado.
2. Copiar o link oficial de um produto real (nunca digitar/adivinhar).
3. `POST /v1/admin/marketplace-offers` com `{"gtin", "merchant": "shopee",
   "affiliate_url": "<link exato colado>", "price": <preço real, se
   souber>}` — rejeitado automaticamente se o domínio não bater.
4. Confirmar com `GET /v1/admin/marketplace-offers?gtin=...`.
5. Só depois disso, com pelo menos uma oferta real cadastrada e validada
   manualmente na Shopee (clique de teste, sem compra automática), setar
   `SHOPEE_AFFILIATE_ENABLED=true` em produção — antes disso, nenhuma
   oferta aparece a nenhum tutor mesmo com linhas cadastradas.
6. Nunca reescrever a URL cadastrada — se a Shopee trocar o formato do
   link, o procedimento é cadastrar de novo (passo 3), não "consertar" a
   URL antiga.

## Amazon — MVP ativo (link de busca com tag, sem preço/API)

Conta Amazon Associados (Programa de Associados) pessoa jurídica
**criada** — cadastro fiscal e bancário concluído, StoreID/Partner Tag
**`petmol-20`** tecnicamente ativa, categoria Pet Shop com **11%**
informado. **Importante não confundir isso com "conta aprovada":** a
candidatura ao Programa de Associados ainda está em análise pela Amazon,
que exige pelo menos **3 vendas qualificadas nos primeiros 180 dias**
pra sequer revisar a conta — é exatamente pra isso que o link precisa
estar ativo agora (a tag é como a Amazon rastreia essas vendas). Nunca
declarar em código, comentário ou documentação que a conta ou a
candidatura já foram aprovadas.

Ativado desacoplado do Shopee (decisão revisada em 19/08/2026) — a
decisão anterior de produto era ligar as duas contas juntas, mas isso só
atrasava a Amazon acumular as vendas necessárias pra entrar em análise,
sem necessidade real de esperar.

A **Creators API ainda não tem credenciais emitidas** (a PA-API 5 antiga
está descontinuada) — exige conta aprovada **e** pelo menos 10 vendas
qualificadas nos últimos 30 dias, então também depende das vendas
qualificadas acima. Enquanto isso, o MVP é deliberadamente mais simples:
um link de busca (ou de produto já conhecido) com a tag aplicada, nunca
preço/imagem/nota vindos da Amazon (proibido fazer scraping de qualquer
um dos três).

- `apps/web/src/features/commerce/amazonAffiliate.ts` — inteiramente
  client-side, sem round-trip a este backend (a tag não é segredo,
  aparece em toda URL gerada, e a Amazon espera navegação direta no
  clique). `AMAZON_ASSOCIATE_TAG` (default real `"petmol-20"`, com
  `NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG` como override se a tag mudar).
  - `buildAmazonSearchUrl(query, tag)` — monta a URL de busca a partir do
    nome do produto, sempre segura por construção (nunca recebe URL
    externa). Encoding manual (não `URLSearchParams`, que usaria `+` em
    vez de `%20`) pra bater com o formato real de busca da Amazon.
  - `buildAmazonProductUrl(rawUrl, tag)` — valida uma URL de produto já
    conhecida (https obrigatório, domínio `amazon.com.br` exato ou
    subdomínio real — nunca por `includes()`/prefixo, que aceitaria
    `amazon.com.br.golpe.com`), substitui/adiciona só `tag=`, preserva
    qualquer outro parâmetro. `null` se a URL for inválida — quem chamar
    nunca deve cair pra URL crua nesse caso. Não usado no MVP hoje (não
    há um catálogo de URLs de produto Amazon conhecidas), reservado pra
    quando houver.
  - `isAllowedAmazonHost(hostname)` — mesma lógica de allowlist por
    sufixo real usada pelo validador Shopee no backend.
  - 20 testes unitários (`amazonAffiliate.test.ts`,
    `MonetizedOffersList.test.tsx`) via Vitest — **primeiro test runner
    de frontend deste repo** (`apps/web/vitest.config.ts`, `npm run
    test`/`npm run web:test`), adicionado especificamente pra cobrir
    isto (não é infraestrutura geral de testes de UI).
- `apps/web/src/features/commerce/homeShoppingPartners.ts` — entrada
  `amazon` com `affiliateStatus: 'active'` (era `'pending'`),
  `affiliateMode: 'search_template'`, `buildAffiliateUrl` usando
  `buildAmazonSearchUrl` — aparece na área geral "Lojas" pelas mesmas
  checagens de sempre (`isPartnerVisibleInStoreArea`), sem mecanismo
  paralelo.
- `apps/web/src/features/commerce/MonetizedOffersList.tsx` — card
  "Ver na Amazon" **fora** do loop de ofertas priceadas do
  `CommerceEngine` (que descarta qualquer oferta sem preço — Amazon
  nunca teria uma real aqui sem scraping). Sempre aparece quando há um
  termo de busca e o merchant Amazon está `active`
  (`isPartnerVisibleForSearch`, mesma regra de "Lojas"), nunca disputa o
  selo "Menor preço" com Cobasi/Awin. Regras de UI seguidas à risca:
  texto "Consulte o preço e a disponibilidade na loja" (nunca preço,
  nunca imagem da Amazon), link `<a>` real com
  `rel="sponsored nofollow noopener noreferrer"` e `target="_blank"`
  (não `window.open` via JS — permite o `rel` literal pedido pelas
  diretrizes de link patrocinado), clique registra `trackClick` sem
  bloquear a navegação (sem `preventDefault`), aviso "Como associado da
  Amazon, o PETMOL recebe por compras qualificadas." mostrado junto do
  card (uma vez por tela, já que só existe um card por sheet).
- `services/price-service/src/config.py` — `amazon_associate_tag`
  (default `"petmol-20"`, centralizado mas não consumido por nenhum
  endpoint hoje — o MVP roda todo no frontend), e três campos reservados
  pra quando a Creators API tiver credenciais:
  `amazon_creators_client_id`, `amazon_creators_client_secret`,
  `amazon_marketplace` (default `"amazon.com.br"`) — nenhum usado, nenhum
  endpoint falso criado.

### Procedimento futuro: migrar para a Creators API

1. Obter credenciais reais da Creators API (a Amazon precisa emitir —
   não inventar client_id/secret).
2. Preencher `AMAZON_CREATORS_CLIENT_ID`/`AMAZON_CREATORS_CLIENT_SECRET`
   no ambiente de produção (server-side only, nunca `NEXT_PUBLIC_*`).
3. Implementar um client OAuth2 análogo ao reservado pra Awin
   (`awin_oauth_token`, ainda não consumido) — módulo novo, não reescrever
   `amazonAffiliate.ts`.
4. Correspondência GTIN↔ASIN via API oficial (nunca scraping/heurística
   de nome) — só então um preço/imagem real da Amazon pode aparecer,
   e só então faz sentido um `AmazonProvider` dentro do `CommerceEngine`
   (hoje não existe, de propósito — ver seção "Discovery vs
   monetização" acima).
5. Até lá, `buildAmazonSearchUrl`/`buildAmazonProductUrl` continuam
   sendo o mecanismo real — a migração é aditiva, não substitui nada
   silenciosamente.

### Variáveis de ambiente — Amazon/Shopee

Nenhuma delas é obrigatória pra manter o comportamento atual (todas têm
default seguro). Awin já tem as próprias documentadas na seção abaixo.

| Variável | Onde | Default | Efeito |
|---|---|---|---|
| `NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG` | frontend | `petmol-20` (embutido) | Override da tag, se ela mudar — não é segredo |
| `AMAZON_ASSOCIATE_TAG` | backend (`config.py`) | `"petmol-20"` | Centralizado, não consumido por endpoint algum hoje (MVP roda no frontend) |
| `AMAZON_CREATORS_CLIENT_ID` / `AMAZON_CREATORS_CLIENT_SECRET` | backend | não setado | Reservado, sem uso — Creators API ainda sem credenciais |
| `AMAZON_MARKETPLACE` | backend | `"amazon.com.br"` | Reservado, sem uso |
| `SHOPEE_AFFILIATE_ENABLED` | backend | `false` | Master gate — `true` só depois do primeiro link oficial validado (ver procedimento acima) |
| `SHOPEE_APPROVED_MEDIA` | backend | `"https://www.petmol.com.br"` | Documentação de qual mídia estamos tentando confirmar no Portal — **não aprova nada sozinho** |

## Awin — rede de afiliados (não merchant)

PETMOL está cadastrado na Awin (Publisher ID `3032803`) como rede de
afiliados. **Awin é a rede — Cobasi, Petz, Zee Now, Zee Dog e Araújo são
merchants (advertisers) dentro dela**, cada um com seu próprio status
comercial, cookie window e comissão; nunca tratados como "a mesma coisa"
por estarem na mesma rede.

Situação real das contas em 14/08/2026 — **Cobasi aprovada** (confirmado
no painel Awin: Anunciantes → Meus Programas → "Seus Anunciantes"), as
demais seguem `commercial_status=pending`:

| Merchant | advertiser_id | feed disponível | fid | comissão | cookie | status comercial |
|---|---|---|---|---|---|---|
| Cobasi | 17870 | sim (8.398 produtos, sincronizado) | 48117 | 8,5% | 1 dia | **approved** |
| Petz | 127553 | não | — | 3% | 14 dias | pending |
| Zee Now | 127557 | sim (~13.746 observados, nunca sincronizado) | — | 3% | 1 dia | pending |
| Zee Dog | 127555 | sim (~1.742 observados, nunca sincronizado) | — | 3% | 14 dias | pending |
| Araújo | 17919 | **não** (0 produtos no ShopWindow) | — | 3,1% | 1 dia | pending/not_joined |

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
  `"petz"`, `"zeenow"`, `"zeedog"`, `"araujo"`) com os dados da tabela
  acima, `enabled=True` só para Cobasi.
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
- **Roteiro de ativação da Zee Now (próxima loja via Product Feed)**:
  mesmo roteiro da Cobasi a partir da etapa 1 — feed já disponível
  (~13.746 produtos observados), falta (a) aprovação comercial confirmada
  no painel Awin, (b) `fid` real do Product Feed (hoje desconhecido,
  **não inventar**), (c) primeira sync real rodada e validada, (d)
  `enabled=True` em `AWIN_ADVERTISERS["zeenow"]` só depois de (a)-(c).
  Não tem rota concorrente (nenhum outro provider monetiza Zee Now hoje),
  então não há dedupe/preferência a decidir — a Zee Now aparece assim que
  `publicly_servable` for verdadeiro.
- Zee Dog e Araújo permanecem `enabled=False`, sem sync, sem aprovação —
  não ativar sem dados comerciais reais (Araújo, além disso, nunca pode
  virar `AwinFeedProvider`: sem Product Feed, exigiria uma fonte de
  discovery separada, não implementada).
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

Frontend: `apps/web/vitest.config.ts` (primeiro test runner de frontend
deste repo — setup mínimo, cobre só o gerador de link Amazon e o
componente que depende dele):
- `amazonAffiliate.test.ts` (17) — `buildAmazonSearchUrl`: bate
  byte-a-byte com o exemplo real do brief (encoding, tag), usa a tag
  padrão do projeto, codifica caracteres especiais, remove espaços nas
  pontas; `isAllowedAmazonHost`: aceita apex/subdomínio real
  (case-insensitive), rejeita prefixo forjado e domínio colado;
  `buildAmazonProductUrl`: inclui/substitui `tag=`, preserva outros
  parâmetros, rejeita domínio falso/http/`javascript:`/`data:`/URL
  malformada (`null`).
- `MonetizedOffersList.test.tsx` (3) — card "Ver na Amazon" renderiza
  sem preço/imagem, com `rel="sponsored nofollow noopener noreferrer"` e
  href com `tag=petmol-20`, nunca reivindica "Menor preço"; aviso de
  associado aparece uma única vez; card não aparece sem termo de busca.

`isPartnerVisibleInStoreArea`/`isPartnerVisibleForSearch` (regra
`affiliateStatus === 'active'`) e o fluxo de GTIN ponta a ponta na ficha
de ração continuam verificados por leitura de código e `tsc --noEmit`
além dos testes acima, não por teste automatizado dedicado.

## Prioridade comercial (estratégia, não hardcode)

1. Cobasi (ativo — MAIS + Awin)
2. Amazon (ativo — MVP link de busca com tag)
3. Shopee (PJ aprovada, fiscal/bancário em avaliação, falta mídia aprovada + primeiro link oficial)
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
| Zee Now | 127557 | pending | sim | — | 3% | 1 dia |
| Zee Dog | 127555 | pending | sim | — | 3% | 14 dias |
| Araújo | 17919 | pending/not_joined | **não** | — | 3,1% | 1 dia |

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
| status | pending — conta PJ, fiscal/bancário em avaliação, Instagram conectado; falta confirmar `petmol.com.br` como mídia aprovada e obter o primeiro link oficial |
| affiliate_mode | none em produção (`SHOPEE_AFFILIATE_ENABLED=false`) — mecanismo pronto e testado, desligado até haver link oficial real |
| storefront_available | não |
| product_deeplink_available | via `MarketplaceOffer`/`MarketplaceOfferProvider` (oferta por vendedor, cadastrada manualmente a partir do link oficial — nunca gerada) |
| api_available | não — só o Portal do Afiliado (geração manual de link) |
| api_confirmed | não |
| manual_generation | sim — colar o link exato do Portal do Afiliado via `POST /v1/admin/marketplace-offers`, rejeitado se o domínio não bater (ver `shopee_link_validator.py`) |
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
| status | pending (cadastro ainda por fazer) |
| affiliate_mode | none |
| storefront_available | pending verification |
| product_deeplink_available | não — marketplace usa `MarketplaceOffer` |
| api_available | pending verification |
| api_confirmed | não |
| manual_generation | pending verification |
| attribution_window | unknown |
| attribution_model | unknown |
| invoice_requirements | unknown |
| paid_media_restrictions | unknown |
| scraping | forbidden |
| last_terms_review | 2026-08-11 |
| notes | não presumir que `affId` arbitrário gera comissão real; validar programa antes de ativar |

### Amazon

| Campo | Valor |
|---|---|
| program_name | Amazon Associates (Programa de Associados) |
| merchant_type | amazon |
| status | **active** (link tecnicamente ativo) — PJ criada, tag `petmol-20`, categoria Pet Shop, cadastro fiscal/bancário concluído; candidatura ao programa ainda **em análise pela Amazon** (não aprovada definitivamente — exige 3 vendas qualificadas em 180 dias) |
| affiliate_mode | search_template — link de busca com tag (`amazonAffiliate.ts`), não `tracking_tag` genérica (sempre construído/validado, nunca colado numa URL qualquer) |
| storefront_available | não |
| product_deeplink_available | `buildAmazonProductUrl` existe e é testada, mas não usada na UI ainda (sem catálogo de URLs de produto Amazon conhecidas hoje) |
| api_available | Creators API existe como programa, mas **sem credenciais emitidas ainda**; exige conta aprovada e pelo menos 10 vendas qualificadas nos últimos 30 dias — ainda mais distante que a aprovação da candidatura em si; PA-API 5 (antiga) está descontinuada |
| api_confirmed | não |
| manual_generation | n/a — MVP gera o link automaticamente (busca por nome), nunca por cadastro manual |
| cpa | 11% informado (categoria Pet Shop) |
| attribution_window | unknown (não documentado nos termos revisados) |
| attribution_model | unknown |
| invoice_requirements | unknown |
| paid_media_restrictions | unknown |
| scraping | forbidden — nunca preço, imagem ou nota/avaliação da Amazon |
| last_terms_review | 2026-08-14 |
| notes | aviso de associado obrigatório exibido junto do link ("Como associado da Amazon, o PETMOL recebe por compras qualificadas."); link real `<a rel="sponsored nofollow noopener noreferrer">`, nunca reivindica ser o menor preço (nunca mostra preço nenhum); qualquer automação futura (Creators API) deve usar ferramentas/APIs oficiais — ver "Procedimento futuro: migrar para a Creators API" acima |

### Petz

| Campo | Valor |
|---|---|
| program_name | unknown (a definir quando aprovado) |
| merchant_type | retailer |
| status | pending — PJ bloqueada por validação de CNAE (CNPJ já tem 7319-0/02, em tratamento) |
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
| notes | não presumir Lomadee; não enviar tráfego gratuito enquanto pending; também listada na Awin (advertiser 127553, pending, sem feed disponível — exigiria monetização por texto/API, não por feed estruturado como a Cobasi) — ver seção Awin |

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

### Drogaria Araújo

| Campo | Valor |
|---|---|
| program_name | unknown |
| merchant_type | retailer |
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
| last_terms_review | 2026-08-14 |
| notes | também listada na Awin (advertiser 17919, pending/not_joined, **sem Product Feed** — 0 produtos no ShopWindow); não permite pessoa física, sem rastreamento de app, sem otimização mobile; mesmo se aprovada, nunca pode virar `AwinFeedProvider` genérico — exigiria uma fonte de discovery/preço separada, não implementada — ver seção Awin |

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
- **Zee Now/Zee Dog — `fid` do Product Feed** — os números de produtos
  observados (~13.746 / ~1.742) vêm do ShopWindow da Awin, não de um
  download de feed real; o `fid` (identificador necessário pra baixar o
  feed via `awin_feed_sync.py`) ainda não foi obtido pra nenhum dos dois.
  Não inventar — só preencher `feed_id` em `AWIN_ADVERTISERS` quando
  confirmado no painel Awin.
- **`awin_oauth_token`/Publisher API** — credencial reservada em
  `config.py`, nunca consumida em código. Só serviria pra validar
  comissão via API de relatórios (alternativa/complemento à compra de
  teste manual) — não implementado, não fazia parte do escopo desta
  tarefa.
- **Shopee — primeiro link oficial** — nenhum link real foi recebido do
  Portal do Afiliado ainda; `SHOPEE_AFFILIATE_ENABLED` continua `false`
  até isso acontecer E `petmol.com.br` ser confirmado como mídia
  aprovada. Mecanismo (validador, provider, admin CRUD) pronto e
  testado, mas inerte sem esses dois fatores externos.
- **Amazon — Creators API** — sem credenciais emitidas pela Amazon ainda
  (a PA-API 5 antiga está descontinuada); o MVP atual (link de busca com
  tag) não depende disso e continua funcionando quando/se a API chegar
  (ver "Procedimento futuro: migrar para a Creators API").
- **Amazon — logo/imagem do card "Ver na Amazon"** — usa só o emoji 📦 e
  texto, nunca uma imagem/logo baixada da Amazon (proibido usar imagem
  da Amazon sem fonte autorizada) — um logo próprio poderia ser
  adicionado depois via asset local do PETMOL, não é bloqueio funcional.
