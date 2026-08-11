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

## Como funciona

- `apps/web/src/features/commerce/homeShoppingPartners.ts` — capacidades de
  cada merchant: `merchantType` (`retailer` | `marketplace` | `amazon` |
  `service`), `affiliateStatus` (`pending` | `approved` | `active` |
  `disabled` — **somente `active` pode aparecer em produção**),
  `affiliateMode`, `supportsProductDeepLink`, `supportsStorefrontAffiliate`,
  `storefrontAffiliateUrl`. `AFFILIATE_ONLY_COMMERCE` decide se o fallback
  sem afiliado é permitido (só em dev).
- `services/price-service/src/affiliate_links.py`:
  - `ProductAffiliateLink` (tabela `product_affiliate_links`) — deep link
    afiliado de **retailer** por produto/GTIN. Um por produto+merchant
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
- `services/price-service/src/commerce_offers.py` — `resolve_cobasi_product_offer()`,
  usado por `GET /commerce/product-offer?q=...` (consumido pela tela
  "Comprar novamente"). Casa o preço real da Cobasi (`commerce_pricing.py`,
  API pública VTEX) com o `ProductAffiliateLink` cadastrado do MESMO
  produto — o casamento é pelo campo `ean` que a própria API da Cobasi
  retorna por SKU, cruzado com `products_catalog.barcode_normalized`. Isso
  evita precisar de GTIN vindo do frontend/scanner (não alterado nesta
  tarefa) e evita casar por nome/marca (embalagens diferentes do mesmo
  produto têm GTINs diferentes). Em prod, sem link ativo para o EAN
  encontrado → `found=False`. Em dev, cai para a URL crua da Cobasi
  (`link_type=direct`) só para não travar o teste local. Hoje só existe
  para Cobasi (retailer) — não serve marketplace.
- `/v1/admin/affiliate-links` (GET/POST/PATCH/DELETE, protegido por
  `get_current_admin`/`get_current_admin_or_readonly_key`) — cadastro
  manual de `ProductAffiliateLink` por GTIN, enquanto não há API oficial
  da rede para gerar isso automaticamente. `config.affiliate_only_commerce_enforced`
  amarra a aplicação estrita ao `env` (prod → true; dev → fallback direto
  permitido). Não existe ainda admin CRUD para `MarketplaceOffer`
  (nada popula essa tabela hoje).
- `isPartnerVisibleInStoreArea`/`isPartnerVisibleForSearch`
  (`homeShoppingPartners.ts`) — filtram quais merchants aparecem na área
  geral "Lojas" e nos pickers de busca (QuickBuyRow, fallback do
  PriceCompareList) em produção: exigem `affiliateStatus === 'active'` E
  (storefront OU afiliado de busca configurado). Em dev mostram os 8
  sempre, para teste.
- `trackClick`/`AnalyticsEvent.link_type` — todo clique comercial registra
  se o link aberto foi `affiliate_product`, `affiliate_marketplace_offer`,
  `affiliate_store`, `affiliate_service`, `affiliate_search` ou `direct`
  (este último só aparece em dev).

## Cadastrar um deep link de retailer (Cobasi)

1. Confirme o GTIN já está em `products_catalog` (escaneie o produto no app
   ou use `GET /products/catalog/search?q=...`).
2. No painel Minha Loja Cobasi/MAIS, gere o link afiliado do produto
   específico.
3. `POST /v1/admin/affiliate-links` com `{"gtin": "...", "merchant":
   "cobasi", "affiliate_product_url": "https://..."}` (precisa de sessão
   admin — mesmo login usado no resto do admin).
4. Confirme com `GET /commerce/monetized-offer?merchant=cobasi&context=product&gtin=...`.

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

`services/price-service/tests/test_affiliate_links.py` (22 testes) — cobre:
storefront geral (Cobasi aparece, Petz não), recompra sem/com deep link,
GTIN diferente não reaproveita link de outro produto, dev vs prod
(fallback direto só em dev), desativar link esconde a oferta na hora,
validação de URL do cadastro admin (https obrigatório, `javascript:`
bloqueado), e a matriz de marketplace (sem oferta → oculto; oferta ativa →
aparece; oferta inativa → oculto; produto sobrevive à desativação da
oferta). Roda com `pytest tests/test_affiliate_links.py` — sempre
monkeypatcha `fetch_cobasi_price`, nunca chama a API real da Cobasi.

Não há test runner de frontend configurado neste repo (sem Jest/Vitest) —
a regra `affiliateStatus === 'active'` em `isPartnerVisibleInStoreArea`/
`isPartnerVisibleForSearch` foi verificada por leitura de código e
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
2. Atualizar a linha do merchant em `homeShoppingPartners.ts`:
   `merchantType`, `affiliateStatus` (só marcar `'active'` quando o
   mecanismo estiver de fato ligado em código, não só aprovado
   comercialmente), `affiliateMode`, `supportsProductDeepLink`/
   `supportsStorefrontAffiliate`, e `storefrontAffiliateUrl` se houver.
3. Retailer com deep link por produto → cadastrar via
   `/v1/admin/affiliate-links` como na Cobasi.
4. Marketplace com oferta → popular `marketplace_offers` (sem crawler —
   manual, como a Cobasi hoje, até haver ferramenta oficial).
5. Espelhar a storefront (se houver) em
   `affiliate_links.STOREFRONT_AFFILIATE_URLS` no backend.
6. Atualizar a tabela de compliance deste documento.
