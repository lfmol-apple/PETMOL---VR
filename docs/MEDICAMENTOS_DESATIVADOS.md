# Medicamentos — desativado no PETMOL 1.0

## Motivo

Decisão de produto: Medicamentos não faz parte do PETMOL 1.0. A implementação
inteira (UI, dados, backend, testes) foi **preservada**, não removida — só a
experiência do usuário foi desligada, via feature flag.

## Data

18/09/2026.

## Ponto de recuperação (commit / branch / tag)

- **Commit de referência** (implementação completa e funcional, antes de
  qualquer alteração desta desativação): `cbacba4`.
- **Branch de recuperação**: `archive/medicamentos-pre-1.0` (aponta pro
  commit `cbacba4`).
- **Tag anotada**: `archive/medicamentos-pre-1.0-tag` (mesmo commit).

Ambos já estão publicados no remoto (`origin`). Pra ver a implementação
exatamente como estava antes desta desativação:

```bash
git checkout archive/medicamentos-pre-1.0
# ou
git show archive/medicamentos-pre-1.0-tag
```

## Onde está a implementação (nada foi apagado)

Tudo abaixo continua no código, intacto, só sem ponto de entrada visível:

**Frontend** (`apps/web/src`)
- `components/home/MedicationItemSheet.tsx` — sheet principal de
  Medicação (formulário, calendário de doses, "Registrar dose",
  frequências vezes/dia · a cada horas · a cada dias).
- `components/home/HealthMedicationPanel.tsx` + aba "Medicação" dentro de
  `components/home/HealthModal.tsx` (`healthTabs`) — segunda superfície,
  o painel de Medicação dentro do modal geral de Cuidados.
- `components/home/HealthQuickActionSheet.tsx` — ação rápida "Registrar
  dose" a partir de um lembrete.
- `components/PushActionSheet.tsx` — tela de ação rápida quando o tutor
  toca num push de medicação (`type: 'medication'`).
- `components/home/HomeNavigationModals.tsx` — tile "Medicação" na grade
  de Cuidados.
- `lib/petCareDomain.ts` (`processEvents`) — geração do lembrete de
  medicação a partir de `PetEventRecord` (dois modos: `treatment_days` e
  `custom_interval_days`), com extração de GTIN das notes
  (`extractMedicationBarcode`).
- `lib/careAreaTheme.ts` — tema de cor da área (`CARE_AREA_THEME.medication`).
- `features/interactions/{homeModalRouting,useHomeMedicationActions,
  useHomeSurfaceActions,useHomeItemSheetActions,interactionEngine,
  preferences}.ts` — roteamento de deep-link/push e templates de
  notificação por domínio.
- `features/commerce/{petStoreContent,HomeShoppingSheet,
  MonetizedOffersList,homeContextualCommerce}.ts` — medicação como um dos
  `BUYABLE_DOMAINS` (card de recompra na Loja do Pet, só aparece com
  GTIN escaneado).
- Testes: `lib/petCareDomain.test.ts` (extração de GTIN, roda com a flag
  forçada `true` via `vi.mock`), `lib/petCareDomain.medicationsFlag.test.ts`
  (comprova o comportamento desligado por padrão), `features/commerce/
  petStoreContent.test.ts` (bloco "medicação só vira compra com código
  de barras").

**Backend** (`services/price-service/src`)
- Não existe rota dedicada — medicação usa a tabela genérica `events`
  (coluna `type='medicacao'`/`'medication'`, dados de tratamento dentro
  de `extra_data` JSON: `treatment_days`, `total_doses`,
  `custom_interval_days`, `applied_dates`, `applied_slots`,
  `skipped_dates`).
- `events/router.py` — `POST /events/{id}/apply-dose`,
  `/skip-dose`, `/remove-dose`, `/unskip-dose` (rastreio de doses,
  inclusive múltiplas doses por dia via `applied_slots`) e os helpers
  `_medication_doses_per_day`/`_medication_treatment_complete`. Rotas
  genéricas, compartilhadas com outros tipos de evento — **continuam
  funcionando normalmente** (não foram tocadas por esta desativação;
  só o *disparo de push* foi desligado, não o CRUD/rastreio).
- `notifications/__init__.py` — `_TYPE_TO_MODAL`/`_TYPE_CONFIG` (deep-link
  e copy do push de medicação) e o gate em `send_due_reminders()` (ver
  abaixo).
- `config.py` — flag `medications_enabled: bool = False`.
- Teste dedicado: `tests/test_medications_disabled.py` +
  `tests/test_medication_multi_dose_per_day.py` (este último prova que o
  CRUD/cálculo de doses continua correto, independente da flag — ele
  chama os endpoints diretamente, não passa pelo scheduler de push).

**Banco de dados**: nenhuma tabela, coluna ou migration dedicada existe
para medicamentos — tudo vive na tabela genérica `events`. **Nenhum DROP,
nenhuma migration de remoção, nenhum dado apagado.** Eventos de medicação
já cadastrados por usuários continuam no banco, intactos e recuperáveis.

## Como foi desativada

Duas flags, uma por lado, sem infraestrutura nova:

1. **Frontend**: `apps/web/src/lib/featureFlags.ts` →
   `export const MEDICATIONS_ENABLED = false;`
   Consumida em 7 pontos (todos os pontos de entrada visíveis + o gerador
   central de lembretes):
   - `lib/petCareDomain.ts` — `processEvents()` pula qualquer evento
     `type === 'medicacao'` quando a flag está desligada. Este é o
     **choke point central**: como o card de Saúde combinado
     (`HomePetDashboard.tsx`), os chips de lembrete (`RemindersSection.tsx`),
     o badge de atenção multipet (`useHomeInteractionCenter.ts` via
     `canonicalEventEngine.ts`) e o card de recompra na Loja do Pet
     (`petStoreContent.ts`) todos consomem a lista que sai daqui, um
     único gate já corta a exposição indireta em cascata.
   - `app/home/page.tsx` — sheet de Medicação nunca renderiza
     (`MEDICATIONS_ENABLED && showMedicationSheet && ...`); scan de
     código de barras de categoria "medication" não abre mais o sheet;
     `PushActionSheet` do tipo `medication` não renderiza (defesa
     adicional contra um push já agendado antes da desativação); a
     "Medicação" some do resumo de estado do pet (`careSummary`) passado
     pro `EditPetModal`.
   - `components/home/HomeNavigationModals.tsx` — tile "Medicação" tirado
     da grade de Cuidados (mesmo padrão já usado pro filtro de espécie da
     Coleira).
   - `components/home/HealthModal.tsx` — aba "Medicação" tirada do
     `healthTabs`, mais uma guarda no próprio render do painel.
   - `features/interactions/homeModalRouting.ts` — os dois resolvers de
     deep-link (`resolveScannedProductDestination`,
     `resolveHomeDeepLinkDestination`) não resolvem mais pra
     `sheet: 'medication'`.

2. **Backend**: `config.py` → `medications_enabled: bool = False`
   (env var `MEDICATIONS_ENABLED`, mesmo padrão de `shopee_affiliate_enabled`
   etc.). Consumida em UM único ponto: `notifications/__init__.py`,
   dentro do loop de `send_due_reminders()` — um lembrete pendente com
   `type in ('medication', 'medicacao')` é pulado (`continue`) sem
   disparar push e **sem marcar `sent=True`** (a linha fica pendente pra
   sempre, nunca é apagada, nunca é falsamente consumida). O scheduler
   inteiro (`send_due_reminders`, cron a cada minuto) continua rodando
   normalmente pra vacina/ração/vermífugo/antipulgas/coleira/banho — só
   o tipo medicação é filtrado dentro dele.

Nenhuma rota foi removida, nenhum arquivo foi deletado, nenhuma migration
foi criada.

## Como reativar

1. Frontend: em `apps/web/src/lib/featureFlags.ts`, mudar
   `MEDICATIONS_ENABLED` pra `true` (ou trocar por
   `process.env.NEXT_PUBLIC_MEDICATIONS_ENABLED === '1'` se quiser
   controlar por ambiente sem novo deploy de código).
2. Backend: setar `MEDICATIONS_ENABLED=true` no `.env`/`api.env` do VPS
   (ou mudar o default em `config.py` pra `True`).
3. Redeploy normal (CI + deploy atômico, como qualquer outra mudança).
4. Não é preciso migration nem backfill — eventos de medicação já
   existentes (de antes ou durante a desativação) voltam a aparecer e a
   gerar lembrete automaticamente assim que a flag liga, sem nenhuma
   ação manual no banco.

## Testes a rodar antes de colocar em produção de novo

```bash
# Frontend
cd apps/web
npx tsc --noEmit
npx vitest run src/lib/petCareDomain.test.ts src/lib/petCareDomain.medicationsFlag.test.ts src/features/commerce/petStoreContent.test.ts
npx vitest run   # suíte inteira
npm run build

# Backend
cd services/price-service
.venv/bin/python -m pytest tests/test_medications_disabled.py tests/test_medication_multi_dose_per_day.py -v
.venv/bin/python -m pytest -q   # suíte inteira
```

Depois de religar a flag, testar manualmente num aparelho: cadastrar uma
medicação, conferir que o card aparece no Cuidados/Home, que o calendário
de doses funciona (inclusive múltiplas doses por dia), e que o push do
lembrete chega na hora certa.

## Escopo — o que NÃO foi tocado

Vacinas, alimentação, vermífugo/antipulgas/coleira, banho e tosa, Pet
Sumido, Loja do Pet (fora do card de medicação) e todo o resto do app
continuam exatamente como estavam. Nenhuma tela foi redesenhada, nenhuma
refatoração fora do escopo de "desligar medicação" foi feita.
