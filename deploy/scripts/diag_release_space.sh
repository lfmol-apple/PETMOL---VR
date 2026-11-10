#!/usr/bin/env bash
# Somente leitura: tamanho de cada release, espaço em disco e se o usuário de
# deploy conseguiria gravar numa pasta de preservação de release.
# Executado via STDIN do SSH (bash -s): nada é copiado para a VPS nem criado em /tmp.
# Nenhuma escrita, nenhum restart, nenhum deploy, nenhuma leitura de segredos.
set -uo pipefail

ROOT=/opt/petmol

echo "--- release ativa ---"
readlink -f "$ROOT/current" 2>&1 || echo "MISSING"

echo "--- releases (mais nova primeiro) ---"
ls -1t "$ROOT/releases" 2>&1

echo "--- tamanho de cada release ---"
du -sh "$ROOT"/releases/* 2>&1 | sort -k2

echo "--- tamanho total de releases/ ---"
du -sh "$ROOT/releases" 2>&1

echo "--- espaço em disco (filesystem de $ROOT) ---"
df -h "$ROOT" 2>&1
echo "--- inodes ---"
df -i "$ROOT" 2>&1

echo "--- conteúdo de $ROOT (nomes, donos, datas; sem ler arquivos) ---"
ls -la --time-style=long-iso "$ROOT" 2>&1

echo "--- tamanho de shared/ por subpasta (sem listar nomes de arquivos) ---"
du -sh --max-depth=1 "$ROOT/shared" 2>&1

echo "--- candidato de destino: $ROOT/protected-releases ---"
if [ -e "$ROOT/protected-releases" ]; then
    ls -la --time-style=long-iso "$ROOT/protected-releases" 2>&1
else
    echo "não existe ainda"
fi
if [ -w "$ROOT" ]; then echo "usuário $(id -un) PODE criar pastas em $ROOT"; else echo "usuário $(id -un) NÃO pode criar pastas em $ROOT"; fi

echo "--- o prune do activate.sh mexe só em releases/ (KEEP_RELEASES) ---"
grep -n "KEEP_RELEASES=" "$ROOT/current/deploy/release/activate.sh" 2>&1 | head -2
