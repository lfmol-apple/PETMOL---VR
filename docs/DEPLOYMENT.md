# DEPLOYMENT — arquitetura de release atômica do PETMOL

> **Status:** migração completa e em produção desde 2026-08-07. `deploy-atomic.yml`
> é o caminho oficial (dispara automaticamente via `workflow_run` após a CI passar
> em `main`); `deploy.yml` legado ficou `workflow_dispatch`-only, mantido só como
> fallback manual de emergência. Veja "Status da migração" no fim.

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
├── REVISION              # indicador OFICIAL — sha + activated_at (+ rolled_back_from se houve rollback)
├── releases/
│   ├── <sha-1>/
│   ├── <sha-2>/
│   └── <sha-atual>/
├── current -> releases/<sha-atual>          # symlink, trocado atomicamente — release ativa
├── shared/
│   ├── env/           # api.env, web.env.local — nunca dentro de uma release
│   ├── uploads/        # services/price-service/uploads
│   ├── logs/
│   ├── persistent/     # push_subscriptions.json
│   └── venv/           # .venv Python COMPARTILHADO entre releases
├── incoming/            # tarball recém-enviado, antes de extrair
└── app/                 # layout LEGADO — vestigial, não é mais checkout git nem release servida;
                          # app/REVISION é hoje só um symlink pra ../REVISION, não consultar direto
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

### `version.json` — não confundir com `manifest.json`

`manifest.json` (acima) descreve o **artefato** e é usado por `activate.sh` pra validar que o
tarball extraído é mesmo o SHA esperado (falha o deploy se não bater). `version.json` é outra
coisa: gerado pelo job `frontend` do CI (`echo "{\"v\":\"$GITHUB_SHA-$(date +%s)\"}" >
apps/web/public/version.json`), vai dentro do build do Next.js e é servido como arquivo estático
em `/version.json` pelo `petmol-web` já rodando — é o que o próprio frontend em produção usa
(`apps/web/src/app/home/page.tsx`) pra detectar que existe uma versão mais nova e avisar o tutor
a atualizar a página. Por isso é consultável via HTTP local no VPS (`127.0.0.1:3000`, sem
precisar da API) e é a terceira perna da checagem de versão abaixo.

## Regra oficial de verificação de versão

Os três indicadores abaixo devem sempre apontar pro mesmo SHA — qualquer divergência entre eles é
incidente de deploy, não normalidade:

```bash
cat /opt/petmol/REVISION                       # o que activate.sh gravou como ativado
readlink -f /opt/petmol/current                # a release efetivamente servida
curl -sS http://127.0.0.1:3000/version.json     # o que o frontend rodando de fato responde
```

`/opt/petmol/REVISION` é o indicador oficial — é o único dos três escrito diretamente por
`activate.sh` como parte da ativação (ou do rollback automático, com `rolled_back_from=<sha>`).
`/opt/petmol/app/REVISION` existe só como symlink legado pra esse mesmo arquivo; não usar como
fonte separada.

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
- [x] Etapa 4 — cutover: `deploy.yml` ficou `workflow_dispatch`-only (fallback manual);
      `fix_vps.yml`/`reclassify.yml`/`vps-unlock.yml` já eram manuais. `deploy-atomic.yml`
      é o único caminho automático (`workflow_run` após `CI` em `main`).
- [x] Etapa 5 — validação de deploy real e rollback real no VPS. Concluída em 2026-08-07.

### Histórico do cutover (2026-08-07)

SSH ficou indisponível por um tempo antes desta sessão (socket systemd escutando só em
IPv6) — resolvido corrigindo `ssh.socket` via console da Hostinger. Depois disso, o
cutover revelou três bugs que só apareciam ao rodar o artefato de verdade (as validações
anteriores de `deploy-atomic.yml` restartavam os units *legados*, então nunca exercitaram
o código do release novo):

1. **Tarball sem `node_modules/`/`package.json`** — o fix do prefixo `./` no `tar` (para o
   `tar -xzOf` seletivo do `deploy-atomic.yml` funcionar) listou os itens de topo
   explicitamente e esqueceu esses dois, que o build standalone do Next também coloca na
   raiz do release. `apps/web/server.js` crashava com `MODULE_NOT_FOUND`.
2. **`shared/env/api.env` root:600** — `bootstrap_vps.sh` copiava com `cp -n`, preservando
   dono/permissão do arquivo legado; o usuário `petmol` (que roda os units novos) não
   conseguia ler.
3. **`bootstrap_vps.sh` copiava o arquivo de env errado** — `services/price-service/.env`
   é um arquivo local parcial (10 chaves), não o que a produção usa de verdade
   (`/etc/petmol/petmol.env`, 57 chaves, incluindo `JWT_SECRET`/`DATABASE_URL`). Corrigido
   para copiar `/etc/petmol/petmol.env` como fonte.
4. **`/uploads/pets/` do nginx apontava pro caminho legado** — descoberto horas depois do
   cutover, quando um usuário reportou que a foto do pet cadastrada não aparecia.
   `/etc/nginx/sites-enabled/petmol` (não versionado — só existe no VPS) tinha
   `location ^~ /uploads/pets/ { alias /opt/petmol/app/services/price-service/uploads/pets/; }`
   hardcoded pro diretório legado. A API já escrevia em `shared/uploads/pets/` (via o
   symlink que `activate.sh` cria), mas o nginx nunca foi atualizado pra servir dali —
   então toda foto enviada depois do cutover dava 404 silencioso no navegador. Corrigido
   trocando o `alias` pra `/opt/petmol/shared/uploads/pets/` (que já contém tanto as fotos
   antigas quanto as novas — `bootstrap_vps.sh` fez o rsync completo). **Pendência:** essa
   config do nginx não está versionada no repo; considerar trazê-la pra
   `deploy/nginx/petmol.conf` num commit futuro, tanto por rastreabilidade quanto pra evitar
   esse tipo de gap se o VPS precisar ser reconstruído.

A primeira tentativa de instalar os units novos bateu nos bugs 1 e 2 ao mesmo tempo: os
dois serviços entraram em crash-loop e o site ficou fora do ar (502) por menos de um
minuto até os units legados serem restaurados manualmente. Depois de corrigir os três
bugs e validar cada serviço isoladamente em portas alternativas (sem tocar no tráfego
real), o cutover foi refeito com sucesso: zero restarts, health checks limpos, sem erros
novos no nginx. O primeiro deploy 100% automático (via `workflow_run`) rodou logo em
seguida e também passou limpo.
