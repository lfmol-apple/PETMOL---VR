'use client';

import React, {
  useRef, useState, useCallback, useEffect, useLayoutEffect, ChangeEvent,
} from 'react';
import { Camera, Image as ImageIcon, X, Check } from 'lucide-react';
import imageCompression from 'browser-image-compression';

const EXPORT_SIZE = 720;
const EXPORT_QUALITY = 0.82;
const IMPORT_MAX_SIZE_MB = 0.8;
const IMPORT_MAX_WIDTH = 1600;
const MAX_ZOOM_FACTOR = 5;

interface PetPhotoPickerProps {
  initialSrc?: string | null;
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}

interface TR { scale: number; x: number; y: number }

export function PetPhotoPicker({ initialSrc, onConfirm, onCancel }: PetPhotoPickerProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // All gesture state lives in refs — zero React re-renders during gestures
  const nat = useRef({ w: 1, h: 1 });      // natural image dimensions
  const csRef = useRef(0);                  // container side (square)
  const tr = useRef<TR>({ scale: 1, x: 0, y: 0 });
  const rafId = useRef<number | null>(null);

  // ── Helpers (refs only → stable identity, no deps) ────────────────────────

  const minScale = useCallback((): number => {
    const { w, h } = nat.current;
    const cs = csRef.current;
    // contain: mostra a foto inteira sem zoom forçado
    return cs > 0 ? Math.min(cs / w, cs / h) : 1;
  }, []);

  const clamp = useCallback((t: TR): TR => {
    const { w, h } = nat.current;
    const cs = csRef.current;
    const maxX = Math.max(0, (w * t.scale - cs) / 2);
    const maxY = Math.max(0, (h * t.scale - cs) / 2);
    return {
      scale: t.scale,
      x: Math.max(-maxX, Math.min(maxX, t.x)),
      y: Math.max(-maxY, Math.min(maxY, t.y)),
    };
  }, []);

  // Direct DOM transform — no React involvement
  // Image is fixed at natural px size, positioned at top:0 left:0, transform-origin:0 0
  // translate includes centering: bx = (cs - w*scale)/2 + panX
  const flush = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    const { scale, x, y } = tr.current;
    const cs = csRef.current;
    const { w, h } = nat.current;
    const bx = (cs - w * scale) / 2 + x;
    const by = (cs - h * scale) / 2 + y;
    el.style.transform = `translate(${bx}px,${by}px) scale(${scale})`;
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(() => { rafId.current = null; flush(); });
  }, [flush]);

  // Set image CSS once after load, then reset transform
  const reset = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    const { w, h } = nat.current;
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.maxWidth = 'none';
    el.style.maxHeight = 'none';
    el.style.transformOrigin = '0 0';
    el.style.willChange = 'transform';
    el.style.userSelect = 'none';
    el.style.pointerEvents = 'none';
    tr.current = clamp({ scale: minScale(), x: 0, y: 0 });
    flush();
  }, [minScale, clamp, flush]);

  // ── Measure container via ResizeObserver ──────────────────────────────────

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      csRef.current = entry.contentRect.width;
      reset();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [reset]);

  // ── Load initialSrc on mount ──────────────────────────────────────────────

  useEffect(() => {
    if (!initialSrc) return;
    const probe = document.createElement('img');
    probe.onload = () => {
      nat.current = { w: probe.naturalWidth, h: probe.naturalHeight };
      setImgSrc(initialSrc);
    };
    probe.src = initialSrc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reset transform after new image renders ───────────────────────────────

  useEffect(() => {
    if (!imgSrc) return;
    // RAF ensures the <img> is in the DOM before we touch it
    requestAnimationFrame(reset);
  }, [imgSrc, reset]);

  // ── File loading ──────────────────────────────────────────────────────────

  const readFile = async (file: File) => {
    setError(null);
    setProcessing(true);
    try {
      const compressed = file.type.startsWith('image/')
        ? await imageCompression(file, {
            maxSizeMB: IMPORT_MAX_SIZE_MB,
            maxWidthOrHeight: IMPORT_MAX_WIDTH,
            useWebWorker: true,
            initialQuality: 0.82,
            fileType: 'image/jpeg',
          }).catch(() => file)
        : file;

      const src = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = e => res(e.target?.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(compressed);
      });

      await new Promise<void>((res, rej) => {
        const probe = document.createElement('img');
        probe.onload = () => { nat.current = { w: probe.naturalWidth, h: probe.naturalHeight }; res(); };
        probe.onerror = rej;
        probe.src = src;
      });

      setImgSrc(src);
    } catch {
      setError('Não consegui abrir essa foto. Tente JPG, PNG ou WebP.');
    } finally {
      setProcessing(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await readFile(file);
    e.target.value = '';
  };

  // ── Gesture handling — imperative listeners, passive:false ────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !imgSrc) return;

    const ptrs = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; cx: number; cy: number } | null = null;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) {
        const [p1, p2] = [...ptrs.values()];
        pinch = {
          dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
          cx: (p1.x + p2.x) / 2,
          cy: (p1.y + p2.y) / 2,
        };
      }
    };

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId)!;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...ptrs.values()];
      const t = tr.current;
      const cs = csRef.current;

      if (pts.length === 1) {
        tr.current = clamp({ ...t, x: t.x + (e.clientX - prev.x), y: t.y + (e.clientY - prev.y) });
      } else if (pts.length >= 2 && pinch) {
        const [p1, p2] = pts;
        const newDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const newCx = (p1.x + p2.x) / 2;
        const newCy = (p1.y + p2.y) / 2;
        const rect = el.getBoundingClientRect();

        const ms = minScale();
        const newS = Math.max(ms, Math.min(ms * MAX_ZOOM_FACTOR, t.scale * (newDist / pinch.dist)));
        const delta = newS / t.scale;

        // Pinch center relative to container center
        const pcx = newCx - rect.left - cs / 2;
        const pcy = newCy - rect.top - cs / 2;

        tr.current = clamp({
          scale: newS,
          x: pcx * (1 - delta) + t.x * delta + (newCx - pinch.cx),
          y: pcy * (1 - delta) + t.y * delta + (newCy - pinch.cy),
        });

        pinch = { dist: newDist, cx: newCx, cy: newCy };
      }

      scheduleFlush();
    };

    const onUp = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
    };

    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [imgSrc, clamp, minScale, scheduleFlush]);

  // ── Scroll wheel (desktop) ────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !imgSrc) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cs = csRef.current;
      const t = tr.current;
      const ms = minScale();
      const newS = Math.max(ms, Math.min(ms * MAX_ZOOM_FACTOR, t.scale * (e.deltaY < 0 ? 1.07 : 0.93)));
      const delta = newS / t.scale;
      const pcx = e.clientX - rect.left - cs / 2;
      const pcy = e.clientY - rect.top - cs / 2;
      tr.current = clamp({ scale: newS, x: pcx * (1 - delta) + t.x * delta, y: pcy * (1 - delta) + t.y * delta });
      scheduleFlush();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [imgSrc, clamp, minScale, scheduleFlush]);

  // ── Confirm: reproduce current view on canvas ─────────────────────────────
  // Uses getBoundingClientRect() directly — no stale ref risk.
  // Transform math: image top-left in container = ((cs - w*s)/2 + x, (cs - h*s)/2 + y)
  // Scale to EXPORT_SIZE by multiplying all coords by ratio = EXPORT_SIZE / cs.

  const handleConfirm = () => {
    if (!imgSrc || !canvasRef.current || !containerRef.current) { onCancel(); return; }
    setProcessing(true);
    const canvas = canvasRef.current;
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);

    const img = document.createElement('img');
    img.onload = () => {
      const cs = containerRef.current!.getBoundingClientRect().width;
      const R = EXPORT_SIZE / cs;
      const { w, h } = nat.current;
      const { scale, x, y } = tr.current;
      ctx.drawImage(
        img,
        ((cs - w * scale) / 2 + x) * R,
        ((cs - h * scale) / 2 + y) * R,
        w * scale * R,
        h * scale * R,
      );
      onConfirm(canvas.toDataURL('image/jpeg', EXPORT_QUALITY));
      setProcessing(false);
    };
    img.onerror = () => { setProcessing(false); onCancel(); };
    img.src = imgSrc;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 pt-14 pb-4">
        <button type="button" onClick={onCancel} disabled={processing}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20">
          <X className="w-5 h-5" />
        </button>
        <span className="text-white/80 text-sm font-semibold">Ajuste a foto</span>
        {imgSrc ? (
          <button type="button" onClick={handleConfirm} disabled={processing}
            className="w-10 h-10 rounded-full bg-[#0066ff] flex items-center justify-center text-white disabled:opacity-50 active:bg-[#0047cc]">
            <Check className="w-5 h-5" />
          </button>
        ) : <div className="w-10" />}
      </div>

      {/* Square crop frame — overflow:hidden clips the image */}
      <div className="flex-1 flex items-center bg-black">
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden bg-black"
          style={{ aspectRatio: '1 / 1', touchAction: 'none', cursor: imgSrc ? 'grab' : 'default' }}
        >
          {imgSrc
            ? <img ref={imgRef} src={imgSrc} alt="preview" draggable={false} />
            : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                <ImageIcon className="w-20 h-20 text-white/15" />
                <span className="text-white/35 text-sm text-center px-10 leading-relaxed">
                  Escolha uma foto da galeria ou tire uma nova
                </span>
              </div>
            )}
        </div>
      </div>

      {/* Bottom */}
      <div className="flex-shrink-0 px-6 pt-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] space-y-2">
        {error && <p className="text-rose-300 text-xs text-center pb-1">{error}</p>}
        {processing && <p className="text-white/45 text-xs text-center pb-1">Preparando foto…</p>}
        <div className="flex gap-3">
          <label className={`relative flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-white/10 text-white active:bg-white/20 transition-colors ${processing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
            <Camera className="w-5 h-5" />
            <span className="text-xs font-medium">Câmera</span>
            <input type="file" accept="image/*" capture="environment" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={processing} onChange={handleFileChange} />
          </label>
          <label className={`relative flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-white/10 text-white active:bg-white/20 transition-colors ${processing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
            <ImageIcon className="w-5 h-5" />
            <span className="text-xs font-medium">Galeria</span>
            <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={processing} onChange={handleFileChange} />
          </label>
          {imgSrc && (
            <button type="button" onClick={handleConfirm} disabled={processing}
              className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-[#0066ff] text-white disabled:opacity-50 active:bg-[#0047cc] transition-colors">
              <Check className="w-5 h-5" />
              <span className="text-xs font-medium">{processing ? 'Salvando…' : 'Confirmar'}</span>
            </button>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
