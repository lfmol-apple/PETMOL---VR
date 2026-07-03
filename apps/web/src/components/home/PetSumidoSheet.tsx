'use client';

import { useState, useRef, useCallback } from 'react';
import type { PetHealthProfile } from '@/lib/petHealth';

interface PetSumidoSheetProps {
  pet: PetHealthProfile;
  petPhotoUrl?: string | null;
  onClose: () => void;
  onGoHome: () => void;
}

type Step = 'form' | 'card';

const MARK_OPTIONS = [
  'Mancha no olho', 'Pata branca', 'Coleira colorida',
  'Cicatriz', 'Rabo cortado', 'Orelha dobrada',
  'Olhos de cores diferentes', 'Pelagem bicolor', 'Manchas na barriga',
  'Focinho diferente', 'Muito peludo', 'Pelo curto',
];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function PetSumidoSheet({ pet, petPhotoUrl, onClose, onGoHome }: PetSumidoSheetProps) {
  const [step, setStep] = useState<Step>('form');
  const [contact, setContact] = useState('');
  const [lastSeenLocation, setLastSeenLocation] = useState('');
  const [selectedMarks, setSelectedMarks] = useState<string[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(petPhotoUrl || null);
  const [generating, setGenerating] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);

  const toggleMark = (mark: string) => {
    setSelectedMarks(prev =>
      prev.includes(mark)
        ? prev.filter(m => m !== mark)
        : prev.length < 3 ? [...prev, mark] : prev,
    );
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const generateCard = useCallback(async () => {
    const canvas = cardCanvasRef.current;
    if (!canvas) return;
    setGenerating(true);

    const W = 1080;
    const H = 1350;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setGenerating(false); return; }

    // Dark background
    ctx.fillStyle = '#1C1B19';
    ctx.fillRect(0, 0, W, H);

    // Orange header band
    ctx.fillStyle = '#FF5722';
    ctx.fillRect(0, 0, W, 118);
    ctx.fillStyle = '#fff';
    ctx.font = '900 52px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.letterSpacing = '8px';
    ctx.fillText('DESAPARECIDO', 56, 80);
    ctx.font = '400 30px Arial, sans-serif';
    ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const now = new Date();
    ctx.fillText(`${now.getHours()}h${String(now.getMinutes()).padStart(2, '0')} — ${now.toLocaleDateString('pt-BR')}`, W - 300, 80);

    // Photo area
    const photoAreaY = 118;
    const photoAreaH = 700;

    if (photoPreview) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej();
          img.src = photoPreview;
        });
        // Cover crop: fill area keeping aspect ratio
        const scale = Math.max(W / img.naturalWidth, photoAreaH / img.naturalHeight);
        const sw = W / scale;
        const sh = photoAreaH / scale;
        const sx = (img.naturalWidth - sw) / 2;
        const sy = (img.naturalHeight - sh) / 3; // bias toward top (face)
        ctx.drawImage(img, sx, sy, sw, sh, 0, photoAreaY, W, photoAreaH);
      } catch {
        // fallback gradient
        const grad = ctx.createLinearGradient(0, photoAreaY, 0, photoAreaY + photoAreaH);
        grad.addColorStop(0, '#3C2210');
        grad.addColorStop(1, '#160D05');
        ctx.fillStyle = grad;
        ctx.fillRect(0, photoAreaY, W, photoAreaH);
        ctx.font = '160px serif';
        ctx.textAlign = 'center';
        ctx.fillText(pet.species === 'cat' ? '🐈' : '🐕', W / 2, photoAreaY + 400);
      }
    } else {
      const grad = ctx.createLinearGradient(0, photoAreaY, 0, photoAreaY + photoAreaH);
      grad.addColorStop(0, '#2A1A10');
      grad.addColorStop(1, '#0E0907');
      ctx.fillStyle = grad;
      ctx.fillRect(0, photoAreaY, W, photoAreaH);
      ctx.font = '120px serif';
      ctx.textAlign = 'center';
      ctx.fillText(pet.species === 'cat' ? '🐈' : '🐕', W / 2, photoAreaY + 400);
      ctx.font = '400 32px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText('Adicione uma foto do pet', W / 2, photoAreaY + 520);
    }

    // Location pill
    ctx.textAlign = 'left';
    if (lastSeenLocation) {
      const pillW = Math.min(ctx.measureText(lastSeenLocation).width + 80, W - 80);
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      roundRect(ctx, 48, photoAreaY + photoAreaH - 66, pillW, 52, 26);
      ctx.fill();
      // live dot
      ctx.fillStyle = '#FF5722';
      ctx.beginPath();
      ctx.arc(78, photoAreaY + photoAreaH - 40, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.font = '400 26px Arial, sans-serif';
      ctx.fillText(lastSeenLocation, 100, photoAreaY + photoAreaH - 30);
    }

    // Vignette on photo bottom
    const vignGrad = ctx.createLinearGradient(0, photoAreaY + photoAreaH - 160, 0, photoAreaY + photoAreaH);
    vignGrad.addColorStop(0, 'rgba(28,27,25,0)');
    vignGrad.addColorStop(1, 'rgba(28,27,25,0.85)');
    ctx.fillStyle = vignGrad;
    ctx.fillRect(0, photoAreaY + photoAreaH - 160, W, 160);

    // Info section
    const infoStartY = photoAreaY + photoAreaH + 20;
    ctx.textAlign = 'left';

    // Pet name
    ctx.font = '900 108px "Arial Black", Arial, sans-serif';
    ctx.fillStyle = '#F5EFE6';
    ctx.letterSpacing = '-3px';
    ctx.fillText(pet.pet_name.toUpperCase(), 56, infoStartY + 90);

    // Breed / species
    ctx.font = '400 34px Arial, sans-serif';
    ctx.fillStyle = '#7A7060';
    ctx.letterSpacing = '3px';
    const speciesText = pet.species === 'cat' ? 'GATO' : 'CÃO';
    const breed = (pet as unknown as { breed?: string }).breed || '';
    ctx.fillText(`${speciesText}${breed ? ` · ${breed.toUpperCase()}` : ''}`, 56, infoStartY + 145);

    // Mark chips
    ctx.letterSpacing = '0px';
    if (selectedMarks.length > 0) {
      let chipX = 56;
      const chipY = infoStartY + 180;
      ctx.font = '700 24px Arial, sans-serif';
      selectedMarks.forEach(mark => {
        const textW = ctx.measureText(mark.toUpperCase()).width;
        const chipW = textW + 44;
        ctx.fillStyle = 'rgba(245,158,11,0.14)';
        roundRect(ctx, chipX, chipY, chipW, 50, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245,158,11,0.32)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, chipX, chipY, chipW, 50, 8);
        ctx.stroke();
        ctx.fillStyle = '#F59E0B';
        ctx.letterSpacing = '1px';
        ctx.fillText(mark.toUpperCase(), chipX + 22, chipY + 34);
        ctx.letterSpacing = '0px';
        chipX += chipW + 14;
      });
    }

    // Contact row
    const contactY = infoStartY + (selectedMarks.length > 0 ? 252 : 192);
    ctx.fillStyle = 'rgba(255,87,34,0.10)';
    roundRect(ctx, 56, contactY, W - 112, 88, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,87,34,0.24)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 56, contactY, W - 112, 88, 14);
    ctx.stroke();
    ctx.fillStyle = '#F5EFE6';
    ctx.font = '700 46px Arial, sans-serif';
    ctx.fillText(`📱 ${contact || '(00) 00000-0000'}`, 96, contactY + 62);

    // Brand strip
    const stripY = H - 118;
    ctx.fillStyle = '#111010';
    ctx.fillRect(0, stripY, W, 118);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(0, stripY, W, 1.5);
    ctx.fillStyle = '#F5EFE6';
    ctx.font = '900 46px "Arial Black", Arial, sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText('🐾 PETMOL', 56, stripY + 68);
    ctx.fillStyle = '#7A7060';
    ctx.font = '400 30px Arial, sans-serif';
    ctx.letterSpacing = '0px';
    ctx.fillText('petmol.com.br/achei-um-pet', 56, stripY + 105);

    setGenerating(false);
    setStep('card');
  }, [pet, photoPreview, lastSeenLocation, contact, selectedMarks]);

  const handleShare = useCallback(async (target: 'native' | 'download') => {
    const canvas = cardCanvasRef.current;
    if (!canvas) return;

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const fileName = `pet-sumido-${pet.pet_name.toLowerCase().replace(/\s+/g, '-')}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      if (target === 'native' && typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: `${pet.pet_name} está desaparecido`,
            text: `Ajude a encontrar ${pet.pet_name}! Contato: ${contact}. Viu? Acesse: petmol.com.br/achei-um-pet`,
            files: [file],
          });
          setShareSuccess(true);
        } catch {
          // user cancelled — silently ignore
        }
        return;
      }

      // Fallback: download image
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setShareSuccess(true);
    }, 'image/png');
  }, [pet, contact]);

  const canGenerate = contact.trim().length >= 8;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-[71] flex flex-col bg-white rounded-t-[28px] shadow-2xl max-h-[96dvh] overflow-hidden animate-slideUp">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xl">🔍</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-black text-slate-900 leading-tight">Pet Sumido</h2>
            <p className="text-[12px] text-slate-500 font-medium truncate">
              {step === 'form' ? 'Preencha para gerar o alerta e o card de compartilhamento' : 'Card gerado — compartilhe agora'}
            </p>
          </div>
          <button
            onClick={onGoHome}
            className="h-8 px-3 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold flex-shrink-0"
          >
            Início
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0"
            aria-label="Fechar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {step === 'form' && (
            <div className="px-5 py-4 space-y-5 pb-8">

              {/* Pet info — read-only */}
              <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3 border border-slate-200">
                {photoPreview ? (
                  <img src={photoPreview} alt={pet.pet_name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">{pet.species === 'cat' ? '🐈' : '🐕'}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-900 text-[15px] truncate">{pet.pet_name}</p>
                  <p className="text-[12px] text-slate-500 truncate">
                    {pet.species === 'cat' ? 'Gato' : 'Cão'}
                    {(pet as unknown as { breed?: string }).breed ? ` · ${(pet as unknown as { breed?: string }).breed}` : ''}
                  </p>
                </div>
              </div>

              {/* Photo upload */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-2">
                  Foto mais recente <span className="text-slate-400 font-normal">(preferir foto clara do rosto)</span>
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full rounded-2xl border-2 border-dashed transition-colors flex items-center gap-3 px-4 py-3 ${
                    photoPreview ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:border-orange-300 hover:bg-orange-50'
                  }`}
                >
                  {photoPreview ? (
                    <>
                      <img src={photoPreview} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                      <div className="text-left">
                        <p className="text-[13px] font-bold text-emerald-700">Foto selecionada</p>
                        <p className="text-[11px] text-emerald-600">Toque para trocar</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl">📷</span>
                      </div>
                      <div className="text-left">
                        <p className="text-[13px] font-bold text-slate-700">Adicionar foto</p>
                        <p className="text-[11px] text-slate-500">Toque para escolher da galeria</p>
                      </div>
                    </>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>

              {/* Last seen location */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                  Onde desapareceu? <span className="text-slate-400 font-normal">(bairro, rua...)</span>
                </label>
                <input
                  type="text"
                  value={lastSeenLocation}
                  onChange={e => setLastSeenLocation(e.target.value)}
                  placeholder="Ex: Rua das Flores, Vila Madalena, SP"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
              </div>

              {/* Contact */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                  Contato WhatsApp <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={contact}
                  onChange={e => setContact(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
                <p className="text-[11px] text-slate-400 mt-1">Este número aparecerá no card compartilhado</p>
              </div>

              {/* Distinctive marks */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-1">
                  Marcas distintivas{' '}
                  <span className="text-slate-400 font-normal">(máx. 3 — escolha o que faz {pet.pet_name} único)</span>
                </label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {MARK_OPTIONS.map(mark => {
                    const selected = selectedMarks.includes(mark);
                    const disabled = !selected && selectedMarks.length >= 3;
                    return (
                      <button
                        key={mark}
                        type="button"
                        onClick={() => !disabled && toggleMark(mark)}
                        className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                          selected
                            ? 'bg-amber-100 border-amber-400 text-amber-800'
                            : disabled
                              ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-50'
                              : 'bg-white border-slate-300 text-slate-600 hover:border-amber-300 hover:bg-amber-50'
                        }`}
                      >
                        {mark}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* How it works — brief */}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">ℹ️</span>
                <p className="text-[12px] text-blue-800 leading-relaxed">
                  O PETMOL vai gerar um <strong>card pronto para Instagram e WhatsApp</strong> com a foto, características e seu contato.
                  Qualquer pessoa que achar {pet.pet_name} pode acessar <strong>petmol.com.br/achei-um-pet</strong> e você será notificado.
                </p>
              </div>

              {/* Generate button */}
              <button
                type="button"
                onClick={generateCard}
                disabled={!canGenerate || generating}
                className={`w-full py-4 rounded-2xl font-black text-[16px] transition-all active:scale-[0.98] ${
                  canGenerate && !generating
                    ? 'bg-[#FF5722] text-white shadow-lg shadow-orange-500/25'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {generating ? '⏳ Gerando card...' : '🔍 Gerar card e alertar a região'}
              </button>
              {!canGenerate && (
                <p className="text-center text-[12px] text-slate-400 -mt-2">Preencha o contato para continuar</p>
              )}
            </div>
          )}

          {step === 'card' && (
            <div className="px-5 py-4 space-y-4 pb-8">

              {/* Card preview */}
              <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200">
                <canvas
                  ref={cardCanvasRef}
                  className="w-full block"
                  style={{ aspectRatio: '4/5' }}
                />
              </div>

              {/* Success / share prompt */}
              {shareSuccess ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <span className="text-2xl flex-shrink-0">✅</span>
                  <div>
                    <p className="font-bold text-emerald-800 text-[14px]">Card compartilhado!</p>
                    <p className="text-[12px] text-emerald-700">Poste em grupos de vizinhos, Instagram e Facebook. Quanto mais pessoas virem, mais rápido {pet.pet_name} volta.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
                  <p className="font-bold text-orange-800 text-[13px] mb-0.5">Card gerado — compartilhe agora</p>
                  <p className="text-[12px] text-orange-700">Poste no Instagram, mande em grupos do WhatsApp e peça para amigos republicarem.</p>
                </div>
              )}

              {/* Share buttons */}
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => handleShare('native')}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[#FF5722] text-white rounded-2xl font-black text-[14px] shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Compartilhar
                </button>
                <button
                  type="button"
                  onClick={() => handleShare('download')}
                  className="w-12 h-[50px] flex items-center justify-center bg-slate-100 text-slate-600 rounded-2xl font-bold text-xl border border-slate-200 active:scale-[0.98] transition-all"
                  title="Salvar imagem"
                  aria-label="Salvar imagem"
                >
                  ↓
                </button>
              </div>

              {/* Edit form */}
              <button
                type="button"
                onClick={() => { setStep('form'); setShareSuccess(false); }}
                className="w-full py-3 rounded-2xl border border-slate-300 text-slate-600 font-semibold text-[14px] bg-white active:scale-[0.98] transition-all"
              >
                Editar informações
              </button>

              {/* petmol.com.br/achei-um-pet info */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">🔗</span>
                <div>
                  <p className="font-bold text-slate-800 text-[13px]">petmol.com.br/achei-um-pet</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Qualquer pessoa que encontrar {pet.pet_name} pode enviar uma foto neste endereço — sem precisar ter o app. Você será notificado.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Hidden canvas for card generation (must be in DOM for Canvas API) */}
        {step === 'form' && (
          <canvas ref={cardCanvasRef} className="hidden" />
        )}
      </div>
    </>
  );
}
