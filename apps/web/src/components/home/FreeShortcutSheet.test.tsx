import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  permission: 'granted' as NotificationPermission,
  tutor: { location_source: null as string | null },
  toast: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ tutor: mocks.tutor }) }));
vi.mock('@/features/interactions/useNotificationPermissionController', () => ({
  useNotificationPermissionController: () => ({ permission: mocks.permission, requestPermission: vi.fn(async () => true), subscribeToPush: vi.fn() }),
}));
vi.mock('@/features/interactions/requestCorePermissions', () => ({ requestLocationAndPersist: vi.fn(async () => {}) }));
vi.mock('@/features/interactions/userPromptChannel', () => ({ showAppToast: mocks.toast }));
vi.mock('@/lib/fetchMe', () => ({ fetchMe: vi.fn(async () => ({ ok: true, json: async () => ({ location_source: null }) })) }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => 't' }));

import { FreeShortcutSheet } from './FreeShortcutSheet';
import { FREE_SHORTCUT_DURATION_MS, FREE_SHORTCUT_STORAGE_KEY } from '@/lib/freeShortcut';

const base = { petName: 'Baby', petSex: 'male' as const, onOpenFood: vi.fn(), onClose: vi.fn() };

describe('FreeShortcutSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    vi.clearAllMocks();
    mocks.permission = 'granted';
    mocks.tutor = { location_source: null };
    window.localStorage.clear();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('mostra o título, a data real e a contagem de 20 minutos a partir do primeiro toque', () => {
    render(<FreeShortcutSheet {...base} startedAt={Date.now()} hasFood={false} />);
    expect(screen.getByText('Mantenha o PETMOL gratuito para você')).toBeTruthy();
    expect(screen.getByText(/Falta só a ração do Baby\. Cadastre até 31\/12\./)).toBeTruthy();
    expect(screen.getByTestId('free-shortcut-countdown').textContent).toBe('20:00');
    act(() => { vi.advanceTimersByTime(65_000); });
    expect(screen.getByTestId('free-shortcut-countdown').textContent).toBe('18:55');
  });

  it('quem já tem notificação só vê ração e localização (não pede notificação de novo)', () => {
    render(<FreeShortcutSheet {...base} startedAt={Date.now()} hasFood={false} />);
    expect(screen.getByRole('button', { name: 'Cadastrar a ração do Baby' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ativar a localização' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ativar as notificações' })).toBeNull();
  });

  it('o texto diz que só o atalho expira, que os passos ficam marcados e que a localização é opcional', () => {
    render(<FreeShortcutSheet {...base} startedAt={Date.now()} hasFood={false} />);
    expect(screen.getByText(/Cada passo concluído fica marcado/)).toBeTruthy();
    expect(screen.getByText(/Depois, você faz o mesmo no menu do app/)).toBeTruthy();
    expect(screen.getByText(/A localização é opcional e você desativa quando quiser/)).toBeTruthy();
  });

  it('"Agora não" encerra e grava o motivo', () => {
    render(<FreeShortcutSheet {...base} startedAt={Date.now()} hasFood={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(base.onClose).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(FREE_SHORTCUT_STORAGE_KEY) ?? '{}').end).toBe('dismissed');
  });

  it('cadastrar a ração NÃO fecha a tela: o passo fica marcado e os outros botões continuam', () => {
    mocks.permission = 'default';
    const { rerender } = render(<FreeShortcutSheet {...base} startedAt={Date.now()} hasFood={false} />);
    rerender(<FreeShortcutSheet {...base} startedAt={Date.now()} hasFood />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(base.onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Cadastrar a ração/ })).toBeNull();            // o passo feito some da lista de botões
    expect(screen.getByRole('button', { name: 'Ativar as notificações' })).toBeTruthy();        // os outros seguem ali
    expect(screen.getByRole('button', { name: 'Ativar a localização' })).toBeTruthy();
    expect(mocks.toast).toHaveBeenCalledWith('Pronto! Esse passo está feito. Veja os outros abaixo.');
  });

  it('quando TUDO está feito, agradece e então fecha, gravando "feito"', () => {
    mocks.tutor = { location_source: 'gps' };
    const { rerender } = render(<FreeShortcutSheet {...base} startedAt={Date.now()} hasFood={false} />);
    rerender(<FreeShortcutSheet {...base} startedAt={Date.now()} hasFood />);
    expect(base.onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(mocks.toast).toHaveBeenCalledWith('Tudo pronto! Obrigado por manter o seu PETMOL em dia.');
    expect(base.onClose).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(FREE_SHORTCUT_STORAGE_KEY) ?? '{}').end).toBe('done');
  });

  it('ao fim dos 20 minutos o atalho encerra', () => {
    render(<FreeShortcutSheet {...base} startedAt={Date.now()} hasFood={false} />);
    act(() => { vi.advanceTimersByTime(FREE_SHORTCUT_DURATION_MS + 1000); });
    expect(base.onClose).toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(FREE_SHORTCUT_STORAGE_KEY) ?? '{}').end).toBe('expired');
  });

  it('sem notificação (abertura dentro do app) oferece ativar as notificações', () => {
    mocks.permission = 'default';
    render(<FreeShortcutSheet {...base} startedAt={Date.now()} hasFood={false} />);
    expect(screen.getByRole('button', { name: 'Ativar as notificações' })).toBeTruthy();
  });

  it('recolhe enquanto o sheet de ração está por cima, mas a contagem segue', () => {
    const { rerender } = render(<FreeShortcutSheet {...base} startedAt={Date.now()} hasFood={false} suppressed />);
    expect(screen.queryByText('Mantenha o PETMOL gratuito para você')).toBeNull();
    act(() => { vi.advanceTimersByTime(60_000); });
    rerender(<FreeShortcutSheet {...base} startedAt={Date.now() - 60_000} hasFood={false} />);
    expect(screen.getByTestId('free-shortcut-countdown').textContent).toBe('19:00');
  });
});
