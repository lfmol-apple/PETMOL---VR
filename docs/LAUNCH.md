# Checklist de lançamento — comércio (Cobasi + Shopee)

Lançamento **2026-08-30**. Lojas ativas: **Cobasi** e **Shopee**. Mercado
Livre e Amazon entram depois. Petz foi desativada.

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
| `SHOPEE_AFFILIATE_ENABLED` | ausente ou `true` (default `True`) | `false` → ofertas Shopee por produto não aparecem |
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

- [ ] **Shopee — ofertas por produto?** O storefront afiliado já funciona
      sozinho. Pra ter oferta por GTIN ("comprar novamente" mostra preço
      Shopee), rodar `scripts/sync_shopee_offers.py <gtin>` pros produtos
      estratégicos (ração/antiparasitário principais). Sem isso, Shopee =
      só a vitrine. **Decidir: lançar storefront-only ou sincronizar N
      produtos.**
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

No app (feche/reabra):
- [ ] "Loja do Pet" mostra **só** ícones Cobasi e Shopee.
- [ ] Nenhum "Ver na Petz" em nenhum produto.
- [ ] Nenhuma menção a Mercado Livre em lojas / busca / comprar novamente.
- [ ] "Comprar novamente" de uma ração → oferta Cobasi com preço; botão
      Shopee abre o shortlink oficial.

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
