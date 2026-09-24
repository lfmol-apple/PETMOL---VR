# PETMOL

App PWA para tutores de pets: controlar o que o pet usa (ração, vacinas, antiparasitários, medicação), avisar antes de acabar ou vencer, e facilitar a recompra.

Fluxo principal: cadastrar pet → registrar alimentação e cuidados → receber alertas → agir → registrar novamente.

## Branch de produção

**`main` é a única branch que vai para produção.** Todo push em `main` roda o CI ([`ci.yml`](.github/workflows/ci.yml)); se ele passar, o deploy dispara automaticamente via GitHub Actions ([`.github/workflows/deploy-atomic.yml`](.github/workflows/deploy-atomic.yml)) para o VPS (`petmol.com.br`) — deploy não roda em paralelo com o CI, só depois dele ter passado.

Pipeline: CI empacota um artefato único (`petmol-<sha>.tar.gz` + `manifest.json`) → `deploy-atomic.yml` baixa esse mesmo artefato, envia por SSH e roda `deploy/release/activate.sh` no VPS, que extrai a release em `/opt/petmol/releases/<sha>/`, troca o symlink `/opt/petmol/current` pra apontar pra ela e reinicia os serviços (ativação atômica — a troca do symlink em si é instantânea) e **só depois** roda os health checks essenciais. Se um health check essencial falhar, o rollback automático desfaz a troca — `/opt/petmol/current` volta pra release anterior e os serviços reiniciam de novo — sem intervenção manual. `deploy.yml` é o pipeline legado (rsync direto sobre `/opt/petmol/app`, sem release versionada nem rollback automático) — hoje só existe como `workflow_dispatch` manual, para emergência caso o atômico esteja indisponível; não é o caminho normal.

> O branch "padrão" exibido na página inicial do GitHub pode não ser `main` — isso é só uma configuração de navegação (Settings → Branches), não afeta o que está em produção. Sempre trabalhe a partir de `main`; as demais branches (`v2-design`, `redesign/frontend-proposal`, `release/docs-viewer-mobile`, `feature/*`) são linhas de desenvolvimento paralelas/abandonadas que não estão no ar.

### Como verificar a versão instalada em produção

`activate.sh` grava o commit ativado em `/opt/petmol/REVISION` no VPS (o link legado `/opt/petmol/app/REVISION` aponta pra esse mesmo arquivo, mas não deve ser consultado diretamente — `/opt/petmol/app` é o layout legado, não a release servida):

```bash
cat /opt/petmol/REVISION
# sha=<commit completo> activated_at=<timestamp UTC>

readlink -f /opt/petmol/current
# /opt/petmol/releases/<mesmo sha> — a release efetivamente servida

curl -sS http://127.0.0.1:3000/version.json
# {"v":"<mesmo sha>-<timestamp>"}
```

Os três devem apontar pro mesmo `sha` — isso, e não a ponta da `main`, é a fonte de verdade sobre o que está no ar. `main` pode legitimamente estar à frente dessa release: `deploy-atomic.yml` só reativa quando o diff desde a release ativa contém algo além de docs/workflow (ver "Detect whether VPS deploy is needed" no workflow), então commits só de documentação/diagnóstico/CI não disparam uma ativação nova. Divergência entre os três indicadores é incidente; `main` mais à frente que eles, sozinho, não é — só investigue se os commits entre a release ativa e a ponta da `main` contiverem código que deveria ter sido implantado (ver [`docs/RUNBOOK.md`](docs/RUNBOOK.md)).

## Estrutura de pastas

```
apps/web/                  Frontend — Next.js 15 (interface do tutor)
services/price-service/    Backend principal — FastAPI (API, auth, pets, notificações, etc.)
services/product-suggest/  Módulo auxiliar (futuro)
shared/                    Catálogos, regras e dados comuns ao frontend e backend
functions/                 Legado / experimental
deploy/                    Scripts de deploy (CI → VPS) e sincronização
scripts/                   Backup, auditoria de notificações
docs/                      Documentação técnica por subsistema
```

Regras de arquitetura (ver [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)):
- Não criar novos backends fora de `services/`.
- Toda lógica de negócio deve viver no backend principal.
- Frontend não deve conter lógica crítica.

## Requisitos

- Node.js 20+
- Python 3.10+
- npm (workspaces — um único `package-lock.json` na raiz cobre `apps/web`)

## Como rodar localmente

```bash
# instalar dependências (raiz — cobre o monorepo)
npm ci --legacy-peer-deps

# backend (cria .venv na primeira vez)
cd services/price-service
python3 -m venv .venv
.venv/bin/pip install -e .
cd ../..

# sobe API (porta 8000) + frontend (porta 3000) juntos
npm run dev
```

Scripts úteis (raiz [`package.json`](package.json)):
- `npm run web` — só o frontend (`next dev`)
- `npm run api` — só o backend (`uvicorn --reload`)
- `npm run web:build` — build de produção do frontend
- `npm run notifications:audit-prod` — audita lembretes/push em produção
- `npm run backup:run` — roda backup manual

## Variáveis de ambiente

Copie [`.env.example`](.env.example) para os arquivos reais (`.env`, `apps/web/.env.local`, etc. — todos ignorados pelo Git). O exemplo documenta cada seção: core/backend, CORS, storage, push (VAPID), integrações externas (Cosmos, GTIN, Open Food Facts, Google Maps, afiliados) e variáveis `NEXT_PUBLIC_*` do frontend.

Pontos que já causaram problema antes:
- `apps/web/.env.local` sobrescreve `.env.production` no build local — confira qual está valendo antes de testar algo "como se fosse produção".
- Em produção, `activate.sh` faz symlink de `/opt/petmol/shared/env/api.env` e `web.env.local` (persistentes, fora de cada release) pra dentro da release recém-ativada — segredos nunca vêm do artefato do CI nem de overrides de desenvolvedor. (O fallback legado `deploy.yml`/`apply_on_vps.sh` usa rsync preservando `.env` diretamente em `/opt/petmol/app`.)

## Banco de dados e migrations

`DATABASE_URL` aceita SQLite (dev) ou PostgreSQL (produção). Não há Alembic — as tabelas são criadas com `Base.metadata.create_all()` e migrações aditivas simples (`ALTER TABLE ... ADD COLUMN`, idempotentes) rodam automaticamente no startup da API, tanto para SQLite quanto PostgreSQL (ver [`services/price-service/src/migrations.py`](services/price-service/src/migrations.py)). Não é necessário rodar nada manualmente.

## Testes

- **Backend**: `services/price-service/tests/` cobre os fluxos críticos com `pytest` + `TestClient` — signup/login, isolamento de dados entre usuários (pet_id de outro tutor deve dar 404), ciclo de ração (cadastrar → estimar término → recompra), vacina + lembrete, e recuperação de senha (solicitar → confirmar → logar com a senha nova, token não reutilizável). Rodar com:
  ```bash
  cd services/price-service
  .venv/bin/python -m pytest tests/ -v
  ```
  `tests/conftest.py` aponta `DATABASE_URL` para um SQLite descartável antes de importar a app — nunca toca o Postgres real, mesmo que o `.env` local aponte para um mirror de produção.
- **Frontend**: não há suíte de testes configurada ainda — é a lacuna que falta cobrir.

O CI ([`ci.yml`](.github/workflows/ci.yml)) roda essa suíte a cada push.

## CI/CD

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda em todo push: typecheck + lint + build do frontend, compile-check + pytest do backend, e empacota o artefato único (`petmol-<sha>.tar.gz` + `manifest.json`) usado pelo deploy — build não acontece de novo no VPS.
- [`.github/workflows/deploy-atomic.yml`](.github/workflows/deploy-atomic.yml) é o **pipeline automático oficial**: dispara via `workflow_run` assim que o CI passa em `main` (mas pula a ativação se o diff desde a release ativa for só docs/workflow — commits desse tipo deixam `main` à frente da produção sem que isso seja incidente). Baixa o artefato já empacotado pelo CI, envia por SSH, extrai em `/opt/petmol/releases/<sha>/`, ativa a release trocando o symlink `/opt/petmol/current` (ativação atômica) e reinicia os serviços — e só então roda a bateria de health checks essenciais. Se um health check essencial falhar, faz rollback automático: desfaz a troca do symlink e reinicia de novo — sem intervenção manual.
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) é o **fallback manual legado**: só roda via `workflow_dispatch`, aplica rsync direto sobre `/opt/petmol/app` (sem release versionada, sem rollback automático). Reservado para emergência caso o pipeline atômico esteja indisponível — não é o fluxo normal, e build direto no VPS não deve ser tratado como caminho padrão de deploy.

## Operação

Deploy travado, rollback, incidentes já enfrentados, onde as coisas ficam (VPS, banco, chaves push) — ver [`docs/RUNBOOK.md`](docs/RUNBOOK.md). É o documento pra alguém colocar produção de volta no ar sem depender de quem escreveu o código.

## Backup

`scripts/backup/create-backup.sh` empacota `pg_dump` do Postgres (quando `DATABASE_URL` aponta pra Postgres — sempre o caso em produção), uploads e `.env` de todos os serviços em um `.tar.gz` com checksum (ver [`docs/BACKUP_ROTINA.md`](docs/BACKUP_ROTINA.md) para agendamento via cron e passo a passo de restauração com `pg_restore`). Se `pg_dump` falhar, o script para com erro em vez de gerar um backup incompleto silenciosamente — o `petmol.db` (SQLite) sozinho não representa os dados reais de produção. Teste de restauração completo (gerar → restaurar em banco isolado → conferir contagens) ainda não foi executado nem documentado como procedimento rotineiro.
