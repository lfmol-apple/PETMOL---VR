import { readFileSync } from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';

type SyncStatus = {
  running?: boolean;
  total?: number;
  processed?: number;
  matched?: number;
  percent?: number;
  remaining?: number;
  match_rate?: number;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
};

const BACKEND_URL = process.env.PETMOL_INTERNAL_API_URL || 'http://127.0.0.1:8000';

function readShopeeSyncToken() {
  if (process.env.SHOPEE_SYNC_TRIGGER_TOKEN) {
    return process.env.SHOPEE_SYNC_TRIGGER_TOKEN;
  }

  const envPaths = [
    '/opt/petmol/shared/env/api.env',
    `${process.cwd()}/../../services/price-service/.env`,
    `${process.cwd()}/services/price-service/.env`,
  ];

  for (const path of envPaths) {
    try {
      const content = readFileSync(path, 'utf8');
      const line = content
        .split('\n')
        .find((entry) => entry.trim().startsWith('SHOPEE_SYNC_TRIGGER_TOKEN='));
      if (!line) continue;
      return line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    } catch {
      // Try the next known deployment/local path.
    }
  }

  return null;
}

function withComputedFields(status: SyncStatus) {
  const total = Number(status.total ?? 0);
  const processed = Number(status.processed ?? 0);
  const matched = Number(status.matched ?? 0);
  const percent = total > 0 ? Math.round((processed / total) * 10000) / 100 : 0;
  const matchRate = processed > 0 ? Math.round((matched / processed) * 10000) / 100 : 0;

  return {
    running: Boolean(status.running),
    total,
    processed,
    matched,
    percent: typeof status.percent === 'number' ? status.percent : percent,
    remaining: typeof status.remaining === 'number' ? status.remaining : Math.max(total - processed, 0),
    match_rate: typeof status.match_rate === 'number' ? status.match_rate : matchRate,
    started_at: status.started_at ?? null,
    finished_at: status.finished_at ?? null,
    error: status.error ?? null,
  };
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return NextResponse.json({ detail: 'Não autenticado' }, { status: 401 });
  }

  const adminCheck = await fetch(`${BACKEND_URL}/v1/admin/stats`, {
    headers: { Authorization: authorization },
    cache: 'no-store',
  });
  if (!adminCheck.ok) {
    return NextResponse.json({ detail: 'Sem permissão' }, { status: adminCheck.status });
  }

  const token = readShopeeSyncToken();
  if (!token) {
    return NextResponse.json({ detail: 'Token do sync Shopee não configurado no servidor' }, { status: 503 });
  }

  const statusResponse = await fetch(`${BACKEND_URL}/v1/admin/shopee-sync/status`, {
    headers: { 'X-Sync-Token': token },
    cache: 'no-store',
  });
  if (!statusResponse.ok) {
    return NextResponse.json({ detail: 'Não foi possível ler o progresso do sync' }, { status: statusResponse.status });
  }

  return NextResponse.json(withComputedFields(await statusResponse.json()));
}
