'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { detectStorePlatform } from '@/lib/appStores';
import { appStoreUrl, googlePlayUrl } from '@/lib/landingLinks';
import { readLandingContext } from '@/lib/landingContext';
import { trackDownloadClick, trackLandingEvent } from '@/lib/landingEvents';
import { getLandingVariant } from '@/lib/landingExperiment';
import { INTRO_POSTER_SRC, INTRO_VIDEO_SRC, markIntroSeen } from '@/lib/landingIntro';

type Phase = 'poster' | 'loading' | 'playing' | 'leaving';

const START_TIMEOUT_MS = 10000; // sem começar a tocar em 10 s após o toque → entra direto na landing
const STALL_TIMEOUT_MS = 9000;  // travado no meio por 9 s → entra direto na landing
const FADE_MS = 320;

/**
 * Entrada em vídeo (só celular): pôster → "Assistir com som" → comercial → landing normal, na mesma página.
 * O som só começa com o toque (sem autoplay com áudio). Qualquer falha revela a landing na hora.
 * A landing já está montada por baixo — revelar não recarrega nada nem deixa tela preta.
 */
export function LandingIntro({ preview, onDone }: { preview: boolean; onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('poster');
  const [muted, setMuted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const phaseRef = useRef<Phase>('poster');
  const startedRef = useRef(false);
  const posterSentRef = useRef(false);
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const platformRef = useRef<'ios' | 'android' | 'desktop'>('desktop');
  const campaignRef = useRef({});

  const setPh = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  const track = useCallback((name: Parameters<typeof trackLandingEvent>[0], extra: Parameters<typeof trackLandingEvent>[1] = {}) => {
    trackLandingEvent(name, extra, getLandingVariant());
  }, []);
  const progress = () => {
    const v = videoRef.current;
    return { watched_s: v?.currentTime ?? 0, duration_s: v && Number.isFinite(v.duration) ? v.duration : undefined, muted: v ? v.muted : undefined };
  };

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimer();
    try { videoRef.current?.pause(); } catch { /* noop */ }
    setPh('leaving');
    setTimeout(onDone, reduced ? 0 : FADE_MS);
  }, [onDone, reduced]);

  const fail = useCallback((reason: string) => {
    if (doneRef.current) return;
    track('landing_intro_video_error', { reason, ...progress() });
    finish();
  }, [finish, track]);

  useEffect(() => {
    markIntroSeen();
    try {
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      platformRef.current = detectStorePlatform(navigator.userAgent || '', navigator.maxTouchPoints || 0, navigator.platform || '');
      campaignRef.current = readLandingContext(window.location.search, navigator.userAgent || '').campaign;
    } catch { /* segue com padrões */ }
    if (!posterSentRef.current) { posterSentRef.current = true; track('landing_intro_poster_view'); } // 1× por exibição (o modo estrito do React roda o efeito 2×)
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = prev; clearTimer(); };
  }, [track]);

  // Vídeo: eventos nativos
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const armStall = () => { clearTimer(); timerRef.current = setTimeout(() => fail(startedRef.current ? 'stalled' : 'start_timeout'), startedRef.current ? STALL_TIMEOUT_MS : START_TIMEOUT_MS); };
    const onPlaying = () => {
      clearTimer();
      if (!startedRef.current) {
        startedRef.current = true;
        setPh('playing');
        track('landing_intro_video_start', { muted: v.muted, duration_s: Number.isFinite(v.duration) ? v.duration : undefined });
      }
    };
    const onEnded = () => { track('landing_intro_video_complete', progress()); finish(); };
    const onError = () => fail('media_error');
    const onWaiting = () => { if (phaseRef.current === 'playing' || phaseRef.current === 'loading') armStall(); };
    v.addEventListener('playing', onPlaying);
    v.addEventListener('ended', onEnded);
    v.addEventListener('error', onError);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('stalled', onWaiting);
    return () => {
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('error', onError);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('stalled', onWaiting);
    };
  }, [fail, finish, track]);

  const watch = () => {
    const v = videoRef.current;
    if (!v || phaseRef.current !== 'poster') return;
    track('landing_intro_watch_click');
    setPh('loading');
    v.muted = false;
    v.volume = 1;
    setMuted(false);
    timerRef.current = setTimeout(() => fail('start_timeout'), START_TIMEOUT_MS);
    // play() dentro do toque do visitante: é isso que libera o áudio no iPhone e no Android
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => fail('play_rejected'));
  };

  const skip = () => {
    if (phaseRef.current === 'leaving') return;
    track('landing_intro_skip', { ...progress(), reason: phaseRef.current === 'poster' ? 'poster' : 'video' });
    finish();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const store = platformRef.current === 'android' ? 'google' : platformRef.current === 'ios' ? 'apple' : 'auto';
  const href = platformRef.current === 'android'
    ? googlePlayUrl('intro-video', campaignRef.current)
    : appStoreUrl('intro-video', campaignRef.current);
  const onDownload = () => trackDownloadClick({ button: 'cta', placement: 'intro-video', store });

  const playingUi = phase === 'loading' || phase === 'playing';
  const fade = reduced ? '' : 'transition-opacity duration-300';
  const pill = 'flex h-10 items-center justify-center rounded-full bg-black/55 px-3.5 text-[13px] font-bold text-white backdrop-blur-md active:scale-95';

  // Portal no <body>: fora da landing (que fica `inert` enquanto a introdução está aberta) e de qualquer overflow/touch-action dela.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Comercial do PETMOL"
      data-landing-intro="1"
      data-preview={preview ? '1' : undefined}
      className={`fixed inset-0 z-[600] overflow-hidden bg-black ${fade} ${phase === 'leaving' ? 'opacity-0' : 'opacity-100'}`}
      style={{ height: '100dvh' }}
    >
      {/* Vídeo: object-contain = nunca corta o rosto do cão, o pote nem as telas do app */}
      <video
        ref={videoRef}
        src={INTRO_VIDEO_SRC}
        poster={INTRO_POSTER_SRC}
        preload="none"
        playsInline
        className="absolute inset-0 h-full w-full bg-black object-contain"
      />

      {/* Pôster (até o vídeo começar de fato) */}
      <div className={`absolute inset-0 ${fade} ${phase === 'playing' || phase === 'leaving' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={INTRO_POSTER_SRC} alt="" width={720} height={1280} fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/35" />

        <div className="absolute inset-x-0 top-0 px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}>
          <span className="flex items-center text-[30px] font-black leading-none tracking-tight text-white drop-shadow">
            Petmol<span className="ml-1.5 text-[26px]" aria-hidden="true">🐾</span>
          </span>
        </div>

        {phase === 'poster' && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 text-center" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
            <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/75">Um filme de 27 segundos</p>
            <h1 className="mt-1 text-[34px] font-black leading-[1.05] tracking-tight text-white" style={{ textShadow: '0 2px 18px rgba(0,0,0,.55)' }}>
              A última porção<br />de ração.
            </h1>
            <button
              type="button"
              onClick={watch}
              className={`mt-6 flex w-full max-w-xs items-center justify-center gap-2.5 rounded-2xl bg-white px-6 py-4 text-[19px] font-black tracking-tight text-[#0056D2] shadow-2xl shadow-black/40 active:scale-[0.98] ${reduced ? '' : 'landing-cta'}`}
            >
              <span aria-hidden="true">▶</span> Assistir com som
            </button>
            <button type="button" onClick={skip} className="mt-3 min-h-[44px] px-4 text-[15px] font-bold text-white/90 underline underline-offset-4 active:opacity-70">
              Pular e conhecer o PETMOL
            </button>
          </div>
        )}

        {phase === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center" role="status" aria-live="polite">
            <div className="flex items-center gap-3 rounded-full bg-black/55 px-5 py-3 text-[15px] font-bold text-white backdrop-blur-md">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              Carregando o filme…
            </div>
          </div>
        )}
      </div>

      {/* Controles: sobre o comercial ficam só nos cantos de cima, pequenos */}
      {playingUi && (
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}>
          <button type="button" onClick={toggleMute} aria-label={muted ? 'Ligar o som' : 'Desligar o som'} aria-pressed={muted}
            className={`${pill} w-10 px-0 text-[18px]`}>
            <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
          </button>
          <a href={href} onClick={onDownload} target="_blank" rel="noopener noreferrer" data-placement="intro-video" data-store="auto"
            className={`${pill} bg-[#0056D2]/90 text-white`}>
            Baixar grátis
          </a>
          <button type="button" onClick={skip} className={pill}>Pular ›</button>
        </div>
      )}
    </div>,
    document.body,
  );
}
