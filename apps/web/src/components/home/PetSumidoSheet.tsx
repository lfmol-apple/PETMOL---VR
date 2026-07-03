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

// Draw word-wrapped text, returns final Y
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  maxWidth: number, lineHeight: number,
): number {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = word;
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, curY); curY += lineHeight; }
  return curY;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function PetSumidoSheet({ pet, petPhotoUrl, onClose, onGoHome }: PetSumidoSheetProps) {
  const [step, setStep] = useState<Step>('form');
  const [contact, setContact] = useState('');
  const [lastSeenLocation, setLastSeenLocation] = useState('');
  const [characteristics, setCharacteristics] = useState('');
  const [missingDate, setMissingDate] = useState(todayISO());
  const [missingTime, setMissingTime] = useState(nowTime());
  const [photoPreview, setPhotoPreview] = useState<string | null>(petPhotoUrl || null);
  const [generating, setGenerating] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [cardDataUrl, setCardDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const generateCard = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setGenerating(true);

    const W = 1080;
    const H = 1350;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setGenerating(false); return; }

    // ── Background ─────────────────────────────────────────────────────────────
    ctx.fillStyle = '#14100E';
    ctx.fillRect(0, 0, W, H);

    // ── Header band — crimson emergency ───────────────────────────────────────
    const headerH = 124;
    ctx.fillStyle = '#C0392B';
    ctx.fillRect(0, 0, W, headerH);
    // subtle stripe at bottom
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, headerH - 3, W, 3);

    ctx.font = '900 56px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.letterSpacing = '6px';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('🚨  DESAPARECIDO', 48, 85);

    // missing date+time on right
    const [yr, mo, dy] = missingDate.split('-');
    const dateLabel = `${dy}/${mo}/${yr} às ${missingTime}`;
    ctx.font = '400 26px Arial, sans-serif';
    ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.textAlign = 'right';
    ctx.fillText(dateLabel, W - 48, 85);

    // ── Photo area ─────────────────────────────────────────────────────────────
    const photoY = headerH;
    const photoH = 660;

    if (photoPreview) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((res, rej) => {
          img.onload = () => res(); img.onerror = () => rej();
          img.src = photoPreview;
        });
        const scale = Math.max(W / img.naturalWidth, photoH / img.naturalHeight);
        const sw = W / scale;
        const sh = photoH / scale;
        const sx = (img.naturalWidth - sw) / 2;
        const sy = (img.naturalHeight - sh) / 3;
        ctx.drawImage(img, sx, sy, sw, sh, 0, photoY, W, photoH);
      } catch {
        // placeholder gradient
        const g = ctx.createLinearGradient(0, photoY, 0, photoY + photoH);
        g.addColorStop(0, '#3A1A10'); g.addColorStop(1, '#180A05');
        ctx.fillStyle = g; ctx.fillRect(0, photoY, W, photoH);
        ctx.font = '140px serif'; ctx.textAlign = 'center';
        ctx.fillText(pet.species === 'cat' ? '🐈' : '🐕', W / 2, photoY + 370);
      }
    } else {
      const g = ctx.createLinearGradient(0, photoY, 0, photoY + photoH);
      g.addColorStop(0, '#2A1208'); g.addColorStop(1, '#0E0604');
      ctx.fillStyle = g; ctx.fillRect(0, photoY, W, photoH);
      ctx.font = '120px serif'; ctx.textAlign = 'center';
      ctx.fillText(pet.species === 'cat' ? '🐈' : '🐕', W / 2, photoY + 340);
      ctx.font = '400 30px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillText('Sem foto — adicione uma foto do pet', W / 2, photoY + 470);
    }

    // Vignette overlay bottom of photo
    const vg = ctx.createLinearGradient(0, photoY + photoH - 220, 0, photoY + photoH);
    vg.addColorStop(0, 'rgba(20,16,14,0)');
    vg.addColorStop(1, 'rgba(20,16,14,0.92)');
    ctx.fillStyle = vg; ctx.fillRect(0, photoY + photoH - 220, W, 220);

    // Location pill over photo
    if (lastSeenLocation) {
      const pillText = lastSeenLocation;
      ctx.font = '500 28px Arial, sans-serif';
      ctx.textAlign = 'left';
      const pillW = Math.min(ctx.measureText(pillText).width + 84, W - 80);
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      roundRect(ctx, 48, photoY + photoH - 76, pillW, 56, 28);
      ctx.fill();
      ctx.fillStyle = '#FF4444';
      ctx.beginPath(); ctx.arc(80, photoY + photoH - 48, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.90)';
      ctx.fillText(pillText, 104, photoY + photoH - 36);
    }

    // ── Info section ───────────────────────────────────────────────────────────
    const infoY = photoY + photoH + 24;
    ctx.textAlign = 'left';

    // Name
    ctx.font = '900 100px Arial, sans-serif';
    ctx.fillStyle = '#F5EFE6';
    ctx.letterSpacing = '-2px';
    ctx.fillText(pet.pet_name.toUpperCase(), 56, infoY + 86);

    // Species + breed
    ctx.font = '400 32px Arial, sans-serif';
    ctx.fillStyle = '#786050';
    ctx.letterSpacing = '3px';
    const speciesLabel = pet.species === 'cat' ? 'GATO' : 'CÃO';
    const breedVal = (pet as unknown as { breed?: string }).breed || '';
    ctx.fillText(`${speciesLabel}${breedVal ? ` · ${breedVal.toUpperCase()}` : ''}`, 56, infoY + 136);

    // Characteristics free text
    if (characteristics.trim()) {
      ctx.letterSpacing = '0px';
      ctx.font = '400 28px Arial, sans-serif';
      ctx.fillStyle = '#C8B89A';
      wrapText(ctx, characteristics.trim(), 56, infoY + 186, W - 112, 42);
    }

    // Contact row
    const hasChar = characteristics.trim().length > 0;
    const charLines = hasChar ? Math.min(Math.ceil(characteristics.length / 38), 4) : 0;
    const contactY = infoY + 196 + charLines * 44;
    ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(192,57,43,0.14)';
    roundRect(ctx, 56, contactY, W - 112, 90, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(192,57,43,0.36)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 56, contactY, W - 112, 90, 14);
    ctx.stroke();
    ctx.fillStyle = '#F5EFE6';
    ctx.font = '700 44px Arial, sans-serif';
    ctx.fillText(`📱  ${contact || '(00) 00000-0000'}`, 92, contactY + 62);
    ctx.fillStyle = '#786050';
    ctx.font = '400 26px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('WHATSAPP', W - 80, contactY + 62);

    // ── Brand strip ────────────────────────────────────────────────────────────
    const stripY = H - 112;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0D0B09';
    ctx.fillRect(0, stripY, W, 112);
    ctx.fillStyle = 'rgba(192,57,43,0.25)';
    ctx.fillRect(0, stripY, W, 2);
    ctx.fillStyle = '#F5EFE6';
    ctx.font = '900 44px Arial, sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText('🐾  PETMOL', 56, stripY + 66);
    ctx.fillStyle = '#786050';
    ctx.font = '400 28px Arial, sans-serif';
    ctx.letterSpacing = '0px';
    ctx.fillText('petmol.com.br/achei-um-pet', 56, stripY + 100);

    // Done — store as data URL
    setCardDataUrl(canvas.toDataURL('image/png'));
    setGenerating(false);
    setStep('card');
  }, [pet, photoPreview, lastSeenLocation, characteristics, missingDate, missingTime, contact]);

  const handleShare = useCallback(async (target: 'native' | 'download') => {
    if (!cardDataUrl) return;
    const res = await fetch(cardDataUrl);
    const blob = await res.blob();
    const fileName = `pet-sumido-${pet.pet_name.toLowerCase().replace(/\s+/g, '-')}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });

    if (target === 'native' && typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${pet.pet_name} está desaparecido!`,
          text: `🚨 Ajude a encontrar ${pet.pet_name}! Contato: ${contact}. Acesse: petmol.com.br/achei-um-pet`,
          files: [file],
        });
        setShareSuccess(true);
      } catch { /* user cancelled */ }
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShareSuccess(true);
  }, [cardDataUrl, pet, contact]);

  const canGenerate = contact.trim().length >= 8;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-[71] flex flex-col bg-[#0F0D0B] rounded-t-[28px] shadow-2xl max-h-[96dvh] overflow-hidden animate-slideUp">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10 flex-shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-red-900/60 border border-red-700/50 flex items-center justify-center flex-shrink-0">
            <span className="text-xl">🚨</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-black text-white leading-tight">Pet Sumido</h2>
            <p className="text-[12px] text-red-400 font-semibold truncate">
              {step === 'form' ? 'Alerta de emergência — gerar e compartilhar' : 'Card gerado — compartilhe agora'}
            </p>
          </div>
          <button
            onClick={onGoHome}
            className="h-8 px-3 rounded-full bg-white/10 text-white/70 text-xs font-semibold flex-shrink-0 border border-white/10"
          >
            Início
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/50 flex-shrink-0"
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

              {/* Pet info row */}
              <div className="flex items-center gap-3 bg-white/5 rounded-2xl px-4 py-3 border border-white/10">
                {photoPreview ? (
                  <img src={photoPreview} alt={pet.pet_name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">{pet.species === 'cat' ? '🐈' : '🐕'}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-white text-[15px] truncate">{pet.pet_name}</p>
                  <p className="text-[12px] text-white/50 truncate">
                    {pet.species === 'cat' ? 'Gato' : 'Cão'}
                    {(pet as unknown as { breed?: string }).breed ? ` · ${(pet as unknown as { breed?: string }).breed}` : ''}
                  </p>
                </div>
              </div>

              {/* Photo — prominent */}
              <div>
                <label className="block text-[13px] font-bold text-white/80 mb-2">
                  📷 Foto atual do pet <span className="text-red-400 font-semibold">*</span>
                  <span className="text-white/40 font-normal ml-1">(rosto visível, recente)</span>
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 py-5 ${
                    photoPreview
                      ? 'border-emerald-500/50 bg-emerald-900/20'
                      : 'border-red-600/60 bg-red-950/30 hover:border-red-500 hover:bg-red-900/30'
                  }`}
                >
                  {photoPreview ? (
                    <div className="flex items-center gap-3 w-full px-4">
                      <img src={photoPreview} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                      <div className="text-left">
                        <p className="text-[13px] font-bold text-emerald-400">Foto selecionada ✓</p>
                        <p className="text-[11px] text-emerald-500/70">Toque para trocar</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="text-3xl">📷</span>
                      <p className="text-[13px] font-bold text-red-400">Adicionar foto — obrigatório</p>
                      <p className="text-[11px] text-white/30">Toque para escolher da galeria</p>
                    </>
                  )}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>

              {/* Quando sumiu */}
              <div>
                <label className="block text-[13px] font-bold text-white/80 mb-2">
                  🕐 Quando desapareceu?
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={missingDate}
                    max={todayISO()}
                    onChange={e => setMissingDate(e.target.value)}
                    className="flex-1 rounded-xl border border-white/15 bg-white/8 px-3 py-3 text-base text-white outline-none focus:border-red-500/60 focus:ring-2 focus:ring-red-500/20 transition-all"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', colorScheme: 'dark' }}
                  />
                  <input
                    type="time"
                    value={missingTime}
                    onChange={e => setMissingTime(e.target.value)}
                    className="w-[120px] rounded-xl border border-white/15 px-3 py-3 text-base text-white outline-none focus:border-red-500/60 focus:ring-2 focus:ring-red-500/20 transition-all"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', colorScheme: 'dark' }}
                  />
                </div>
              </div>

              {/* Onde sumiu */}
              <div>
                <label className="block text-[13px] font-bold text-white/80 mb-2">
                  📍 Onde desapareceu? <span className="text-white/40 font-normal">(bairro, rua…)</span>
                </label>
                <input
                  type="text"
                  value={lastSeenLocation}
                  onChange={e => setLastSeenLocation(e.target.value)}
                  placeholder="Ex: Rua das Flores, Vila Madalena, SP"
                  className="w-full rounded-xl border border-white/15 px-4 py-3.5 text-base text-white placeholder:text-white/25 outline-none focus:border-red-500/60 focus:ring-2 focus:ring-red-500/20 transition-all"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                />
              </div>

              {/* Contato */}
              <div>
                <label className="block text-[13px] font-bold text-white/80 mb-2">
                  📱 Contato WhatsApp <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={contact}
                  onChange={e => setContact(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="w-full rounded-xl border border-white/15 px-4 py-3.5 text-base text-white placeholder:text-white/25 outline-none focus:border-red-500/60 focus:ring-2 focus:ring-red-500/20 transition-all"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                />
                <p className="text-[11px] text-white/30 mt-1">Aparece no card compartilhado</p>
              </div>

              {/* Características — texto livre */}
              <div>
                <label className="block text-[13px] font-bold text-white/80 mb-2">
                  🔎 Características únicas{' '}
                  <span className="text-white/40 font-normal">(só você sabe)</span>
                </label>
                <textarea
                  value={characteristics}
                  onChange={e => setCharacteristics(e.target.value)}
                  placeholder={`Descreva o que faz ${pet.pet_name} único — cor dos olhos, manchas, jeito de andar, coleira, cicatriz, comportamento ao ver estranhos...`}
                  rows={4}
                  className="w-full rounded-xl border border-white/15 px-4 py-3.5 text-base text-white placeholder:text-white/25 outline-none focus:border-red-500/60 focus:ring-2 focus:ring-red-500/20 transition-all resize-none leading-relaxed"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                />
              </div>

              {/* Info box */}
              <div className="bg-red-950/40 border border-red-800/40 rounded-2xl px-4 py-3 flex gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">🚨</span>
                <p className="text-[12px] text-red-300/80 leading-relaxed">
                  O PETMOL gera um <strong className="text-red-300">card para Instagram e WhatsApp</strong> com foto, características e seu contato.
                  Quem encontrar {pet.pet_name} acessa <strong className="text-red-300">petmol.com.br/achei-um-pet</strong>.
                </p>
              </div>

              {/* Generate button */}
              <button
                type="button"
                onClick={generateCard}
                disabled={!canGenerate || generating}
                className={`w-full py-4 rounded-2xl font-black text-[16px] transition-all active:scale-[0.98] ${
                  canGenerate && !generating
                    ? 'bg-[#C0392B] text-white shadow-xl shadow-red-900/40 border border-red-600/30'
                    : 'bg-white/8 text-white/30 border border-white/10 cursor-not-allowed'
                }`}
              >
                {generating ? '⏳ Gerando card...' : '🚨 Gerar alerta e card de compartilhamento'}
              </button>
              {!canGenerate && (
                <p className="text-center text-[12px] text-white/30 -mt-2">Preencha o contato para continuar</p>
              )}
            </div>
          )}

          {step === 'card' && (
            <div className="px-5 py-4 space-y-4 pb-8">

              {/* Card preview */}
              {cardDataUrl && (
                <div className="rounded-2xl overflow-hidden shadow-2xl shadow-red-900/30 border border-red-900/30">
                  <img src={cardDataUrl} alt="Card Pet Sumido" className="w-full block" style={{ aspectRatio: '4/5' }} />
                </div>
              )}

              {shareSuccess ? (
                <div className="bg-emerald-950/60 border border-emerald-700/40 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <span className="text-2xl flex-shrink-0">✅</span>
                  <div>
                    <p className="font-bold text-emerald-400 text-[14px]">Card compartilhado!</p>
                    <p className="text-[12px] text-emerald-500/70">Poste em grupos de vizinhos, Instagram e Facebook.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-red-950/40 border border-red-800/40 rounded-2xl px-4 py-3">
                  <p className="font-bold text-red-400 text-[13px] mb-0.5">Card gerado — compartilhe agora 🚨</p>
                  <p className="text-[12px] text-red-300/60">Poste no Instagram, mande em grupos do WhatsApp e peça para amigos republicarem.</p>
                </div>
              )}

              {/* Share buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleShare('native')}
                  className="col-span-2 flex items-center justify-center gap-2 py-4 bg-[#C0392B] text-white rounded-2xl font-black text-[15px] shadow-lg shadow-red-900/30 border border-red-600/30 active:scale-[0.98] transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Compartilhar
                </button>
                <button
                  type="button"
                  onClick={() => handleShare('download')}
                  className="flex items-center justify-center bg-white/8 text-white/70 rounded-2xl font-bold text-lg border border-white/10 active:scale-[0.98] transition-all"
                  title="Salvar imagem"
                  aria-label="Salvar imagem"
                >
                  ↓
                </button>
              </div>

              <button
                type="button"
                onClick={() => { setStep('form'); setShareSuccess(false); }}
                className="w-full py-3 rounded-2xl border border-white/15 text-white/60 font-semibold text-[14px] bg-white/5 active:scale-[0.98] transition-all"
              >
                Editar informações
              </button>

              <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">🔗</span>
                <div>
                  <p className="font-bold text-white/70 text-[13px]">petmol.com.br/achei-um-pet</p>
                  <p className="text-[11px] text-white/30 mt-0.5 leading-relaxed">
                    Qualquer pessoa que encontrar {pet.pet_name} pode registrar sem ter o app. Você será notificado.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Canvas always in DOM (needed for drawing API) */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </>
  );
}
