# DEPLOYMENT — arquitetura de release atômica do PETMOL

> **Status:** este documento descreve o **novo** pipeline (`ci.yml` job `package` + `deploy-atomic.yml`).
> Ele ainda **não é o caminho oficial de produção** — está pronto e testável, mas
> `deploy-atomic.yml` só dispara manualmente (`workflow_dispatch`) até ser validado
> contra o VPS real e o `deploy.yml` legado ser desativado. Veja "Status da migração" no fim.

## Por que isso existe

O pipeline anterior acumulou, incidente por incidente, seis caminhos independentes capazes de
alterar o mesmo diretório de produção (`/opt/petmol/app`): deploy via GitHub Actions por SSH,
um fallback HTTP que reconstrói tudo no runner, um webhook que roda scripts arbitrários dentro
do próprio processo Next.js de produção, dois scripts locais (`deploy.sh`, `deploy/sync/publish.sh`),
e um timer legado pull-based no VPS. Cada deploy também compilava o Next.js e reinstalava
dependências Python **na máquina de produção**, competindo por CPU/memória com o tráfego real,
e não existia rollback — o `rsync --delete` sobrescrevia o estado anterior in-place.

O novo fluxo:

```text
push/merge em main
  → CI (typecheck, lint, testes, build)
  → job package: gera petmol-<sha>.tar.gz + manifest.json (artefato do GitHub Actions)
  → deploy-atomic.yml: baixa esse artefato exato, envia por SSH, roda activate.sh
  → activate.sh: extrai em releases/<sha>, troca o symlink current, reinicia, health check
  → se health check essencial falhar: rollback automático pro release anterior
```

O VPS nunca mais roda `npm ci`, `next build` ou reinstala todas as dependências Python a cada
deploy — só extrai um artefato já pronto e testado.

## Estrutura no VPS

```text
/opt/petmol/
├── releases/
│   ├── <sha-1>/
│   ├── <sha-2>/
│   └── <sha-atual>/
├── current -> releases/<sha-atual>          # symlink, trocado atomicamente
├── shared/
│   ├── env/           # api.env, web.env.local — nunca dentro de uma release
│   ├── uploads/        # services/price-service/uploads
│   ├── logs/
│   ├── persistent/     # push_subscriptions.json
│   └── venv/           # .venv Python COMPARTILHADO entre releases
├── incoming/            # tarball recém-enviado, antes de extrair
└── app/                 # layout LEGADO — mantido até a migração ser confirmada
```

`activate.sh` cria symlinks dentro de cada release apontando para `shared/`:
`services/price-service/.env`, `.venv`, `uploads`, `push_subscriptions.json`, e
`apps/web/.env.local` quando existir. Isso preserva os scripts/invocações existentes
(`.venv/bin/uvicorn`, etc.) sem precisar reescrevê-los.

### Por que uma `.venv` compartilhada, e não uma por release

Das três opções levantadas (venv compartilhada, venv por release, wheels pré-compiladas),
venv compartilhada foi a mais simples e confiável dado que não há acesso ao VPS nesta sessão
para validar compatibilidade binária entre o runner do GitHub Actions e o Ubuntu do VPS —
pré-compilar wheels arriscaria quebrar por divergência de glibc/arquitetura sem forma de testar.
`activate.sh` só reinstala nela quando o hash de `requirements.txt` muda (`shared/venv/.requirements.sha256`),
fora da seção travada — então a maioria dos deploys (só mudança de código, sem nova dependência)
não reinstala nada.

## O artefato

Gerado pelo job `package` em [`ci.yml`](../.github/workflows/ci.yml), só em push para `main`
depois que `frontend` e `backend` passam. Contém:

- `apps/web/` — build standalone do Next.js já pronto (equivalente ao antigo
  `.next/standalone/apps/web`, mas na raiz do artefato — mais simples de servir);
- `services/price-service/` — código, `requirements.txt`, `pyproject.toml`, migrations
  (rodam automaticamente no startup da API via `src/migrations.py`, não é um passo separado);
- `deploy/release/{activate,rollback,health_check}.sh` e `deploy/systemd/*.service`;
- `manifest.json`:
  ```json
  { "sha": "...", "branch": "main", "built_at": "...", "frontend": true, "backend": true }
  ```

Publicado como artefato nativo do GitHub Actions (`actions/upload-artifact`), retenção de 14 dias.

## Ativação (`deploy/release/activate.sh`)

Roda no VPS via SSH, recebendo o caminho do tarball já enviado. Ordem:

1. Extrai em `releases/<sha>` — **fora de qualquer lock**.
2. Cria os symlinks para `shared/` — fora do lock.
3. Reinstala a venv compartilhada só se `requirements.txt` mudou — fora do lock (é o único
   passo que pode ser lento, e não precisa de exclusão mútua: cada release tem seu próprio
   diretório).
4. **Só agora** adquire `/opt/petmol/.activate.lock` (`flock`, timeout de 30s) para: trocar o
   symlink `current`, reiniciar `petmol-api`/`petmol-web`, rodar os health checks essenciais.
   Essa seção costuma levar poucos segundos.
5. Se os health checks essenciais falharem, troca `current` de volta pro release anterior,
   reinicia de novo, e falha o deploy — **sem** derrubar produção na versão quebrada.
6. Roda os health checks não-essenciais só como aviso (nunca falha o deploy nem repete nada).
7. Remove releases antigas, mantendo as últimas 5.

### Health checks — essenciais vs não-essenciais

Ver [`deploy/release/health_check.sh`](../deploy/release/health_check.sh).

- **Essenciais (bloqueiam + disparam rollback automático):** `/health` da API responde 200;
  a home do frontend responde 200/307/308.
- **Não-essenciais (só warning):** `/suggest`, `sw.js`, VAPID key.

## Rollback

Automático: já embutido em `activate.sh` (passo 5 acima).

Manual: `deploy/release/rollback.sh [sha]` no VPS — sem argumento, volta pro release mais
recente diferente da atual; com um SHA, volta pra aquele release específico (precisa já estar
em `releases/`). Também roda health check essencial depois de trocar o symlink; se falhar,
avisa e não apaga nada — intervenção manual necessária.

## Systemd

[`deploy/systemd/petmol-api.service`](../deploy/systemd/petmol-api.service) e
[`petmol-web.service`](../deploy/systemd/petmol-web.service) apontam para `/opt/petmol/current/...`
em vez do antigo `/opt/petmol/app/...`. `EnvironmentFile=-/opt/petmol/shared/env/...` (o `-`
inicial faz o systemd não falhar se o arquivo ainda não existir).

## Tarefas de negócio fora do deploy

A reclassificação de documentos do pet "Baby" via Gemini foi removida do script de deploy —
ela já rodou uma vez (não fazia mais nada além de checar uma flag em todo deploy desde então).
Para reclassificar de novo ou outro pet, use o workflow manual `reclassify.yml`.

## Status da migração

- [x] Etapa 1 — reclassificação Gemini removida do deploy.
- [x] Etapa 2 — artefato único gerado no CI.
- [x] Etapa 3 — scripts de release atômica, systemd de referência, script de migração manual
      (`deploy/release/bootstrap_vps.sh`).
- [ ] Etapa 4 — cutover: desativar `deploy.yml`/`fix_vps.yml`/`reclassify.yml`/`vps-unlock.yml`
      do caminho automático e tornar `deploy-atomic.yml` o único oficial. **Bloqueado**: SSH
      pro VPS (`147.93.33.24:22`) está indisponível (timeout de conexão) desde antes desta
      sessão — precisa ser resolvido pelo console web da Hostinger antes de qualquer teste real.
- [ ] Etapa 5 — validação de deploy real e rollback real no VPS.

### Como retomar quando o SSH voltar

1. Confirmar acesso: `ssh -o ConnectTimeout=10 root@147.93.33.24 echo ok`.
2. Rodar `deploy/release/bootstrap_vps.sh` manualmente no VPS (copia `.env`/uploads/`.venv`
   para `shared/`, não apaga nada do layout antigo).
3. Disparar o job `package` (push em `main` já faz isso) e depois `deploy-atomic.yml` via
   `workflow_dispatch` com o SHA gerado.
4. Confirmar `https://petmol.com.br/api/health`, `https://www.petmol.com.br/`, e
   `/opt/petmol/REVISION` com o SHA esperado.
5. Testar `deploy/release/rollback.sh` manualmente uma vez.
6. Só depois disso, desativar `deploy.yml` (e os demais workflows fora do caminho oficial) e
   promover `deploy-atomic.yml` para disparo automático (`workflow_run` do CI).
