import { describe, expect, it } from 'vitest';
import { activeAlertUrls, type PublicCase } from './sitemapAlerts';

const S = 'https://www.petmol.com.br';
const mk = (slug: string, status?: string | null): PublicCase => ({ slug, status, updated_at: '2026-11-15T12:00:00' });

describe('sitemap: só alertas ativos', () => {
  it('mantém ativos e tira encontrados, expirados e removidos', () => {
    const urls = activeAlertUrls([mk('a', 'active'), mk('b', 'found'), mk('c', 'expired'), mk('d', 'removed'), mk('e', 'active')], S).map((u) => u.url);
    expect(urls).toEqual([`${S}/pet-perdido/a`, `${S}/pet-perdido/e`]);
  });
  it('é dinâmico: a quantidade segue os dados, não um número fixo', () => {
    const many = Array.from({ length: 50 }, (_, i) => mk(`p${i}`, i % 5 === 0 ? 'active' : 'found'));
    expect(activeAlertUrls(many, S)).toHaveLength(10);
    expect(activeAlertUrls([], S)).toEqual([]);
    expect(activeAlertUrls(Array.from({ length: 7 }, (_, i) => mk(`x${i}`, 'active')), S)).toHaveLength(7);
  });
  it('status ausente, nulo ou desconhecido fica de fora (nunca expõe por engano) e slug vazio é ignorado', () => {
    expect(activeAlertUrls([mk('a'), mk('b', null), mk('c', 'pending'), mk('', 'active')], S)).toEqual([]);
  });
  it('preserva a data de atualização real e não inventa data quando ela falta', () => {
    const [x] = activeAlertUrls([{ slug: 'a', status: 'active', updated_at: '2026-11-15T12:00:00' }], S);
    expect(x.lastModified).toEqual(new Date('2026-11-15T12:00:00'));
    const [y] = activeAlertUrls([{ slug: 'b', status: 'active' }], S);
    expect(y.lastModified).toBeUndefined();
  });
});
