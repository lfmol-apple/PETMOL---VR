# PUSH_ENGINE_V2_RESET

## 1. Infra mantida

- Subscriptions push dos usuários.
- Chaves VAPID.
- Service worker web push.
- Endpoint de teste manual de push.

## 2. Regras antigas neutralizadas

- Scheduler antigo de medicação: `send_medication_pushes`.
- Scheduler antigo de cuidados: `send_care_pushes`.
- Scheduler antigo de ração: `send_food_reminder_pushes`.

Com `FEATURE_PUSH_ENGINE_V2=false`, o startup não registra nenhum job automático no APScheduler.

Com `FEATURE_PUSH_ENGINE_V2=true`, apenas as primeiras regras autorizadas entram no APScheduler:

- Medicação: job legado `send_medication_pushes`, mantido sem redesenho.
- Cuidados: job V2 `send_care_pushes_v2`, somente para vacina, vermífugo, antipulgas e coleira com lembrete explícito.
- Ração: job V2 `send_food_reminder_pushes_v2`, somente para lembrete explícito/manual.

Os jobs legados de cuidados e ração não são registrados automaticamente.

## 3. Regras autorizadas agora

### Medicação

- Usa a lógica própria que já funcionava anteriormente.
- Não foi redesenhada neste ciclo.

### Cuidados

Tipos permitidos:

- Vacina.
- Vermífugo.
- Antipulgas.
- Coleira.

Condições obrigatórias:

- Lembrete ativado.
- `reminder_date` definida pelo usuário.
- Hora de lembrete definida.

Para vacinas, o campo `reminder_enabled` foi adicionado como opt-in explícito. Registros existentes sem esse campo ficam com `false`.

Não há:

- Regra automática por vencimento.
- Regra D-2.
- Janela de envio.
- Regra quinzenal.
- Reenvio de vencidos.
- Fallback automático de horário.

### Ração

Condições obrigatórias:

- `enabled=true`.
- `next_reminder_date` definida manualmente.
- `reminder_time` definido pelo usuário.
- `reminder_source=manual`.

Não há:

- Regra D-1/D/D+1.
- Uso direto de `estimated_end_date` como decisão automática.
- Fallback 19:00.
- Envio sem data e hora.
- Reenvio de vencidos.

### Deduplicação

- Um push por lembrete configurado.
- A chave de dedup inclui tipo, registro, data e hora.
- Se o usuário editar data/hora, a chave muda e abre novo ciclo.

## 4. Reconstrução futura

Novos disparos além dos acima só entram quando o dono do produto definir explicitamente:

- Qual evento dispara.
- Em que momento.
- Com que texto.
- Com qual ação.
- Com qual repetição.
- Com qual deduplicação.

Ordem futura sugerida, ainda sem implementação adicional:

- Slice 1 — push teste manual no celular.
- Slice 2 — medicação simples, somente após definição explícita de evento, horário, texto, ação, repetição e dedup.
- Slice 3 — ração, somente após definição explícita de evento, janela, texto, ação, repetição e dedup.
- Slice 4 — vacinas, somente se tutor ativar lembrete e após definição explícita da regra.
- Slice 5 — vermífugo/antipulgas/coleira, somente se tutor ativar lembrete e após definição explícita da regra.
- Slice 6 — central de preferências de notificação.

## 5. Regras absolutas futuras

- Nada dispara sem vontade clara do tutor.
- Cada controle tem `enabled` e `reminder_time` próprios.
- Dedup por controle/ciclo.
- Quiet hours só depois de validado.
- Weekly cap só depois de validado.
- Nada de banho/tosa como controle.
- Logs antes de complexidade.
- Nenhum fallback de horário, vencimento, D-1/D/D+1, ciclo quinzenal ou regra automática entra sem decisão explícita.
