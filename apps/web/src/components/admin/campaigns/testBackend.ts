/* eslint-disable @typescript-eslint/no-explicit-any -- servidor falso de teste: corpos JSON livres */
/** Servidor FALSO para os testes da interface de campanhas: nada sai da memória, nenhum push real existe aqui. */
import { vi } from 'vitest';
import fields from './fields.fixture.json';

export interface Call { method: string; path: string; body?: any }
type Handler = (body: any, ctx: Backend) => { status?: number; json: unknown } | Promise<{ status?: number; json: unknown }>;

const zero = () => ({ reserved: 0, sending: 0, accepted: 0, failed: 0, uncertain: 0 });

export class Backend {
  enabled = true;
  calls: Call[] = [];
  campaigns: any[] = [];
  available = 120;                    // tutores disponíveis para o próximo lote
  used = 0;
  overrides = new Map<string, Handler[]>();  // "METHOD path" → fila de respostas pontuais
  delayMs = 0;
  seq = 0;

  on(key: string, h: Handler) { const q = this.overrides.get(key) ?? []; q.push(h); this.overrides.set(key, q); }
  count(method: string, pathEnd: string) { return this.calls.filter((c) => c.method === method && c.path.endsWith(pathEnd)).length; }
  last(method: string, pathEnd: string) { return [...this.calls].reverse().find((c) => c.method === method && c.path.endsWith(pathEnd)); }

  addCampaign(p: Partial<any> = {}) {
    const c = {
      id: `camp${++this.seq}`, name: 'Ração gatos', status: 'active', created_at: '2026-11-13T12:00:00Z', content_locked: false,
      content: { title: '{tutor}, ração para {pets}', message: 'Oferta de ração.', goal: null, destination: 'home', product_url: null, product_title: null },
      used_total: 0, counts: zero(), batches: [], ...p,
    };
    this.campaigns.push(c);
    return c;
  }
  addBatch(c: any, p: Partial<any>) {
    const b = { id: `bat${++this.seq}`, campaign_id: c.id, batch_no: c.batches.length + 1, phase: 'done', created_at: '2026-11-13T12:05:00Z', requested: 50, reserved: 50,
      counts: { ...zero(), accepted: 50 }, interrupted_suspected: false, accepted_note: "'Aceito' = o provedor (APNs/FCM/Web Push) aceitou o envio. Não é confirmação de entrega ao celular.",
      metrics: { delivered: 50, tapped: 4, opened: 9, acted: 2 }, ...p };
    c.batches.push(b);
    c.used_total = c.batches.reduce((n: number, x: any) => n + Object.values(x.counts as Record<string, number>).reduce((a, v) => a + v, 0), 0);
    c.counts = c.batches.reduce((acc: any, x: any) => { for (const k of Object.keys(acc)) acc[k] += x.counts[k]; return acc; }, zero());
    c.content_locked = true;
    return b;
  }

  audience(body: any) {
    const avail = this.available;
    return {
      matches: avail + this.used + 30, reachable: avail + this.used, not_reachable: { no_push: 20, opt_out: 10 }, used: this.used, used_in_campaign_total: this.used,
      available: avail, next_batch: body.all_available ? avail : body.batch_size ? Math.min(body.batch_size, avail) : null,
      by_platform: { ios: 60, android: 40, web: 5, mais_de_um_canal: 1 }, rules: [], warnings: [],
    };
  }

  routes: Record<string, Handler> = {
    'GET /config': (_b, s) => ({ json: { enabled: s.enabled } }),
    'GET /fields': () => ({ json: fields }),
    'GET /suggestions/brands': () => ({ json: { suggestions: [{ text: 'Golden', search: 'golden', plans: 40, tutors: 31 }] } }),
    'GET /segments': () => ({ json: { goals: [{ key: 'racao', group: 'Alimentação', label: 'Cadastrar a ração', title: '{tutor}, a ração de {pets}?', open: 'food', message: 'Cadastre a ração.' }], destinations: { home: 'Tela inicial', food: 'Ração', produto: 'O produto do link (direto na loja)' } } }),
    'GET /campaigns': (_b, s) => ({ json: { campaigns: s.campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status, content_locked: c.content_locked, created_at: c.created_at, counts: c.counts })) } }),
    'POST /campaigns': (b, s) => {
      const c = s.addCampaign({ name: b.name, status: 'draft', content: { title: b.title, message: b.message, goal: b.goal, destination: b.destination, product_url: b.product_url, product_title: b.product_title } });
      return { json: c };
    },
    'POST /audience/count': (b, s) => ({ json: s.audience(b) }),
    'POST /link-preview': (b) => ({ json: { url: b.url, store: 'Amazon', host: 'amzn.to', final_host: 'amazon.com.br', title: 'Ração Premier Gatos 7,5kg', image: null, readable: true, reason: null } }),
  };

  async handle(url: string, init?: RequestInit) {
    const method = init?.method ?? 'GET';
    const path = url.replace('/api/v1/admin/push-campaigns', '').replace('/api/v1/admin/broadcast', '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    this.calls.push({ method, path, body });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const key = `${method} ${path}`;
    const queue = this.overrides.get(key);
    let h: Handler | undefined = queue?.shift();
    let m: RegExpMatchArray | null;
    if (!h) {
      if (this.routes[key]) h = this.routes[key];
      else if ((m = path.match(/^\/campaigns\/([^/]+)$/)) && method === 'GET') h = () => { const c = this.campaigns.find((x) => x.id === m![1]); return c ? { json: c } : { status: 404, json: { detail: { code: 'campaign_not_found', message: 'Campanha não encontrada.' } } }; };
      else if ((m = path.match(/^\/campaigns\/([^/]+)\/close$/)) && method === 'POST') h = () => { const c = this.campaigns.find((x) => x.id === m![1])!; c.status = 'closed'; return { json: c }; };
      else if ((m = path.match(/^\/campaigns\/([^/]+)\/batches\/preview$/)) && method === 'POST') h = (b, s) => {
        const will = b.all_available ? s.available : Math.min(b.batch_size ?? 0, s.available);
        return { json: { campaign_id: m![1], counts: s.audience(b), available: s.available, will_reserve: will, smaller_than_requested: !b.all_available && b.batch_size > s.available, can_reserve: will > 0,
          blocking_batch: null, content: s.campaigns.find((x) => x.id === m![1])!.content, next_batch_no: 1, confirmation: `Para confirmar, digite ${will}.`, token: will ? `tok-${++s.seq}` : null,
          expires_at: new Date(Date.now() + 600_000).toISOString() } };
      };
      else if ((m = path.match(/^\/campaigns\/([^/]+)\/batches$/)) && method === 'POST') h = (b, s) => {
        const c = s.campaigns.find((x) => x.id === m![1])!;
        const will = b.all_available ? s.available : Math.min(b.batch_size, s.available);
        const batch = s.addBatch(c, { phase: 'sending', requested: b.all_available ? 'all' : b.batch_size, reserved: will, counts: { reserved: 0, sending: will, accepted: 0, failed: 0, uncertain: 0 } });
        s.available -= will; s.used += will;
        return { json: { batch, idempotent_replay: false, started: true } };
      };
      else if ((m = path.match(/^\/batches\/([^/]+)\/(recover|resume|release)$/)) && method === 'POST') h = () => ({ json: {} });
    }
    if (!h) return { ok: false, status: 404, json: async () => ({ detail: `sem rota: ${key}` }) };
    const out = await h(body, this);
    const status = out.status ?? 200;
    return { ok: status < 400, status, json: async () => JSON.parse(JSON.stringify(out.json)) };   // cópia, como um JSON de rede de verdade
  }

  install() {
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => this.handle(url, init)));
  }
}

export const err = (code: string, message: string, status = 409, extra: object = {}) => ({ status, json: { detail: { code, message, ...extra } } });
