import { spawn, execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { NextRequest } from 'next/server'

const REPO = 'lfmol-apple/PETMOL---VR'

export async function POST(req: NextRequest) {
  let body: { token?: string; url?: string } = {}
  try { body = await req.json() } catch { /* ignore */ }

  const tokenFile = '/opt/petmol/deploy-token'
  const expected = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : null

  if (!expected || body.token !== expected) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try { execSync('pkill -f petmol-deploy 2>/dev/null', { timeout: 3000 }) } catch { /* ok */ }
  try { execSync('pkill -f "curl.*release-assets" 2>/dev/null', { timeout: 3000 }) } catch { /* ok */ }

  const envFile = '/opt/petmol/.github-env'
  if (!existsSync(envFile)) {
    return Response.json({ error: '.github-env não encontrado' }, { status: 500 })
  }
  const envContent = readFileSync(envFile, 'utf8')
  const tokenMatch = envContent.match(/GITHUB_TOKEN[=\s]+['"]?([^\s'"]+)['"]?/)
  const ghToken = tokenMatch?.[1]
  if (!ghToken) {
    return Response.json({ error: 'GITHUB_TOKEN não encontrado em .github-env' }, { status: 500 })
  }

  const LOG = '/var/log/petmol-deploy.log'
  const scriptPath = `/tmp/petmol-deploy-${Date.now()}.sh`

  let script: string

  if (body.url) {
    const url = (body.url as string).replace(/'/g, '').replace(/"/g, '')
    script = `#!/bin/bash
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
LOG='${LOG}'
echo "=== Deploy (url) start $(date) ===" >> "$LOG"
/usr/bin/curl -fL --max-time 300 '${url}' | /usr/bin/tar -xzC /opt/petmol/app/apps/web --no-same-owner
echo "Extract OK $(date)" >> "$LOG"
/usr/bin/systemctl restart petmol-web
echo "Restart OK $(date)" >> "$LOG"`
  } else {
    script = `#!/bin/bash
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
GH_TOKEN='${ghToken}'
LOG='${LOG}'
echo "=== Deploy start $(date) ===" >> "$LOG"
LATEST=$(/usr/bin/curl -sf --max-time 15 -H "Authorization: token $GH_TOKEN" -H "User-Agent: petmol-deploy" "https://api.github.com/repos/${REPO}/releases/latest")
if [ -z "$LATEST" ]; then echo "ERRO: sem resposta da API GitHub" >> "$LOG"; exit 1; fi
echo "Got metadata" >> "$LOG"
ASSET_ID=$(echo "$LATEST" | /usr/bin/python3 -c "import sys,json;print(json.load(sys.stdin)['assets'][0]['id'])" 2>>"$LOG")
echo "Asset ID: $ASSET_ID" >> "$LOG"
DL_URL=$(/usr/bin/curl -s --max-time 15 -o /dev/null -w "%{redirect_url}" -H "Authorization: token $GH_TOKEN" -H "Accept: application/octet-stream" -H "User-Agent: petmol-deploy" "https://api.github.com/repos/${REPO}/releases/assets/$ASSET_ID")
echo "DL_URL: $DL_URL" >> "$LOG"
if [ -z "$DL_URL" ]; then echo "ERRO: DL_URL vazia" >> "$LOG"; exit 1; fi
/usr/bin/curl -fL --max-time 300 "$DL_URL" | /usr/bin/tar -xzC /opt/petmol/app/apps/web --no-same-owner
echo "Extract OK $(date)" >> "$LOG"
/usr/bin/systemctl restart petmol-web
echo "Restart OK $(date)" >> "$LOG"`
  }

  try {
    writeFileSync(scriptPath, script, { mode: 0o755 })
  } catch (e) {
    return Response.json({ error: `Falha ao escrever script: ${e}` }, { status: 500 })
  }

  spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' }).unref()
  return Response.json({ ok: true, message: 'Deploy iniciado', script: scriptPath })
}
