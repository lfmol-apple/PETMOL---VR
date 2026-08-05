# Rotina de Backup (PETMOL)

Objetivo: gerar backup automatico dos dados criticos que nao estao no Git.

## O que entra no backup

- `analysis/`
- `uploads/`
- `services/price-service/uploads/`
- Dump do Postgres (`pg_dump -Fc`), quando `DATABASE_URL` do backend aponta para Postgres — é o caso de producao. Isso e o que realmente contem usuarios, pets, vacinas, racao e medicacao.
- `services/price-service/petmol.db`, quando existir (SQLite — so em ambiente local/dev; nao existe em producao)
- `services/price-service/push_subscriptions.json`
- `.env` (raiz, web, functions, backend), quando existir

Se `DATABASE_URL` for Postgres e `pg_dump` falhar (ou nao estiver instalado), o script para com erro em vez de gerar um backup incompleto silenciosamente.

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

Copia secundaria (recomendado):

```bash
BACKUP_MIRROR_DIR="/Volumes/BackupExterno/petmol" npm run backup:run
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
