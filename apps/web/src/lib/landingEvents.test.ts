import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetLandingVariantMemo, EXPERIMENT_ID } from './landingExperiment';
import { buildLandingEvent, trackDownloadClick, trackLandingEvent } from './landingEvents';

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  __resetLandingVariantMemo();
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState({}, '', '/?utm_source=instagram&utm_medium=paid&utm_campaign=set26&utm_content=video1&fbclid=abc123');
});
afterEach(() => vi.unstubAllGlobals());

// O contexto de analytics faz 1 fetch de /version.json por sessão; aqui só interessam os eventos.
const eventCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/analytics/event'));
const sent = () => eventCalls().map((c) => JSON.parse(c[1].body));

describe('eventos da landing', () => {
  it('landing_view vai ao servidor com variante, experimento, id anônimo, sessão e UTMs', () => {
    trackLandingEvent('landing_view', {}, { variant: 'B', preview: false, persisted: true });
    expect(eventCalls()).toHaveLength(1);
    const [url, init] = eventCalls()[0];
    expect(String(url)).toContain('/analytics/event');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    const e = sent()[0];
    expect(e).toMatchObject({
      event_name: 'landing_view', utm_source: 'instagram', utm_medium: 'paid', utm_campaign: 'set26', utm_content: 'video1',
      properties: { experiment_id: EXPERIMENT_ID, variant: 'B', fbclid: true },
    });
    expect(e.anonymous_id).toMatch(/^anon_/);
    expect(e.session_id).toMatch(/^sess_/);
    expect(JSON.stringify(e)).not.toContain('abc123'); // valor do fbclid nunca é enviado
  });

  it('o id anônimo é estável entre eventos e o event_id é único (o servidor descarta repetição do mesmo id)', () => {
    const info = { variant: 'A' as const, preview: false, persisted: true };
    const a = buildLandingEvent('landing_view', info);
    const b = buildLandingEvent('landing_view', info);
    expect(a.anonymous_id).toBe(b.anonymous_id);
    expect(a.event_id).not.toBe(b.event_id);
  });

  it('clique numa loja gera 1 clique + 1 redirecionamento com a loja; clique "auto" (desktop) só o clique', () => {
    localStorage.setItem('petmol_exp_landing_v1', JSON.stringify({ experiment_id: EXPERIMENT_ID, variant: 'B' }));
    trackDownloadClick({ button: 'badge', placement: 'hero', store: 'google' });
    trackDownloadClick({ button: 'cta', placement: 'hero-botao', store: 'auto' });
    const names = sent().map((e) => `${e.event_name}:${e.properties.store}:${e.properties.button}`);
    expect(names).toEqual([
      'landing_download_click:google:badge',
      'landing_store_redirect:google:badge',
      'landing_download_click:auto:cta',
    ]);
    expect(sent().every((e) => e.properties.variant === 'B')).toBe(true);
  });

  it('pré-visualização é marcada e nunca vira estatística', () => {
    trackLandingEvent('landing_view', {}, { variant: 'A', preview: true, persisted: false });
    expect(sent()[0].properties.preview).toBe(true);
  });

  it('falha de rede não quebra o clique (medir nunca atrapalha o redirecionamento)', () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(() => trackDownloadClick({ button: 'cta', placement: 'hero-botao', store: 'apple' })).not.toThrow();
    fetchMock.mockImplementation(() => { throw new Error('síncrono'); });
    expect(() => trackDownloadClick({ button: 'cta', placement: 'hero-botao', store: 'apple' })).not.toThrow();
  });

  it('não envia dados pessoais nem impressão digital: só os campos definidos', () => {
    const e = buildLandingEvent('landing_view', { variant: 'A', preview: false, persisted: true });
    const keys = Object.keys(e).sort();
    expect(keys).toEqual([
      'anonymous_id', 'app_version', 'browser', 'device_class', 'event_id', 'event_name', 'landing_path', 'locale',
      'occurred_at', 'os', 'platform', 'properties', 'referrer_host', 'route', 'session_id', 'timezone',
      'utm_campaign', 'utm_content', 'utm_medium', 'utm_source', 'utm_term',
    ]);
  });
});
