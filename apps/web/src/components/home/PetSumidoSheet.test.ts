/**
 * Bug real (set/2026): o CTA "Gerar alerta e card" do Pet Sumido só exigia
 * contact.trim().length >= 8 — qualquer texto de 8+ caracteres (sem forma de
 * telefone) liberava publicar um alerta público com contato incontatável.
 * Este arquivo cobre só a validação em isolamento (o componente inteiro usa
 * canvas/Image, pesado demais pra testar aqui só por causa de duas funções
 * puras).
 */
import { describe, expect, it } from 'vitest';
import { formatBRPhoneInput, isValidBRPhone } from './PetSumidoSheet';

describe('isValidBRPhone', () => {
  it('aceita celular BR com DDD (11 dígitos)', () => {
    expect(isValidBRPhone('(11) 99999-8888')).toBe(true);
  });

  it('aceita fixo BR com DDD (10 dígitos)', () => {
    expect(isValidBRPhone('(11) 3333-4444')).toBe(true);
  });

  it('rejeita texto sem dígitos suficientes de telefone (bug real: "asdfasdf" passava)', () => {
    expect(isValidBRPhone('asdfasdf')).toBe(false);
  });

  it('rejeita menos de 10 dígitos', () => {
    expect(isValidBRPhone('999999999')).toBe(false);
  });

  it('rejeita string vazia', () => {
    expect(isValidBRPhone('')).toBe(false);
  });

  it('ignora o 55 do DDI quando presente', () => {
    expect(isValidBRPhone('+55 11 99999-8888')).toBe(true);
  });
});

describe('formatBRPhoneInput', () => {
  it('formata progressivamente enquanto digita', () => {
    expect(formatBRPhoneInput('1')).toBe('(1');
    expect(formatBRPhoneInput('11999')).toBe('(11) 999');
    expect(formatBRPhoneInput('11999998888')).toBe('(11) 99999-8888');
  });

  it('descarta dígitos além do 11º', () => {
    expect(formatBRPhoneInput('119999988889999')).toBe('(11) 99999-8888');
  });
});
