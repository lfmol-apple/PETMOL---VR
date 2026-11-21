import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => null }));

describe('home → guias', () => {
  it('a home (HTML do servidor) liga para /guias no texto e no rodapé, sem tirar os selos das lojas', async () => {
    const html = renderToStaticMarkup(createElement((await import('./page')).default));
    expect((html.match(/href="\/guias"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('apps.apple.com');
    expect(html).toContain('play.google.com');
  });
});
