# PETMOL

App PWA para tutores de pets: controlar o que o pet usa (ração, vacinas, antiparasitários, medicação), avisar antes de acabar ou vencer, e facilitar a recompra.

Fluxo principal: cadastrar pet → registrar alimentação e cuidados → receber alertas → agir → registrar novamente.

## Branch de produção

**`main` é a única branch que vai para produção.** Todo push em `main` roda o CI; se ele passar, o deploy dispara automaticamente via GitHub Actions ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) para o VPS (`petmol.com.br`) — deploy não roda mais em paralelo com o CI, só depois dele ter passado.

> O branch "padrão" exibido na página inicial do GitHub pode não ser `main` — isso é só uma configuração de navegação (Settings → Branches), não afeta o que está em produção. Sempre trabalhe a partir de `main`; as demais branches (`v2-design`, `redesign/frontend-proposal`, `release/docs-viewer-mobile`, `feature/*`) são linhas de desenvolvimento paralelas/abandonadas que não estão no ar.

### Como verificar a versão instalada em produção

O script de deploy grava o commit exato aplicado em `/opt/petmol/app/REVISION` no VPS:

```bash
cat /opt/petmol/app/REVISION
# sha=<commit completo>
# branch=main
# deployed_at=<timestamp UTC>
```

Compare o `sha` com `git log -1 --format=%H main` localmente para confirmar que produção bate com o GitHub.

## Estrutura de pastas

```
apps/web/                  Frontend — Next.js 14 (interface do tutor)
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
- Em deploy real, `apply_on_vps.sh` remove `.env.local` do servidor de propósito, para não herdar overrides de desenvolvedor.

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

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda em todo push: typecheck + lint + build do frontend, compile-check do backend.
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) roda depois que o CI passa em `main` (`workflow_run`, não em paralelo) — ou manualmente via `workflow_dispatch`, que pula essa checagem de propósito para deploys de emergência. Empacota o repo, envia para o VPS via SSH, aplica com [`deploy/sync/apply_on_vps.sh`](deploy/sync/apply_on_vps.sh) (rsync preservando `.env`/segredos, reinstala dependências se necessário, rebuild do Next.js, restart dos serviços via systemd, bateria de health checks pós-deploy) e roda um health check final em `https://petmol.com.br/api/health`.

## Backup

`scripts/backup/create-backup.sh` empacota banco, uploads e `.env` de todos os serviços em um `.tar.gz` com checksum (ver [`docs/BACKUP_ROTINA.md`](docs/BACKUP_ROTINA.md) para agendamento via cron). Teste de restauração ainda não documentado como procedimento rotineiro.
