# Benchmark de Capacidade (PETMOL)

Executado localmente em 24/08/2026, **nunca contra produção**. Objetivo: aprender o teto real de concorrência do backend hoje, não escalar pra 100k usuários.

## Ambiente

- Máquina: Mac local, 8 cores / 16GB RAM (não é o hardware da VPS — números absolutos de req/s não são 1:1 com produção, mas o comportamento arquitetural sim, porque a invocação foi idêntica à de produção)
- Backend iniciado com o comando exato de produção (`deploy/systemd/petmol-api.service`): `uvicorn src.main:app --host 127.0.0.1 --port <porta>` — **sem `--workers`**, ou seja, produção roda hoje com um único processo/worker, igual ao ambiente testado
- Banco: `petmol_prod_mirror` local (espelho de produção), não o banco real
- Ferramenta: `hey` (`brew install hey`)
- Endpoints testados: `GET /health` (sem auth), `GET /pets` (auth), `GET /notifications/reminders` (auth), `GET /catalog/search/v2` (busca/ofertas, auth), `POST /auth/login`
- Usuário de teste criado e removido só para o benchmark (`claude-benchmark-8002@example.com`), nunca dados reais

## Resultado principal: teto de conexões de banco é o gargalo real

O pool do SQLAlchemy (`services/price-service/src/db.py`) está configurado com `pool_size=20` + `max_overflow=40` = **60 conexões simultâneas no máximo**, por processo. Como produção roda um único processo uvicorn, esse teto de 60 é o teto de concorrência de qualquer endpoint autenticado — não 500, não 1000.

Reproduzido ao vivo: em `GET /pets` com concorrência 250, o log do servidor mostrou:

```
sqlalchemy.exc.TimeoutError: QueuePool limit of size 20 overflow 40 reached, connection timed out, timeout 30.00
```

A partir daí, o efeito **cascateou para endpoints completamente diferentes** (`/notifications/reminders`, `/catalog/search/v2`, `/auth/login`) mesmo em concorrências baixas (10-50) — porque todos compartilham o mesmo pool de conexões e o mesmo processo único. Cada requisição que não conseguia uma conexão ficava na fila até 30s (o `pool_timeout` configurado) antes de falhar, e como a fila enchia mais rápido do que esvaziava, o serviço inteiro (não só `/pets`) ficou de fato indisponível por dezenas de segundos até o backlog drenar.

`GET /health` (não toca o banco) permaneceu rápido e barato em qualquer concorrência testada, inclusive 1000 — confirma que o gargalo é especificamente o pool de conexões, não CPU/rede/uvicorn em si.

## Números por endpoint

| Endpoint | Concorrência | Req/s | p50 | p95 | p99 | Erros |
|---|---|---|---|---|---|---|
| `GET /health` | 50–1000 | — | — | — | — | 0% (CPU do processo ficou perto de 0% o tempo todo) |
| `GET /pets` | 50 | 696 | 62ms | 132ms | 173ms | 0% |
| `GET /pets` | 100 | 678 | 133ms | 219ms | 249ms | 0% |
| `GET /pets` | 250 | 24 | 280ms | 436ms | 495ms | **51%** (pool exaurido) |
| `GET /pets` | 500 | — | — | — | — | **100%** (pool exaurido) |
| `GET /pets` | 1000 | — | — | — | — | **100%** (pool exaurido) |
| `GET /notifications/reminders` | 50–500 | — | — | — | — | **100%** (backlog do teste anterior ainda drenando) |
| `GET /catalog/search/v2` | 50 | — | — | — | — | **100%** (backlog ainda drenando) |
| `GET /catalog/search/v2` | 100 | 12 | 10.16s | 10.19s | 10.19s | parcial (servidor chegou a recusar conexão brevemente) |
| `GET /catalog/search/v2` | 250 | 1276 | 139ms | 395ms | 1.3s | ~0.3% |
| `GET /catalog/search/v2` | 500 | 1260 | 233ms | 488ms | 3.97s | 0% |
| `GET /catalog/search/v2` | 1000 | 1256 | 761ms | 1.03s | 4.15s | 0% |
| `POST /auth/login` | 10–50 | — | — | — | — | **100%** (bcrypt + fila do pool ainda saturados do backlog anterior) |

O padrão "erro total mesmo em concorrência baixa" em `/notifications/reminders` e no início de `/catalog/search/v2` **não é o endpoint em si sendo lento** — é o backlog de conexões enfileiradas dos testes anteriores (`/pets` a 250-1000) ainda não ter drenado quando o próximo teste começou. Isso por si só é um achado real: uma vez que o pool satura, o serviço leva dezenas de segundos para voltar ao normal, mesmo depois que o tráfego que causou a saturação já parou.

## O que isso significa pra hoje

- **Não bloqueia o lançamento.** Numa fase inicial (10k DAU com picos progressivos, não 100k simultâneos), é improvável bater 250 requisições autenticadas simultâneas de forma sustentada logo de cara.
- **Mas é um gatilho de escala concreto e barato de corrigir**, não uma limitação de hardware. Duas mudanças de baixo risco, quando fizerem sentido:
  1. Aumentar `pool_size`/`max_overflow` em `db.py` (o Postgres da VPS aguenta bem mais que 60 conexões — confirmar `max_connections` do Postgres antes de subir muito).
  2. Rodar uvicorn com múltiplos workers (`--workers N`) ou um process manager (gunicorn+uvicorn workers) — hoje production roda um único processo, então qualquer gargalo (pool, CPU, uma requisição lenta) afeta 100% do tráfego, não uma fração.
- **Não implementado hoje** — por instrução explícita de não fazer otimização especulativa sem necessidade comprovada. Isso é documentação do gatilho, não a correção.

## Gatilhos de escala sugeridos

Revisar/agir quando, sustentado (não só um pico de segundos):

- Erros de `QueuePool ... connection timed out` aparecerem nos logs de produção
- CPU do processo `petmol-api` sustentado acima de ~70-80%
- p95 de endpoints autenticados (`/pets`, `/notifications/reminders`, `/commerce/offers` equivalente) passando de ~500ms sustentado
- Conexões simultâneas no Postgres se aproximando do `max_connections` configurado

## Limitações deste benchmark

- Hardware local ≠ hardware da VPS — os números de req/s absolutos não devem ser tomados como capacidade real de produção, só o comportamento arquitetural (onde o teto está, como ele se manifesta).
- Não foi possível confirmar via SSH os specs exatos da VPS nem o `max_connections` real do Postgres de produção (conectividade SSH instável durante esta sessão) — confirmar depois via `ssh petmol` quando disponível.
- Serviços externos (Shopee, Awin, Gemini) não foram exercitados no benchmark — os endpoints testados não dependem de chamada externa no caminho crítico (confirmado em auditoria anterior), então isso não deveria mudar o resultado, mas não foi verificado sob carga.
