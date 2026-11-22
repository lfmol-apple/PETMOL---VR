# Push Gratuito — envio seguro (sem duplicar, com horário de silêncio)

Escrito em 21/11/2026 após a auditoria que provou: um reinício no meio do envio avulso perdia o registro de quem já havia recebido
(simulado: 17 aceitos, 10 gravados), a retomada reenviava a eles e a barra ficava presa em "enviando". Código: `services/price-service/src/admin/broadcast_safe.py`.

## Decisão de arquitetura: correção localizada × motor de campanhas

| | Motor de campanhas em lotes (`push_campaign_batches`) | **Correção localizada no envio avulso (escolhida)** |
|---|---|---|
| Garante não duplicar | Sim (já tem intenção-antes-do-provedor, incerto, recuperação) | Sim (mesma máquina de estados, reaproveitando os nomes e a semântica) |
| Público "faltam passos" do Gratuito | **Não existe**: o motor usa `AudienceFilter` próprio; seria reescrever a segmentação | Usa `eligible_users` como hoje |
| Teto por lote | Sim (`PUSH_CAMPAIGNS_MAX_BATCH`, hoje 1 em produção; "todos" acima do teto é recusado) | Sem teto novo (decisão do dono: sem limite) |
| Destino "atalho", texto fixo, "TESTE." | Não existem no motor | Já existem |
| Tela da aba Gratuito | Teria de ser refeita (prévia+token+lotes) | Mantida (só ganha progresso, silêncio e reenvio) |
| Raio da mudança | Aba Gratuito inteira + flag própria | Só o envio avulso, hoje usado **apenas** pela aba Gratuito |
| Manutenção | Um motor só | Dois caminhos, mas o novo é pequeno (~400 linhas), aditivo e coberto por 39 testes |

Escolha: **localizada**, com a mesma máquina de estados do motor. Migrar o Gratuito para o motor continua possível no futuro; não é necessário para fechar o risco agora.

## Máquina de estados (por destinatário, persistida)

```
reserved ──claim atômico + COMMIT──▶ sending ──▶ accepted | failed | uncertain
reserved ──janela de silêncio fechada──▶ pending_quiet ──janela abre + confirmação──▶ reserved
reserved | pending_quiet ──descartar (confirmação)──▶ released
```

- **Criação**: o envio e TODAS as linhas `reserved` nascem na mesma transação, sob trava (processo + `pg_advisory_xact_lock`). Um envio aberto por vez (o teste "só eu" só é barrado por envio *em andamento*). Índice único **parcial** `(broadcast_id, user_id) WHERE state IS NOT NULL`.
- **Execução**: por pessoa, `UPDATE … SET state='sending' WHERE state='reserved'` (claim atômico, `rowcount==1`) + COMMIT **antes** de chamar o provedor. Duas execuções simultâneas nunca pegam a mesma pessoa. Chamada ao provedor com timeout (25 s).
  - `accepted`: algum aparelho aceitou. **Não significa entregue.** `failed`: nenhum aparelho aceitou (definitivo). `uncertain`: exceção, timeout ou queda — **nunca** vira entregue e **nunca** é reenviado automaticamente.
- **Recuperação** (`recover_stale`): na partida da API, ao abrir a barra e antes de aceitar novo envio. Envio sem sinal de vida há 5 min: `sending → uncertain`, fase `interrupted`. **Nunca chama o provedor.**
- **Continuar / Descartar** (explícitos, com a contagem digitada): continuar envia **só** quem nunca foi tentado (e cuja janela de silêncio já abriu); descartar marca `released` (nada é apagado).
- **Reenvio manual**: é um envio **novo** (`is_resend`), pedido com `include_already` na prévia e `resend_confirmed` no envio (a tela exige uma caixa de confirmação própria além da contagem digitada). Nunca reaproveita linhas de outro envio. Sem `resend_confirmed` o servidor responde 409. Por padrão, aceitos, incertos e quem está na fila de um envio anterior ficam de fora (`already_breakdown` mostra os números).
- **Sem limite semanal**: nada de 7 dias foi criado; contatos de e-mail não afetam o push (e vice-versa).

## Horário de silêncio (22h–8h)

- Vale para o push da meta `atalho` (envio real). O **teste "só eu" não segue** a janela. O **e-mail não foi alterado** (precisa de análise própria).
- **Fuso conhecido**: o último fuso IANA informado pelo aparelho nos eventos do app (`analytics_product_events.timezone`). Pode enviar se 8h ≤ hora local < 22h. (Limitação: o fuso vem do último evento; quem viaja pode estar defasado.)
- **Fuso desconhecido** (conservador, sem presumir Brasília): só entre **13:00 e 24:00 UTC = 10h–21h em Brasília**, janela em que é dia em **todos** os fusos do Brasil (UTC−5 a UTC−2).
- Quem cai no silêncio fica `pending_quiet` com `not_before` = próxima abertura. **Ninguém é descartado.** A prévia e a barra mostram quantos ficam pendentes e quando a primeira janela abre. Os pendentes saem quando o administrador clica em **Continuar** depois da abertura (decisão deliberada: não há disparo automático sem ninguém olhando; pode virar agendamento depois, com autorização).

## Barra de progresso (números do banco)

Processadas = aceitas + falhas + incertas. Total = processadas + fila + em envio + pendentes por silêncio + descartadas (verificado por teste). Rótulos: "aceitas pelo provedor", "falhas (nenhum aparelho aceitou)", "resultados incertos", "na fila", "pendentes pelo horário de silêncio". Nenhum texto chama "aceita" de "entregue". Envios anteriores a esta correção aparecem só com "aceita ou não" (`legacy`).

## Comportamento em caso de falha

| Situação | Resultado |
|---|---|
| Reinício/queda no meio | Intenção já gravada: quem estava em envio vira **incerto** (não reenvia); quem nunca foi tentado fica na fila; fase "interrompido" em ≤5 min; nada é reenviado sozinho |
| Provedor devolve "nenhum aparelho" | `failed` (não reenvia sozinho) |
| Provedor lança erro / demora >25 s | `uncertain` |
| Falha ao gravar o resultado | Linha fica `sending` → recuperação a torna `uncertain` |
| Duas execuções / dois cliques | Claim atômico por linha + trava de criação: ninguém recebe duas vezes; 2ª criação recebe 409 |
| Continuar com contagem errada | 409 `count_changed` |

## Migração e rollback

- Migração **aditiva** (colunas anuláveis + índice parcial que não pode falhar por duplicata histórica); idempotente; validada em Postgres sobre o esquema antigo com duplicata histórica. Linhas antigas (`state NULL`) continuam valendo por `delivered`.
- **Rollback**: reverter o merge (a main anterior) basta. As colunas novas ficam no banco sem uso (são anuláveis e o código antigo as ignora); não há migração destrutiva. Tag `rollback/pre-gratuito-seguro-<sha>` criada antes do deploy.
- Em caso de dúvida sobre um envio em curso: **não** reiniciar a API durante um envio real; se reiniciar, aguardar 5 min e usar Continuar/Descartar (nada é reenviado sozinho).

## Testes (provedor simulado, banco de teste; nenhum push real)

`tests/test_broadcast_safe.py` (35): demonstração de reinício; queda antes/depois do provedor; recuperação e partida sem chamar o provedor; barra não presa; continuar/descartar com contagem; execuções simultâneas; criações simultâneas; reenvio manual autorizado e recusado; retry indevido; incerto/em curso fora do novo envio; janela por fuso (Brasília, Manaus, Rio Branco, Nova York) e fuso desconhecido; pendentes por silêncio; teste "só eu"; metas não protegidas; falha/exceção/timeout; consistência da barra; envio antigo; push × e-mail separados e sem limite semanal.
`tests/test_broadcast_safe_pg.py` (4, **Postgres real**, `PETMOL_TEST_PG_URL`): migração sobre esquema antigo, 4 execuções paralelas, queda+recuperação+retomada, advisory lock.
