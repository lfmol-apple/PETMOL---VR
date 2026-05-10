# Auditoria — Alertas Parametrizados PETMOL

Data: 2026-04-23

---

## 1. Resumo Executivo

O sistema de alertas do PETMOL tem dois mecanismos principais:

- **`send_care_pushes`** — job minuto a minuto para vacinas, vermífugo, antipulgas, coleira, grooming
- **`send_medication_pushes`** — job minuto a minuto para medicações com horário real
- **`send_food_reminder_pushes`** — job diário fixo às 11h BRT para ração

O problema reportado (vermífugo alertando dia D-2 **e** dia D-1) era comportamento real: o sistema usava uma tag com `{data_hoje}` como dedup, fazendo a pendência expirar à meia-noite e disparando novo push no dia seguinte — cada dia dentro da janela gerava um push independente.

**Correção aplicada:** tag agora é baseada em ciclo (`start-{data_início}` / `due-{data_vencimento}`), garantindo máximo 2 pushes por ciclo independente de quantos dias o controle fique em aberto.

---

## 2. Tabela Completa de Alertas

| Alerta | Função | Arquivo | Job | Parametrização do usuário | Data-base | Janela de aviso | Dedup | Comportamento ANTES | Comportamento APÓS |
|--------|--------|---------|-----|--------------------------|-----------|-----------------|-------|--------------------|--------------------|
| **Vermífugo** | `send_care_pushes` | `notifications/__init__.py` | A cada minuto | `alert_days_before`, `reminder_time`, `reminder_enabled` | `next_due_date` (ParasiteControlRecord) | `due - alert_days` até `due` | tag por ciclo (`start-` / `due-`) | 1 push/dia todo dia na janela | Máx 2 pushes por ciclo |
| **Antipulgas** | `send_care_pushes` | `notifications/__init__.py` | A cada minuto | `alert_days_before`, `reminder_time`, `reminder_enabled` | `next_due_date` | `due - alert_days` até `due` | tag por ciclo | 1 push/dia todo dia na janela | Máx 2 pushes por ciclo |
| **Coleira** | `send_care_pushes` | `notifications/__init__.py` | A cada minuto | `alert_days_before`, `reminder_time`, `reminder_enabled` | `collar_expiry_date` ou `next_due_date` | `due - alert_days` até `due` | tag por ciclo | 1 push/dia todo dia na janela | Máx 2 pushes por ciclo |
| **Antiparasitário cardíaco** | `send_care_pushes` | `notifications/__init__.py` | A cada minuto | `alert_days_before`, `reminder_time`, `reminder_enabled` | `next_due_date` | `due - alert_days` até `due` | tag por ciclo | 1 push/dia todo dia na janela | Máx 2 pushes por ciclo |
| **Vacina** | `send_care_pushes` | `notifications/__init__.py` | A cada minuto | `alert_days_before`, `reminder_time` | `next_dose_date` (VaccineRecord, latest por grupo) | `due - alert_days` até `due` | tag por ciclo | 1 push/dia todo dia na janela | Máx 2 pushes por ciclo |
| **Banho / Tosa** | `send_care_pushes` | `notifications/__init__.py` | A cada minuto | `alert_days_before`, `reminder_days_before`, `scheduled_time`, `reminder_enabled` | `next_recommended_date` | `due - alert_days` até `due` | tag por ciclo | 1 push/dia todo dia na janela | Máx 2 pushes por ciclo |
| **Medicação** | `send_medication_pushes` | `notifications/__init__.py` | A cada minuto | `reminder_time`, `frequency` (1x/2x/3x dia), `reminder_offset_minutes`, `treatment_days` | `next_due_date` / `scheduled_at` do Event | Horário exato (ou offset) | tag `{event_id}-{data}-{slot}` — diária por slot | 1 push por slot por dia (correto) | Sem mudança — correto |
| **Ração / Alimentação** | `send_food_reminder_pushes` | `notifications/__init__.py` | Diário às 11h BRT (exato) | `next_reminder_date`, `enabled`, `no_consumption_control` | `next_reminder_date` do FeedingPlan | `next_reminder_date <= hoje` | `last_food_push_date` persistido em DB | 1 push/dia (correto) | Sem mudança — correto |
| **Revisão mensal / Documentos** | `send_monthly_docs_reminder` | `notifications/__init__.py` | — | — | — | — | — | **Neutralizado** — retorna imediatamente | Sem mudança |
| **Checkin** | `send_checkin_pushes` | `notifications/__init__.py` | — | — | — | — | — | **Deprecated** — retorna imediatamente | Sem mudança |
| **Urgente** | `send_care_urgent_pushes` | `notifications/__init__.py` | — | — | — | — | — | **Desativado** — retorna imediatamente | Sem mudança |

---

## 3. Caso Concreto do Vermífugo — Por que repetiu

### Configuração do usuário
- `alert_days_before = 2`
- `reminder_time = 09:00` (ou padrão)
- `next_due_date = 2026-04-25` (hipotético)

### Fluxo **antes da correção**

```
start_date = 2026-04-25 - 2 dias = 2026-04-23

Dia 2026-04-22:  today < start_date → date_ok=False → nada
Dia 2026-04-23:  today == start_date → date_ok=True, time_ok=True
                 tag = "petmol-care-dewormer-{id}-2026-04-23-0900"
                 _pendency_exists? NÃO → cria pendência (expires_at = 23:59 de hoje)
                 → PUSH ENVIADO ✅

Dia 2026-04-24:  today > start_date → date_ok=True, time_ok=True
                 tag = "petmol-care-dewormer-{id}-2026-04-24-0900"  ← TAG DIFERENTE
                 _pendency_exists? NÃO (a de ontem expirou à meia-noite)
                 → PUSH ENVIADO novamente ❌ (usuário não entendeu o por quê)

Dia 2026-04-25:  (due date) mesmo padrão → PUSH ENVIADO pela 3ª vez ❌
```

**Raiz do problema:** tag continha `{today_str}` → nova tag a cada dia → dedup nunca bloqueava porque a tag de ontem sempre expirava.

### Fluxo **após a correção**

```
start_date = 2026-04-23, due = 2026-04-25

Dia 2026-04-23:  today >= start_date, today < due
                 cycle_key = "start-2026-04-23"
                 tag = "petmol-care-dewormer-{id}-start-2026-04-23"
                 _pendency_exists? NÃO → cria pendência (expires_at = 2026-04-25 + 30 dias)
                 → PUSH ENVIADO ✅

Dia 2026-04-24:  today > start_date, today < due
                 cycle_key = "start-2026-04-23"  ← MESMA TAG
                 _pendency_exists? SIM (pendência ainda existe)
                 → BLOQUEADO ✅

Dia 2026-04-25:  today == due
                 cycle_key = "due-2026-04-25"  ← tag diferente (só no dia exato)
                 _pendency_exists? NÃO → cria pendência
                 → PUSH ENVIADO (alerta de "vence hoje") ✅

Dia 2026-04-26+: today > due → condição `today > due` → skip
                 → NENHUM PUSH ✅
```

---

## 4. O que foi corrigido

### `notifications/__init__.py`

**`_build_care_payload`:**
- Adicionado parâmetro `cycle_key: str`
- Tag alterada de `{today_str}-{reminder_time}` para `{cycle_key}`
- Adicionado `"_due_date": due_date` no retorno (para o `expires_at` da pendência)

**Loops de vacinas, parasitas, grooming:**
- Removida variável `date_ok` (substituída pela lógica abaixo)
- Nova condição de disparo:
  ```python
  if not time_ok or today < start_date or today > due:
      continue
  cycle_key = f"start-{start_date.isoformat()}" if today < due else f"due-{due.isoformat()}"
  ```
- Adicionado `cycle_key=cycle_key` na chamada de `_build_care_payload`

**Loop `scheduled_items`:**
- `expires_at` alterado de `end-of-today` para `due_date + 30 dias`
  ```python
  # Antes
  expires_at=datetime.combine(today, time(23, 59, 59)).replace(tzinfo=brt)
  # Depois
  expires_at=datetime.combine(payload.get("_due_date", today), time(23, 59, 59)).replace(tzinfo=brt) + timedelta(days=30)
  ```

### `PetTabs.tsx`

**Jitter no swipe entre pets:**
- `isMobileViewport` agora inicializa sincronamente via lazy initializer:
  ```javascript
  useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  })
  ```
  Antes: iniciava `false` → trocava para `true` no mount → causava flip de modo de animação no primeiro render
- `setDirection(-1/1)` removido de `handlePanEnd`: o `useEffect` já computava a mesma direção ao detectar mudança de `currentIndex`, causando setState duplo e render extra por swipe

---

## 5. Comportamento esperado após a correção

| Cenário | Push esperado |
|---------|--------------|
| Entra na janela (ex: D-2) | 1 push "Faltam 2 dias. Toque para ver." |
| Dia D-1 (entre entrada e vencimento) | Nenhum push |
| Dia D (vencimento) | 1 push "Vence hoje. Toque para registrar." |
| Dia D+1 em diante (atrasado) | Nenhum push (pendência in-app permanece visível por 30 dias) |
| Usuário registra o tratamento | Registro cria novo ciclo → novas tags → novos alertas no próximo ciclo |

**Medicação e ração não foram alteradas** — comportamento desses dois já era correto.

---

## 6. Mapa de Comportamento por Tipo

| Alerta | Comportamento atual (pós-fix) | Risco de repetição | Campo de controle |
|--------|------------------------------|--------------------|------------------|
| Vermífugo | AVISA 1x na entrada + 1x no vencimento | Baixo | `petmol-care-dewormer-{id}-{cycle_key}` |
| Antipulgas | AVISA 1x na entrada + 1x no vencimento | Baixo | `petmol-care-flea_tick-{id}-{cycle_key}` |
| Coleira | AVISA 1x na entrada + 1x no vencimento | Baixo | `petmol-care-collar-{id}-{cycle_key}` |
| Vacina | AVISA 1x na entrada + 1x no vencimento | Baixo | `petmol-care-vaccine-{id}-{cycle_key}` |
| Banho/Tosa | AVISA 1x na entrada + 1x no vencimento | Baixo | `petmol-care-grooming-{type}-{id}-{cycle_key}` |
| Medicação | AVISA EM HORÁRIO FIXO por slot, 1x/dia por slot | Normal — design intencional | tag `{event_id}-{data}-{slot}` |
| Ração | AVISA UMA VEZ por `next_reminder_date` | Baixo — dedup por `last_food_push_date` em DB | `FeedingPlan.last_food_push_date` |

---

## 7. Como testar cada alerta

### Vermífugo (após fix)

1. Acesse um controle de vermífugo com `next_due_date = hoje + 2 dias`
2. Configure `alert_days_before = 2`
3. Aguarde o horário configurado (`reminder_time`) ou ajuste-o para daqui a 1 min
4. Verifique que chegou 1 push (não 2)
5. Espere passar a meia-noite e confirme que **não** chegou novo push no dia seguinte
6. No dia do vencimento, confirme que chegou 1 push "Vence hoje"

### Medicação (sem mudança)

1. Configure um evento de medicação com `reminder_time = HH:MM` e `frequency = 1x_dia`
2. Aguarde o horário exato
3. Confirme 1 push por slot configurado
4. Aplique a dose → slot deve ir para `applied_slots` → não repete no mesmo dia

### Ração (sem mudança)

1. Configure plano de alimentação com `next_reminder_date <= hoje`
2. Às 11:00 BRT o push deve chegar uma vez
3. Confirme que `last_food_push_date` foi gravado → não repete até nova data de lembrete

### Swipe entre pets (após fix)

1. Abra o app com 2+ pets no mobile (Chrome DevTools modo mobile ou dispositivo real)
2. Faça o gesto de swipe horizontal várias vezes consecutivas
3. Observe que a transição é suave (fade) sem flash/jitter
4. Confirme que o visual geral não mudou (mesmos cards, mesmos dados)

---

## 8. Nota sobre pendências existentes (deploy)

No dia do deploy, pendências antigas com tag no formato `{today_str}-{time}` existem no banco até meia-noite. Como as novas tags têm formato diferente (`start-` / `due-`), o `_pendency_exists` não as encontrará → pode haver um push duplicado na hora do deploy se o job rodar novamente no mesmo dia.

Isso é um efeito de uma única vez e não se repete nos dias seguintes. Não requer migração de dados.
