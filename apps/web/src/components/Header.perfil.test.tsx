import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/I18nContext', () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ tutor: { name: 'Leonardo Mol', email: 'a@b.com' }, token: 'tok' }) }));
vi.mock('@/hooks/useLogout', () => ({ useLogout: () => ({ initiateLogout: vi.fn() }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/home' }));
vi.mock('@/components/ContentMenu', () => ({ ContentMenu: () => null }));

import { Header } from './Header';

afterEach(cleanup);

describe('Header — botão do Perfil', () => {
  it('é um link de página inteira (<a href="/profile">), imune a versão velha do app aberto durante um deploy', () => {
    render(<Header />);
    const links = screen.getAllByRole('link', { name: /Perfil|Leonardo/ });
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      expect(l.getAttribute('href')).toBe('/profile');
      expect(l.tagName).toBe('A');
      // <Link> do Next marca o <a> para navegação client-side; o link simples não tem esse comportamento
      expect(l.getAttribute('data-nextjs-link')).toBeNull();
    }
  });
});
