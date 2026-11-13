# Campanhas push — Etapa 4 (interface administrativa)

Só frontend do painel admin (aba Push). Nenhuma mudança de backend, de envio avulso, de notificações do sistema, Loja, i18n ou e-mail.
Flag `push_campaigns_enabled` continua OFF: com ela desligada, o modo "Campanhas" apenas avisa que ainda não foi liberado.

## O que foi construído

Aba Push → dois modos: **Envio avulso** (painel de sempre, intacto; fica montado e só escondido ao trocar de modo) e **Campanhas**.

Fluxo do modo Campanhas (`apps/web/src/components/admin/campaigns/`):

1. Criar ou continuar campanha (lista com estado e contagem por situação; encerradas identificadas).
2. Conteúdo: nome, título, mensagem, destino, produto + link monetizado (guardado exatamente como colado; "Conferir" usa o `/link-preview` já existente, que não envia nada). Depois do 1º lote o conteúdo vira só leitura; há "Criar cópia editável".
3. Filtros combináveis: blocos E/OU, escopo de pets por bloco (algum / mesmo pet / todos), catálogo em 6 grupos expansíveis (Tutor, Pet, Localização, Alimentação, Cuidados, Atividade) com **exatamente os 21 filtros** publicados em `GET /fields`. Localização mostra origem e precisão; GPS e IP exigem confirmação "aproximada, não é residência".
4. Contagem dinâmica (`POST /audience/count`, com espera de 450 ms e descarte de respostas antigas): atendem aos filtros, alcançáveis, já usados, disponíveis, próximo lote, avisos de cobertura.
5. Tamanho do lote: quantidade ou "todos os disponíveis".
6. Prévia (`/batches/preview`): conteúdo, resumo dos filtros, disponíveis/pedido/reservado, aviso destacado se o lote será menor que o pedido, validade de 10 min.
7. Confirmação: digitar o número exato; `POST /batches` com `preview_token`, `confirm_count` e **chave de idempotência por prévia**.
8. Histórico: por lote, os 5 estados (Reservados, Em envio, Aceitos pelo provedor, Com falha, Resultado incerto); acompanhamento automático a cada 4 s enquanto houver lote ativo.

"Entregue" nunca aparece para aceitação do provedor (teste automatizado varre o texto da tela).

## Erros tratados (todos sem reservar nada e sem apagar o que o admin digitou)

| Situação | Tratamento |
|---|---|
| Público insuficiente | Aviso na contagem; na prévia, banner "pediu X, só há Y"; confirmar exige digitar Y |
| Prévia expirada | Contagem regressiva; confirmar bloqueado; erro `token_expired` pede nova prévia |
| Público/filtro/conteúdo mudou | `preview_stale` / `audience_changed` / `reservation_conflict`: mensagem + prévia descartada |
| Clique duplicado | Trava local (um pedido por vez) + mesma chave de idempotência; servidor responde `idempotent_replay` e a tela diz "já processada" |
| Falha de rede ao confirmar | "Tentar de novo" reenvia com a **mesma chave e o mesmo token** (não duplica) |
| Lote em andamento | Bloqueia nova prévia; acompanha sozinho |
| Lote parado (>5 min sem atividade) | "Verificar lote parado" → `/recover`: só reclassifica, não envia |
| Lote interrompido | Continuar SÓ os nunca tentados ou devolvê-los ao público, ambos com número digitado; falhos e incertos nunca são reenviados nem substituídos (não existe botão para isso) |
| Campanha encerrada | Sem filtros/lote; histórico segue visível |
| Flag desligada | Aviso; nenhum outro endpoint é chamado |

## Testes

- `filters.test.ts` (10), `SegmentedCampaigns.test.tsx` (32), `PushTab.test.tsx` (3): servidor falso em memória (`testBackend.ts`), nenhum push real.
- Acessibilidade básica: todo campo/botão com nome acessível, `role=alert` nos erros, região viva na contagem, abas com `role=tab`, ordem dos passos.
- Responsividade: capturas reais em Chrome com 390 px e 1180 px — sem estouro horizontal (`docs/push-campanhas-etapa4/`). A página de prévia usada para isso foi só local e não está no commit.
- Backend: +2 testes novos na suíte da Etapa 3 (conteúdo alterado entre prévia e reserva; reivindicação só de `reserved`).

## Mutação — reconfirmação da Etapa 3 (backend, PostgreSQL + SQLite)

Cada mutante altera uma linha de `push_campaign_batches.py`; "morto" = algum teste falha.

| Mutante | Resultado |
|---|---|
| Não consulta a chave de idempotência antes do token | morto |
| Não confere assinatura/escopo da prévia | morto |
| Ignora mudança do público (digest) | morto |
| Não exige confirmação digitada | morto |
| Permite 2º lote simultâneo | morto |
| Reserva ignora quem já foi usado | morto |
| Encolhe em silêncio se o banco recusa alguém | morto |
| Reserva aceita campanha encerrada | morto |
| Conteúdo mudado depois da prévia passa | **sobreviveu → teste novo → morto** |
| Conteúdo não congela após o 1º lote | morto |
| Execução reivindica incertos (select + update) | **só "morto" por travamento → teste direto novo → morto em 1 s** |
| Chave reutilizada em outra operação é aceita | morto |
| Inserção sem ordenação (deadlock no PostgreSQL) | morto |
| Ignora `w` (quantidade) do token | **sobrevive — mutante equivalente** |

O último não é lacuna de teste: `will` é função pura de (`r` quantidade pedida, `a` disponíveis), ambos já verificados no token assinado; checar `w` é defesa redundante. Não afirmamos "cobertura completa": a mutação cobre os pontos críticos listados, não todas as linhas.
