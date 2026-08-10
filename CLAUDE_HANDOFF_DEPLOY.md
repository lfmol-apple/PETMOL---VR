# Handoff para Claude - Deploy PETMOL

Data: 2026-08-10

## Atualizacao de acesso - 2026-08-10

Teste executado a partir deste workspace em 2026-08-10:

```bash
ssh -vvv -o BatchMode=yes -o ConnectTimeout=30 root@147.93.33.24 'hostname; whoami; date'
```

Resultado relevante:

```text
Connecting to 147.93.33.24 [147.93.33.24] port 22.
Connection established.
Local version string SSH-2.0-OpenSSH_9.9
kex_exchange_identification: read: Operation timed out
banner exchange: Connection to 147.93.33.24 port 22: Operation timed out
```

Conclusao: a porta 22 aceita TCP, mas o servidor nao envia o banner SSH. Nao
e falha de senha/chave, porque a autenticacao nem comeca.

Producao HTTP/HTTPS esta acessivel:

```bash
curl -I --connect-timeout 10 http://147.93.33.24
curl -I --connect-timeout 10 https://www.petmol.com.br/
curl -sS --connect-timeout 10 https://www.petmol.com.br/version.json
```

Resultados observados:

```text
http://147.93.33.24 -> HTTP/1.1 308 Permanent Redirect
Server: nginx/1.24.0 (Ubuntu)
Location: https://www.petmol.com.br/

https://www.petmol.com.br/ -> HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
X-Powered-By: Next.js

version.json -> {"v":"4509084d7673944287c74c5fd29df1ea701259a2-1786155743"}
```

Isso prova que a producao web esta no ar e no commit atual `4509084`, mas o
canal SSH inbound esta quebrado. Para corrigir o servidor agora, use o Web
Console da Hostinger (`srv1335464.hstgr.cloud`, usuario `root`) e rode:

```bash
set -euxo pipefail

date
hostname
whoami

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

ufw status verbose || true
iptables -S || true
ss -ltnp | grep -E ':(22|2222)\b'
```

Depois do console, testar daqui:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=15 root@147.93.33.24 'hostname; whoami; date'
ssh -p 2222 -o BatchMode=yes -o ConnectTimeout=15 root@147.93.33.24 'hostname; whoami; date'
```

Se porta 2222 passar, configurar o GitHub secret `VPS_PORT=2222` para os
workflows usarem a porta alternativa. Se nenhuma porta passar, verificar as
regras de firewall no painel Hostinger e liberar TCP 22 e/ou 2222.

## Correcao aplicada via Web Console - 2026-08-10

Foi usado o Web Console da Hostinger aberto em
`https://asc.hostingervps.com/1065/`.

Comandos aplicados no VPS:

```bash
cat >/etc/ssh/sshd_config.d/99-petmol-ports.conf <<'CONF'
Port 22
Port 2222
CONF

sshd -t
systemctl disable --now ssh.socket || true
systemctl enable ssh
systemctl restart ssh
```

Nao foram alteradas as politicas de autenticacao (`PermitRootLogin`,
`PasswordAuthentication`, chaves, senhas etc.).

Evidencia no VPS:

```text
sshd: Server listening on 0.0.0.0 port 2222.
sshd: Server listening on 0.0.0.0 port 22.
Accepted publickey for root from 135.232.208.136 ...
```

Resultado apos push do commit `7537051`:

```text
CI 31395780233: success
Deploy atomic 31396136881: success
https://www.petmol.com.br/version.json:
{"v":"753705196e29044936fc41a876a960918affe10a-1786370556"}
https://www.petmol.com.br/api/health:
{"status":"ok","version":"0.1.0","providers":["mercadolivre"]}
```

Observacao: o ambiente local desta sessao ainda recebeu timeout no banner ao
tentar `ssh root@147.93.33.24`, mas o GitHub Actions acessou e implantou com
sucesso depois da correcao. Para deploy operacional, o canal GitHub Actions
esta validado.

## Estado atual resumido

- Branch local: `main`
- `HEAD` antes desta segunda correcao: `6cb6755 Add regression test: manual GTIN confirmation clears the negative cache`
- `origin/main` antes desta segunda correcao: `6cb6755`
- CI do commit `6cb6755`: passou (`31120875967`)
- Deploys do commit `6cb6755`: falharam (`31123361530`, `31123461547`)
- Ultimo deploy bem-sucedido visto no GitHub: `1227ef9` (`31111253246`)
- Site/API continuaram no ar durante a investigacao: `https://petmol.com.br/api/health` retornou `308`
- SSH para `root@147.93.33.24` falhou nesta segunda investigacao com timeout antes do banner:
  `Connection timed out during banner exchange`

## O que eu fiz na primeira intervencao

Commit ja pushado:

- `fd23a07 Disable legacy VPS auto deploy timer`

Arquivo alterado:

- `deploy/sync/apply_on_vps.sh`

Diagnostico naquele momento:

- Existia um segundo orquestrador no VPS: `petmol-auto-deploy.timer`
- Ele rodava `/opt/petmol/scripts/auto_deploy.sh` a cada 2 minutos
- Ele chamava `deploy/sync/apply_on_vps.sh` por fora do GitHub Actions
- Ele podia competir pelo lock `/opt/petmol/.deploy.lock`

Acao:

- Desativei `petmol-auto-deploy.timer` no VPS.
- Adicionei protecao no inicio de `apply_on_vps.sh` para desativar esse timer legado se ele existir.

Resultado na hora:

- Deploy oficial do commit `fd23a07` passou (`31105409156`)
- Producao ficou em `fd23a075d4d5477929213870af482001020cee7f` em `2026-08-06T13:22:19Z`

## Novo problema observado depois

Depois, `main` avancou para `1227ef9` e depois `6cb6755`.

O deploy de `1227ef9` passou (`31111253246`), mas os deploys de `6cb6755` falharam rapido.

Sinal mais importante:

```text
Connection timed out during banner exchange
Connection to 147.93.33.24 port 22 timed out
```

Isso indica que o problema atual nao e build longo nem lock concorrente: o runner/local nao consegue abrir uma sessao SSH estavel no VPS antes de enviar o zip/aplicar deploy.

Nota importante: o auto-deploy legado era ruim por competir com Actions, mas tambem era um caminho pull-based que nao dependia de SSH inbound. Como ele foi desligado, quando a porta 22 fica indisponivel o deploy oficial nao tem fallback.

## Segunda correcao aplicada agora

Commit pushado:

- `ebb94e3 Retry VPS SSH deploy connection`

Arquivo alterado:

- `.github/workflows/deploy.yml`

Mudancas:

- `timeout-minutes` do job aumentou de `10` para `20`.
- `SSH_OPTS` agora usa:
  - `ConnectTimeout=15`
  - `ServerAliveInterval=10`
  - `ServerAliveCountMax=2`
- Adicionados retries no workflow oficial:
  - `ssh_retry` para preflight SSH
  - `scp_retry` para upload do zip
  - `ssh_stdin_retry` para aplicar `deploy/sync/apply_on_vps.sh` via stdin reabrindo o arquivo a cada tentativa
- Janela de retry: ate 480s, com backoff de 10s ate 40s.

Validacao local:

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/deploy.yml"); puts "yaml ok"'
```

Resultado:

```text
yaml ok
```

Status apos push:

- CI criada para `ebb94e3`: `31125070012`
- Estado observado depois: `completed/failure`, com os dois jobs `cancelled`
- Jobs cancelados:
  - `Backend — compile check + tests`
  - `Frontend — typecheck + lint + build`
- No mesmo periodo, GitHub Status reportava `Actions: major_outage`.
- Nenhum deploy novo foi criado porque o deploy depende de `workflow_run` da CI com conclusao `success`.
- SSH direto para o VPS continuava falhando antes do banner:
  `Connection timed out during banner exchange`.
- Tentativa de habilitar `Port 2222` via `/etc/ssh/sshd_config.d/99-petmol-ports.conf`
  nao abriu a porta 2222. O `ss -ltnp` mostrou apenas `:22`, com `systemd`
  tambem dono do socket. Diagnostico: Ubuntu 24 esta usando `ssh.socket`
  para socket activation; nesse modo, adicionar `Port 2222` no `sshd_config`
  nao cria novo listener enquanto o `ssh.socket` continuar configurado apenas
  para `ListenStream=22`.
- HTTP/HTTPS de producao estavam saudaveis:
  - `https://www.petmol.com.br/` retornou `200`
  - `https://petmol.com.br/api/health` retornou `308` (aceito pelo workflow)

## Terceira correcao: fallback HTTP automatizado

Atualizacao mais recente: o usuario pediu outra abordagem, sem continuar
tentando consertar SSH no escuro. A rota adotada foi o deploy via webhook HTTP
ja existente em `apps/web/src/app/webhook/route.ts`.

O webhook atual:

- `POST https://www.petmol.com.br/webhook`
- Valida o token contra `/opt/petmol/deploy-token`
- Quando recebe `url`, baixa o `.tar.gz`, extrai em
  `/opt/petmol/app/apps/web` e reinicia `petmol-web`
- Nao atualiza backend, `REVISION`, nem roda o deploy completo de
  `deploy/sync/apply_on_vps.sh`

Recuperacao manual ja executada:

- `/tmp/petmol-standalone-ebb94e3-webhook.tar.gz`
- Publicado temporariamente no commit `d9fa583` em
  `deploy/releases/petmol-standalone-ebb94e3-webhook.tar.gz`
- Webhook acionado com sucesso
- Producao validada em:
  `{"v":"ebb94e3-webhook-1786041298"}`

Correcao estrutural aplicada depois:

- Commit pushado: `b56eb17 Add webhook deploy fallback`
- `.github/workflows/deploy.yml` agora mantem o deploy completo por SSH como
  caminho principal.
- Se o SSH falhar, o workflow:
  1. instala dependencias com `npm ci --legacy-peer-deps`;
  2. marca `apps/web/public/version.json`;
  3. roda `npm run web:build`;
  4. empacota `apps/web/.next/standalone`;
  5. cria um GitHub Release asset com `GITHUB_TOKEN`;
  6. pede um token OIDC do GitHub Actions com audience `petmol-deploy`;
  7. aciona `POST https://www.petmol.com.br/webhook` sem `url`, para o VPS
     baixar o latest release usando o token dele em `/opt/petmol/.github-env`.

Atualizacao posterior:

- O fallback nao depende mais de secret `DEPLOY_WEBHOOK_TOKEN`.
- `apps/web/src/app/webhook/route.ts` aceita o token manual antigo ou um
  `oidcToken` assinado pelo GitHub.
- O webhook valida:
  - issuer `https://token.actions.githubusercontent.com`;
  - audience `petmol-deploy`;
  - repository `lfmol-apple/PETMOL---VR`;
  - ref `refs/heads/main`;
  - assinatura RS256 contra JWKS oficial do GitHub.
- `.github/workflows/deploy.yml` agora tem `permissions.id-token: write`.

Validar com:

```bash
curl -sS https://www.petmol.com.br/version.json
```

Resultado esperado:

```json
{"v":"<sha>-webhook-<timestamp>"}
```

Observacao: nao publicar o token do webhook em logs, commits ou mensagens.

## Proximos passos recomendados para Claude

1. Quando GitHub Actions sair de `major_outage`, disparar uma nova CI para `main` ou rerun da `31125070012`.
2. Acompanhar a CI e o deploy que ela disparar.
3. Se SSH falhar, confirmar que o fallback criou release, obteve OIDC e acionou o webhook.
4. Se o fallback falhar por OIDC, verificar `permissions.id-token: write` e audience `petmol-deploy`.
5. Se a CI passar e o deploy ainda falhar com SSH banner timeout depois de 480s de retry, o problema de SSH continua fora do repo: porta 22/sshd/firewall/provider do VPS.
6. Nesse caso, usar o console web da Hostinger para corrigir `sshd`/firewall ou reiniciar o VPS. Sem SSH e sem Actions, nao ha canal tecnico disponivel daqui para alterar o servidor.
   - Para porta alternativa em Ubuntu 24 com `ssh.socket`, criar override do socket:
     `systemctl edit ssh.socket` ou arquivo em `/etc/systemd/system/ssh.socket.d/override.conf`
     limpando `ListenStream=` e adicionando `ListenStream=22` e `ListenStream=2222`,
     depois `systemctl daemon-reload && systemctl restart ssh.socket ssh`.
7. Nao reativar simplesmente `petmol-auto-deploy.timer` sem redesenhar:
   - se usar pull-based deploy, ele deve ser o unico orquestrador;
   - o workflow SSH push deve ser desativado ou convertido em apenas CI/status;
   - o timer deve ter timeout finito e lock robusto.

## Comandos uteis

```bash
git status --short
git log --oneline -8 --decorate
```

```bash
curl -sS 'https://api.github.com/repos/lfmol-apple/PETMOL---VR/actions/runs?branch=main&per_page=6' \
  | jq -r '.workflow_runs[] | [.id,.name,.head_sha[0:7],.status,(.conclusion // "null"),.created_at,.html_url] | @tsv'
```

```bash
ssh root@147.93.33.24 "cat /opt/petmol/app/REVISION 2>/dev/null || true"
ssh root@147.93.33.24 "systemctl is-enabled petmol-auto-deploy.timer 2>/dev/null || true; systemctl is-active petmol-auto-deploy.timer 2>/dev/null || true"
ssh root@147.93.33.24 "lsof /opt/petmol/.deploy.lock 2>&1 || true"
```

```bash
curl -sS -o /dev/null -w 'api %{http_code}\n' https://petmol.com.br/api/health
```

## Workspace local

Arquivos sujos pre-existentes/gerados que nao fazem parte da correcao de deploy:

- `apps/web/tsconfig.tsbuildinfo`
- `services/price-service/src/petmol_price_service.egg-info/PKG-INFO`
- `services/price-service/src/petmol_price_service.egg-info/SOURCES.txt`
- `services/price-service/src/petmol_price_service.egg-info/requires.txt`
- `services/price-service/src/petmol_price_service.egg-info/top_level.txt`
