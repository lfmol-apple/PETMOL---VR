# Inventário de buy paths públicos

Última varredura: 25/08/2026 (revisão pós-#70). Cobre todo padrão que
pode terminar numa URL de compra: `window.open`, `window.location`,
`location.href`, `Browser.open`, `navigateToPartnerUrl`,
`openHomeShoppingPartner`, rotas `/handoff/*`, `affiliate_url`,
`direct_url`, `fallbackUrl`, `storefrontAffiliateUrl`, CTAs "Comprar" /
"Recomprar" / "Ver oferta" / "Onde comprar" / "Ver na loja".

**Pergunta obrigatória: existe hoje qualquer CTA público em produção
capaz de abrir um caminho não monetizado? NÃO.**

Os três que existiam (VaccineItemSheet, `/handoff/shopping` →
Google Shopping, `handoff_partner.py`'s `dest` open redirect + bypass
do gate Petz) foram fechados no PR #66, verificados ao vivo em
produção (`curl` contra `petmol.com.br`), e agora têm cobertura de
teste explícita — ver `test_handoff_partner.py`,
`test_handoff_shopping.py`, e o contrato global em
`test_buy_path_regression.py` (`test_no_unmonetized_public_buy_paths`,
`test_affiliate_only_never_returns_direct_link`).

## Superfície completa

| Surface | CTA | Merchant(s) | Origem da URL | Mecanismo | Gate | Status |
|---|---|---|---|---|---|---|
| `GET /commerce/offers` (via `MonetizedOffersList.tsx`, `AffiliateCatalogSearch.tsx`, `HomeShoppingSheet.tsx`) | "🛒 Comprar" | Cobasi, Zee Now, Zee Dog, Shopee, ML | `CommerceEngine` — `ProductAffiliateLink.affiliate_product_url` / Awin `affiliate_url` via `build_awin_click_redirect_url` / `MarketplaceOffer.affiliate_url` | Cadastro manual / feed Awin / Portal do Afiliado | `cobasi_affiliate_mode`, `awin_enabled`+`shadow_mode`+per-merchant, `shopee_affiliate_enabled`, `mercadolivre_affiliate_enabled` — todos re-checados dentro de `monetize()` | ✅ Seguro. `MonetizedOffer` não tem campo `direct_url`; `get_offers()` descarta oferta sem preço |
| `GET /commerce/petz-direct-link` | "Ver na Petz" | Petz | `PetzProductMapping.product_url` ou `STOREFRONT_AFFILIATE_URLS["petz"]` | Loja Parceira + cupom PETTMOL | `is_petz_publicly_servable()` (as duas flags) | ✅ Seguro (fix #65) |
| `GET /commerce/monetized-offer` | store/product/marketplace context | Cobasi, Petz, Shopee, ML | `get_monetized_offer()` | idem acima | Petz: `is_petz_publicly_servable()`; Cobasi: `cobasi_affiliate_mode`; Shopee/ML: `is_marketplace_merchant_publicly_servable()` | ✅ Seguro (gap dormente fechado nesta revisão) |
| `GET /commerce/awin-click` | redirect server-side | Cobasi, Zee Now, Zee Dog | `resolve_awin_click_target()` | Rede Awin | Exige `awc` não-vazio no destino final, fail-closed | ✅ Seguro (fix #65) |
| `resolvePartnerUrl()`/`openHomeShoppingPartner()` (`homeShoppingPartners.ts`) | QuickBuyRow, botões genéricos de loja | Cobasi, Shopee, Zee Now, Zee Dog, Petz | env `AFF[...]` ou `storefrontAffiliateUrl` fixa | idem | `AFFILIATE_ONLY_COMMERCE` — `return null` antes de qualquer fallback direto | ✅ Seguro em build de produção |
| `VaccineItemSheet.tsx` "Onde comprar" | botões por loja | Cobasi, Shopee, Zee Now, Zee Dog | Agora via `openHomeShoppingPartner`/`isPartnerVisibleInStoreArea` | idem | idem | ✅ Corrigido (#66) — antes eram 4 URLs de busca hardcoded, zero afiliado |
| `/handoff/shopping` → `/go/shopping` | banner "Recomprar" (`FoodControlTab.tsx`) | genérico (Google Shopping) | — | nenhum | `affiliate_only_commerce_enforced` — falha fechado server-side e na CTA | ✅ Corrigido (#66) — era o único comportamento do endpoint, não um fallback |
| `/handoff/shop`, `/handoff/doglife` | "Lojas parceiras" (`FunnelCTAs.tsx`, página pública `/p/[id]`) | Cobasi, Petz, PetLove | Cobasi/Petz agora via `get_monetized_offer()`; PetLove ainda via env var crua | Cobasi/Petz: idem acima; PetLove: nenhum gate formal | ✅ Cobasi/Petz corrigidos (#66); ⚠️ PetLove sem conceito de prova comercial no código — ver risco residual abaixo |

## Risco residual (não é um buy path aberto — é uma lacuna de modelagem)

**PetLove (Dog Life)** é o único merchant em `handoff_partner.py` sem
gate técnico nem tabela de estado — só uma env var (`PETLOVE_DOG_LIFE_URL`)
validada como HTTPS antes do redirect. Não é uma URL conhecida como
não-monetizada (pode ser um link real do programa), mas também não há
como hoje o código distinguir COMPROVADO de NÃO COMPROVADO pra esse
merchant especificamente. Não corrigido nesta rodada — decisão de
produto sobre o que "prova comercial" significa pra esse programa
específico fica pra quando ele for de fato avaliado.

## Como este documento se mantém atualizado

`test_no_unmonetized_public_buy_paths` e
`test_affiliate_only_never_returns_direct_link`
(`tests/test_buy_path_regression.py`) são o mecanismo de proteção real
— eles quebram se um CTA novo reintroduzir um fallback não monetizado.
Este arquivo é o resumo legível por humano; a fonte de verdade sobre
"está seguro agora" são os testes, não este texto.
