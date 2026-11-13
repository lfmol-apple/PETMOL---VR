/**
 * Cliente das campanhas push segmentadas (Etapas 1–3 do backend). Só fala com /api/v1/admin/push-campaigns/*
 * (e com o /link-preview do envio avulso, que apenas CONFERE um link: não envia nada).
 */
import { getToken } from '@/lib/auth-token';

const BASE = '/api/v1/admin/push-campaigns';

export class ApiError extends Error {
  status: number;
  code: string;
  extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** Chamada JSON. `status 0` = a rede falhou (não sabemos se o servidor recebeu). */
export async function call<T>(path: string, body?: unknown, opts: { base?: string; method?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${opts.base ?? BASE}${path}`, {
      method: opts.method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'network', 'Sem conexão com o servidor. Nada foi confirmado: confira o histórico antes de tentar de novo.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      const { code, message, ...extra } = d as Record<string, unknown>;
      throw new ApiError(res.status, String(code ?? `http_${res.status}`), String(message ?? `Erro ${res.status}`), extra);
    }
    if (Array.isArray(d)) throw new ApiError(res.status, 'invalid_filter', d.map((e: { msg?: string }) => e?.msg ?? '').filter(Boolean).join('; ') || `Erro ${res.status}`);
    throw new ApiError(res.status, `http_${res.status}`, typeof d === 'string' ? d : `Erro ${res.status}`);
  }
  return data as T;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export type RecipientState = 'reserved' | 'sending' | 'accepted' | 'failed' | 'uncertain';
export type Counts = Record<RecipientState, number>;
export type BatchPhase = 'reserved' | 'sending' | 'done' | 'interrupted' | 'error';

export interface FieldInfo {
  field: string; label: string; group: string; scope: 'tutor' | 'pet'; ops: string[]; values: (string | boolean)[] | null;
  approximate: boolean; origin: string; precision: string;
}
export interface FieldsResponse { fields: FieldInfo[]; activity_note: string; location_origins: Record<string, string> }

export interface AudienceWarning { code: string; level: string; text: string }
export interface AudienceCount {
  matches: number; reachable: number; not_reachable: { no_push: number; opt_out: number };
  used: number; used_in_campaign_total: number; available: number; next_batch: number | null;
  by_platform: { ios: number; android: number; web: number; mais_de_um_canal: number };
  rules: { field: string; label: string; origin: string; precision: string; coverage: { with_data: number; total: number; unit: string; percent: number | null } | null }[];
  warnings: AudienceWarning[];
}

export interface BatchMetrics { delivered: number; tapped: number; opened: number; acted: number }
export interface Batch {
  id: string; campaign_id: string; batch_no: number; phase: BatchPhase; created_at: string | null;
  requested: number | 'all' | null; reserved: number | null; counts: Counts; interrupted_suspected: boolean; accepted_note: string;
  metrics?: BatchMetrics | null;
}
export interface CampaignContent { title: string | null; message: string; goal: string | null; destination: string | null; product_url: string | null; product_title: string | null }
export interface Campaign {
  id: string; name: string; status: 'draft' | 'active' | 'closed' | string; created_at: string | null; content_locked: boolean;
  content: CampaignContent; used_total: number; counts: Counts; batches: Batch[];
}
export interface CampaignListItem { id: string; name: string; status: string; content_locked: boolean; created_at: string | null; counts: Counts }

export interface BatchPreview {
  campaign_id: string; counts: AudienceCount; available: number; will_reserve: number; smaller_than_requested: boolean;
  can_reserve: boolean; blocking_batch: { id: string; batch_no: number } | null; content: CampaignContent & Record<string, unknown>;
  next_batch_no: number; confirmation: string | null; token: string | null; expires_at: string | null;
}
export interface ReserveResult { batch: Batch; idempotent_replay: boolean; started: boolean }

/** Chave de idempotência: uma por PRÉVIA. Repetir a mesma chave devolve o mesmo lote (nunca reserva duas vezes). */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return `pc-${c.randomUUID()}`;
  return `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Mensagens da interface para os códigos de erro do backend (o texto do servidor entra como complemento, quando útil). */
export function explainError(e: unknown): { text: string; needsNewPreview: boolean; retrySameKey: boolean } {
  if (!(e instanceof ApiError)) return { text: (e as Error)?.message || 'Erro inesperado.', needsNewPreview: false, retrySameKey: false };
  switch (e.code) {
    case 'network':
      return { text: e.message, needsNewPreview: false, retrySameKey: true };
    case 'token_expired':
      return { text: 'A prévia expirou (vale 10 minutos). Nada foi reservado. Gere uma nova prévia e confira de novo.', needsNewPreview: true, retrySameKey: false };
    case 'preview_stale':
    case 'audience_changed':
      return { text: 'O público mudou entre a prévia e a confirmação (ou os filtros/quantidade/conteúdo não são mais os da prévia). Nada foi reservado. Gere uma nova prévia.', needsNewPreview: true, retrySameKey: false };
    case 'reservation_conflict':
      return { text: 'Outra operação reservou destinatários ao mesmo tempo. Nada foi reservado. Gere uma nova prévia.', needsNewPreview: true, retrySameKey: false };
    case 'invalid_token':
    case 'signing_key_missing':
      return { text: 'A prévia não é válida. Gere uma nova prévia.', needsNewPreview: true, retrySameKey: false };
    case 'no_one_available':
      return { text: 'Não há mais destinatários disponíveis para estes filtros nesta campanha.', needsNewPreview: true, retrySameKey: false };
    case 'batch_in_progress':
      return { text: 'Já existe um lote em andamento ou interrompido nesta campanha. Conclua-o antes de reservar outro.', needsNewPreview: false, retrySameKey: false };
    case 'campaign_closed':
      return { text: 'A campanha está encerrada.', needsNewPreview: false, retrySameKey: false };
    case 'bad_confirmation':
      return { text: e.message, needsNewPreview: false, retrySameKey: false };
    case 'idempotency_key_reused':
      return { text: 'Esta confirmação já foi usada para outra operação. Gere uma nova prévia.', needsNewPreview: true, retrySameKey: false };
    case 'invalid_filter':
    case 'invalid_content':
    case 'invalid_request':
      return { text: e.message, needsNewPreview: false, retrySameKey: false };
    default:
      return { text: e.message, needsNewPreview: false, retrySameKey: false };
  }
}
