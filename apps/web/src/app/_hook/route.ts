import { spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  let body: { token?: string } = {}
  try { body = await req.json() } catch { /* ignore */ }

  const tokenFile = '/opt/petmol/deploy-token'
  const expected = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : null

  if (!expected || body.token !== expected) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const script = '/opt/petmol/deploy_pull.sh'
  if (!existsSync(script)) {
    return Response.json({ error: 'deploy_pull.sh não encontrado' }, { status: 500 })
  }

  spawn('bash', [script], { detached: true, stdio: 'ignore' }).unref()

  return Response.json({ ok: true, message: 'Deploy iniciado' })
}
