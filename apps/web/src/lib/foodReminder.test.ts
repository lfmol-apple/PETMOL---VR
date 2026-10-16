import { describe, expect, it } from 'vitest';
import { parseReminderDays, friendlyApiError } from './foodReminder';

describe('parseReminderDays', () => {
  it('preserva 0 (avisar no próprio dia) — não vira 3', () => {
    expect(parseReminderDays('0')).toBe(0);
    expect(parseReminderDays(0)).toBe(0);
  });
  it('usa o valor escolhido', () => {
    expect(parseReminderDays('5')).toBe(5);
  });
  it('vazio ou inválido cai no padrão de 3', () => {
    expect(parseReminderDays('')).toBe(3);
    expect(parseReminderDays('abc')).toBe(3);
    expect(parseReminderDays(null)).toBe(3);
    expect(parseReminderDays(undefined)).toBe(3);
  });
  it('respeita o limite 0..30 do servidor/campo', () => {
    expect(parseReminderDays('99')).toBe(30);
    expect(parseReminderDays('-4')).toBe(0);
  });
});

describe('friendlyApiError', () => {
  it('extrai detail em texto', () => {
    expect(friendlyApiError('{"detail":"Pet não encontrado"}')).toBe('Pet não encontrado');
  });
  it('junta mensagens de validação', () => {
    expect(friendlyApiError('{"detail":[{"msg":"valor inválido"},{"msg":"campo obrigatório"}]}'))
      .toBe('valor inválido; campo obrigatório');
  });
  it('texto que não é JSON volta como está', () => {
    expect(friendlyApiError('Bad Gateway')).toBe('Bad Gateway');
  });
  it('vazio volta vazio', () => {
    expect(friendlyApiError('')).toBe('');
  });
});
