# RUNBOOK — Operação do PETMOL

Este documento existe para que alguém além de quem escreveu o código consiga colocar o PETMOL de volta no ar, entender um incidente, ou fazer uma restauração de emergência. O [README.md](../README.md) explica a estrutura do projeto; este documento explica **o que fazer quando algo quebra ou precisa ser operado**.

## Onde as coisas ficam

- **Repositório**: `github.com/lfmol-apple/PETMOL---VR`, branch de produção é `main`.
- **VPS**: Hostinger, `srv1335464.hstgr.cloud` (147.93.33.24), São Paulo. Painel: Hostinger → VPS. Acesso root via Web Console do painel ou `ssh root@147.93.33.24`.
- **Diretório da aplicação no VPS**: `/opt/petmol/app`.
- **Serviços systemd**: `petmol-api` (FastAPI/Uvicorn, porta 8000) e `petmol-web` (Next.js standalone, porta 3000). nginx faz proxy reverso para ambos e serve `petmol.com.br` / `www.petmol.com.br`.
- **Banco**: PostgreSQL local no VPS. `DATABASE_URL` em `services/price-service/.env` (nunca commitado).
- **Admin master**: `leonardofmol@gmail.com` — único e-mail que `get_current_admin` aceita (hardcoded em `src/config.py`, ver `admin_master_email`).

## Deploy

Fluxo normal: push em `main` → CI ([`ci.yml`](../.github/workflows/ci.yml): typecheck/lint/build do frontend, compile-check + pytest do backend) → se o CI passar, `deploy.yml` dispara automaticamente via `workflow_run` → empacota o repo, envia por SSH, roda [`deploy/sync/apply_on_vps.sh`](../deploy/sync/apply_on_vps.sh) no VPS.

O que `apply_on_vps.sh` faz, em ordem: extrai o pacote, faz `rsync --delete` preservando `.env`/segredos, reinstala dependências (`pip`/`npm ci`) se backend/frontend mudou, builda o Next.js, grava `/opt/petmol/app/REVISION` com o SHA e branch aplicados, reinicia `petmol-api` e `petmol-web` via `systemctl`, roda 6 health checks internos (API health/version/suggest, frontend home, `sw.js`, VAPID key).

**Deploy manual** (bypassa a espera do CI — usar só se souber que o commit já está validado):
```bash
gh workflow run deploy.yml --repo lfmol-apple/PETMOL---VR --ref main
```

### Quando o SSH nao entra

Sintoma ja observado em 2026-08-10:

```text
Connection established.
kex_exchange_identification: read: Operation timed out
banner exchange: Connection to 147.93.33.24 port 22: Operation timed out
```

Isso significa que o TCP na porta 22 abriu, mas o `sshd` nao respondeu o
banner. Nao e erro de senha/chave. A producao pode continuar no ar via nginx
enquanto o SSH esta quebrado; confirme com:

```bash
curl -I --connect-timeout 10 http://147.93.33.24
curl -I --connect-timeout 10 https://www.petmol.com.br/
curl -sS --connect-timeout 10 https://www.petmol.com.br/version.json
```

Sem SSH funcional, o canal de correcao e o **Web Console da Hostinger**. Entrar
como `root` e rodar o script idempotente versionado no repo:

```bash
cd /opt/petmol/current 2>/dev/null || cd /opt/petmol/app
bash deploy/release/repair_ssh_and_create_claudeops.sh
```

Esse script:
- registra um snapshot de `ssh.socket`, `ssh`, journal e portas abertas;
- limpa bans ativos do fail2ban, se existir;
- mantem o UFW ligado, mas garante `22/tcp` e `2222/tcp`;
- desativa `ssh.socket` e deixa `ssh.service` escutar diretamente em `22` e `2222`;
- cria o usuario dedicado `claudeops` com chave publica e sudo sem senha para automacao.

Se o repo local do VPS estiver inconsistente, o procedimento manual equivalente
continua sendo:

```bash
set -euxo pipefail

systemctl status ssh.socket --no-pager || true
systemctl status ssh --no-pager || true
journalctl -u ssh.socket -u ssh -n 120 --no-pager || true
ss -ltnp | grep -E ':(22|2222)\b' || true

install -d /etc/systemd/system/ssh.socket.d
cat >/etc/systemd/system/ssh.socket.d/petmol-listen.conf <<'EOF'
[Socket]
ListenStream=
ListenStream=22
ListenStream=2222
EOF

sshd -t
systemctl daemon-reload
systemctl restart ssh.socket
systemctl restart ssh || true
ss -ltnp | grep -E ':(22|2222)\b'
```

Depois testar de fora:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=15 root@147.93.33.24 'hostname; whoami; date'
ssh -p 2222 -o BatchMode=yes -o ConnectTimeout=15 root@147.93.33.24 'hostname; whoami; date'
```

Se a porta 2222 funcionar e a 22 nao, liberar TCP 2222 no firewall da
Hostinger e configurar o GitHub secret `VPS_PORT=2222`. Os workflows e scripts
locais ja aceitam porta alternativa; localmente use `PETMOL_VPS_PORT=2222`.

Correcao aplicada em 2026-08-10: o `ssh.socket` foi desativado e o `ssh.service`
passou a escutar diretamente em `22` e `2222`, com validacao por `sshd -t`.
Depois disso, o deploy atomico `31396136881` do commit `7537051` passou e a
producao respondeu:

```text
version.json -> 753705196e29044936fc41a876a960918affe10a-1786370556
api/health -> {"status":"ok","version":"0.1.0","providers":["mercadolivre"]}
```

**Verificar se um deploy realmente aplicou** — compare o SHA:
```bash
git log -1 --format=%H main          # local/GitHub
cat /opt/petmol/app/REVISION          # o que está de fato rodando (rodar no VPS)
```

**Acompanhar um deploy em andamento** (não precisa de acesso ao VPS, só `gh` autenticado):
```bash
gh run list --repo lfmol-apple/PETMOL---VR --limit 5
gh run watch <run-id> --repo lfmol-apple/PETMOL---VR --exit-status
```

### Trava de concorrência (por que existe)

Dois deploys rodando ao mesmo tempo no VPS corrompem `node_modules`/`.next` (dois `npm ci`/`next build` escrevendo em cima um do outro). Duas camadas de proteção:
- `deploy.yml` tem `concurrency: group: deploy-vps` — GitHub enfileira em vez de rodar em paralelo, e `timeout-minutes: 10` no job evita que uma conexão SSH morta (ex.: reboot do VPS no meio de um deploy) bloqueie a fila por até 6 horas (o padrão do GitHub Actions).
- `apply_on_vps.sh` também usa `flock` num arquivo (`/opt/petmol/.deploy.lock`) como segunda trava, com expiração automática depois de 15 minutos — protege contra invocação direta do script fora do GitHub Actions.

Se um deploy travar com `"Outro deploy ja esta em andamento"` e você tiver certeza de que não há deploy real rodando, o lock expira sozinho em até 15 minutos. Não é necessário intervir manualmente.

### Rollback

Não existe rollback automático. Para reverter um deploy problemático:
```bash
git revert <commit-ruim> --no-edit
git push origin main
```
Isso passa pelo mesmo pipeline (CI → deploy) e aplica o estado anterior. Alternativa mais rápida em emergência: `git checkout <sha-bom> -- .` seguido de commit, ou disparar `gh workflow run deploy.yml --ref <branch-com-sha-bom>` se existir uma branch/tag apontando pro estado bom.

## Banco de dados

PostgreSQL em produção (obrigatório — `Settings.validate_prod()` em `src/config.py` bloqueia o startup se `DATABASE_URL` não for Postgres). Não há Alembic: tabelas são criadas via `Base.metadata.create_all()` e migrações aditivas simples (`ALTER TABLE ADD COLUMN`) rodam automaticamente no startup da API (`src/migrations.py`). Não é necessário rodar nada manualmente para aplicar uma migration nova — só fazer o deploy normal.

## Backup e restauração

Ver [`BACKUP_ROTINA.md`](BACKUP_ROTINA.md) para o procedimento completo. Resumo: `scripts/backup/create-backup.sh` gera `pg_dump` do Postgres + uploads + `.env`, agendado via cron (`npm run backup:install-cron`). O script falha alto (exit != 0) se o `pg_dump` falhar — não gera um backup incompleto silenciosamente.

**Atenção**: a restauração completa (gerar → `pg_restore` num banco isolado → conferir contagens) ainda não foi executada nem comprovada. Antes de confiar neste backup como plano de recuperação de desastre real, siga o procedimento de restauração documentado em `BACKUP_ROTINA.md` pelo menos uma vez.

## Notificações push

Chaves VAPID em `.env` (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_CLAIMS_EMAIL`). O agendador (`start_push_scheduler()` em `src/main.py`) roda um cron job por segundo checando lembretes vencidos via `send_due_reminders`. Auditoria: `npm run notifications:audit-prod` (script em `scripts/notifications/`). Histórico de decisões de arquitetura do push está em `docs/PUSH_ENGINE_V2_RESET.md` e `docs/PUSH_NOTIFICATION_COMPARISON.md`.

## Checagem rápida de saúde

Não precisa de acesso ao VPS — tudo isso é HTTP público:
```bash
curl -sL https://www.petmol.com.br/api/health      # {"status":"ok",...}
curl -s -o /dev/null -w "%{http_code}\n" -L https://www.petmol.com.br/
```
Se a API responder mas o frontend não (502 só na home), o problema é o `petmol-web` especificamente, não o VPS inteiro — um deploy novo (ou `systemctl restart petmol-web` direto no VPS) normalmente resolve.

## Incidentes reais já enfrentados (e a lição de cada um)

- **Deploy corrompeu `node_modules`/`.next`**: dois deploys rodando ao mesmo tempo, sem trava nenhuma na época. Corrigido com a trava de concorrência descrita acima.
- **`flock` ficou preso mesmo sem processo nenhum rodando**: descritor de arquivo do lock era herdado por processos filhos (`npm`/`next build`) que sobreviviam ao processo pai em caso de crash. Corrigido fechando o descritor (`200>&-`) antes de spawnar esses processos, mais expiração automática do lock após 15 min como rede de segurança.
- **Reboot do VPS deixou uma run do GitHub Actions "presa" em `in_progress` para sempre**: a conexão SSH morreu mas o GitHub não percebeu, e como a trava de concorrência nunca cancela (`cancel-in-progress: false`), isso bloqueou a fila de deploys indefinidamente. Corrigido com `timeout-minutes: 10` no job — nenhum deploy real leva mais que ~5 min, então um travado morre sozinho bem antes de virar um problema.
- **`DELETE /auth/me` quebrava com 500 pra todo mundo**: a lista de tabelas a apagar incluía `care_plans`, uma tabela que nunca existiu no schema real. Exclusão de conta esteve efetivamente quebrada até ser descoberta por um teste automatizado que exercitou o fluxo de ponta a ponta — nenhuma tela acusava esse erro previamente.
