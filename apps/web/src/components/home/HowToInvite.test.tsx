import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HowToSheet } from './HowToSheet';
import { InviteChoiceSheet } from './InviteChoiceSheet';
import { HOWTO_CHANNEL_URL, HOWTO_VIDEOS, howToVideoUrl } from '@/features/howto/howToVideos';

const openUrl = vi.fn();
vi.mock('@/features/howto/howToVideos', async (orig) => ({
  ...(await orig<typeof import('@/features/howto/howToVideos')>()),
  openHowToUrl: (u: string) => openUrl(u),
}));
vi.mock('@/lib/analytics', () => ({ trackProductEvent: vi.fn() }));

beforeEach(() => openUrl.mockClear());

describe('vídeos do "Como usar"', () => {
  it('ids únicos e URLs do YouTube bem formadas', () => {
    const ids = HOWTO_VIDEOS.map((v) => v.videoId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{11}$/);
    expect(howToVideoUrl('9bx3GMVmQdU')).toBe('https://www.youtube.com/watch?v=9bx3GMVmQdU');
    expect(HOWTO_CHANNEL_URL).toBe('https://www.youtube.com/@petmolinstitucional');
  });
});

describe('HowToSheet', () => {
  it('lista os temas e abre o vídeo certo ao tocar', () => {
    render(<HowToSheet open onClose={() => {}} />);
    for (const v of HOWTO_VIDEOS) expect(screen.getByText(v.title)).toBeTruthy();
    fireEvent.click(screen.getByText('Vacinas'));
    expect(openUrl).toHaveBeenCalledWith('https://www.youtube.com/watch?v=n-Z6W7r9fHI');
  });
  it('"Ver todos no canal" abre o canal; fechado não renderiza nada', () => {
    const { rerender } = render(<HowToSheet open onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Tutorial' })).toBeTruthy();
    fireEvent.click(screen.getByText('Ver todos no canal do YouTube'));
    expect(openUrl).toHaveBeenCalledWith(HOWTO_CHANNEL_URL);
    rerender(<HowToSheet open={false} onClose={() => {}} />);
    expect(screen.queryByRole('heading', { name: 'Tutorial' })).toBeNull();
  });
});

describe('InviteChoiceSheet', () => {
  it('mostra as duas opções e cada uma chama o seu handler, depois fecha', async () => {
    const fam = vi.fn().mockResolvedValue(undefined);
    const app = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    render(<InviteChoiceSheet open petName="Baby" onClose={close} onInviteFamily={fam} onShareApp={app} />);
    expect(screen.getByText(/Para cuidar de Baby com você/)).toBeTruthy();
    fireEvent.click(screen.getByText('Indicar o PETMOL'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(app).toHaveBeenCalledTimes(1);
    expect(fam).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Convidar família'));
    await waitFor(() => expect(fam).toHaveBeenCalledTimes(1));
  });
});
