import { describe, expect, it } from 'vitest';
import { isPublic } from './middleware';

describe('middleware — isPublic não deve liberar rotas autenticadas', () => {
  it('rotas realmente públicas continuam passando', () => {
    expect(isPublic('/')).toBe(true);
    expect(isPublic('/login')).toBe(true);
    expect(isPublic('/register')).toBe(true);
    expect(isPublic('/go')).toBe(true);
    expect(isPublic('/go/abc123')).toBe(true);
    expect(isPublic('/v/algum-token')).toBe(true);
    expect(isPublic('/cuidar/xyz')).toBe(true);
  });

  it('rotas autenticadas nunca devem virar públicas por causa da entrada "/"', () => {
    // Bug real encontrado: pathname.startsWith(p) com p === '/' bate com
    // QUALQUER pathname (todos começam com '/'), fazendo isPublic sempre
    // retornar true e a checagem de sessão nunca rodar.
    expect(isPublic('/home')).toBe(false);
    expect(isPublic('/profile')).toBe(false);
    expect(isPublic('/admin/dashboard')).toBe(false);
    expect(isPublic('/pets')).toBe(false);
  });

  it('prefixo solto não deve capturar rotas parecidas mas diferentes', () => {
    // '/go' não pode capturar '/google'; '/rg' não pode capturar '/rgpf'
    expect(isPublic('/google')).toBe(false);
    expect(isPublic('/rgpf')).toBe(false);
  });
});
