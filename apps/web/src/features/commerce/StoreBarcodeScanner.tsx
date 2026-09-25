'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { createPortal } from 'react-dom';
import { X, Zap } from 'lucide-react';
import { useBackHandler } from '@/lib/backStack';

// Só formatos de varejo com dígito verificador: é o que vem na embalagem de ração/petisco/antipulgas e evita
// "leitura fantasma" em arte da embalagem (CODE_128/CODE_39/ITF ficam de fora de propósito).
const RETAIL_FORMATS = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E];

type CameraState = 'starting' | 'scanning' | 'denied' | 'unavailable';

/**
 * Leitor de código de barras da Loja — para quem está numa loja física e quer comparar/comprar o produto
 * na hora. Abre a câmera traseira em tela cheia, lê o primeiro código EAN/UPC e devolve os dígitos.
 * Sem digitação manual de propósito (decisão de produto): ou lê, ou volta para a busca por nome.
 */
export function StoreBarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  useBackHandler(true, onClose);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);
  const [state, setState] = useState<CameraState>('starting');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const stop = useCallback(() => {
    try { controlsRef.current?.stop(); } catch { /* já parado */ }
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) { v.pause(); v.srcObject = null; }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState('unavailable'); return; }
      try {
        const base: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { ...base, facingMode: { exact: 'environment' } }, audio: false });
        } catch (e) {
          if ((e as DOMException)?.name === 'NotAllowedError') throw e;
          stream = await navigator.mediaDevices.getUserMedia({ video: { ...base, facingMode: { ideal: 'environment' } }, audio: false });
        }
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(!!caps.torch);

        const video = videoRef.current;
        if (!video) return;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        video.srcObject = stream;
        await video.play();

        const hints = new Map<DecodeHintType, unknown>([
          [DecodeHintType.POSSIBLE_FORMATS, RETAIL_FORMATS],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80, delayBetweenScanSuccess: 300 });
        setState('scanning');
        controlsRef.current = await reader.decodeFromVideoElement(video, (result) => {
          if (!result || doneRef.current) return;
          const code = result.getText().replace(/\D/g, '');
          if (!/^\d{8,14}$/.test(code)) return;
          doneRef.current = true;
          try { navigator.vibrate?.(60); } catch { /* sem vibração */ }
          stop();
          onDetected(code);
        });
      } catch (e) {
        if (cancelled) return;
        setState((e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      }
    })();
    return () => { cancelled = true; stop(); };
    // onDetected muda a cada render do pai; o leitor só deve subir uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch { /* lanterna indisponível */ }
  };

  // Portal no body: o sheet da Loja tem transform/blur, que prenderia o "fixed" dentro dele em vez da tela toda.
  return createPortal(
    <div className="fixed inset-0 z-[400] bg-black" role="dialog" aria-modal="true" aria-label="Ler código de barras">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline autoPlay />

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)]">
        <button type="button" onClick={onClose} aria-label="Fechar leitor"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur active:scale-95">
          <X className="h-6 w-6" />
        </button>
        {torchSupported && (
          <button type="button" onClick={toggleTorch} aria-pressed={torchOn} aria-label="Lanterna"
            className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur active:scale-95 ${torchOn ? 'bg-amber-400 text-black' : 'bg-black/50 text-white'}`}>
            <Zap className="h-5 w-5" />
          </button>
        )}
      </div>

      {(state === 'starting' || state === 'scanning') && (
        <>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[32vh] w-[82vw] max-w-sm rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
              <div className="landing-cue-arrow absolute inset-x-3 top-1/2 h-0.5 rounded bg-red-500/90" />
            </div>
          </div>
          <p className="absolute inset-x-0 bottom-0 z-10 px-6 pb-[max(env(safe-area-inset-bottom),28px)] text-center text-[15px] font-bold text-white">
            {state === 'starting' ? 'Abrindo a câmera…' : 'Aponte para o código de barras do produto'}
          </p>
        </>
      )}

      {(state === 'denied' || state === 'unavailable') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-[18px] font-black text-white">
            {state === 'denied' ? 'O PETMOL precisa da câmera' : 'Não foi possível abrir a câmera'}
          </p>
          <p className="text-[14px] leading-relaxed text-white/80">
            {state === 'denied'
              ? 'Permita o acesso à câmera nas configurações do aparelho para ler o código de barras. Enquanto isso, você pode buscar o produto pelo nome.'
              : 'Neste aparelho a leitura não está disponível. Você pode buscar o produto pelo nome.'}
          </p>
          <button type="button" onClick={onClose} className="mt-2 rounded-2xl bg-white px-6 py-3 text-[15px] font-black text-slate-900 active:scale-95">
            Buscar pelo nome
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
