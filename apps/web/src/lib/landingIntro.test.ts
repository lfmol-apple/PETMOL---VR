import { describe, expect, it } from 'vitest';
import { __resetIntroSeen, COMMERCIALS, commercialForDate, decideIntro, getIntroCommercial, markIntroSeen, pickCommercial, saoPauloDate, saoPauloTime, setIntroMode, wasIntroSeen } from './landingIntro';

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

describe('revezamento dos comerciais (um dia cada, dia de São Paulo)', () => {
  it('26/09/2026 = Pet Sumido; 27/09 = ração; 28/09 = Pet Sumido; e assim por diante', () => {
    expect(commercialForDate(new Date('2026-09-26T15:00:00Z'))).toBe('pet-sumido');
    expect(commercialForDate(new Date('2026-09-27T15:00:00Z'))).toBe('racao');
    expect(commercialForDate(new Date('2026-09-28T15:00:00Z'))).toBe('pet-sumido');
    expect(commercialForDate(new Date('2026-10-01T15:00:00Z'))).toBe('racao');
  });
  it('a virada é à meia-noite de São Paulo, não do UTC', () => {
    expect(saoPauloDate(new Date('2026-09-27T02:30:00Z'))).toBe('2026-09-26'); // 23:30 em SP
    expect(commercialForDate(new Date('2026-09-27T02:30:00Z'))).toBe('pet-sumido');
    expect(saoPauloDate(new Date('2026-09-27T03:30:00Z'))).toBe('2026-09-27'); // 00:30 em SP
    expect(commercialForDate(new Date('2026-09-27T03:30:00Z'))).toBe('racao');
  });
  it('dias antes da data de referência também alternam (sem quebrar)', () => {
    expect(commercialForDate(new Date('2026-09-25T15:00:00Z'))).toBe('racao');
    expect(commercialForDate(new Date('2026-09-24T15:00:00Z'))).toBe('pet-sumido');
  });
  it('interruptor: COMMERCIAL_FIXED fixa um só comercial', () => {
    expect(commercialForDate(new Date('2026-09-27T15:00:00Z'), 'pet-sumido')).toBe('pet-sumido');
    expect(commercialForDate(new Date('2026-09-26T15:00:00Z'), 'racao')).toBe('racao');
  });
  it('?comercial= só vale no modo de teste (visitante real não escolhe)', () => {
    const d = new Date('2026-09-26T15:00:00Z'); // dia do Pet Sumido
    expect(pickCommercial('?comercial=racao', false, d).id).toBe('pet-sumido');
    expect(pickCommercial('?intro=preview&comercial=racao', true, d).id).toBe('racao');
    expect(pickCommercial('?intro=preview&comercial=lixo', true, d).id).toBe('pet-sumido');
    expect(pickCommercial('', false, d)).toBe(COMMERCIALS['pet-sumido']);
  });
  it('a visita guarda qual comercial foi exibido; sem introdução = nenhum', () => {
    setIntroMode('shown', 'racao');
    expect(getIntroCommercial()).toBe('racao');
    setIntroMode('none', 'racao');
    expect(getIntroCommercial()).toBeNull();
  });
});
