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
  - `monetize()`: estratégia por `cobasi_affiliate_mode` (config.py):
    - `cached` (padrão) — consulta `ProductAffiliateLink`; sem link
      cadastrado, em dev cai pro link cru da Cobasi (`link_type=direct`),
      em prod não monetiza.
    - `utm` — gera URL com UTM dinamicamente (`cobasi_utm.py`), sem
      cadastro manual. **Não ativado por padrão** — precisa confirmação
      formal da Cobasi/MAIS de que UTM sozinho gera comissão (não
      confirmado; painel MAIS gera `mais.app/...`, não uma URL com UTM
      simples — ver seção "UTM Cobasi" abaixo).
    - `api` — reservado para API oficial futura. Não implementado.
    - `disabled` — Cobasi nunca monetiza.
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

## UTM Cobasi — por que não está ativada

O painel Minha Loja/MAIS gera links no formato `mais.app/XXXXXX`
(shortlink próprio), não uma URL da Cobasi com UTM simples. Não está
confirmado que anexar `utm_source=mais&utm_medium=maisplataforma&
utm_campaign=lojapetmol` diretamente a uma URL de produto Cobasi (sem
passar pelo painel) gera comissão do mesmo jeito. `build_cobasi_affiliate_url`
(`cobasi_utm.py`) existe, é testada, e está pronta para o dia em que essa
confirmação vier — nesse dia, virar produção é só `COBASI_AFFILIATE_MODE=utm`
no ambiente, sem tocar em código/frontend. Até lá, `cached` continua sendo
o único modo real.

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

## Marketplace (Shopee, Mercado Livre) — arquitetura pronta, nada integrado

Deliberadamente **não implementado** nesta tarefa: busca automática de
anúncios, scraping, crawler, fila, cron, escolha automática de vendedor, ou
qualquer API não documentada. As contas ainda estão em aprovação — a
integração real só deve ser desenhada depois de sabermos quais
ferramentas oficiais cada programa vai liberar.

O que já existe, pronto para quando isso acontecer:

- Tabela `marketplace_offers` (ver acima) — uma linha = uma
  oferta/publicação de um vendedor, não o produto.
- `get_monetized_offer(..., context="marketplace")` já resolve
  corretamente: sem oferta ativa → oculto; com oferta ativa → aparece;
  oferta desativada → volta a ficar oculta, sem tocar no produto PETMOL.
- `merchantType: 'marketplace'` já diferencia Shopee/ML de retailers na
  UI (`homeShoppingPartners.ts`).

Quando o programa for aprovado e a ferramenta oficial de geração de link
estiver definida, o trabalho é popular `marketplace_offers` (manualmente
no início, como a Cobasi hoje) — não redesenhar nada disso.

## Testes

70 testes em `services/price-service/tests/` (nenhum chama a API real da
Cobasi — `fetch_cobasi_price` é sempre monkeypatchado quando o teste
precisa de discovery):

- `test_affiliate_links.py` (22) — storefront geral (Cobasi aparece, Petz
  não), recompra sem/com deep link, GTIN diferente não reaproveita link
  de outro produto, dev vs prod, desativar link esconde a oferta na hora,
  validação de URL do cadastro admin, matriz de marketplace.
- `test_commerce_provider.py` (5) — `CommerceEngine`: ordena por menor
  preço (3 providers fake), descarta oferta sem monetização, provider sem
  discovery é ignorado, discovery roda sem qualquer cadastro prévio.
- `test_commerce_pricing.py` (5) — `_select_item_by_weight`: escolhe o
  SKU certo entre variantes de tamanho (kg e g), sem peso alvo preserva
  comportamento antigo (primeiro item).
- `test_cobasi_utm.py` (9) — `build_cobasi_affiliate_url`: adiciona/
  preserva/remove UTM corretamente, idempotente em chamadas repetidas,
  rejeita não-https/domínio não-Cobasi/`javascript:`.
- `test_cobasi_provider.py` (12) — `CobasiProvider` por modo
  (cached/utm/api/disabled), confirma que o padrão é `cached` mesmo com
  `ENV=prod`, `find_offer()` funciona sem `ProductCatalog`/
  `ProductAffiliateLink` nenhum no banco.

Não há test runner de frontend configurado neste repo (sem Jest/Vitest) —
a regra `affiliateStatus === 'active'` em `isPartnerVisibleInStoreArea`/
`isPartnerVisibleForSearch`, e o uso de `useCommerceOffers` nas 3 telas de
"Comprar novamente", foram verificados por leitura de código e
`tsc --noEmit`, não por teste automatizado de frontend.

## Prioridade comercial (estratégia, não hardcode)

1. Cobasi (ativo)
2. Shopee (cadastro em andamento)
3. Mercado Livre (pending)
4. Amazon (pending)
5. Petz (pending — após resolução do CNAE)

Petlove Produtos: aguardar programa de catálogo completo adequado.
Petlove Saúde: avaliar posteriormente (critérios próprios de
aprovação/audiência).
DogLife/Araújo: aguardar confirmação de programa real.

## Compliance por merchant

Campos "unknown"/"pending verification" quando não confirmados — nunca
preencher informação desconhecida como se fosse conhecida.

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
| attribution_window | unknown (não documentado nos termos revisados) |
| attribution_model | unknown |
| invoice_requirements | NF de serviços obrigatória |
| paid_media_restrictions | proibido mídia paga com termos da marca Cobasi |
| scraping | forbidden |
| last_terms_review | 2026-08-11 |
| notes | compra programada comissiona só a primeira transação; proibido usar outro programa de marketing Cobasi simultaneamente; não se apresentar como representante da Cobasi; preço real via API pública VTEX (`commerce_pricing.py`) é sinal interno de matching, nunca substitui a checagem de link afiliado |

### Shopee

| Campo | Valor |
|---|---|
| program_name | Shopee Affiliates |
| merchant_type | marketplace |
| status | pending (cadastro empresarial em andamento/aguardando aprovação) |
| affiliate_mode | none (nada ligado em código ainda) |
| storefront_available | pending verification |
| product_deeplink_available | não — marketplace usa `MarketplaceOffer` (oferta por vendedor), não deep link fixo |
| api_available | pending verification |
| api_confirmed | não |
| manual_generation | pending verification |
| attribution_window | 7 dias (conforme termos analisados) |
| attribution_model | último clique |
| invoice_requirements | unknown |
| paid_media_restrictions | unknown |
| scraping | forbidden |
| last_terms_review | 2026-08-11 |
| notes | PETMOL cadastrado como empresa + site + rede social oficial; clique deve partir de ação consciente do tutor (sem cookie dropping/iframe/redirect automático); oferta nunca é vínculo permanente com o GTIN |

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
| status | pending (cadastro ainda por fazer) |
| affiliate_mode | tracking_tag (Link Especial, quando aprovado) |
| storefront_available | não |
| product_deeplink_available | não nesta tarefa — futura correspondência GTIN↔ASIN via ferramentas oficiais |
| api_available | PA-API existe, mas não implementada nesta tarefa |
| api_confirmed | não |
| manual_generation | pending verification |
| attribution_window | unknown |
| attribution_model | unknown |
| invoice_requirements | unknown |
| paid_media_restrictions | unknown |
| scraping | forbidden |
| last_terms_review | 2026-08-11 |
| notes | qualquer automação futura deve usar ferramentas/APIs oficiais do Programa de Associados; não fazer scraping |

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
| notes | não presumir Lomadee; não enviar tráfego gratuito enquanto pending |

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
| last_terms_review | 2026-08-11 |
| notes | aguardando programa de afiliação aprovado para o PETMOL |

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
6. Espelhar a storefront (se houver) em
   `affiliate_links.STOREFRONT_AFFILIATE_URLS` no backend.
7. Atualizar a tabela de compliance deste documento.

`GET /commerce/offers` e o frontend (`useCommerceOffers`/
`MonetizedOffersList`) não precisam mudar — a lista já é multi-provider.
