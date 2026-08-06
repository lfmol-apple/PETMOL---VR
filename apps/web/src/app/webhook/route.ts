import { spawn, execSync } from 'child_process'
import { createPublicKey, createVerify } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { NextRequest } from 'next/server'

const REPO = 'lfmol-apple/PETMOL---VR'
const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com'
const GITHUB_OIDC_AUDIENCE = 'petmol-deploy'
const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`

type DeployRequest = {
  token?: string
  url?: string
  oidcToken?: string
}

type JwtHeader = {
  alg?: string
  kid?: string
  typ?: string
}

type JwtClaims = {
  aud?: string | string[]
  exp?: number
  iat?: number
  iss?: string
  nbf?: number
  ref?: string
  repository?: string
}

type JwksKey = {
  alg?: string
  e?: string
  kid?: string
  kty?: string
  n?: string
  use?: string
}

function decodeBase64UrlJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T
}

function audienceMatches(aud: JwtClaims['aud']) {
  return Array.isArray(aud)
    ? aud.includes(GITHUB_OIDC_AUDIENCE)
    : aud === GITHUB_OIDC_AUDIENCE
}

async function verifyGitHubOidcToken(token: string): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 3) return false

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  let header: JwtHeader
  let claims: JwtClaims
  try {
    header = decodeBase64UrlJson<JwtHeader>(encodedHeader)
    claims = decodeBase64UrlJson<JwtClaims>(encodedPayload)
  } catch {
    return false
  }

  if (header.alg !== 'RS256' || !header.kid) return false

  const now = Math.floor(Date.now() / 1000)
  if (claims.iss !== GITHUB_OIDC_ISSUER) return false
  if (!audienceMatches(claims.aud)) return false
  if (claims.repository !== REPO) return false
  if (claims.ref !== 'refs/heads/main') return false
  if (typeof claims.exp !== 'number' || claims.exp <= now) return false
  if (typeof claims.nbf === 'number' && claims.nbf > now + 30) return false
  if (typeof claims.iat === 'number' && claims.iat > now + 30) return false

  const jwksResponse = await fetch(GITHUB_OIDC_JWKS_URL, { cache: 'no-store' })
  if (!jwksResponse.ok) return false

  const jwks = (await jwksResponse.json()) as { keys?: JwksKey[] }
  const jwk = jwks.keys?.find((key) => key.kid === header.kid)
  if (!jwk) return false

  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${encodedHeader}.${encodedPayload}`)
  verifier.end()

  try {
    const publicKey = createPublicKey({
      key: jwk,
      format: 'jwk',
    } as Parameters<typeof createPublicKey>[0])
    return verifier.verify(publicKey, Buffer.from(encodedSignature, 'base64url'))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  let body: DeployRequest = {}
  try { body = await req.json() } catch { /* ignore */ }

  const tokenFile = '/opt/petmol/deploy-token'
  const expected = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : null
  const tokenAuthorized = Boolean(expected && body.token === expected)
  const oidcAuthorized = body.oidcToken ? await verifyGitHubOidcToken(body.oidcToken) : false

  if (!tokenAuthorized && !oidcAuthorized) {
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
