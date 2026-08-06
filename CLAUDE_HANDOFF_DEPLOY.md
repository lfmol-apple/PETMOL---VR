# Handoff para Claude - Deploy PETMOL

Data: 2026-08-06

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

## Proximos passos recomendados para Claude

1. Confirmar se o commit desta segunda correcao foi pushado.
2. Acompanhar a CI e o deploy que ela disparar.
3. Se o deploy ainda falhar com SSH banner timeout depois de 480s de retry, o problema esta fora do repo: porta 22/sshd/firewall/provider do VPS.
4. Nesse caso, nao reativar simplesmente `petmol-auto-deploy.timer` sem redesenhar:
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

