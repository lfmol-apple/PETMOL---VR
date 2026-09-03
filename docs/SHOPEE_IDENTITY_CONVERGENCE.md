# Convergência de identidade Shopee

Como o PETMOL faz a oferta Shopee ser **coerente** (produto/variante/preço
certos) sem apagar cobertura nem fazer operação de massa destrutiva.
Contexto pra quem pegar isso depois — inclusive GPT.

Relacionado: [PRODUCT_IDENTITY.md](PRODUCT_IDENTITY.md),
[AFFILIATES.md](AFFILIATES.md),
[SHOPEE_AFFILIATE_TRACKING_AUDIT.md](SHOPEE_AFFILIATE_TRACKING_AUDIT.md).

---

## 1. O problema (set/2026)

`marketplace_offers` tinha ~60.500 ofertas Shopee ativas / ~10.800 produtos,
mas **só 193 com `merchant_title`** — o resto era um despejo em massa de
agosto: sem título, sem GTIN do anúncio, sem `match_decision`. O provider
era **fail-open**: servia a oferta ativa mais barata, sem validar identidade.
Resultado: Scalibor 48cm mostrava anúncio de 65cm; ração Urinary 7,5kg
mostrava "Mini Indoor" 2kg; etc.

A Cobasi **não** era o problema: é consulta direta por EAN na VTEX, devolve
o SKU certo. É a âncora confiável, cobre ~100% via programa MAIS.

A Shopee **é** o problema estrutural: a API de afiliado (`productOfferV2`)
**só aceita palavra-chave** — não existe lookup por GTIN. Não fazemos
scraping. Então a única estratégia possível é: buscar por nome/EAN-como-
keyword → validar cada candidato no Identity Engine → servir/gravar só o
que passou.

---

## 2. Princípio (não negociável)

> Nunca servir ao tutor uma oferta cuja identidade não esteja
> suficientemente **comprovada**, mas também nunca apagar/desativar uma
> oferta legada só porque ainda não conseguimos comprová-la.

- Evidência **positiva** de que é o produto → serve / grava.
- Evidência **positiva** de que **não** é (conflito estrutural) → desativa
  e libera o GTIN pra recasar.
- **Ausência** de evidência → mantém `active`, **não serve, não desativa**.
  A Cobasi cobre a tela enquanto isso.

Preço **nunca cria identidade** — só ajuda a ordenar/confirmar um candidato
que já tem identidade textual/estrutural quase suficiente.

---

## 3. O que mudou no código (branch `fix/matcher-dieta-veterinaria`, PR #186)

| commit | efeito |
|---|---|
| `a7d93d0` | `_compare_therapeutic`: dieta veterinária/terapêutica é **fronteira de identidade**. Produto esperado com marcador terapêutico + anúncio sem nenhum (ou outro) → CONFLITO, não UNKNOWN. GTIN exato suprime conflito terapêutico só inferido de título. |
| `8169bbd` | **Provider identidade-primeiro** (`_select_valid_marketplace_offer` deixa de ser fail-open) — atrás do flag `marketplace_strict_identity_serving`. **Auditoria Shopee tri-state**: `valid` (enriquece) / `conflict` (única classe que desativa) / `unresolved` (não desativa) / `error` (não desativa). |
| `ee3ee98` | Fecha vazamento de pack/multipack no matcher: abreviações ("4 Comp.", "2 Un", "cx"), "Kit com 2", e anúncio "3 comprimidos" vs esperado avulso = CONFLITO. |
| `9ae312a` | Flag **`marketplace_strict_identity_serving`** (`config.py`, **OFF por padrão**). OFF = comportamento antigo (fail-open) MAS conflito comprovado nunca é servido. ON = só serve identidade comprovada. |
| `1d75cef` | `_resolve_product_id_from_text` respeita `context.weight_kg` — "Urinary Small Dog" existe em 2kg e 7,5kg; sem isso servia a de 2kg num plano de 7,5kg. |
| `3f506ab` | Resgate por **banda de preço Cobasi** (`_anchor_price_rescues`) + `_has_ambiguous_sku_identity` só considera dimensão **não pinada**. |
| `f6784c7` | Endurece 4 pontos (review externo — ver §6). |
| `9cab748` | Escada de keywords orientada pela identidade enriquecida (marca + linha/sabor/porte/faixa/comprimento + peso). |

Tag de rollback: `rollback/pre-matcher-dieta-20260902` → `22f6c92`.

---

## 4. O flag `marketplace_strict_identity_serving`

- **Nasce OFF.** O despejo de agosto tem ~60k linhas sem título; ligar o
  modo estrito antes de reconstruir a cobertura derruba a Shopee da
  vitrine (piloto: só **42 produtos** servíveis com flag ON no dia 0).
- Enquanto OFF: fail-open preservado, **exceto** que oferta em CONFLITO
  comprovado nunca é servida (isso é sempre ativo).
- **Ligar quando:** a fila A estiver reconstruída com títulos reais e a
  medição mostrar cobertura aceitável. Env: `MARKETPLACE_STRICT_IDENTITY_SERVING=true`
  em `/opt/petmol/shared/env/api.env`.
- **Estado final do lançamento é ON.** OFF é medida operacional de
  transição, não o destino.

---

## 5. Método de reconstrução — rounds (catch-up ÚNICO)

O despejo de agosto forçou um catch-up único. **Não é padrão recorrente.**

- **Round 1** (`enrich_ab.py`): `sync_shopee_offer_for_gtin` em ~10.846
  GTINs — fila A (scan events) + fila B (todo GTIN com oferta Shopee
  ativa). **NÃO** fila C (descoberta nova de catálogo Cobasi). Por GTIN:
  busca API, casa, grava confiáveis COM título/decisão, aposenta as
  title-less do mesmo produto (substituídas por evidência positiva); GTIN
  sem match fica intocado. 0,4s entre GTINs, checkpoint resumível.
  **Resultado: ~50% match, ~5.500 GTINs casados, ~25.800 ofertas gravadas.**
- **Round 2** (`enrich_round2.py`): só os ~5.300 que o round 1 não casou,
  cada um com `anchor_price` = preço Cobasi ao vivo do mesmo GTIN + matcher
  endurecido + escada de keywords.

Scripts ficam em `services/price-service/` no worktree de execução; não são
parte do deploy. Rodam via `systemd-run --unit=petmol-enrich-*` na VPS.

**Regra:** mudança de critério do matcher → re-run **só do segmento
afetado** (ex: GTINs com discriminador de comprimento após mexer em
coleira), algumas centenas, uma vez. **Nunca** sweep completo de novo.

---

## 6. Review externo (GPT, 03/09) — 4 endurecimentos aplicados

1. **`_anchor_price_rescues` estava forte demais.** Preço não pode
   converter NO_MATCH fraco em HIGH_CONFIDENCE. Agora exige:
   `BRAND_MATCH` + `FAMILY_MATCH` + ≥1 discriminador real MATCH + confiança
   ≥0,50 + banda estreita `[0,75×, 1,30×]` + dimensão dura pinada
   (peso/volume/comprimento) tem que ser MATCH (não UNKNOWN) + tokens de
   `product_line` pinada presentes no título. Sem isso não resgata.
2. **`evaluate_identity`** — resultado NO_MATCH agora carrega os sinais que
   bateram (`BRAND_MATCH`/`FAMILY_MATCH`/`*_MATCH`), pra quem chama
   distinguir quase-match de lixo.
3. **`_has_ambiguous_sku_identity`** — compara valores **por dimensão**,
   não tupla heterogênea. Ambíguo = alguma dimensão **não pinada** com 2+
   valores explícitos incompatíveis entre candidatos aceitos.
4. **Desativação do sync** = mesma epistemologia do audit: listing que já
   foi EXACT/HIGH_CONFIDENCE e só não voltou na busca vira
   `stale_unconfirmed`, **não desativa**. Só aposenta legado sem identidade
   (com substituto positivo) ou CONFLITO anterior.

**Pendente (round 3, se a cobertura pós-round-2 não bastar):**
- API de GTIN (Bluesoft Cosmos) como **enriquecimento**, não juiz.
  Hierarquia: Cobasi/Awin por GTIN > catálogo PETMOL enriquecido > Cosmos
  por GTIN > texto genérico. `evidence="COSMOS_GTIN"`.
- Comparação de imagem (pHash primeiro, embeddings depois) como
  **desempate** pros AMBIGUOUS — nunca imagem→HIGH_CONFIDENCE (2kg e 7,5kg
  usam a mesma foto).
- Investigar na doc autenticada da Shopee se há lookup por `itemId/shopId`
  — resolveria os `unresolved` do audit ("listing não voltou na busca").

---

## 7. Fila noturna — prioridade por estratégia (proposto)

Hoje: `petmol-shopee-sync.timer` 05:00 UTC, `iter_launch_coverage_queue`
A→B→C, cap `shopee_sync_max_products_per_run=400`.

**Steady state proposto** (implementar após round 2, calibrar pesos com dado):

| Tier | quem | cadência |
|---|---|---|
| 1 | scan events ≤7d + item de plano/medicação com lembrete disparando | **toda noite** |
| 2 | ofertas validadas (EXACT/HIGH_CONFIDENCE) — refresh de preço + "ainda válida?" | ~1/7 por noite (semanal), priorizado por cliques de commerce |
| 3 | `stale_unconfirmed` + `unresolved` do audit | quinzenal |
| 4 | GTIN sem match confiável — retry de discovery, respeitando cooldown `ShopeeDiscoveryAttempt` | mensal, categoria de valor primeiro (medicação/antiparasitário/ração > acessório) |
| 5 | sem scan, fora de feed, baixo valor | quase nunca — entra só se um tutor escanear |

Event-driven (fora do cron): tutor escaneia produto novo →
`schedule_shopee_discovery` na hora. Deploy que muda o matcher → enfileira
só o segmento afetado.

Ajuste imediato: cap 400 → ~800-1000/noite (backlog cicla em ~2 semanas).

---

## 8. Decisão de lançamento: Cobasi-first

Perseguir paridade de cobertura Shopee **não** vale o risco. 8.500 Cobasi
corretos + ~5.000-6.000 Shopee corretos é produto melhor que 8.500 Cobasi
+ 10.000 Shopee com fração de SKU errado. Uma Shopee incorreta destrói a
confiança na comparação inteira — inclusive na Cobasi correta.

O "8500 = 8500" era a meta errada.

---

## 9. Números do piloto (produção, dry-run, 02-03/09)

- Ofertas Shopee ativas: 60.498 / produtos: 10.837 / **com título: 193**
- Provider com flag ON no dia 0: **42 produtos servíveis** (por isso flag OFF)
- Audit tri-state em 8 GTINs conhecidos: 42 valid / 41 conflict / 35
  unresolved / 0 error — todos conflitos legítimos (65↔48cm, faixa de
  peso, pack). **Zero falso-conflito** em anúncio genuinamente certo.
- Casos conhecidos: Scalibor 48↔65 → conflict ✓; RC Urinary vs linha
  comum → conflict ✓; listing ausente → unresolved ✓; NexGard faixa de
  peso errada → conflict ✓.
- Pós round 1: **~5.000 produtos com Shopee validada** (de 42).

---

## 10. Runbook

**VPS:** `root@147.93.33.24` (porta 22 instável — retry). App:
`/opt/petmol/current`. Venv price-service:
`/opt/petmol/current/services/price-service/.venv/bin/python`. Env:
`/opt/petmol/shared/env/api.env` (tem valor com parênteses que quebra
`source` do bash — usar `-p EnvironmentFile=` do systemd-run ou parser
python). DB: `psql -h localhost -U petmol_dev -d petmol_dev` (a
`DATABASE_URL` usa user `petmol_dev`).

**Rodar one-off:**
```
systemd-run --pipe --wait --collect --uid=petmol --gid=petmol \
  -p WorkingDirectory=<dir>/services/price-service \
  -p EnvironmentFile=/opt/petmol/shared/env/api.env \
  /opt/petmol/current/services/price-service/.venv/bin/python <script>
```

**Auditoria tri-state (dry-run):**
`python scripts/audit_shopee_offers.py --gtins <a,b,c>` (sem `--apply` = dry).
Com `--apply` desativa conflitos e enriquece válidas.

**Verificar tracking / conversões Shopee:** query GraphQL
`conversionReport(purchaseTimeStart:, purchaseTimeEnd:, limit:)` via
`src.shopee_affiliate_client._post`. `partnerOrderReport` = access-deny no
nosso tier. Ver [SHOPEE_AFFILIATE_TRACKING_AUDIT.md](SHOPEE_AFFILIATE_TRACKING_AUDIT.md).

**Backup antes de saneamento de dados:**
`pg_dump -h localhost -U petmol_dev -d petmol_dev -t marketplace_offers | gzip > .../manual/marketplace_offers_PRE_<motivo>_<ts>.sql.gz`

---

## 11. Restrições permanentes (não violar)

- Não desativar em massa `marketplace_offers` por SQL
  (`UPDATE ... SET active=false WHERE match_decision IS NULL`) — já se
  provou inadequado.
- Não alterar Cobasi, links MAIS/UTM, credenciais Shopee, ou links
  afiliados Shopee válidos.
- Não fazer scraping. Só API oficial.
- Respeitar o rate limit (~0,4s entre chamadas Shopee). Sem paralelismo
  agressivo.
- Deploy de código e saneamento de dados são etapas **separadas**.
- Antes de operação de massa: dry-run/piloto → PARAR → mostrar números →
  decisão do usuário.

---

## 12. Resultados rounds 1 + 2 (03/09/2026)

Catch-up único executado (`enrich_ab.py` round 1 + `enrich_round2.py`
round 2, com o matcher de `9cab748`). Aditivo, checkpoint, backup
`marketplace_offers_PRE_ENRICH_20260903T025947Z.sql.gz`.

| | round 1 | round 2 |
|---|---|---|
| GTINs processados | 10.842 | 5.318 (só os que o round 1 não casou) |
| casados | 5.479 (~50%) | 1.103 (~21% do balde difícil) |
| ofertas gravadas c/ título+decisão | 25.840 | 5.338 |
| resgatados por banda de preço Cobasi | — | 71 (~6% dos matches — não inerte) |
| erro de API | 461 | 80 |

**Estado da vitrine (medição `measure_coverage.py`, flag ON simulado):**

- Ofertas Shopee ativas: 60.498 → **50.466** (~10k title-less legadas
  aposentadas por substituto positivo)
- `match_decision`: **31.282 HIGH_CONFIDENCE** / 19.176 NULL (legado) /
  6 NO_MATCH / 2 CONFLICT
- **Produtos com Shopee servível (flag ON): 5.981 de 10.837 (55%)** —
  vs **42** no dia 0 do piloto
- ~6.582 GTINs com match no total; a diferença pra 5.981 servíveis é
  re-validação de identidade do provider (catálogo) um pouco mais rígida
  que o `expected_name` do sync.

**Análise do balde sem-match (4.212 GTINs):**

| segmento | total | tem Cobasi | visto por tutor |
|---|---|---|---|
| acessório/outro | 2.811 | 1.131 | **3** |
| ração | 906 | 679 | **4** |
| med/antiparasitário | 227 | 135 | 0 |
| petisco | 161 | 62 | 2 |
| higiene | 107 | 46 | 1 |

**Só ~10 GTINs sem-match são vistos por tutor** (scan/plano). Retry
priority-A neles: 0 casou — são ausências genuínas na Shopee, não erro de
API. Os 10: 2 são lixo de scanner (vinho, óleo de cabelo), 6 têm Cobasi
(família Biscrok, Pedigree úmida, Pet Milk), 2 são pet real sem Cobasi
(Bifinho Doguitos, tapete Kapazi). **Nenhum gap de cobertura relevante.**

O caso Biscrok é o matcher recusando corretamente anúncios multi-variante
ambíguos ("Biscrok Multi" vs "Raças Pequenas" vs tamanhos) — Cobasi mostra
o preço.

### Prontidão pra ligar `MARKETPLACE_STRICT_IDENTITY_SERVING=true`

- **Cobertura: 5.981 produtos** servíveis com identidade comprovada.
- Produtos que sairiam da vitrine Shopee: ~4.856 — **quase todos long-tail
  / lixo de UPC**, ~10 vistos por tutor, todos com Cobasi menos 2 itens
  menores.
- Risco de preço errado com flag ON: **eliminado** (só serve comprovado).
- Recomendação: **pronto pra ligar** após merge do #186. Decisão do
  usuário (impacto visível na vitrine).

### Steady state

Rounds não se repetem. Daqui pra frente: fila noturna priorizada (§7) +
re-run segmentado só quando muda regra do matcher. Ver
`services/price-service/scripts/` e a fila `iter_launch_coverage_queue`.
