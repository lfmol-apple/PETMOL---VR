# Checklist de lançamento — comércio (Cobasi + Shopee)

Lançamento **2026-08-30**. Lojas ativas:
- **Cobasi** — completa (comparação de preço por produto + vitrine, UTM/MAIS 7%)
- **Shopee** — vitrine (shortlink afiliado) **+ ofertas por produto**
  (`shopee_affiliate_enabled=True`). Ficou `False` por ~1 dia no
  lançamento e voltou depois do projeto de precisão (#120). Em 01/09/2026
  recebeu Product Identity Engine: GTIN/campos canônicos separados de
  Merchant Match e Price; preço nunca escolhe variação; refresh não troca
  listing_id. Ver §7 e `docs/PRODUCT_IDENTITY.md`.

Mercado Livre e Amazon entram depois. Petz foi desativada no lançamento
e **reativada em 04/09/2026**: primeiro como card de Loja Parceira fixa
(PR #210), depois "Ver na Petz" por produto específico também (mesmo
dia) — ver `docs/AFFILIATES.md` §Petz e `docs/PETZ_COMMISSION_VALIDATION.md`.
O restante deste doc registra o estado no dia do lançamento (histórico).

Este doc é o runbook de go-live da parte comercial. Deploy geral: ver
`docs/DEPLOYMENT.md`.

---

## 1. Estado do código (já no PR de lançamento)

| Item | Onde | Estado no PR |
|---|---|---|
| Petz desativada | `petz_provider.is_petz_publicly_servable` (`petz_publicly_disabled=True`) + `homeShoppingPartners.ts` (`affiliateStatus: 'disabled'`) | ✅ |
| Mercado Livre fora | `homeShoppingPartners.ts` (`affiliateStatus: 'disabled'`); backend já off por padrão | ✅ |
| Amazon fora | sem `amazon_associate_tag`; nunca reintroduzido | ✅ (nada a fazer) |
| Quick-buy só Cobasi/Shopee | `petStoreContent.ts::QUICK_BUY_PARTNERS = ['cobasi', 'shopee']` | ✅ |
| `/loja` deriva das lojas ativas | `app/loja/page.tsx` (filtra por `isPartnerVisibleInStoreArea`) | ✅ |

Todo o código de Petz e ML fica **dormente** no repo — reativar cada um é
flip de flag/status (ver comentários no código).

---

## 2. Variáveis de produção a CONFERIR antes do go-live

No VPS (`/etc/petmol/petmol.env`) e no build do frontend. **Conferir, não
presumir.**

### Backend (`/etc/petmol/petmol.env`)

| Var | Valor esperado no lançamento | Efeito se errado |
|---|---|---|
| `PETZ_PUBLICLY_DISABLED` | ausente ou `true` (default no código já é `True`) | se `false`, "Ver na Petz" volta |
| `PETZ_AFFILIATE_ENABLED` | pode ficar como está — o kill-switch acima vence | — |
| `COBASI_AFFILIATE_MODE` | `utm` (ou ausente — default é `utm`) | `disabled` → Cobasi não monetiza nem busca preço |
| `SHOPEE_AFFILIATE_ENABLED` | ausente ou `true` (default no código voltou a `True` após o projeto de precisão #120) | `false` → Shopee vira só vitrine (ofertas por produto somem) |
| `MERCADOLIVRE_AFFILIATE_ENABLED` | **ausente ou `false`** | `true` → ML pode vazar em superfícies |
| `MERCADOLIVRE_PUBLIC_OFFERS_ENABLED` | **ausente ou `false`** | `true` (com afiliado on) → ofertas ML públicas |
| `AMAZON_ASSOCIATE_TAG` | **ausente** | qualquer valor tenta reativar Amazon |
| `AWIN_ENABLED` | conforme decisão (Cobasi funciona por UTM sem isto) | ligar sem querer expõe rota Awin |

Comando de conferência (no VPS):
```
grep -E 'PETZ|COBASI|SHOPEE|MERCADOLIVRE|AMAZON|AWIN' /etc/petmol/petmol.env
```

### Frontend (bakeado no build — ver `apps/web` package.json / CI)

| Var | Valor esperado |
|---|---|
| `NEXT_PUBLIC_AFFILIATE_SHOPEE` | **shortlink oficial PETMOL da Shopee** (gerado no Portal do Afiliado). Se ausente, o código usa `DEFAULT_SHOPEE_AFFILIATE_URL` (`s.shopee.com.br/4AzW1leQcW`) — **confirmar que esse default é o link oficial atual**, senão setar a var. |
| `NEXT_PUBLIC_AFFILIATE_COBASI` | opcional — Cobasi por produto usa `/commerce/offers` (UTM no backend), não esta var. |
| `NEXT_PUBLIC_AFFILIATE_MERCADOLIVRE` | irrelevante no lançamento (ML `disabled`). |

---

## 3. Decisões de conteúdo antes do go-live

- [x] **Shopee** — ficou só vitrine por ~1 dia (30/08); **voltou com
      ofertas por produto** (`shopee_affiliate_enabled=True`) depois do
      projeto de precisão (§7). Ainda vale rodar o audit + revisão de §7.
- [ ] **Confirmar o shortlink oficial da Shopee** — o default no código é
      `s.shopee.com.br/4AzW1leQcW` (`DEFAULT_SHOPEE_AFFILIATE_URL` em
      `homeShoppingPartners.ts`). Resolve pra `shopee.com.br/search?keyword=pet`
      com tracking de afiliado PETMOL (`utm_content=petmol-lojadopet`,
      `mmp_pid=an_18392191175`) — verificado 2026-08-30. Se houver um
      shortlink mais novo/melhor, setar `NEXT_PUBLIC_AFFILIATE_SHOPEE`.
- [ ] **Cobasi — validar 1 compra real** com a UTM (`utm_source=mais…`)
      pra confirmar atribuição no painel MAIS. (Discovery de preço já
      funciona independente disso.)
- [ ] Logos `apps/web/public/partner-logos/{cobasi,shopee}.png` conferidos.

---

## 4. Smoke tests pós-deploy (produção)

```
# 1. Petz sumiu do endpoint
curl -s 'https://www.petmol.com.br/api/commerce/petz-direct-link?gtin=7896181298090' | grep -o '"available":[a-z]*'
#   → "available":false

# 2. Handoff Petz bloqueado
curl -s -o /dev/null -w '%{http_code}\n' 'https://www.petmol.com.br/api/handoff/shop?partner=petz'
#   → 503

# 3. Cobasi ainda serve preço
curl -s 'https://www.petmol.com.br/api/commerce/offers?q=racao%20golden' | head -c 300
#   → ofertas com merchant "cobasi" e url com utm_source=mais
```

# 4. Shopee de volta — oferta por produto aparece (preço fresco OU
#    "price":null se ainda não re-sincronizada — nunca número velho)
curl -s 'https://www.petmol.com.br/api/commerce/monetized-offer?merchant=shopee&context=marketplace&gtin=7896181298090'
#   → {"offer":{"merchant":"shopee",...}}
```

No app (feche/reabra):
- [ ] "Loja do Pet" mostra **só** ícones Cobasi e Shopee.
- [ ] Nenhum "Ver na Petz" em nenhum produto.
- [ ] Nenhuma menção a Mercado Livre em lojas / busca / comprar novamente.
- [ ] "Comprar novamente" de uma ração → oferta Cobasi com preço; oferta
      Shopee quando houver (preço fresco ou "Conferir preço na Shopee" —
      nunca um número defasado).
- [ ] Ícone Shopee na "Loja do Pet" abre o shortlink oficial.

---

## 5. Rollback

- Frontend/backend: reverter o PR de lançamento (tag de rollback criada
  no merge, padrão `rollback/pre-launch-<data>`).
- Reativar Petz (se necessário): `petz_publicly_disabled` → `False` +
  `affiliateStatus` Petz → `'active'`.
- Reativar Mercado Livre: `affiliateStatus` ML → `'active'` +
  `MERCADOLIVRE_AFFILIATE_ENABLED=true` (+ `MERCADOLIVRE_PUBLIC_OFFERS_ENABLED=true`
  se quiser ofertas públicas).

---

## 6. Pós-lançamento (quando ligar ML / Amazon)

- **Mercado Livre**: ligar `mercadolivre_affiliate_enabled` +
  `mercadolivre_public_offers_enabled`, `affiliateStatus` → `'active'`,
  rodar a bridge manual de links (`export_ml_link_candidates.py` →
  Gerador de Links do ML → `import_ml_offers.py`). Ver `docs/AFFILIATES.md`
  §Mercado Livre. Scraping do site do ML é proibido.
- **Amazon**: só com nova aprovação do Amazon Associates e nova tag
  válida — reintrodução está bloqueada por decisão de produto até lá
  (`docs/AFFILIATES.md` §Amazon).

---

## 7. Shopee por produto — status

`shopee_affiliate_enabled=True` (voltou 30/08 após #120). Ofertas Shopee
por produto aparecem de novo. Esta seção lista o que já protege a
qualidade e o que ainda vale rodar.

### Já feito (#120)

1. **GTIN literal como 1ª palavra-chave** da busca Shopee
   (`shopee_offer_sync.py`) — vendedor sério de pet põe o EAN no título;
   é o mais perto de um lookup por GTIN que a API da Shopee permite.
2. **Hard-fail de comprimento em cm** pra coleiras
   (`shopee_offer_matcher.py::extract_length_cm`) — Scalibor 48cm nunca
   casa com um anúncio "65 cm".
3. **Sync noturno em prioridades** (RC 1.0; ordem revista 01/09/2026): o
   timer diário (`petmol-shopee-sync.timer`) usa `source=active_products`
   — fila determinística deduplicada por GTIN, na ordem: **A** GTINs que
   os tutores de fato usam (`product_scan_events` resolvidos num produto
   de catálogo com nome) — é o que aparece na tela, conjunto pequeno,
   revalidado toda noite → **B** o resto das ofertas Shopee ativas
   (backlog, da mais antiga pra mais nova; nunca apaga a oferta se a API
   falhar) → **C** catálogo Awin fresco (Cobasi/Zee Now/Zee Dog), só o
   que ainda não tem oferta Shopee. Teto por execução
   (`SHOPEE_SYNC_MAX_PRODUCTS_PER_RUN`, default 400); ao bater o teto,
   para limpo e a próxima noite continua. **Por que tutores primeiro:**
   antes, "A" era todas as ~10k+ ofertas ativas — estourava o teto de 400
   toda noite, "B"/"C" nunca rodavam e o preço Shopee ficava
   permanentemente defasado (janela stale de 36h). O feed Awin não é
   dependência das prioridades A/B. O `activate.sh` do deploy instala o
   trigger script novo sozinho.
4. **Frescor + descoberta on-demand**: oferta de marketplace defasada
   (`marketplace_offer_stale_after_hours`, default 36h) não vira mais
   número na tela — `price=None`, o app mostra "Conferir preço na Shopee"
   e a oferta desce pro fim do ranking, mas o **link afiliado é
   preservado**. Quando o tutor abre a Loja de um produto com GTIN
   confiável e ainda não existe oferta Shopee, o backend agenda **uma**
   tentativa de descoberta por GTIN em background (nunca inline — o
   cliente tem timeout de 5s), com cooldown persistido por GTIN
   (`SHOPEE_MISS_RETRY_HOURS`, default 12h); a próxima abertura encontra
   a oferta.
5. **Product Identity Engine (01/09/2026)**: `products_catalog` é a fonte
   de verdade; `MarketplaceOffer` guarda `merchant_title` e evidências de
   match; `CommerceEngine` devolve nome canônico para busca e produto
   pré-cadastrado. Variações de peso, volume, cm de coleira, comprimidos,
   faixa de peso do pet, porte, espécie, idade e terapêutica viram
   `CONFLICT`. GTIN igual vira `EXACT`, salvo corrupção objetiva.
6. **Refresh de preço separado**: `petmol-commerce-price-refresh.timer`
   roda a cada 6h (`02,08,14,20:20 UTC`, com atraso aleatório) e chama
   `scripts/refresh_commerce_prices.py`. Ele processa somente ofertas
   Shopee já validadas, preserva preço antigo em erro/timeout, nunca cria
   oferta nova e nunca troca `external_listing_id`; se a API devolver
   outro SKU aceito no lugar do atual, marca `identity_conflict`.

### Auditoria operacional

- `GET /v1/admin/commerce-identity/product-report` resume Cobasi/Shopee:
  matches exatos, alta confiança, ambiguidades, conflitos, preços frescos
  ou stale, erros do refresh e motivos de rejeição.
- A tela pública deve mostrar `canonical_name`/nome PETMOL. Título de
  lojista (`merchant_product_name`) é dado de auditoria, não verdade de
  produto.

### Ainda vale rodar (higiene, não bloqueia)

- [ ] **Rodar 1 sync manual** pra refrescar já (senão só no próximo
      05:00 UTC): `curl -X POST .../v1/admin/shopee-sync/run
      -H "X-Sync-Token: $TOKEN" -d '{"source":"active_products"}'`
      e acompanhar `GET .../v1/admin/shopee-sync/status` (campos
      `refreshed_existing / new_matches / misses / errors /
      skipped_cooldown / remaining_after_cap / duration_seconds`).
- [ ] `scripts/audit_shopee_offers.py --deactivate-invalid` — desliga as
      ofertas antigas que não recasarem no matcher novo.
- [ ] Revisar à mão uma amostra (10-15 ofertas): a URL abre o produto
      certo? preço bate?

Enquanto isso não roda, a rede de segurança do §7.4 (oferta >36h sem
preço-número) garante que nada de errado aparece como número — só o
link, com "Conferir preço na Shopee".

### Gap conhecido do matcher

Tamanho de coleira abreviado (anúncio "Scalibor **M**") vs escrito
("Cães Pequenos e Médios") — o matcher não equipara os dois de forma
confiável sem quebrar o casamento de porte de ração (Mini Adult ≠ Adult).
Mitigação: o GTIN-first pega o anúncio certo quando o vendedor lista o
EAN; a revisão à mão acima pega o resto.
