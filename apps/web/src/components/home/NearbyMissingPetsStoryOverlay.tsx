'use client';

import { useBackHandler } from '@/lib/backStack';
import { useEffect, useRef, useState } from 'react';
import type { NearbyAlert } from './MissingPetAlertCard';

// Visualizador em tela cheia, estilo story do Instagram — pedido explícito
// do tutor com prints reais do Insta (barra de progresso segmentada, foto
// cheia, gradiente escuro, CTA grande). É o destino de um toque intencional
// num círculo da NearbyMissingPetsStoryRow — diferente da fileira em si
// (que é passiva/silenciável), abrir aqui já é uma ação escolhida pelo
// tutor, então a tela cheia não é intrusiva do jeito que um popup
// automático seria.
const SLIDE_MS = 6000;

interface NearbyMissingPetsStoryOverlayProps {
  alerts: NearbyAlert[];
  initialIndex?: number;
  getPhotoUrl: (photoPath: string | undefined | null) => string | null;
  onClose: () => void;
  onViewCard: (alert: NearbyAlert) => void;
  onSeeThis: (alert: NearbyAlert) => void;
}

export function NearbyMissingPetsStoryOverlay({
  alerts, initialIndex = 0, getPhotoUrl, onClose, onViewCard, onSeeThis,
}: NearbyMissingPetsStoryOverlayProps) {
  useBackHandler(true, onClose);
  const [index, setIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);
  const touchStartY = useRef<number | null>(null);

  const alert = alerts[index];

  useEffect(() => {
    setProgress(0);
    startRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const p = Math.min(1, elapsed / SLIDE_MS);
      setProgress(p);
      if (p >= 1) {
        goNext();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  function goNext() {
    setIndex((i) => {
      if (i >= alerts.length - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }

  function goPrev() {
    setIndex((i) => Math.max(0, i - 1));
  }

  if (!alert) return null;

  const speciesLabel = alert.species === 'cat' ? 'Gato' : alert.species === 'dog' ? 'Cachorro' : 'Pet';
  const photoUrl = getPhotoUrl(alert.photo_url);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black"
      onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
      onTouchMove={(e) => {
        if (touchStartY.current == null) return;
        if (e.touches[0].clientY - touchStartY.current > 80) onClose();
      }}
      onTouchEnd={() => { touchStartY.current = null; }}
    >
      {photoUrl ? (
        <>
          {/* Fundo desfocado da mesma foto — preenche as bordas da tela
              cheia sem precisar cortar/dar zoom na foto real (pedido
              explícito: mostrar o pet inteiro). */}
          <img
            src={photoUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl"
          />
          <div className="absolute inset-0 bg-black/35" />
          {/* Foto real, sempre inteira (object-contain, nunca cover) —
              mesma resolução/qualidade do upload original. */}
          <img src={photoUrl} alt={alert.pet_name} className="absolute inset-0 h-full w-full object-contain" />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-8xl">
          {alert.species === 'cat' ? '🐱' : '🐶'}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/40" />

      {/* barra de progresso segmentada, estilo story */}
      <div className="absolute inset-x-0 flex gap-1 px-3" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>
        {alerts.map((a, i) => (
          <div key={a.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full bg-white"
              style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%`, transition: i === index ? 'none' : 'width 150ms' }}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 22px)' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="h-4 w-4" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      {/* zonas de toque anterior/próximo — atrás do conteúdo, que fica por
          cima onde há botões reais (ver comentário de stacking abaixo). */}
      <button type="button" aria-label="Anterior" onClick={goPrev} className="absolute left-0 top-0 h-full w-1/3" />
      <button type="button" aria-label="Próximo" onClick={goNext} className="absolute right-0 top-0 h-full w-1/3" />

      <div
        className="absolute inset-x-0 bottom-0 px-5 pb-6 text-white"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)' }}
      >
        <span aria-hidden>🚨</span>{' '}
        <span className="text-[15px] font-black leading-tight">ALERTA DE PET SUMIDO PERTO DE VOCÊ!</span>
        <div className="mt-3 space-y-1 text-[14px] font-medium">
          <p><span className="font-black">NOME:</span> {alert.pet_name}</p>
          {alert.breed && <p><span className="font-black">RAÇA:</span> {alert.breed}</p>}
          {!alert.breed && <p><span className="font-black">ESPÉCIE:</span> {speciesLabel}</p>}
          {alert.last_seen_location && (
            <p><span className="font-black">ÚLTIMO LOCAL VISTO:</span> {alert.last_seen_location}</p>
          )}
        </div>
        {/* Botões reais, DEPOIS das zonas de toque no DOM — ficam por cima
            delas na mesma posição (stacking por ordem), então o toque no
            botão nunca aciona o avançar/voltar por baixo. */}
        <div className="relative mt-4 space-y-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSeeThis(alert); }}
            className="w-full rounded-full bg-rose-600 py-3 text-center text-[14px] font-black text-white shadow-lg active:scale-[0.98] transition-transform"
          >
            VI ESTE PET?
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onViewCard(alert); }}
            className="w-full rounded-full bg-white/95 py-3 text-center text-[14px] font-bold text-slate-800 active:scale-[0.98] transition-transform"
          >
            Ver Cartaz Completo
          </button>
        </div>
      </div>
    </div>
  );
}
