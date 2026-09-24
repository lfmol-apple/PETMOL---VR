import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

import { ModerationSection } from './ModerationSection';

const base = {
  context: 'pet_profile', entity_type: 'pet', entity_id: 'e1', uploader_user_id: 'u1',
  ai_decision: 'x', ai_confidence: 0.98, ai_species: null, ai_image_type: 'real_photo', ai_is_main_subject: false,
  ai_unavailable: false, reviewed_by_admin_id: null, reviewed_at: null, review_note: null,
  created_at: '2026-09-23T22:00:00Z', photo_key: null, image_note: null, has_image: false,
};
const ITEMS: Record<string, unknown[]> = {
  approved: [{ ...base, id: 'a1', status: 'approved', ai_reason: 'cão real', photo_key: 'pets/abc.jpg' }],
  rejected: [
    { ...base, id: 'r1', status: 'rejected', ai_reason: 'nenhum pet identificável na imagem', has_image: true, image_views_left: 2 },
    { ...base, id: 'r2', status: 'rejected', ai_reason: 'nudez', image_note: 'Conteúdo sensível — a imagem não é guardada, por segurança.' },
    { ...base, id: 'r3', status: 'rejected', ai_reason: 'antiga', image_note: 'Imagem não disponível: recusada antes de passarmos a guardar as fotos recusadas, ou já apagada (guardamos por 30 dias).' },
  ],
  pending: [],
};

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:foto-recusada', revokeObjectURL: () => {} }));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith('/summary')) return { ok: true, json: async () => ({ approved: 1, rejected: 3, pending: 0, total: 4 }) } as Response;
    if (u.includes('/image')) return { ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) } as Response;
    const status = /status=(\w+)/.exec(u)?.[1] || 'pending';
    const items = ITEMS[status] || [];
    return { ok: true, json: async () => ({ total: items.length, items }) } as Response;
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Moderação de Fotografias — mostra as fotos', () => {
  it('aprovadas aparecem com a foto publicada', async () => {
    render(<ModerationSection />);
    fireEvent.click(await screen.findByText('Aprovadas'));
    const img = (await screen.findByAltText('Foto aprovada')) as HTMLImageElement;
    expect(img.src).toMatch(/\/uploads\/pets\/abc\.jpg$/);
  });

  it('recusadas guardadas mostram a foto; as sem imagem explicam o porquê', async () => {
    render(<ModerationSection />);
    fireEvent.click(await screen.findByText('Rejeitadas'));
    // a foto recusada só carrega quando você pede (cada abertura conta: são só 2)
    expect(await screen.findByText(/restam 2 visualização/)).toBeTruthy();
    expect(screen.queryByAltText('Foto em revisão')).toBeNull();
    fireEvent.click(screen.getByText(/Ver foto/));
    const shown = (await screen.findByAltText('Foto em revisão')) as HTMLImageElement;
    expect(shown.src).toBe('blob:foto-recusada');
    expect(screen.getByText(/Você ainda pode abrir mais 1 vez/)).toBeTruthy();
    expect(screen.getByText(/Conteúdo sensível — a imagem não é guardada/)).toBeTruthy();
    expect(screen.getByText(/recusada antes de passarmos a guardar/)).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByText('Carregando…')).toHaveLength(0));
  });
});
