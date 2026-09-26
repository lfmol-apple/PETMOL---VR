import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { __resetLandingVariantMemo } from '@/lib/landingExperiment';
import { LandingIntro } from './LandingIntro';
import { __resetIntroSeen, COMMERCIALS, setIntroMode, wasIntroSeen } from '@/lib/landingIntro';

const fetchMock = vi.fn();
const sent = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/analytics/event')).map((c) => JSON.parse(c[1].body));
const names = () => sent().map((e) => e.event_name);
let playImpl: () => Promise<void>;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear(); sessionStorage.clear(); __resetLandingVariantMemo(); __resetIntroSeen();
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState({}, '', '/?utm_source=instagram&utm_campaign=set26');
  playImpl = () => Promise.resolve();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: function () { return playImpl(); } });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: () => undefined });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const video = () => document.querySelector('video') as HTMLVideoElement;

describe('introdução em vídeo (celular)', () => {
  it('mostra o pôster com "Assistir com som" e "Pular", sem iniciar o vídeo sozinho', () => {
    render(<LandingIntro commercial={COMMERCIALS.racao} preview={false} onDone={() => undefined} />);
    expect(screen.getByText(/Assistir com som/)).toBeTruthy();
    expect(screen.getByText('Pular e conhecer o PETMOL')).toBeTruthy();
    expect(names()).toEqual(['landing_intro_poster_view']);
    expect(video().getAttribute('preload')).toBe('none');
    expect(wasIntroSeen()).toBe(true); // não repete ao navegar dentro da mesma página
  });

  it('tocar em "Assistir com som" toca COM áudio (dentro do gesto) e registra o clique', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
    render(<LandingIntro commercial={COMMERCIALS.racao} preview={false} onDone={() => undefined} />);
    fireEvent.click(screen.getByText(/Assistir com som/));
    expect(play).toHaveBeenCalled();
    expect(video().muted).toBe(false);
    expect(names()).toEqual(['landing_intro_poster_view', 'landing_intro_watch_click']);
  });

  it('início → fim: registra start/complete e revela a landing (onDone) sem recarregar', () => {
    const onDone = vi.fn();
    render(<LandingIntro commercial={COMMERCIALS.racao} preview={false} onDone={onDone} />);
    fireEvent.click(screen.getByText(/Assistir com som/));
    act(() => { fireEvent(video(), new Event('playing')); });
    expect(names()).toContain('landing_intro_video_start');
    expect(screen.getByText('Pular ›')).toBeTruthy();
    act(() => { fireEvent(video(), new Event('ended')); vi.advanceTimersByTime(400); });
    expect(names()).toContain('landing_intro_video_complete');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Pular durante o vídeo: registra segundos assistidos e revela a landing', () => {
    const onDone = vi.fn();
    render(<LandingIntro commercial={COMMERCIALS.racao} preview={false} onDone={onDone} />);
    fireEvent.click(screen.getByText(/Assistir com som/));
    Object.defineProperty(video(), 'currentTime', { value: 7.34, configurable: true });
    act(() => { fireEvent(video(), new Event('playing')); });
    fireEvent.click(screen.getByText('Pular ›'));
    act(() => { vi.advanceTimersByTime(400); });
    const skip = sent().find((e) => e.event_name === 'landing_intro_skip');
    expect(skip.properties).toMatchObject({ reason: 'video', watched_s: 7.3 });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Pular no pôster: entra direto na landing', () => {
    const onDone = vi.fn();
    render(<LandingIntro commercial={COMMERCIALS.racao} preview={false} onDone={onDone} />);
    fireEvent.click(screen.getByText('Pular e conhecer o PETMOL'));
    act(() => { vi.advanceTimersByTime(400); });
    expect(sent().find((e) => e.event_name === 'landing_intro_skip').properties.reason).toBe('poster');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('falhas revelam a landing na hora: play recusado, erro de mídia e não começar em 10 s', async () => {
    for (const mode of ['reject', 'error', 'timeout'] as const) {
      cleanup(); fetchMock.mockClear();
      const onDone = vi.fn();
      playImpl = mode === 'reject' ? () => Promise.reject(new Error('NotAllowed')) : () => new Promise(() => undefined);
      render(<LandingIntro commercial={COMMERCIALS.racao} preview={false} onDone={onDone} />);
      fireEvent.click(screen.getByText(/Assistir com som/));
      if (mode === 'error') act(() => { fireEvent(video(), new Event('error')); });
      if (mode === 'timeout') act(() => { vi.advanceTimersByTime(10100); });
      await act(async () => { await Promise.resolve(); vi.advanceTimersByTime(400); });
      const err = sent().find((e) => e.event_name === 'landing_intro_video_error');
      expect(err, mode).toBeTruthy();
      expect(onDone, mode).toHaveBeenCalledTimes(1);
    }
  });

  it('durante o vídeo: botão Baixar grátis presente (com loja e UTMs) e som liga/desliga', () => {
    render(<LandingIntro commercial={COMMERCIALS.racao} preview={false} onDone={() => undefined} />);
    fireEvent.click(screen.getByText(/Assistir com som/));
    act(() => { fireEvent(video(), new Event('playing')); });
    const dl = screen.getByText('Baixar grátis') as HTMLAnchorElement;
    expect(dl.getAttribute('href')).toMatch(/apps\.apple\.com|play\.google\.com/);
    fireEvent.click(dl);
    const click = sent().filter((e) => e.event_name === 'landing_download_click').pop();
    expect(click.properties).toMatchObject({ placement: 'intro-video', button: 'cta' });
    expect(click.utm_campaign).toBe('set26');
    fireEvent.click(screen.getByLabelText('Desligar o som'));
    expect(video().muted).toBe(true);
    expect(screen.getByLabelText('Ligar o som')).toBeTruthy();
  });

  it('todos os eventos carregam experimento, variante, UTMs e horário de SP', () => {
    render(<LandingIntro commercial={COMMERCIALS.racao} preview onDone={() => undefined} />);
    const e = sent()[0];
    expect(e.properties.sp_time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(e.properties.experiment_id).toBeTruthy();
    expect(e.utm_source).toBe('instagram');
  });

  it('comercial da ração: pôster com "A última porção de ração." e o vídeo da ração', () => {
    render(<LandingIntro commercial={COMMERCIALS.racao} preview={false} onDone={() => undefined} />);
    expect(screen.getByText(/Um filme de 27 segundos/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('A última porção');
    expect(video().getAttribute('src')).toBe('/landing/comercial/petmol-comercial-v1.mp4');
  });

  it('comercial do Pet Sumido: pôster "Operação Fuga." com a frase do filme e o vídeo do Pet Sumido', () => {
    render(<LandingIntro commercial={COMMERCIALS['pet-sumido']} preview={false} onDone={() => undefined} />);
    expect(screen.getByText(/Um filme de 45 segundos/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Operação');
    expect(screen.getByText('Biscoito tem um plano.')).toBeTruthy();
    expect(video().getAttribute('src')).toBe('/landing/comercial/petmol-pet-sumido-v1.mp4');
    expect(video().getAttribute('poster')).toBe('/landing/comercial/petmol-pet-sumido-poster-v1.webp');
  });

  it('todo evento leva qual comercial foi exibido (para separar os dois no painel)', () => {
    setIntroMode('shown', 'pet-sumido');
    render(<LandingIntro commercial={COMMERCIALS['pet-sumido']} preview={false} onDone={() => undefined} />);
    fireEvent.click(screen.getByText(/Assistir com som/));
    const evs = sent();
    expect(evs.length).toBeGreaterThan(0);
    for (const e of evs) expect(e.properties.commercial).toBe('pet-sumido');
    setIntroMode('none');
  });
});
