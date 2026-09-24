import { describe, expect, it } from 'vitest';
import { classifyPhotoUpload, notAPetPhotoMessage, unusablePhotoMessage } from './photoModerationMessages';

describe('notAPetPhotoMessage', () => {
  it('cita o pet pelo nome e pede, com gentileza, uma foto dele', () => {
    const m = notAPetPhotoMessage('Baby');
    expect(m).toContain('Baby');
    expect(m).toMatch(/reservado para a foto do seu pet/);
    expect(m).toMatch(/fotografar Baby/);
    expect(m).not.toMatch(/imprópri|proibid|violaç|inválid/i);   // sem acusar ninguém
  });
  it('sem nome, cai em "seu pet"', () => {
    expect(notAPetPhotoMessage('')).toContain('fotografar seu pet');
    expect(notAPetPhotoMessage(undefined)).toContain('seu pet');
    expect(notAPetPhotoMessage('  Rex  ')).toContain('identificar Rex');
  });
});

describe('classifyPhotoUpload', () => {
  it('422 = recusada; 200 = aprovada; 200 pending = revisão; resto = erro', () => {
    expect(classifyPhotoUpload(422, { detail: 'x' } as never)).toBe('rejected');
    expect(classifyPhotoUpload(200, { status: 'approved' })).toBe('approved');
    expect(classifyPhotoUpload(200, {})).toBe('approved');
    expect(classifyPhotoUpload(200, { status: 'pending' })).toBe('pending');
    expect(classifyPhotoUpload(429, {})).toBe('error');
    expect(classifyPhotoUpload(500, null)).toBe('error');
  });
});

describe('unusablePhotoMessage', () => {
  it('foto pesada (413) e ilegível (400) ganham pedido claro; outros erros seguem sem aviso', () => {
    expect(unusablePhotoMessage(413, 'Baby')).toMatch(/pesada demais.*8 MB.*fotografe Baby/);
    expect(unusablePhotoMessage(400, 'Baby')).toMatch(/Não conseguimos ler essa foto.*fotografe Baby/);
    expect(unusablePhotoMessage(500, 'Baby')).toBeNull();
    expect(unusablePhotoMessage(0, undefined)).toBeNull();
  });
});
