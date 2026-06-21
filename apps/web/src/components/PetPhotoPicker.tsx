'use client';

import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  ChangeEvent,
} from 'react';
import { Camera, Image as ImageIcon, X, Check } from 'lucide-react';
import imageCompression from 'browser-image-compression';

// Square export size in px
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

interface Transform { scale: number; x: number; y: number }

export function PetPhotoPicker({ initialSrc, onConfirm, onCancel }: PetPhotoPickerProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Persistent refs — never trigger re-renders
  const naturalSize = useRef({ w: 1, h: 1 });
  const containerSize = useRef(300);
  const tr = useRef<Transform>({ scale: 1, x: 0, y: 0 });
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);

  // ── Helpers (all ref-based, stable identity) ──────────────────────────────

  const getMinScale = useCallback((): number => {
    const { w, h } = naturalSize.current;
    const cs = containerSize.current;
    if (!w || !h || !cs) return 1;
    return Math.max(cs / w, cs / h);
  }, []);

  const clamp = useCallback((t: Transform): Transform => {
    const { w, h } = naturalSize.current;
    const cs = containerSize.current;
    const iw = w * t.scale;
    const ih = h * t.scale;
    const maxX = Math.max(0, (iw - cs) / 2);
    const maxY = Math.max(0, (ih - cs) / 2);
    return {
      scale: t.scale,
      x: Math.max(-maxX, Math.min(maxX, t.x)),
      y: Math.max(-maxY, Math.min(maxY, t.y)),
    };
  }, []);

  // Apply transform directly to DOM — zero React renders during gesture
  const applyTransform = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    const { scale, x, y } = tr.current;
    el.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
  }, []);

  const resetTransform = useCallback(() => {
    const minS = getMinScale();
    tr.current = clamp({ scale: minS, x: 0, y: 0 });
    applyTransform();
  }, [getMinScale, clamp, applyTransform]);

  // ── Measure container ─────────────────────────────────────────────────────

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      containerSize.current = entry.contentRect.width;
      if (imgSrc) resetTransform();
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [imgSrc, resetTransform]);

  // ── Load initial image ────────────────────────────────────────────────────

  useEffect(() => {
    if (!initialSrc) return;
    const img = document.createElement('img');
    img.onload = () => {
      naturalSize.current = { w: img.naturalWidth, h: img.naturalHeight };
      setImgSrc(initialSrc);
    };
    img.src = initialSrc;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset transform when new image is rendered ────────────────────────────

  useEffect(() => {
    if (!imgSrc || !imgRef.current) return;
    imgRef.current.style.transformOrigin = 'center center';
    imgRef.current.style.willChange = 'transform';
    resetTransform();
  }, [imgSrc, resetTransform]);

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

      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(compressed);
      });

      await new Promise<void>((resolve, reject) => {
        const probe = document.createElement('img');
        probe.onload = () => {
          naturalSize.current = { w: probe.naturalWidth, h: probe.naturalHeight };
          resolve();
        };
        probe.onerror = reject;
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

  // ── Pointer events (pan + pinch) ──────────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      lastPinch.current = {
        dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
        cx: (pts[0].x + pts[1].x) / 2,
        cy: (pts[0].y + pts[1].y) / 2,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!activePointers.current.has(e.pointerId)) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const prev = activePointers.current.get(e.pointerId)!;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(activePointers.current.values());
    const cs = containerSize.current;
    const t = tr.current;

    if (pts.length === 1) {
      // ── Pan ──
      tr.current = clamp({ ...t, x: t.x + (e.clientX - prev.x), y: t.y + (e.clientY - prev.y) });
      applyTransform();
    } else if (pts.length >= 2 && lastPinch.current) {
      // ── Pinch zoom + pan simultaneously ──
      const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const newCx = (pts[0].x + pts[1].x) / 2;
      const newCy = (pts[0].y + pts[1].y) / 2;

      const minS = getMinScale();
      const maxS = minS * MAX_ZOOM_FACTOR;
      const newScale = Math.max(minS, Math.min(maxS, t.scale * (newDist / lastPinch.current.dist)));
      const actualDelta = newScale / t.scale;

      // Pinch center relative to container center
      const pcx = newCx - rect.left - cs / 2;
      const pcy = newCy - rect.top - cs / 2;
      const panDx = newCx - lastPinch.current.cx;
      const panDy = newCy - lastPinch.current.cy;

      tr.current = clamp({
        scale: newScale,
        x: pcx * (1 - actualDelta) + t.x * actualDelta + panDx,
        y: pcy * (1 - actualDelta) + t.y * actualDelta + panDy,
      });
      applyTransform();

      lastPinch.current = { dist: newDist, cx: newCx, cy: newCy };
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) lastPinch.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cs = containerSize.current;
    const t = tr.current;
    const minS = getMinScale();
    const maxS = minS * MAX_ZOOM_FACTOR;
    const factor = e.deltaY < 0 ? 1.07 : 0.93;
    const newScale = Math.max(minS, Math.min(maxS, t.scale * factor));
    const actualDelta = newScale / t.scale;
    const pcx = e.clientX - rect.left - cs / 2;
    const pcy = e.clientY - rect.top - cs / 2;
    tr.current = clamp({
      scale: newScale,
      x: pcx * (1 - actualDelta) + t.x * actualDelta,
      y: pcy * (1 - actualDelta) + t.y * actualDelta,
    });
    applyTransform();
  };

  // ── Confirm: draw current view to canvas ──────────────────────────────────

  const handleConfirm = () => {
    if (!imgSrc || !canvasRef.current) { onCancel(); return; }
    setProcessing(true);
    const canvas = canvasRef.current;
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);

    const img = document.createElement('img');
    img.onload = () => {
      const ratio = EXPORT_SIZE / containerSize.current;
      const { w, h } = naturalSize.current;
      const { scale, x, y } = tr.current;
      ctx.drawImage(
        img,
        (EXPORT_SIZE - w * scale * ratio) / 2 + x * ratio,
        (EXPORT_SIZE - h * scale * ratio) / 2 + y * ratio,
        w * scale * ratio,
        h * scale * ratio,
      );
      onConfirm(canvas.toDataURL('image/jpeg', EXPORT_QUALITY));
      setProcessing(false);
    };
    img.onerror = () => { setProcessing(false); onCancel(); };
    img.src = imgSrc;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col" style={{ touchAction: 'none' }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 pt-14 pb-4 bg-black">
        <button type="button" onClick={onCancel} disabled={processing}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20">
          <X className="w-5 h-5" />
        </button>
        <span className="text-white/80 text-sm font-semibold tracking-wide">Ajuste a foto</span>
        {imgSrc ? (
          <button type="button" onClick={handleConfirm} disabled={processing}
            className="w-10 h-10 rounded-full bg-[#0066ff] flex items-center justify-center text-white disabled:opacity-50 active:bg-[#0047cc]">
            <Check className="w-5 h-5" />
          </button>
        ) : <div className="w-10" />}
      </div>

      {/* Square crop frame */}
      <div className="flex-1 flex items-center bg-black">
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden bg-black"
          style={{
            aspectRatio: '1 / 1',
            touchAction: 'none',
            cursor: imgSrc ? 'grab' : 'default',
            // Subtle inset border to show crop boundary
            boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.15)',
          }}
          onPointerDown={imgSrc ? onPointerDown : undefined}
          onPointerMove={imgSrc ? onPointerMove : undefined}
          onPointerUp={imgSrc ? onPointerUp : undefined}
          onPointerCancel={imgSrc ? onPointerUp : undefined}
          onWheel={imgSrc ? onWheel : undefined}
        >
          {imgSrc ? (
            <img
              ref={imgRef}
              src={imgSrc}
              alt="preview"
              draggable={false}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                maxWidth: 'none',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
              <ImageIcon className="w-20 h-20 text-white/15" />
              <span className="text-white/35 text-sm text-center px-10 leading-relaxed">
                Escolha uma foto da galeria ou tire uma nova
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex-shrink-0 bg-black px-6 pt-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] space-y-2">
        {error && <p className="text-rose-300 text-xs text-center pb-1">{error}</p>}
        {processing && <p className="text-white/45 text-xs text-center pb-1">Preparando foto…</p>}

        <div className="flex gap-3">
          {/* Camera — opens camera directly on mobile */}
          <label className={`relative flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-white/10 text-white active:bg-white/20 transition-colors ${processing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
            <Camera className="w-5 h-5" />
            <span className="text-xs font-medium">Câmera</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={processing}
              onChange={handleFileChange}
            />
          </label>

          {/* Gallery */}
          <label className={`relative flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-white/10 text-white active:bg-white/20 transition-colors ${processing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
            <ImageIcon className="w-5 h-5" />
            <span className="text-xs font-medium">Galeria</span>
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={processing}
              onChange={handleFileChange}
            />
          </label>

          {imgSrc && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={processing}
              className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-[#0066ff] text-white active:bg-[#0047cc] transition-colors disabled:opacity-50"
            >
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
