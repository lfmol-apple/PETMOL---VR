# Campanhas push — Etapa 5.1 (correções da homologação)

Só interface do painel admin + 1 campo de leitura no backend admin (`filters` no lote). Flag continua OFF; sem migration; sem envio real.

## Correções

| # | Problema da homologação | Correção |
|---|---|---|
| 1 | Contagem desatualizada após reservar/concluir/recuperar/continuar/devolver, trocar filtros ou campanha | A consulta ao servidor passa a depender também do **estado dos lotes** (fases e contagens por situação), do status e da campanha. Nenhuma soma/subtração local. Enquanto atualiza, os quadros mostram "…" (nunca o número antigo); respostas atrasadas de consultas antigas são descartadas |
| 2 | "Já usados" confundia histórico com filtro atual | Mostra o **total histórico** da campanha e, abaixo, quantos deles atendem aos filtros atuais |
| 3 | Histórico sem filtros | Cada lote mostra "Quem foi escolhido": resumo legível dos filtros **guardados** na reserva (`filters` vem do `filters_json` já existente; só leitura) |
| 4 | Reabrir campanha perdia os filtros | Ao abrir uma campanha com lotes, os filtros do último lote viram o ponto de partida (com aviso de que podem ser alterados; o histórico não muda) |
| 5 | Rótulos crus (`produto`, `home`, `{tutor}`, `{pets}`) | Destino em palavras ("O produto do link (direto na loja)"); prévia "como aparece no celular" com exemplo (Ana/Thor) e explicação da substituição |
| 6 | Passos começavam em 2 | Cabeçalho da campanha é o passo 1; depois 2 Conteúdo, 3 Filtros, 4 Lote, 5 Histórico |
| 7 | E/OU pouco claro | Texto simples por bloco e entre blocos, mudando com a escolha. Motor de filtros inalterado; sem cálculo por bloco |
| 8 | Conferência do link sem internet | Mensagem clara: o link não é um erro e continua exatamente como colado; digite o nome do produto |
| 9 | Avulso bloqueado durante lote de campanha | Bloqueio inalterado. Mensagens explicam: aviso no modo Campanhas e explicação no erro 409 do avulso |

## Verificação

- Frontend: 973 testes passando (92 em `admin`), incluindo o exemplo obrigatório 200 disponíveis → 50/150, 80/120, 180/20 e a semântica de filtros trocados entre lotes. Mutação: sem o estado dos lotes na consulta, sem o descarte de números antigos ou sem a guarda de resposta atrasada, os testes falham.
- Backend: 191 passando nos testes de campanhas (SQLite + PostgreSQL), +1 teste (filtros expostos por lote).
- Homologação isolada repetida (dados fictícios, provedor falso, trava de rede): contagens da tela conferidas contra o servidor após cada operação; bateria de integração 49/49; nenhum tutor repetido em nenhuma campanha.
