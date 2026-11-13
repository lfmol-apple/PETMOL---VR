# Campanhas push — Etapa 6.1 (parada segura de lote e teto por lote)

Flag continua OFF; sem envio real; arquitetura em thread mantida (nenhum serviço novo). Migration adicional: 3 colunas nulas em `admin_broadcasts` (aditiva, idempotente, validada em cópia do backup de produção de 12/11).

## R1 — Parar envio

**Persistência:** `admin_broadcasts.stop_requested_at`, `stop_requested_by`, `stop_ack_at`. Parada **pendente** = pedido gravado e (reconhecimento vazio ou anterior ao pedido).

**Estados** (campo `stop` do lote):
| Estado | Significa | Tela |
|---|---|---|
| `none` | sem parada | botão "Parar envio" (só em lote reservado/em envio) |
| `requested` | pedido gravado; o envio em andamento neste instante ainda termina | "Parada solicitada" + etapas 1 Solicitada ✔ · 2 Reconhecida (aguardando) · 3 Decidir |
| `acknowledged` | o executor (ou a recuperação na partida) reconheceu: lote `interrupted`, nada novo é reivindicado | "Envio parado a seu pedido" + continuar só os nunca tentados / devolver (regras de recuperação existentes) |
| `finished_before_stop` | o lote acabou antes de a parada valer | aviso informativo |

**Como funciona**
- `POST /batches/{id}/stop` com `{"confirm": true}` (sem confirmação → 422). Idempotente: vários cliques/administradores ao mesmo tempo geram **um** pedido e todos recebem 200 (`already_requested`). Lote que não está em andamento → 409 `batch_not_running`; parada já reconhecida → 200 `already_stopped`.
- O executor passou a reivindicar **1 destinatário por vez** e consulta o banco (leitura fresca) **antes de reivindicar e antes de cada chamada ao provedor**. Parada pendente: devolve a `reserved` quem foi reivindicado e comprovadamente não tentado (o provedor só é chamado depois da conferência), reconhece a parada e termina.
- Uma chamada ao provedor **já em andamento não é cancelada**: o resultado real (aceito/falha/incerto) é registrado antes de a parada valer. Aceitos continuam registrados; incertos nunca são reenviados; nunca tentados seguem as regras de continuar/devolver.
- **Reinício da API:** pedido de parada sobrevive no banco. Na partida (flag ligada) a recuperação reclassifica (`sending→uncertain`, lote `interrupted`) e **reconhece** a parada pendente, para que uma retomada posterior não pare de novo. Com a flag desligada nada é alterado (e nada envia).
- A parada reconhecida deixa o lote `interrupted`, que **não bloqueia mais o envio avulso**.

## R2 — Teto de destinatários por lote

- Variável de ambiente **`PUSH_CAMPAIGNS_MAX_BATCH`** (+ reinício). **Padrão: 50.** Valor ausente, inválido ou < 1 cai no padrão. Primeiro teste real: **1**.
- Conferido na **prévia** (pedido e "todos os disponíveis"), na **reserva** (de novo, já com o público real; chamada direta à API não contorna) e na **continuação** (restantes nunca tentados acima do teto → 422; "devolver" continua possível). Repetição idempotente de um lote já criado não é afetada.
- Nunca divide o pedido em vários lotes e nunca o reduz em silêncio: acima do teto = 422 `batch_limit_exceeded` com explicação.
- Interface: mostra o limite ("definido no servidor, vale também para todos os disponíveis"), bloqueia a prévia com aviso em vermelho para pedido ou "todos" acima do limite e exibe a mensagem do servidor se ele recusar.

## Testes
- Backend (SQLite + PostgreSQL), `tests/test_push_campaign_stop_limit.py`: parada antes do 1º envio, durante o processamento, com chamada em andamento (resultado registrado, e variante com timeout → incerto nunca reenviado), parada simultânea de 2 e 6 administradores, reinício da API com parada pendente, flag desligada na partida, recuperação dos nunca tentados (continuar/devolver), ausência de reenvio de incertos, `finished_before_stop`, idempotência, avulso (não pode ser parado por aqui; parada libera o avulso), concorrência parada × reserva × continuação (15 rodadas), tetos 1/5/50, pedido e "todos" acima do teto, teto reconferido na reserva, repetição idempotente, continuação com teto, valores inválidos, endpoints HTTP.
- Mutação (10 mutantes no código novo): 9 mortos; 1 equivalente (conferir a parada antes de reivindicar é redundante com a conferência antes de cada envio — a segunda devolve o reivindicado; a primeira só evita o vai-e-volta).
- Frontend: +12 testes (parar envio, confirmação, clique duplicado, estados, limite).
- Homologação isolada (backend real + PostgreSQL + provedor falso): 44/44 de parada e teto, 49/49 de integração e as contagens da tela conferidas.

## Correção pós-CI: lote `interrupted` aguardando decisão bloqueia (API = interface)

Achado no CI do PR consolidado (teste de disputa instável): a interface e as mensagens tratavam o lote interrompido como bloqueante, mas o backend só bloqueava `reserved`/`sending`.

- `BATCH_ACTIVE_PHASES` (`reserved`, `sending`) **não mudou**: continua sendo a *execução ativa* (parada, recuperação, partida).
- Novo critério separado, `_blocking_batch`: lote em execução ativa **ou** `interrupted` que ainda tem destinatários **nunca tentados** (`reserved`) aguardando decisão. `interrupted` sem pendentes (só aceitos/falhos/incertos) não tem o que decidir e não bloqueia (evita impasse eterno).
- Bloqueia: **reserva** (`batch_awaiting_decision` 409 / `batch_in_progress` 409), **prévia** (`can_reserve=false`, **sem token**, `blocking_batch.phase`) e **encerramento da campanha**.
- Não bloqueia: **continuar** e **devolver** o próprio lote. Resolvido (`done`) → nova reserva e encerramento liberados.
- Interface: mensagem da prévia distingue "em andamento" de "interrompido, aguarda sua decisão"; erro novo mapeado.
- Testes: `tests/test_push_campaign_interrupted_blocks.py` (SQLite + PostgreSQL): prévia, reserva direta com token antigo, encerramento, continuar, devolver, nova reserva depois de resolver, sem duplicidade, interrompido sem pendentes, 6 ordens controladas de parada/continuação/nova reserva e 25 rodadas de disputa real (PostgreSQL) com atrasos reprodutíveis — o resultado esperado **não depende de quem vence**. O teste instável foi substituído por esta versão determinística. Mutação: 6 de 6 mutantes mortos (inclusive "interrupted em BATCH_ACTIVE_PHASES").
