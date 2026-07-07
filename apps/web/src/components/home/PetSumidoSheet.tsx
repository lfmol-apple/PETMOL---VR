'use client';

import { useState, useRef, useCallback } from 'react';
import type { PetHealthProfile } from '@/lib/petHealth';
import { getToken } from '@/lib/auth-token';

interface PetSumidoSheetProps {
  pet: PetHealthProfile;
  petPhotoUrl?: string | null;
  onClose: () => void;
  onGoHome: () => void;
  // Modo edição: alerta já existe, preenche os campos e chama PATCH
  editAlertId?: string;
  initialContact?: string;
  initialLocation?: string;
  initialCharacteristics?: string;
  initialMissingDate?: string;
  initialMissingTime?: string;
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

function calcAutoRadius(missingDate: string, missingTime: string, species: string) {
  try {
    const [yr, mo, dy] = missingDate.split('-').map(Number);
    const [hh, mm] = (missingTime || '00:00').split(':').map(Number);
    const missingAt = new Date(yr, mo - 1, dy, hh, mm);
    const hoursElapsed = Math.max(0, (Date.now() - missingAt.getTime()) / 3600000);
    const speedKmh = species === 'cat' ? 3 : 5;
    const rawKm = Math.max(2, Math.ceil(hoursElapsed * speedKmh));
    return { km: rawKm, hoursElapsed: Math.round(hoursElapsed * 10) / 10, speedKmh };
  } catch {
    return { km: 2, hoursElapsed: 0, speedKmh: 5 };
  }
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function PetSumidoSheet({
  pet, petPhotoUrl, onClose, onGoHome,
  editAlertId, initialContact = '', initialLocation = '',
  initialCharacteristics = '', initialMissingDate, initialMissingTime,
}: PetSumidoSheetProps) {
  const isEditMode = Boolean(editAlertId);
  const [step, setStep] = useState<Step>('form');
  const [contact, setContact] = useState(initialContact);
  const [lastSeenLocation, setLastSeenLocation] = useState(initialLocation);
  const [characteristics, setCharacteristics] = useState(initialCharacteristics);
  const [missingDate, setMissingDate] = useState(initialMissingDate ?? todayISO());
  const [missingTime, setMissingTime] = useState(initialMissingTime ?? nowTime());
  const [photoPreview, setPhotoPreview] = useState<string | null>(petPhotoUrl || null);
  const [generating, setGenerating] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [cardDataUrl, setCardDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [alertSent, setAlertSent] = useState(false);
  const [alertBlocked, setAlertBlocked] = useState(false);
  const [notifiedCount, setNotifiedCount] = useState<number | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [liveRadius, setLiveRadius] = useState(() => calcAutoRadius(todayISO(), nowTime(), pet.species || 'dog'));
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');

  const handleCepChange = async (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    setCep(formatted);
    setCepError('');
    if (digits.length === 8) {
      setCepLoading(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await res.json();
        if (data.erro) {
          setCepError('CEP não encontrado');
        } else {
          const parts = [data.logradouro, data.bairro, `${data.localidade}/${data.uf}`].filter(Boolean);
          setLastSeenLocation(parts.join(', '));
        }
      } catch {
        setCepError('Erro ao consultar CEP');
      }
      setCepLoading(false);
    }
  };

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
    setAlertBlocked(false);

    let geoLat: number | undefined;
    let geoLng: number | undefined;
    try {
      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000, maximumAge: 60000 })
        );
        geoLat = pos.coords.latitude;
        geoLng = pos.coords.longitude;
      }
    } catch { /* geolocation is optional */ }

    const _token = getToken();

    // Se o dono fez upload de foto nova, salva no servidor antes de criar o alerta
    let resolvedPhotoUrl: string | null = petPhotoUrl && !petPhotoUrl.startsWith('data:') ? petPhotoUrl : null;
    if (photoPreview && photoPreview.startsWith('data:')) {
      try {
        const upRes = await fetch('/api/missing-pets/upload-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(_token ? { Authorization: `Bearer ${_token}` } : {}) },
          body: JSON.stringify({ photo_base64: photoPreview }),
        });
        if (upRes.ok) {
          const upData = await upRes.json() as { photo_url?: string };
          if (upData.photo_url) resolvedPhotoUrl = upData.photo_url;
        }
      } catch { /* silent — alerta vai sem foto nova */ }
    }

    try {
      if (isEditMode && editAlertId) {
        // Modo edição: PATCH no alerta existente
        const patchRes = await fetch(`/api/missing-pets/${editAlertId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(_token ? { Authorization: `Bearer ${_token}` } : {}) },
          body: JSON.stringify({
            contact: contact.trim() || null,
            last_seen_location: lastSeenLocation.trim() || null,
            characteristics: characteristics.trim() || null,
          }),
        });
        if (patchRes.ok) {
          setAlertSent(true);
          try {
            const resData = await patchRes.json() as { newly_notified?: number };
            if (resData.newly_notified != null) setNotifiedCount(resData.newly_notified);
          } catch { /* silent */ }
        }
      } else {
        // Modo criação: POST
        const checkRes = await fetch('/api/missing-pets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            pet_id: pet.pet_id,
            pet_name: pet.pet_name,
            species: pet.species,
            breed: (pet as unknown as { breed?: string }).breed ?? null,
            characteristics: characteristics.trim() || null,
            contact: contact.trim(),
            last_seen_location: lastSeenLocation.trim() || null,
            lat: geoLat ?? null,
            lng: geoLng ?? null,
            radius_km: liveRadius.km,
            missing_date: missingDate,
            missing_time: missingTime,
            photo_url: resolvedPhotoUrl,
          }),
        });
        if (checkRes.status === 409) {
          setAlertBlocked(true);
          setGenerating(false);
          return;
        }
        if (checkRes.ok) {
          setAlertSent(true);
          try {
            const resData = await checkRes.json() as { notified_count?: number };
            if (resData.notified_count != null) setNotifiedCount(resData.notified_count);
          } catch { /* silent */ }
        }
      }
    } catch { /* silent */ }

    const W = 1080;
    const H = 1350;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setGenerating(false); return; }

    ctx.fillStyle = '#14100E';
    ctx.fillRect(0, 0, W, H);

    const headerH = 124;
    ctx.fillStyle = '#C0392B';
    ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, headerH - 3, W, 3);

    ctx.font = '900 56px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.letterSpacing = '6px';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('🚨  DESAPARECIDO', 48, 85);

    const [yr, mo, dy] = missingDate.split('-');
    const dateLabel = `${dy}/${mo}/${yr} às ${missingTime}`;
    ctx.font = '400 26px Arial, sans-serif';
    ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.textAlign = 'right';
    ctx.fillText(dateLabel, W - 48, 85);

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

    const vg = ctx.createLinearGradient(0, photoY + photoH - 220, 0, photoY + photoH);
    vg.addColorStop(0, 'rgba(20,16,14,0)');
    vg.addColorStop(1, 'rgba(20,16,14,0.92)');
    ctx.fillStyle = vg; ctx.fillRect(0, photoY + photoH - 220, W, 220);

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

    const infoY = photoY + photoH + 24;
    ctx.textAlign = 'left';
    ctx.font = '900 100px Arial, sans-serif';
    ctx.fillStyle = '#F5EFE6';
    ctx.letterSpacing = '-2px';
    ctx.fillText(pet.pet_name.toUpperCase(), 56, infoY + 86);

    ctx.font = '400 32px Arial, sans-serif';
    ctx.fillStyle = '#786050';
    ctx.letterSpacing = '3px';
    const speciesLabel = pet.species === 'cat' ? 'GATO' : 'CÃO';
    const breedVal = (pet as unknown as { breed?: string }).breed || '';
    ctx.fillText(`${speciesLabel}${breedVal ? ` · ${breedVal.toUpperCase()}` : ''}`, 56, infoY + 136);

    if (characteristics.trim()) {
      ctx.letterSpacing = '1px';
      ctx.font = '700 34px Arial, sans-serif';
      ctx.fillStyle = '#F5EFE6';
      wrapText(ctx, characteristics.trim().toUpperCase(), 56, infoY + 186, W - 112, 48);
    }

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

    setCardDataUrl(canvas.toDataURL('image/png'));
    setGenerating(false);
    setStep('card');
  }, [pet, petPhotoUrl, photoPreview, lastSeenLocation, characteristics, missingDate, missingTime, contact, isEditMode, editAlertId]);

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
      <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-md" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-[71] flex flex-col bg-white rounded-t-[28px] shadow-2xl max-h-[96dvh] overflow-hidden animate-slideUp">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xl">🚨</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-gray-900 leading-tight">Pet Sumido</h2>
            <p className="text-[12px] text-slate-400 truncate">
              {step === 'form' ? 'Alerta de emergência · gerar e compartilhar' : 'Card gerado · compartilhe agora'}
            </p>
          </div>
          <button
            onClick={onGoHome}
            className="h-8 px-3 rounded-full bg-gray-100 text-gray-500 text-[13px] font-semibold flex-shrink-0"
          >
            Início
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0"
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
            <div className="px-5 py-5 space-y-5 pb-10">

              {/* Pet info */}
              <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 border border-gray-100">
                {photoPreview ? (
                  <img src={photoPreview} alt={pet.pet_name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">{pet.species === 'cat' ? '🐈' : '🐕'}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-[15px] truncate">{pet.pet_name}</p>
                  <p className="text-[12px] text-slate-400 truncate">
                    {pet.species === 'cat' ? 'Gato' : 'Cão'}
                    {(pet as unknown as { breed?: string }).breed ? ` · ${(pet as unknown as { breed?: string }).breed}` : ''}
                  </p>
                </div>
              </div>

              {/* Foto */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Foto atual do pet <span className="text-red-500 normal-case font-semibold">obrigatório</span>
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 py-5 active:scale-[0.99] ${
                    photoPreview
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-200 bg-slate-50 hover:border-red-300'
                  }`}
                >
                  {photoPreview ? (
                    <div className="flex items-center gap-3 w-full px-4">
                      <img src={photoPreview} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                      <div className="text-left">
                        <p className="text-[13px] font-bold text-emerald-600">Foto selecionada ✓</p>
                        <p className="text-[11px] text-slate-400">Toque para trocar</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="text-3xl">📷</span>
                      <p className="text-[13px] font-bold text-slate-500">Adicionar foto do pet</p>
                      <p className="text-[11px] text-slate-400">Rosto visível, foto recente</p>
                    </>
                  )}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>

              {/* Quando sumiu */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Quando desapareceu
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={missingDate}
                    max={todayISO()}
                    onChange={e => { setMissingDate(e.target.value); setLiveRadius(calcAutoRadius(e.target.value, missingTime, pet.species || 'dog')); }}
                    className="flex-1 border-2 border-slate-200 rounded-2xl px-4 py-3 text-[15px] text-gray-900 outline-none focus:border-red-400 transition-colors"
                    style={{ colorScheme: 'light' }}
                  />
                  <input
                    type="time"
                    value={missingTime}
                    onChange={e => { setMissingTime(e.target.value); setLiveRadius(calcAutoRadius(missingDate, e.target.value, pet.species || 'dog')); }}
                    className="w-[116px] border-2 border-slate-200 rounded-2xl px-4 py-3 text-[15px] text-gray-900 outline-none focus:border-red-400 transition-colors"
                    style={{ colorScheme: 'light' }}
                  />
                </div>
              </div>

              {/* Raio calculado */}
              <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="text-xl flex-shrink-0">📡</span>
                <div className="flex-1">
                  <p className="text-[13px] font-bold text-amber-800">
                    Raio de notificação: <span className="text-amber-700">{liveRadius.km} km</span>
                  </p>
                  <p className="text-[11px] text-amber-600 leading-tight">
                    {liveRadius.hoursElapsed > 0
                      ? `${liveRadius.hoursElapsed}h desaparecido × ${liveRadius.speedKmh} km/h`
                      : 'Raio mínimo de 2 km — cresce com o tempo'}
                  </p>
                </div>
              </div>

              {/* Onde sumiu — CEP */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Onde desapareceu
                </label>
                <div className="relative mb-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cep}
                    onChange={e => handleCepChange(e.target.value)}
                    placeholder="CEP (preenche o endereço automaticamente)"
                    onFocus={() => setFocusedField('cep')}
                    onBlur={() => setFocusedField(null)}
                    className={`w-full border-2 rounded-2xl px-4 pr-10 text-[15px] text-gray-900 placeholder-slate-300 outline-none transition-colors ${
                      focusedField === 'cep' ? 'border-red-400 py-5 text-xl' : 'border-slate-200 py-3'
                    }`}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px]">
                    {cepLoading ? '⏳' : cep.replace(/\D/g, '').length === 8 && !cepError ? '✓' : null}
                  </span>
                </div>
                {cepError && <p className="text-[11px] text-red-500 font-semibold mb-1.5">{cepError}</p>}
                <input
                  type="text"
                  value={lastSeenLocation}
                  onChange={e => setLastSeenLocation(e.target.value)}
                  placeholder="Endereço (preenchido pelo CEP ou digitar)"
                  onFocus={() => setFocusedField('location')}
                  onBlur={() => setFocusedField(null)}
                  className={`w-full border-2 rounded-2xl px-4 text-[15px] text-gray-900 placeholder-slate-300 outline-none transition-colors ${
                    focusedField === 'location' ? 'border-red-400 py-5 text-lg' : 'border-slate-200 py-3'
                  }`}
                />
              </div>

              {/* Contato */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  WhatsApp para contato <span className="text-red-500 normal-case font-semibold">obrigatório</span>
                </label>
                <input
                  type="tel"
                  value={contact}
                  onChange={e => setContact(e.target.value)}
                  placeholder="(00) 00000-0000"
                  onFocus={() => setFocusedField('contact')}
                  onBlur={() => setFocusedField(null)}
                  className={`w-full border-2 rounded-2xl px-4 text-gray-900 placeholder-slate-300 outline-none transition-all ${
                    focusedField === 'contact' ? 'border-red-400 py-5 text-xl' : 'border-slate-200 py-3 text-[15px]'
                  }`}
                />
                <p className="text-[11px] text-slate-400 mt-1">Aparece no card compartilhado</p>
              </div>

              {/* Características */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Características únicas
                  <span className="normal-case font-normal text-slate-400 ml-1">— só você sabe</span>
                </label>
                <textarea
                  value={characteristics}
                  onChange={e => setCharacteristics(e.target.value)}
                  placeholder={`Descreva o que faz ${pet.pet_name} único — cor dos olhos, manchas, coleira, cicatriz, comportamento...`}
                  rows={focusedField === 'characteristics' ? 6 : 3}
                  onFocus={() => setFocusedField('characteristics')}
                  onBlur={() => setFocusedField(null)}
                  className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-[15px] text-gray-900 placeholder-slate-300 outline-none focus:border-red-400 transition-colors resize-none leading-relaxed"
                />
              </div>

              {/* Info */}
              <div className="bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 flex gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">🚨</span>
                <p className="text-[12px] text-rose-600 leading-relaxed">
                  O PETMOL gera um <strong className="text-rose-700">card para Instagram e WhatsApp</strong> e envia um alerta push para usuários próximos.
                  Quem encontrar acessa <strong className="text-rose-700">petmol.com.br/achei-um-pet</strong>.
                </p>
              </div>

              {/* Gerar */}
              <button
                type="button"
                onClick={generateCard}
                disabled={!canGenerate || generating}
                className={`w-full py-4 rounded-2xl font-black text-[16px] transition-all active:scale-[0.98] ${
                  canGenerate && !generating
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
              >
                {generating ? '⏳ Aguarde...' : isEditMode ? '📣 Salvar e reenviar alerta' : '🚨 Gerar alerta e card'}
              </button>

              {!canGenerate && (
                <p className="text-center text-[12px] text-slate-400 -mt-2">
                  Preencha o WhatsApp para continuar
                </p>
              )}

              {alertBlocked && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
                  <p className="text-[13px] font-bold text-amber-700">Alerta já ativo para {pet.pet_name}</p>
                  <p className="text-[11px] text-amber-600 mt-0.5">Confirme que foi encontrado antes de criar um novo.</p>
                </div>
              )}
            </div>
          )}

          {step === 'card' && (
            <div className="px-5 py-5 space-y-4 pb-10">

              {cardDataUrl && (
                <div className="rounded-2xl overflow-hidden shadow-xl border border-gray-100">
                  <img src={cardDataUrl} alt="Card Pet Sumido" className="w-full block" style={{ aspectRatio: '4/5' }} />
                </div>
              )}

              {alertSent && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <span className="text-xl flex-shrink-0">✅</span>
                  <p className="text-[13px] font-semibold text-emerald-700">
                    {isEditMode
                      ? notifiedCount != null
                        ? notifiedCount === 0
                          ? 'Atualizado — todos no raio já foram notificados'
                          : `${notifiedCount} nova${notifiedCount !== 1 ? 's' : ''} pessoa${notifiedCount !== 1 ? 's' : ''} notificada${notifiedCount !== 1 ? 's' : ''}!`
                        : 'Alerta atualizado com sucesso'
                      : notifiedCount != null
                        ? notifiedCount === 0
                          ? 'Alerta registrado — nenhum usuário com push na área agora'
                          : `${notifiedCount} ${notifiedCount === 1 ? 'usuário notificado' : 'usuários notificados'} na sua região`
                        : 'Alerta enviado para usuários PETMOL próximos'}
                  </p>
                </div>
              )}

              {shareSuccess ? (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <span className="text-xl flex-shrink-0">🎉</span>
                  <div>
                    <p className="font-bold text-emerald-700 text-[14px]">Card compartilhado!</p>
                    <p className="text-[12px] text-emerald-600">Poste em grupos de vizinhos, Instagram e Facebook.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
                  <p className="font-bold text-rose-600 text-[13px]">Compartilhe agora para maximizar o alcance</p>
                  <p className="text-[12px] text-rose-500 mt-0.5">Grupos de vizinhos, Instagram, Facebook e WhatsApp.</p>
                </div>
              )}

              {/* Botões de partilha */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleShare('native')}
                    className="col-span-2 flex items-center justify-center gap-2 py-4 bg-red-500 text-white rounded-2xl font-black text-[15px] shadow-md shadow-red-500/20 active:scale-[0.98] transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Compartilhar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare('download')}
                    className="flex items-center justify-center bg-gray-100 text-gray-500 rounded-2xl font-bold text-lg border border-gray-200 active:scale-[0.98] transition-all"
                    title="Salvar imagem"
                  >
                    ↓
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const txt = encodeURIComponent(`🚨 ${pet.pet_name} está desaparecido!\n📍 ${lastSeenLocation || 'Local a confirmar'}\n📱 Contato: ${contact}\n🔗 petmol.com.br/achei-um-pet`);
                      window.open(`https://wa.me/?text=${txt}`, '_blank', 'noopener,noreferrer');
                    }}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[14px] bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/25 active:scale-[0.98] transition-all"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current flex-shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const txt = encodeURIComponent(`🚨 ${pet.pet_name} está desaparecido! Contato: ${contact}`);
                      const url = encodeURIComponent('https://petmol.com.br/achei-um-pet');
                      window.open(`https://t.me/share/url?url=${url}&text=${txt}`, '_blank', 'noopener,noreferrer');
                    }}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[14px] bg-[#2AABEE]/10 text-[#2AABEE] border border-[#2AABEE]/25 active:scale-[0.98] transition-all"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current flex-shrink-0"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                    Telegram
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => { setStep('form'); setShareSuccess(false); }}
                className="w-full py-3 rounded-2xl border-2 border-gray-200 text-gray-500 font-semibold text-[14px] bg-white active:scale-[0.98] transition-all"
              >
                Editar informações
              </button>

              <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 flex gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">🔗</span>
                <div>
                  <p className="font-bold text-slate-600 text-[13px]">petmol.com.br/achei-um-pet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    Qualquer pessoa que encontrar {pet.pet_name} pode avisar sem ter o app.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </>
  );
}
