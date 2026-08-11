# Afiliados / Comércio monetizado

Regra definitiva: o PETMOL não manda tráfego comercial gratuito para
varejista em produção. Uma loja só aparece como opção de compra quando
existe caminho monetizável real (afiliado) para aquele contexto —
produto específico ou storefront geral.

## Como funciona

- `apps/web/src/features/commerce/homeShoppingPartners.ts` — capacidades de
  cada merchant (`affiliateStatus`, `affiliateMode`,
  `supportsProductDeepLink`, `supportsStorefrontAffiliate`,
  `storefrontAffiliateUrl`). `AFFILIATE_ONLY_COMMERCE` decide se o fallback
  sem afiliado é permitido (só em dev).
- `services/price-service/src/affiliate_links.py` — modelo
  `ProductAffiliateLink` (deep link por produto/GTIN → merchant, tabela
  `product_affiliate_links`) e `get_monetized_offer()`, a lógica de
  resolução:
  - `context="product"`: só retorna oferta se existir link ativo daquele
    produto específico. Nunca cai para a storefront genérica.
  - `context="store"`: só retorna a storefront afiliada fixa do merchant
    (`STOREFRONT_AFFILIATE_URLS`), quando existir.
- `GET /commerce/monetized-offer?merchant=...&context=product|store&gtin=...`
  — endpoint público de leitura para testar a resolução acima.
- `/v1/admin/affiliate-links` (GET/POST/PATCH/DELETE, protegido por
  `get_current_admin`/`get_current_admin_or_readonly_key`) — cadastro manual
  de deep links por GTIN, enquanto não há API oficial da rede para gerar
  isso automaticamente. `config.affiliate_only_commerce_enforced` amarra a
  aplicação estrita ao `env` (prod → true; dev → fallback direto permitido).

## Cadastrar um deep link (Cobasi)

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

## Status por merchant

| Merchant       | affiliateStatus | affiliateMode      | Storefront afiliada | Deep link por produto |
|----------------|------------------|--------------------|----------------------|------------------------|
| Cobasi         | approved         | product_deeplink   | sim (Minha Loja/MAIS)| sim, cadastro manual   |
| Petz           | disabled         | none               | não                  | não                    |
| Amazon         | disabled         | tracking_tag       | não                  | não                    |
| Petlove        | disabled         | none               | não                  | não                    |
| DogLife        | disabled         | none               | não                  | não                    |
| Shopee         | disabled         | none               | não                  | não                    |
| Mercado Livre  | disabled         | none               | não                  | não                    |
| Drogaria Araújo| disabled         | none               | não                  | não                    |

### Cobasi — detalhes do programa

- Programa: Minha Loja Cobasi / Empreendedor MAIS. PETMOL cadastrado como PJ.
- Storefront: `https://minhaloja.cobasi.com.br?utm_source=mais&utm_medium=maisplataforma&utm_campaign=lojapetmol`
  — não modificar essa URL (não adicionar `q=`, não usar como busca).
- Deep link por produto: gerado manualmente no painel MAIS ("cole o link,
  clique em gerar"). Sem API oficial confirmada — não automatizar/scraping.
- NF de serviços obrigatória. Compra programada comissiona só a primeira
  transação. Proibido usar outro programa de marketing Cobasi simultâneo ou
  mídia paga com termos da marca Cobasi.
- Preço real (via API pública VTEX da Cobasi, `commerce_pricing.py`) é sinal
  interno de preço/matching — nunca substitui a checagem de link afiliado
  antes de mostrar "Comprar".

## Ativar a próxima loja

1. Confirmar aprovação/termos do programa real do merchant.
2. Atualizar a linha do merchant em `homeShoppingPartners.ts`:
   `affiliateStatus`, `affiliateMode`, `supportsProductDeepLink`/
   `supportsStorefrontAffiliate`, e `storefrontAffiliateUrl` se houver.
3. Se o merchant suportar deep link por produto, cadastrar links via
   `/v1/admin/affiliate-links` como na Cobasi.
4. Espelhar a storefront (se houver) em
   `affiliate_links.STOREFRONT_AFFILIATE_URLS` no backend.
