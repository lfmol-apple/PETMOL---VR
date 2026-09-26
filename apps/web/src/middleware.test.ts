import { describe, expect, it } from 'vitest';
import { isPublic } from './middleware';

describe('middleware — /loja e /guias chegam à página para retornar 404', () => {
  it('/loja e /guias seguem sem exigir sessão, mas a página decide notFound()', () => {
    expect(isPublic('/loja')).toBe(true);
    expect(isPublic('/loja/qualquer-coisa')).toBe(true);
    expect(isPublic('/guias')).toBe(true);
    expect(isPublic('/guias/conforto-pets-idosos')).toBe(true);
  });

  it('páginas institucionais da área editorial são públicas', () => {
    expect(isPublic('/sobre')).toBe(true);
    expect(isPublic('/politica-editorial')).toBe(true);
    expect(isPublic('/transparencia')).toBe(true);
  });

  it('/recommendations (página Amazon Associates em inglês) é pública', () => {
    expect(isPublic('/recommendations')).toBe(true);
    expect(isPublic('/recommendations/')).toBe(true);
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

describe('middleware — comercial da landing (mp4) para visitante sem login', () => {
  it('o vídeo e o pôster passam direto, sem redirecionar para /login', async () => {
    const { middleware } = await import('./middleware');
    const { NextRequest } = await import('next/server');
    for (const path of ['/landing/comercial/petmol-comercial-v1.mp4', '/landing/comercial/petmol-comercial-poster-v1.webp']) {
      const res = middleware(new NextRequest(`https://www.petmol.com.br${path}`));
      expect(res.headers.get('location'), path).toBeNull();
      expect(res.status, path).toBe(200);
    }
  });
});
