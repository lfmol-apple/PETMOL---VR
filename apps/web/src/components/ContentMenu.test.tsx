import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/home' }));

const isNativeAppClient = vi.fn(() => false);
vi.mock('@/lib/nativeApp', () => ({ isNativeAppClient: () => isNativeAppClient() }));

import { ContentMenu } from './ContentMenu';

describe('ContentMenu (menu de barras do Header)', () => {
  beforeEach(() => isNativeAppClient.mockReturnValue(false));

  it('mostra só o botão fechado, com aria correto', () => {
    render(<ContentMenu />);
    const btn = screen.getByRole('button', { name: 'Menu de conteúdo' });
    expect(btn.getAttribute('aria-haspopup')).toBe('menu');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('web: abre com Guias e Recommendations; fecha ao escolher', () => {
    render(<ContentMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu de conteúdo' }));
    const menu = screen.getByRole('menu');
    expect(menu).toBeTruthy();
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.getAttribute('href'))).toEqual(['/guias', '/recommendations']);
    fireEvent.click(items[0]!);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('app nativo: menu só tem Guias (Recommendations é web-only)', () => {
    isNativeAppClient.mockReturnValue(true);
    render(<ContentMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu de conteúdo' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.getAttribute('href'))).toEqual(['/guias']);
  });

  it('fecha no Escape', () => {
    render(<ContentMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu de conteúdo' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
