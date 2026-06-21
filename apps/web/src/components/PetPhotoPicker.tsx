'use client';

import React, { useState, ChangeEvent } from 'react';
import { Camera, Image as ImageIcon, X, Check } from 'lucide-react';
import imageCompression from 'browser-image-compression';

const IMPORT_MAX_SIZE_MB = 0.8;
const IMPORT_MAX_WIDTH = 1600;

interface PetPhotoPickerProps {
  initialSrc?: string | null;
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}

export function PetPhotoPicker({ initialSrc, onConfirm, onCancel }: PetPhotoPickerProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(initialSrc ?? null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleConfirm = () => {
    if (!imgSrc) { onCancel(); return; }
    onConfirm(imgSrc);
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 pt-14 pb-4">
        <button type="button" onClick={onCancel} disabled={processing}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20">
          <X className="w-5 h-5" />
        </button>
        <span className="text-white/80 text-sm font-semibold">Foto do pet</span>
        {imgSrc ? (
          <button type="button" onClick={handleConfirm} disabled={processing}
            className="w-10 h-10 rounded-full bg-[#0066ff] flex items-center justify-center text-white disabled:opacity-50 active:bg-[#0047cc]">
            <Check className="w-5 h-5" />
          </button>
        ) : <div className="w-10" />}
      </div>

      {/* Full image preview — no crop */}
      <div className="flex-1 flex items-center justify-center bg-black p-4">
        {imgSrc
          ? (
            <img
              src={imgSrc}
              alt="preview"
              draggable={false}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
            />
          )
          : (
            <div className="flex flex-col items-center justify-center gap-4">
              <ImageIcon className="w-20 h-20 text-white/15" />
              <span className="text-white/35 text-sm text-center px-10 leading-relaxed">
                Escolha uma foto da galeria ou tire uma nova
              </span>
            </div>
          )}
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
              <span className="text-xs font-medium">{processing ? 'Salvando…' : 'Usar foto'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
