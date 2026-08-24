# Rotina de Backup (PETMOL)

Objetivo: gerar backup automatico dos dados criticos que nao estao no Git.

## O que entra no backup

Arquivo principal (`petmol_HOST_TIMESTAMP.tar.gz`):

- `analysis/`
- `uploads/`
- `services/price-service/uploads/` — copiado com `tar -h` (dereferencia symlink): em producao esse caminho e um symlink pro diretorio compartilhado (ver `deploy/release/activate.sh`), e sem `-h` o tar arquivava o symlink vazio em vez do conteudo real — bug real, corrigido.
- Dump do Postgres (`pg_dump -Fc`), quando `DATABASE_URL` do backend aponta para Postgres — e o caso de producao. Isso e o que realmente contem usuarios, pets, vacinas, racao e medicacao.
- `services/price-service/petmol.db`, quando existir (SQLite — so em ambiente local/dev; nao existe em producao)
- `services/price-service/push_subscriptions.json`

Se `DATABASE_URL` for Postgres e `pg_dump` falhar (ou nao estiver instalado), o script para com erro em vez de gerar um backup incompleto silenciosamente.

O script le `DATABASE_URL` do `.env` do backend com `grep`/`cut`, nao com `source` do arquivo inteiro — algumas variaveis do `.env` (ex: um User-Agent com espacos e parenteses) nao sao bash valido, e um `source` ingenuo quebrava o backup inteiro com erro de sintaxe antes mesmo do `pg_dump` rodar. Bug real, encontrado ao preparar um teste de restore, corrigido.

### Secrets (`.env`) — arquivo separado, criptografado

`.env` (raiz, web, functions, backend) **nao entra mais no arquivo principal** — eles carregam JWT secret, credenciais de banco, chaves de API etc., e o arquivo principal e o que sai da VPS (ver off-site abaixo). Em vez disso:

- Se `BACKUP_ENCRYPTION_KEY` estiver definida no ambiente, os `.env` sao arquivados e criptografados (`openssl enc -aes-256-cbc -pbkdf2`) em `petmol_HOST_TIMESTAMP_secrets.tar.gz.enc`, com checksum proprio.
- Se `BACKUP_ENCRYPTION_KEY` **nao** estiver definida, os secrets simplesmente nao entram em nenhum backup (aviso impresso no log) — nunca em texto puro.
- A chave nunca deve ficar no repo nem dentro do proprio backup — guardar em um cofre de secrets separado (1Password, variavel de ambiente do host, etc).

Para decifrar (restauracao):

```bash
BACKUP_ENCRYPTION_KEY="a-mesma-chave-usada-no-backup" \
  openssl enc -d -aes-256-cbc -pbkdf2 \
  -in petmol_HOST_TIMESTAMP_secrets.tar.gz.enc \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -out secrets.tar.gz
```

### Copia off-site

`BACKUP_MIRROR_DIR` (abaixo) copia para outro caminho local/montado — util, mas nao conta como "fora da VPS" se for um disco da mesma maquina. Para uma copia que realmente sai do host, defina `BACKUP_OFFSITE_CMD` com qualquer comando que aceite um caminho de arquivo como ultimo argumento (`rclone copy ... --`, `rsync ... user@host:/dest/`, `aws s3 cp ... s3://bucket/`, etc) — o script chama esse comando pra cada arquivo gerado (arquivo principal, checksum, e o `.enc` de secrets quando existir). Sem `BACKUP_OFFSITE_CMD` definido, nada sai da VPS automaticamente.

## Execucao manual

No diretorio raiz do projeto:

```bash
npm run backup:run
```

Padrao:

- destino: `~/.petmol-backups`
- retencao: 30 dias

Variaveis opcionais:

```bash
BACKUP_DIR="/caminho/do/backup" RETENTION_DAYS=45 npm run backup:run
```

Copia secundaria local/montada:

```bash
BACKUP_MIRROR_DIR="/Volumes/BackupExterno/petmol" npm run backup:run
```

Secrets criptografados + copia off-site real (recomendado em producao):

```bash
BACKUP_ENCRYPTION_KEY="$(cat /caminho/seguro/fora/do/repo/backup.key)" \
BACKUP_OFFSITE_CMD="rclone copy --" \
  npm run backup:run
```

## Agendamento automatico (cron)

Agenda padrao: a cada 6 horas (`15 */6 * * *`).

```bash
npm run backup:install-cron
```

Customizando agenda/destino:

```bash
CRON_SCHEDULE="0 */4 * * *" BACKUP_DIR="$HOME/.petmol-backups" RETENTION_DAYS=30 npm run backup:install-cron
```

Logs do cron:

- `~/.petmol-backups/backup.log`

## Restauracao (manual)

Extrair o arquivo:

```bash
mkdir -p /tmp/petmol-restore
tar -xzf ~/.petmol-backups/petmol_HOST_DATA.tar.gz -C /tmp/petmol-restore
```

Verificacao de integridade:

```bash
cd ~/.petmol-backups
shasum -a 256 -c petmol_HOST_DATA.sha256
```

Restaurar o banco (Postgres) — **sempre em um banco separado, nunca sobrescrever o de producao diretamente**:

```bash
createdb petmol_restore_test
pg_restore -d petmol_restore_test /tmp/petmol-restore/services/price-service/_backup_db.dump
psql -d petmol_restore_test -c "select count(*) from users;"
```

So depois de conferir os dados nesse banco isolado (contagem de usuarios, pets, vacinas etc. bate com o esperado) e que faria sentido promover esse dump para substituir o banco real, em caso de recuperacao de desastre real.

## RPO / RTO

- **RPO alvo: ≤ 6 horas** — cron padrao roda a cada 6h (`15 */6 * * *`). Se o agendamento real em producao for mais espacado, o RPO efetivo e o intervalo do cron, nao este numero — conferir com `crontab -l` na VPS.
- **RTO**: teste de restore real executado em 2026-08-24 contra o mirror local de producao — `create-backup.sh` (com `BACKUP_DIR` apontando pra um diretorio temporario) → checksum conferido → `pg_restore --no-owner --no-privileges` num banco isolado (`petmol_restore_test`, nunca o de producao) → contagem de linhas comparada tabela a tabela contra o banco de origem. Todas as 14 tabelas criticas bateram exatamente (`users`, `pets`, `events`, `feeding_plans`, `vaccine_records`, `parasite_control_records`, `grooming_records`, `care_plans`, `push_subscriptions`, `reminders`, `missing_pets`, `found_reports`, `affiliate_feed_offers`, `marketplace_offers`). Fim a fim (dump + restore + verificacao) levou poucos minutos no tamanho atual do banco; o gargalo real numa recuperacao de desastre seria provisionar uma VPS nova, nao o restore em si. Banco e diretorio de teste foram descartados apos a verificacao.
