# Checklist de autorização comercial por parceiro

Estado real de cada merchant que o PETMOL pode monetizar — comercial
(programa/autorização) separado de técnico (flag ligada no código).
Ver `docs/AFFILIATES.md` pro mecanismo técnico de cada um;
`docs/BUY_PATH_AUDIT.md` pra superfície de buy-path;
`GET /v1/admin/monetization-coverage` pra cobertura de catálogo.

| Merchant | Programa/autorização comercial | Mecanismo técnico | Estado hoje | Comprovação |
|---|---|---|---|---|
| Cobasi (MAIS) | Empreendedor MAIS — cadastro manual próprio | `ProductAffiliateLink` (cached) | Pausado por decisão de produto (`cobasi_affiliate_mode=disabled` desde 15/08/2026) | Documentado em `config.py` |
| Cobasi (Awin) | Awin advertiser 17870 | Feed Awin + `AffiliateFeedOffer` | Autorização confirmada (`commercial_status=approved`) — visibilidade real depende de `awin_enabled` | `awin_advertisers.py` |
| Petz | Programa próprio "Loja Parceira" (storefront + cupom PETTMOL) | `PetzProductMapping` + `is_petz_publicly_servable()` | Autorização de produto existe; **comissão NÃO comprovada** por compra real | `docs/PETZ_COMMISSION_VALIDATION.md` — status NÃO COMPROVADO |
| Shopee | Portal do Afiliado Shopee | `MarketplaceOffer` | Ativo (`shopee_affiliate_enabled=true` por padrão) | Cadastro manual por link oficial |
| Mercado Livre | Programa de Afiliados e Criadores (Gerador de Links) — sem API própria | `MarketplaceOffer` via CSV manual | Mecanismo comprovado por link; visibilidade pública desligada por decisão de rollout (`mercadolivre_affiliate_enabled=false`) | `docs/AFFILIATES.md` §ML |
| Zee Now | Awin advertiser 127557 | Feed Awin | Autorização confirmada (`commercial_status=approved`) | `awin_advertisers.py` |
| Zee Dog | Awin advertiser 127555 | Feed Awin | Autorização confirmada (`commercial_status=approved`) | `awin_advertisers.py` |
| Araújo | Awin advertiser 17919 | Feed Awin | `commercial_status=pending` — excluído de todos os paths públicos | `awin_advertisers.py` |
| Amazon | — | — | Integração encerrada em 22/08/2026 — `/handoff/shop?partner=amazon` sempre 503 | `docs/AFFILIATES.md` |
| PetLove (Dog Life) | **Não documentado neste repositório** | `handoff_partner.py` — URL crua em env var, sem tabela de estado | Sem gate técnico, sem registro do status do programa comercial | Nenhuma — ver risco abaixo |

## Risco aberto — PetLove

`PETLOVE_DOG_LIFE_URL` é servida (quando configurada) sem nenhum dos
gates que todo outro merchant tem — nem master flag, nem tabela de
match/link, nem `is_*_publicly_servable()`. Não é evidência de que o
link seja inválido (pode ser um acordo real e válido), mas hoje não há
como o código distinguir "programa autorizado e comprovado" de
"URL antiga que ninguém revalidou". Ação recomendada antes de
qualquer expansão desse merchant: confirmar o status real do programa
com quem negociou, documentar aqui, e só então decidir se cabe um gate
formal (mesmo padrão de `is_petz_publicly_servable()`) ou descontinuar.

## Como manter atualizado

Toda vez que um merchant mudar de status comercial (aprovado, pausado,
encerrado), atualizar esta tabela na mesma PR que muda o código —
mesma regra de "documentar o estado real, não o desejado" do resto da
auditoria (ver `docs/AFFILIATES.md` e `docs/MOBILE_RELEASE_CHECKLIST.md`).
