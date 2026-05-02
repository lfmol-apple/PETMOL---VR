import { NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const INTERNAL_SECRET = process.env.INTERNAL_HEALTH_SECRET ?? '';

/**
 * GET /api/internal/push-health
 *
 * Sentinel endpoint — pode ser monitorado externamente (UptimeRobot, etc.).
 * Verifica se o serviço de push do backend está acessível.
 *
 * Protegido por header "x-internal-secret" se INTERNAL_HEALTH_SECRET estiver definido.
 */
export async function GET(req: Request) {
  if (INTERNAL_SECRET) {
    const incoming = req.headers.get('x-internal-secret') ?? '';
    if (incoming !== INTERNAL_SECRET) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  const start = Date.now();

  try {
    const res = await fetch(`${API_BASE_URL}/notifications/vapid-public-key`, {
      signal: AbortSignal.timeout(5000),
    });

    const latency_ms = Date.now() - start;

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `backend_status_${res.status}`, latency_ms },
        { status: 502 },
      );
    }

    const data = await res.json();
    const hasKey = typeof data?.publicKey === 'string' && data.publicKey.length > 10;

    if (!hasKey) {
      return NextResponse.json(
        { ok: false, error: 'vapid_key_missing', latency_ms },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, latency_ms, timestamp: new Date().toISOString() });
  } catch (err) {
    const latency_ms = Date.now() - start;
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      { ok: false, error: message, latency_ms },
      { status: 503 },
    );
  }
}
