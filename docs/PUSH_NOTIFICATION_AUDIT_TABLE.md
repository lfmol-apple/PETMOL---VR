# 📊 PETMOL Push Notification Audit Table

## Notificação vs Função vs Scheduler vs Status

| # | Tipo de Lembrete | Função | Localização | Job/Cron | Intervalo | Status | Últimas Execuções | Elegíveis | Enviadas | Bloqueadores | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Medicação** | `send_medication_pushes()` | `notifications/__init__.py` L~430-550 | `add_job(..., "interval", minutes=1)` | 1 min | ✅ **ATIVO** | Sim (APScheduler) | ✓ Query real | ✓ Contado | Nenhum conhecido | **FUNCIONA** — teste validado |
| 2 | **Teste/Exame** | `send_medication_pushes()` (mesmo job) | `notifications/__init__.py` L~430-550 | `add_job(..., "interval", minutes=1)` | 1 min | ✅ **ATIVO** | Sim (APScheduler) | ✓ Query real | ✓ Contado | Nenhum conhecido | **FUNCIONA** — teste validado |
| 3 | **Vacina** | `send_care_pushes()` | `notifications/__init__.py` L~636-800+ | `add_job(..., "interval", minutes=1)` | 1 min | ✅ **ATIVO** | Sim (APScheduler) | ✓ Query real | ✓ Contado | ? Reminders_enabled check? Time window? | **NÃO FUNCIONA** — Bloqueador |
| 4 | **Antipulgas/Carrapato** | `send_care_pushes()` | `notifications/__init__.py` L~636-800+ | `add_job(..., "interval", minutes=1)` | 1 min | ✅ **ATIVO** | Sim (APScheduler) | ✓ Query real | ✓ Contado | ? Reminders_enabled check? Time window? | **NÃO FUNCIONA** — Bloqueador |
| 5 | **Vermífugo** | `send_care_pushes()` | `notifications/__init__.py` L~636-800+ | `add_job(..., "interval", minutes=1)` | 1 min | ✅ **ATIVO** | Sim (APScheduler) | ✓ Query real | ✓ Contado | ? Special logic (d-2/due)? | **NÃO FUNCIONA** — Bloqueador |
| 6 | **Coleira** | `send_care_pushes()` | `notifications/__init__.py` L~636-800+ | `add_job(..., "interval", minutes=1)` | 1 min | ✅ **ATIVO** | Sim (APScheduler) | ✓ Query real | ✓ Contado | ? collar_expiry_date check? | **NÃO FUNCIONA** — Bloqueador |
| 7 | **Higiene/Banho/Tosa** | `send_care_pushes()` | `notifications/__init__.py` L~636-800+ | `add_job(..., "interval", minutes=1)` | 1 min | ✅ **ATIVO** | Sim (APScheduler) | ✓ Query real | ✓ Contado | ? reminder_enabled check? | **NÃO FUNCIONA** — Bloqueador |
| 8 | **Ração (Food)** | `send_food_reminder_pushes()` | `notifications/__init__.py` L~560-620 | `add_job(..., "cron", hour=11, minute=0, tz=BRT)` | Cron 11:00 BRT | ✅ **ATIVO** | Sim (APScheduler Cron) | ✓ Query real | ✓ Contado | Time window (11:00 only)? | **NÃO FUNCIONA** — Bloqueador |
| 9 | **Revisão Mensal / Docs** | `send_monthly_docs_reminder()` | `notifications/__init__.py` L~933 | Não ativado | — | 🔴 **NEUTRALIZADO** | Não | Não | Não | `return` (sem-op) | Removido intencionalmente |
| 10 | **Urgente/Care Urgent** | `send_care_urgent_pushes()` | `notifications/__init__.py` L~928 | Não ativado | — | 🔴 **DESATIVADO** | Não | Não | Não | `return` (sem-op) | Removido intencionalmente |
| 11 | **Controle Geral (no_control)** | `send_no_control_pushes()` | `notifications/__init__.py` L~938 | Não ativado | — | 🔴 **REMOVIDO** | Não | Não | Não | `return` (sem-op) | Rotina automática removida |

---

## 🎯 Análise Preliminar

### ✅ FUNCIONANDO (Medicação + Teste)
- **Razão**: `send_medication_pushes()` é limpo e executa sem filtros quebrados
- **Scheduler**: Intervalo 1 min garante execução frequente
- **Logs**: Existem logs mas podem ser insuficientes para auditar

### ❌ NÃO FUNCIONANDO (Vacinas, Parasitas, Higiene, Ração)
- **send_care_pushes()**: Lógica complexa com múltiplos filtros
  - `reminder_enabled == True` check (ParasiteControlRecord, GroomingRecord)
  - `_care_time_reached(now, reminder_time, brt)` — **POSSÍVEL BLOQUEADOR**
  - Intervalo de datas: `today < start_date or today > due`
  - Dewormer: lógica especial `trigger_minus_two`
  - Coleira: uso de `collar_expiry_date` vs `next_due_date`

- **send_food_reminder_pushes()**: 
  - Fixado em cron **11:00 BRT** — só dispara nesse horário
  - Sem fallback para outras horas
  - Sem mecanismo de retry

### 🔴 DESATIVADOS (Legacy)
- `send_care_urgent_pushes()`, `send_monthly_docs_reminder()`, `send_no_control_pushes()` — apenas retornam

---

## 🔍 Próximas Ações (Audit Steps)

### Step 1 ✅ — Mapear jobs (COMPLETO)
Tabela acima consolidada.

### Step 2 — Adicionar Logging Detalhado [PRÓXIMO]
Para cada `send_*` função:
- `[PETMOL_PUSH_AUDIT]` timestamp + function name
- Por que cada lembrete foi **incluído** ou **pulado**
- Contadores: elegíveis, enviados, deduplicados
- Erros com stack trace

### Step 3 — Criar Endpoint de Debug
POST `/debug/push-audit` para testar cada tipo

### Step 4 — Comparar Caminhos
Analisar diffs entre `send_medication_pushes()` (funciona) vs `send_care_pushes()` (não funciona)

### Step 5+ — Corrigir Bloqueadores
Baseado em findings dos steps 2-4

---

## 📋 Questões Abertas

1. **`reminder_enabled`** field:
   - ParasiteControlRecord tem este field?
   - GroomingRecord tem este field?
   - Está setado como `True` nos registros de produção?

2. **`_care_time_reached()`**:
   - Qual a lógica exata?
   - Está retornando `False` para horários fora da janela?

3. **Timezone**:
   - BRT definido como UTC-3 hardcoded?
   - Funciona corretamente com horário de verão?

4. **Dewormer Special Case**:
   - Por que `trigger_minus_two` (d-2)?
   - Está funcionando?

5. **Coleira**:
   - Qual field é usado? `collar_expiry_date` ou `next_due_date`?
   - Ambos existem e populados?

6. **Food Reminder Cron**:
   - Por que fixado em 11:00?
   - Se usuário não abrir app nesse horário, fica perdido?

---

## 📝 Rastreamento

| Status | Tarefa |
|---|---|
| ✅ | Mapear todas as funções + jobs |
| ⏳ | Adicionar logging audit |
| ⏳ | Criar endpoint debug |
| ⏳ | Comparar working vs broken |
| ⏳ | Corrigir blockers |
| ⏳ | Testar em dev |
| ⏳ | Deploy prod |
