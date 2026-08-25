import { describe, expect, it } from 'vitest';
import { isPublic } from './middleware';

describe('middleware — /loja e /guias chegam à página para retornar 404', () => {
  it('/loja e /guias seguem sem exigir sessão, mas a página decide notFound()', () => {
    expect(isPublic('/loja')).toBe(true);
    expect(isPublic('/loja/qualquer-coisa')).toBe(true);
    expect(isPublic('/guias')).toBe(true);
    expect(isPublic('/guias/conforto-pets-idosos')).toBe(true);
  });

  it('rotas autenticadas de verdade continuam exigindo sessão (não viraram públicas por engano)', () => {
    expect(isPublic('/home')).toBe(false);
    expect(isPublic('/profile')).toBe(false);
    expect(isPublic('/admin/dashboard')).toBe(false);
    expect(isPublic('/pets')).toBe(false);
  });
});

describe('middleware — isPublic não deve liberar rotas autenticadas por acidente', () => {
  it('rotas realmente públicas continuam passando', () => {
    expect(isPublic('/')).toBe(true);
    expect(isPublic('/login')).toBe(true);
    expect(isPublic('/register')).toBe(true);
    expect(isPublic('/go')).toBe(true);
    expect(isPublic('/go/abc123')).toBe(true);
    expect(isPublic('/v/algum-token')).toBe(true);
    expect(isPublic('/cuidar/xyz')).toBe(true);
    // Exigência Google Play — precisa funcionar sem sessão/app instalado.
    expect(isPublic('/excluir-conta')).toBe(true);
  });

  it('prefixo solto não deve capturar rotas parecidas mas diferentes', () => {
    // '/go' não pode capturar '/google'; '/rg' não pode capturar '/rgpf'
    expect(isPublic('/google')).toBe(false);
    expect(isPublic('/rgpf')).toBe(false);
  });
});
