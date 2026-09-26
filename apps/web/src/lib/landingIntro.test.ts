import { describe, expect, it } from 'vitest';
import { __resetIntroSeen, decideIntro, markIntroSeen, saoPauloTime, wasIntroSeen } from './landingIntro';

const base = { search: '', isMobile: true, isNative: false, seen: false };

describe('decisão da introdução em vídeo', () => {
  it('celular, 1ª vez na sessão: mostra', () => {
    expect(decideIntro(base)).toMatchObject({ show: true, preview: false });
  });
  it('desktop: nunca (landing normal, sem introdução)', () => {
    expect(decideIntro({ ...base, isMobile: false })).toMatchObject({ show: false, reason: 'not_mobile' });
  });
  it('não repete ao navegar dentro da mesma página (mas volta em toda nova visita/atualização)', () => {
    expect(decideIntro({ ...base, seen: true })).toMatchObject({ show: false, reason: 'seen_this_load' });
    __resetIntroSeen();
    expect(wasIntroSeen()).toBe(false);
    markIntroSeen();
    expect(wasIntroSeen()).toBe(true);
    __resetIntroSeen();
  });
  it('interruptor desligado apaga tudo, até o modo de teste', () => {
    expect(decideIntro({ ...base, enabled: false }).show).toBe(false);
    expect(decideIntro({ ...base, enabled: false, search: '?intro=preview' }).show).toBe(false);
  });
  it('app nativo nunca vê a introdução', () => {
    expect(decideIntro({ ...base, isNative: true }).show).toBe(false);
  });
  it('?intro=0 pula; ?ab= (conferência do A/B) vai direto à landing', () => {
    expect(decideIntro({ ...base, search: '?intro=0' }).show).toBe(false);
    expect(decideIntro({ ...base, search: '?ab=B' }).show).toBe(false);
  });
  it('?intro=preview mostra em qualquer aparelho, mesmo já visto, marcado como teste', () => {
    expect(decideIntro({ ...base, isMobile: false, seen: true, search: '?intro=preview' })).toMatchObject({ show: true, preview: true });
  });
  it('mantém UTMs: a decisão não depende dos parâmetros de campanha', () => {
    expect(decideIntro({ ...base, search: '?utm_source=instagram&utm_campaign=x&fbclid=abc' }).show).toBe(true);
  });
  it('horário de São Paulo em AAAA-MM-DD HH:mm:ss', () => {
    expect(saoPauloTime(new Date('2026-09-26T18:30:05Z'))).toBe('2026-09-26 15:30:05');
  });
});
