'use client';

/**
 * PetPhotoPicker — modern photo cropper modal.
 *
 * Features:
 *  - Drag to reposition the photo inside the rectangular frame
 *  - Pinch / scroll wheel to zoom
 *  - Zoom slider
 *  - Canvas-based rectangular crop → returns a PNG Blob
 *  - Camera capture button (mobile "environment" camera)
 *  - Gallery / file picker button
 */

import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  ChangeEvent,
} from 'react';
import { Camera, Image as ImageIcon, X, Check, ZoomIn, ZoomOut } from 'lucide-react';
import imageCompression from 'browser-image-compression';

const CROP_W = 320; // px — width of the rectangular preview / canvas output
const CROP_H = 200; // px — height of the rectangular preview / canvas output
const EXPORT_QUALITY = 0.72;
const IMPORT_MAX_SIZE_MB = 0.45;
const IMPORT_MAX_WIDTH = 1280;

interface PetPhotoPickerProps {
  /** Current photo URL or Data-URL to prefill the picker */
  initialSrc?: string | null;
  /** Called when user confirms the crop — receives a base64 PNG Data-URL */
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}

export function PetPhotoPicker({ initialSrc, onConfirm, onCancel }: PetPhotoPickerProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(initialSrc ?? null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const imgNatural = useRef<{ w: number; h: number }>({ w: 1, h: 1 });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Load image ───────────────────────────────────────────────────────────
  const readFile = async (file: File) => {
    setError(null);
    setProcessing(true);
    const preparedFile = file.type.startsWith('image/')
      ? await imageCompression(file, {
          maxSizeMB: IMPORT_MAX_SIZE_MB,
          maxWidthOrHeight: IMPORT_MAX_WIDTH,
          useWebWorker: true,
          initialQuality: 0.72,
          fileType: 'image/jpeg',
        }).catch(() => file)
      : file;

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = document.createElement('img');
      img.onload = () => {
        imgNatural.current = { w: img.naturalWidth, h: img.naturalHeight };
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setImgSrc(src);
        setProcessing(false);
      };
      img.onerror = () => {
        setProcessing(false);
        setError('Não consegui abrir essa foto. Tente JPG, PNG ou WebP.');
      };
      img.src = src;
    };
    reader.onerror = () => {
      setProcessing(false);
      setError('Não consegui ler essa foto. Tente outra imagem.');
    };
    reader.readAsDataURL(preparedFile);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await readFile(file);
    e.target.value = '';
  };

  // ── Helpers: rendered image dimensions inside the frame ──────────────────
  const getRenderedSize = useCallback(() => {
    const { w, h } = imgNatural.current;
    const aspect = w / h;
    const frameAspect = CROP_W / CROP_H;
    let rw: number, rh: number;
    if (aspect >= frameAspect) {
      // wider than frame — fit height
      rh = CROP_H;
      rw = rh * aspect;
    } else {
      // taller than frame — fit width
      rw = CROP_W;
      rh = rw / aspect;
    }
    return { rw: rw * zoom, rh: rh * zoom };
  }, [zoom]);

  const clampOffset = useCallback(
    (ox: number, oy: number) => {
      const { rw, rh } = getRenderedSize();
      const maxX = Math.max(0, (rw - CROP_W) / 2);
      const maxY = Math.max(0, (rh - CROP_H) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, ox)),
        y: Math.max(-maxY, Math.min(maxY, oy)),
      };
    },
    [getRenderedSize]
  );

  // ── Pointer drag ─────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    lastPointer.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !lastPointer.current) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      setOffset((prev) => clampOffset(prev.x + dx, prev.y + dy));
    },
    [dragging, clampOffset]
  );

  const onPointerUp = () => { setDragging(false); lastPointer.current = null; };

  // ── Scroll / pinch zoom ──────────────────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const next = Math.min(3, Math.max(1, z - e.deltaY * 0.002));
      return next;
    });
  };

  useEffect(() => {
    setOffset((prev) => clampOffset(prev.x, prev.y));
  }, [zoom, clampOffset]);

  // ── Confirm: draw to canvas, export PNG ──────────────────────────────────
  const handleConfirm = () => {
    if (!imgSrc || !canvasRef.current) { onCancel(); return; }
    setProcessing(true);
    const canvas = canvasRef.current;
    canvas.width = CROP_W;
    canvas.height = CROP_H;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, CROP_W, CROP_H);

    const img = document.createElement('img');
    img.onload = () => {
      const { rw, rh } = getRenderedSize();
      // Draw image centred + offset — no circular clip, full rectangle
      const sx = (CROP_W - rw) / 2 + offset.x;
      const sy = (CROP_H - rh) / 2 + offset.y;
      ctx.drawImage(img, sx, sy, rw, rh);
      onConfirm(canvas.toDataURL('image/jpeg', EXPORT_QUALITY));
      setProcessing(false);
    };
    img.onerror = () => {
      setProcessing(false);
      onCancel();
    };
    img.src = imgSrc;
  };

  // ── Image size for percentage-based positioning inside responsive frame ──
  const { rw, rh } = imgSrc ? getRenderedSize() : { rw: 0, rh: 0 };

  return (
    <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#111] rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[90dvh]">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={processing}
            className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="text-white/80 text-sm font-medium">Ajuste a foto</span>
          {imgSrc ? (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={processing}
              className="p-2 rounded-full bg-[#0066ff] text-white hover:bg-[#0047cc] transition-colors disabled:opacity-50"
            >
              <Check className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-9" />
          )}
        </div>

        {/* Rectangular preview frame — fixed pixel size matches canvas export */}
        <div className="flex items-center justify-center px-4 py-2">
          <div
            className="relative overflow-hidden rounded-2xl border-2 border-white/30 shadow-2xl"
            style={{
              width: CROP_W,
              height: CROP_H,
              maxWidth: '100%',
              cursor: imgSrc ? (dragging ? 'grabbing' : 'grab') : 'default',
            }}
            onPointerDown={imgSrc ? onPointerDown : undefined}
            onPointerMove={imgSrc ? onPointerMove : undefined}
            onPointerUp={imgSrc ? onPointerUp : undefined}
            onPointerCancel={onPointerUp}
            onWheel={imgSrc ? onWheel : undefined}
          >
            {imgSrc ? (
              <img
                src={imgSrc}
                alt="preview"
                draggable={false}
                style={{
                  position: 'absolute',
                  width: rw,
                  height: rh,
                  top: (CROP_H - rh) / 2 + offset.y,
                  left: (CROP_W - rw) / 2 + offset.x,
                  userSelect: 'none',
                  pointerEvents: 'none',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-white/5 gap-3">
                <ImageIcon className="w-16 h-16 text-white/30" />
                <span className="text-white/50 text-sm text-center px-6">
                  Escolha uma foto da galeria ou tire uma nova
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Hint */}
        {imgSrc && (
          <p className="text-white/40 text-xs text-center pb-1">
            Arraste para mover · Scroll ou belisce para ampliar
          </p>
        )}

        {processing && (
          <p className="pb-1 text-center text-xs text-white/55">
            Preparando foto...
          </p>
        )}

        {error && (
          <p className="px-6 pb-2 text-center text-xs font-medium text-rose-200">
            {error}
          </p>
        )}

        {/* Zoom slider */}
        {imgSrc && (
          <div className="px-8 pb-2 flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-white/40 shrink-0" />
            <input
              type="range"
              min="1"
              max="3"
              step="0.02"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-[#0066ff]"
            />
            <ZoomIn className="w-4 h-4 text-white/40 shrink-0" />
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex gap-2 px-4 pb-5 pt-2 sm:gap-3 sm:px-6 sm:pb-8">
          <label
            className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-colors ${
              processing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
            }`}
          >
            <Camera className="w-5 h-5" />
            <span className="text-xs font-medium">Câmera</span>
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              disabled={processing}
              onChange={handleFileChange}
            />
          </label>
          <label
            className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-colors ${
              processing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
            }`}
          >
            <ImageIcon className="w-5 h-5" />
            <span className="text-xs font-medium">Galeria</span>
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              disabled={processing}
              onChange={handleFileChange}
            />
          </label>
          {imgSrc && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={processing}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-[#0066ff] text-white hover:bg-[#0047cc] transition-colors disabled:opacity-50"
            >
              <Check className="w-5 h-5" />
              <span className="text-xs font-medium">{processing ? 'Salvando...' : 'Confirmar'}</span>
            </button>
          )}
        </div>

        {/* Off-screen canvas for export */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
