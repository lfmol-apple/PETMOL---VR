# Rotina de Backup (PETMOL)

Objetivo: gerar backup automatico dos dados criticos que nao estao no Git.

## O que entra no backup

- `analysis/`
- `uploads/`
- `services/price-service/uploads/`
- `services/price-service/petmol.db`
- `services/price-service/push_subscriptions.json`
- `.env` (raiz, web, functions, backend), quando existir

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

Exemplo de restauracao:

```bash
mkdir -p /tmp/petmol-restore
tar -xzf ~/.petmol-backups/petmol_HOST_DATA.tar.gz -C /tmp/petmol-restore
```

Verificacao de integridade:

```bash
cd ~/.petmol-backups
shasum -a 256 -c petmol_HOST_DATA.sha256
```
