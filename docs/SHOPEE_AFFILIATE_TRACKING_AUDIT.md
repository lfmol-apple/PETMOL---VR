# Auditoria de tracking de afiliado Shopee

Auditoria não-destrutiva feita em **03/09/2026**. Objetivo: provar de ponta
a ponta que um clique PETMOL destinado à Shopee sai com o `offerLink`
emitido pela Shopee Affiliate Open API, sem perda de tracking em nenhuma
camada. Nada foi alterado.

Conta: **HENRIQUE DE FREITAS MOL** — `SHOPEE_AFFILIATE_APP_ID=18392191175`
(app_id **não** é secret; o app_secret nunca aparece aqui).

Relacionado: [AFFILIATES.md](AFFILIATES.md),
[SHOPEE_IDENTITY_CONVERGENCE.md](SHOPEE_IDENTITY_CONVERGENCE.md).

---

## Conclusão: ✅ TRACKING PROVADO

- `offerLink` nasce da API oficial, é persistido **verbatim**, servido
  **verbatim** e aberto **verbatim** — zero transformação em qualquer
  camada.
- **Nunca** ocorre `affiliate_url → productLink` / URL canônica antes de
  abrir a Shopee (código + teste de regressão + inspeção das duas rotas).
- **Todo** link testado — 10 legacy + 8 sync + API fresca + storefront —
  resolve para `utm_source=an_18392191175` + `mmp_pid=an_18392191175`
  (nossa conta).
- O dump de agosto **não** contém links de terceiro, sem tracking, ou
  `productLink` cru — é a mesma conta.
- App handoff comprovadamente preserva atribuição (`device=APP` nas
  conversões reais).

**Ressalva:** provamos o **clique** e a **atribuição à conta**. Não
provamos **clique PETMOL ↔ conversão específica** porque `utm_content` é
genérico (`----` nos produtos). Ver §Recomendações.

---

## O fluxo

```
productOfferV2 (API GraphQL oficial)
  → offerLink  (+ productLink, campo separado)
  → shopee_offer_sync.py: affiliate_url = offer_link  (verbatim; validador
      só confere https + domínio, não toca parâmetro)
  → MarketplaceOffer.affiliate_url  /  .direct_url = productLink
  → monetize() → row.affiliate_url  (NUNCA direct_url)
  → CommerceEngine → MonetizedOffer.url  (sem transformação)
  → CommerceOfferOut.url  (schema não expõe direct_url)
  → frontend: offer.url
  → navigateToPartnerUrl(offer.url):
       web            → window.open(url, '_blank', 'noopener')   [verbatim]
       PWA iOS        → window.location.href = url               [verbatim]
       Capacitor      → @capacitor/browser Browser.open({url})   [verbatim]
     (Loja do Pet: <a href={offer.url} target="_blank" rel="noopener">)
  → s.shopee.com.br/XXXX  → 302 → shopee.com.br/opaanlp/{shopId}/{itemId}
       ?...&mmp_pid=an_18392191175&utm_source=an_18392191175
       &utm_medium=affiliates&utm_content=----
```

**Sem redirect intermediário pra Shopee.** A ponte `/go/loja` existe só
pra `isCobasiAffiliateUrl` (app da Cobasi engole a UTM MAIS); `/go/petz` só
pra Petz. Shopee vai direto — o `mmp_pid` é o parâmetro projetado pra
sobreviver ao handoff pro app.

---

## Achados-chave

### 1. `offerLink` NÃO é estável

Cada `productOfferV2` cunha um short code novo. Reconsultei 2 listings
servíveis: `5LBcPXHPqF` → `40gEp5QkmE`, `1LfTTf1Iw8` → `3qMoctBUz9` — mesmo
produto, mesma conta, código diferente. **Comparação byte-a-byte
offerLink-agora × banco será sempre DIFFERENT — e isso é normal, não é
problema.** O `productLink` (`shopee.com.br/product/{shopId}/{itemId}`) é
estável.

### 2. Legacy (dump agosto) × sync — mesma conta

| ORIGEM | Nº | FORMATO | VALIDADOR | = offerLink atual? | RISCO ATRIBUIÇÃO |
|---|---|---|---|---|---|
| LEGACY / dump agosto | ~30k ativas | `s.shopee.com.br/<9-10 chars>` | passa | short code ≠ (esperado), resolve p/ `an_18392191175` — **10/10** amostras | **BAIXO** |
| SYNC API atual | ~22k validadas | idem | passa | idem — **8/8** amostras | **BAIXO** |
| MANUAL (só storefront `NEXT_PUBLIC_AFFILIATE_SHOPEE` = `s.shopee.com.br/4AzW1leQcW`) | 1 | `search?keyword=pet&utm_content=petmol-lojadopet---&utm_source=an_18392191175` | passa | — | **BAIXO** |

Legacy e sync têm formato idêntico e a mesma conta. Muda só o
`utm_campaign` (id por link) — normal.

### 3. `utm_content` (= sub_id no painel)

- **`----`** nos cliques de produto (via `offerLink` do `productOfferV2` —
  não passamos sub_id)
- **`petmol-lojadopet---`** nos cliques do storefront genérico (link criado
  no painel Shopee com esse sub_id)

Atribuição à conta funciona nos dois. Granularidade por-listing/por-tela
**não existe** hoje.

### 4. Telemetria PETMOL — o que grava

`POST /api/analytics/click` → `analytics_events` + `analytics_product_events`:

| campo | grava? |
|---|---|
| gtin, merchant, timestamp, tela/origem, platform/os/browser, link_type, preço mostrado | ✅ |
| **MarketplaceOffer.id** | ❌ |
| **external_listing_id / itemId** | ❌ |
| **URL afiliada clicada** | ❌ — removida por `_PII_KEYS` (chave `url` stripada) |

IP → SHA-256 truncado. UA → 255 chars.

**Cliques de compra (target=shopee):** ~53 em 24h, ~92 em 7d, ~141 em 30d
(medição de 03/09).

### 5. API tem endpoints de conversão

Introspecção do schema da nossa conta:
- `conversionReport` — **funciona.** `clickTime, purchaseTime,
  conversionStatus, grossCommission, netCommission, totalCommission,
  utmContent, device, orders{ items{ itemId itemName itemPrice qty } }`.
  Args: `purchaseTimeStart/End` (Int64, passar inline), `limit`, `scrollId`,
  filtros por `productId`/`orderId`/`conversionStatus`/etc.
- `validatedReport` — existe, exige `validationId`
- `partnerOrderReport` — **access deny [10031]** (não liberado pro nosso tier)

**Dados reais (`conversionReport`, ~40 dias):** 2 conversões, **AMBAS
`CANCELLED`, comissão líquida R$0**:
1. item `23598215204` "COLEIRA SCALIBOR 48CM…" R$68,40 @ LONG DOG —
   `device=APP`, `utmContent='----'`
2. item `10688001685` "Ração Royal Canin Veterinary Nutrition Urinary…"
   R$382,32 @ Rações Online — `device=APP`, `utmContent='----'`

O item 1 é o mesmo que o painel mostrou R$5,47 "pendente" — a comissão foi
**estornada** (pedido cancelado). App handoff preservou o tracking (as duas
são `device=APP`).

---

## Riscos encontrados

1. **`utm_content='----'` em todo clique de produto** — não dá pra amarrar
   conversão Shopee a clique PETMOL específico, só ao intervalo/produto.
2. **Validador de link é fraco** — só domínio. Um `productLink` cru (import
   manual, bug de feed) passaria como "válido" e serviria sem comissão.
   Hoje não há nenhum, mas não há guarda.
3. **Telemetria não grava `MarketplaceOffer.id` / `itemId` / URL** — sem
   reconciliação clique↔conversão do nosso lado.
4. **`offerLink` regenerado a cada sync** — o link no banco "envelhece"
   (funciona, mas não é idêntico ao que a API daria agora).
5. **`/commerce/monetized-offer?context=marketplace` é fail-open** (sem
   validação de identidade) — serve `affiliate_url` da mais barata.
   Tracking ok, variante possivelmente errada.
6. **2 de 2 conversões canceladas** — amostra minúscula; pode ser teste
   interno, pode ser fricção real no checkout Shopee. Observar.

---

## Recomendações (não implementadas)

- **Sub_id por clique:** passar `utm_content=petmol-{screen}-{offer_id}`
  pra amarrar conversão a clique. Mas isso **modifica o offerLink** e as
  regras Shopee proíbem alterar parâmetros do link do Portal. O caminho
  certo é usar **`generateShortLink` com `subId`** (endpoint que existe no
  schema) em vez do `offerLink` cru do `productOfferV2`.
- **Endurecer o validador:** exigir presença de tracking (`utm_source=an_` /
  `mmp_pid=an_` após resolver, ou domínio `s.shopee.com.br` + comprimento
  de short code) além do domínio.
- **Guardar `MarketplaceOffer.id` + `external_listing_id` na telemetria de
  clique** (não é PII) pra reconciliação.
- **Job periódico** puxando `conversionReport` pra dentro de uma tabela
  PETMOL — hoje a conversão só é visível no painel Shopee ou por query
  manual.
