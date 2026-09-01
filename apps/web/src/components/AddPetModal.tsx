'use client';

import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Plus, X } from 'lucide-react';
import { trackV1Metric } from '@/lib/v1Metrics';
import { PetPhotoPicker } from './PetPhotoPicker';
import { ModalPortal } from '@/components/ModalPortal';
import { localTodayISO } from '@/lib/localDate';
import { sanitizePetName } from '@/lib/petName';
import { useKeyboardSheetViewport } from '@/hooks/useKeyboardSheetViewport';

// ── Breed data (sincronizado com register-pet) ────────────────────────────────

const DOG_BREEDS = [
  'SRD (Sem Raça Definida)',
  'Affenpinscher', 'Airedale Terrier', 'Akita Americano', 'Akita Japonês',
  'Alaskan Malamute', 'American Bully', 'American Pit Bull Terrier', 'American Staffordshire Terrier',
  'Australian Cattle Dog', 'Australian Shepherd', 'Basenji', 'Basset Hound',
  'Beagle', 'Bearded Collie', 'Bernese Mountain Dog', 'Bichon Frisé',
  'Blood Hound', 'Border Collie', 'Border Terrier', 'Boston Terrier',
  'Boxer', 'Braco Alemão', 'Bull Terrier', 'Bulldog Americano',
  'Bulldog Francês', 'Bulldog Inglês', 'Cane Corso', 'Cavalier King Charles Spaniel',
  'Chow Chow', 'Chihuahua', 'Cocker Spaniel Americano', 'Cocker Spaniel Inglês',
  'Collie Rough', 'Collie Smooth', 'Dachshund (Salsicha)', 'Dálmata',
  'Doberman', 'Dogue Alemão', 'Dogue de Bordeaux', 'English Setter',
  'Fila Brasileiro', 'Fox Terrier', 'Galgo Espanhol', 'Golden Retriever',
  'Greyhound', 'Husky Siberiano', 'Irish Setter', 'Jack Russell Terrier',
  'Labrador Retriever', 'Lhasa Apso', 'Maltês', 'Mastiff Inglês',
  'Mastiff Napolitano', 'Mastiff Tibetano', 'Miniature Pinscher',
  'Old English Sheepdog', 'Papillón', 'Pastor Alemão',
  'Pastor Australiano', 'Pastor Belga Malinois', 'Pastor de Berna',
  'Pekingese', 'Pinscher Miniatura', 'Pit Bull Terrier', 'Pointer',
  'Pomerânia (Spitz Anão)', 'Poodle Gigante', 'Poodle Médio', 'Poodle Miniatura', 'Poodle Toy',
  'Pug', 'Rottweiler', 'Saluki', 'Samoyed',
  'Schnauzer Gigante', 'Schnauzer Médio', 'Schnauzer Miniatura',
  'Shar-Pei', 'Shiba Inu', 'Shih Tzu', 'Spitz Alemão Médio',
  'Spitz Japonês', 'St. Bernard', 'Staffordshire Bull Terrier',
  'Vizsla', 'Weimaraner', 'West Highland White Terrier',
  'Whippet', 'Yorkshire Terrier', 'Zuchon', 'Outro',
];

const CAT_BREEDS = [
  'SRD (Sem Raça Definida)',
  'Abyssinian', 'American Curl', 'American Shorthair',
  'Balinês', 'Bengal', 'Birman (Sagrado da Birmânia)',
  'Bombaim', 'British Longhair', 'British Shorthair',
  'Burmês', 'Burmilla', 'Cornish Rex',
  'Devon Rex', 'Exótico (Exotic Shorthair)',
  'Himalaio', 'Korat', 'LaPerm',
  'Maine Coon', 'Manx', 'Mau Egípcio',
  'Norwegian Forest Cat', 'Ocicat', 'Oriental Shorthair',
  'Persa', 'Ragamuffin', 'Ragdoll',
  'Russo Azul', 'Savannah', 'Scottish Fold',
  'Scottish Straight', 'Selkirk Rex', 'Siamês',
  'Siberiano', 'Singapura', 'Somali',
  'Sphynx (Esfinge)', 'Tonquinês',
  'Turkish Angora', 'Turkish Van', 'Outro',
];

// ── Primitives ────────────────────────────────────────────────────────────────

const SRD_BREED = 'SRD (Sem Raça Definida)';

const label = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wide';

const segBtn = (active: boolean) =>
  `flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
    active ? 'border-[#0056D2] bg-blue-50 text-[#0047ad]' : 'border-slate-300 bg-white text-slate-600'
  }`;

const inputCls = 'w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3.5 text-base outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:shadow-lg focus:shadow-blue-500/10';
// iOS: input[type=date] tem largura intrínseca e valor centralizado — força
// encolher (min-w-0), tira o chrome nativo (appearance-none) e alinha à esquerda
// como os outros campos.
const dateInputCls = `${inputCls} block min-w-0 appearance-none text-left [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:m-0`;

// Toggle visual — div sem estilos padrão de browser (button no Safari quebra backgroundColor)
function Toggle({ on }: { on: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative', display: 'block', flexShrink: 0,
        width: 51, height: 31, borderRadius: 31,
        backgroundColor: on ? '#34C759' : '#E5E5EA',
        transition: 'background-color 0.2s ease',
        pointerEvents: 'none',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: 2,
        width: 27, height: 27, borderRadius: '50%',
        backgroundColor: '#fff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.28), 0 0 0 0.5px rgba(0,0,0,0.06)',
        transition: 'transform 0.2s ease',
        transform: on ? 'translateX(20px)' : 'translateX(0)',
        display: 'block',
      }} />
    </div>
  );
}

// ── Zoomed text field — bottom sheet para digitação confortável ───────────────
function ZoomedField({
  labelText,
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  hint,
}: {
  labelText: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const vvRef = useKeyboardSheetViewport(open);

  const openPanel = () => {
    setOpen(true);
    setTimeout(() => ref.current?.focus(), 80);
  };

  return (
    <div className="space-y-1.5">
      <p className={label}>{labelText}</p>
      <button
        type="button"
        onClick={openPanel}
        className="w-full rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-base text-left transition-all duration-200 active:scale-[0.99] active:bg-slate-50"
      >
        <span className={value ? 'text-slate-900 font-semibold' : 'text-slate-400'}>
          {value || placeholder}
        </span>
      </button>
      {open && (
        <div
          ref={vvRef}
          className="fixed left-0 right-0 z-[300] flex flex-col justify-end"
          style={{ top: 0, height: '100dvh', cursor: 'pointer' }}
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl animate-slideUp"
            style={{ cursor: 'default' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold active:bg-slate-200 transition-colors"
                aria-label="Fechar"
              >
                ✕
              </button>
              <div className="h-1 w-10 rounded-full bg-slate-200" />
              <div className="w-9" />
            </div>
            <div className="px-5 pt-1 pb-4">
              <p className={`${label} mb-4`}>{labelText}</p>
              <input
                ref={ref}
                type={type}
                inputMode={inputMode}
                autoFocus
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setOpen(false); } }}
                className="w-full text-[28px] font-semibold text-slate-900 border-b-2 border-blue-400 outline-none pb-3 bg-transparent placeholder:text-slate-300 leading-tight"
              />
              {hint && <p className="text-[12px] text-slate-400 mt-3 leading-relaxed">{hint}</p>}
            </div>
            <div className="px-5 pb-[max(24px,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full py-4 rounded-2xl bg-[#0056D2] text-white font-black text-[16px] active:scale-[0.98] transition-all shadow-md shadow-blue-600/20"
              >
                Pronto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Zoomed weight field — número grande + seletor de unidade ──────────────────
function ZoomedWeightField({
  value,
  unit,
  onValueChange,
  onUnitChange,
}: {
  value: string;
  unit: string;
  onValueChange: (v: string) => void;
  onUnitChange: (u: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const vvRef = useKeyboardSheetViewport(open);

  const openPanel = () => {
    setOpen(true);
    setTimeout(() => ref.current?.focus(), 80);
  };

  return (
    <div className="space-y-1.5">
      <p className={label}>Peso (opcional)</p>
      <button
        type="button"
        onClick={openPanel}
        className="w-full rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-base text-left transition-all duration-200 active:scale-[0.99] active:bg-slate-50"
      >
        <span className={value ? 'text-slate-900 font-semibold' : 'text-slate-400'}>
          {value ? `${value} ${unit}` : 'Ex: 8.5 kg'}
        </span>
      </button>
      {open && (
        <div
          ref={vvRef}
          className="fixed left-0 right-0 z-[300] flex flex-col justify-end"
          style={{ top: 0, height: '100dvh', cursor: 'pointer' }}
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl animate-slideUp"
            style={{ cursor: 'default' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold active:bg-slate-200 transition-colors"
                aria-label="Fechar"
              >
                ✕
              </button>
              <div className="h-1 w-10 rounded-full bg-slate-200" />
              <div className="w-9" />
            </div>
            <div className="px-5 pt-1 pb-4">
              <p className={`${label} mb-4`}>Peso</p>
              <div className="flex items-end gap-4">
                <input
                  ref={ref}
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={value}
                  onChange={e => onValueChange(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
                  placeholder="0.0"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setOpen(false); } }}
                  className="flex-1 text-[40px] font-bold text-slate-900 border-b-2 border-blue-400 outline-none pb-2 bg-transparent placeholder:text-slate-300"
                />
                <div className="flex gap-2 pb-2">
                  {(['kg', 'lb'] as const).map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => onUnitChange(u)}
                      className={`px-4 py-2.5 rounded-xl font-bold text-[15px] transition-all border ${unit === u ? 'bg-[#0056D2] text-white border-blue-600' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 pb-[max(24px,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full py-4 rounded-2xl bg-[#0056D2] text-white font-black text-[16px] active:scale-[0.98] transition-all shadow-md shadow-blue-600/20"
              >
                Pronto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// BreedPicker — bottom sheet com scroll livre por todas as raças
function BreedPicker({ species, value, onChange }: { species: string; value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useKeyboardSheetViewport(open);
  const isMounted = useRef(false);

  const breeds = species === 'dog' ? DOG_BREEDS : species === 'cat' ? CAT_BREEDS : [];
  const q = query.trim().toLowerCase();
  const filtered = q ? breeds.filter(b => b.toLowerCase().includes(q)) : breeds;

  useEffect(() => { if (!open) setQuery(''); }, [open]);
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    setQuery(''); onChange('');
  }, [species]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (breed: string) => { onChange(breed); setOpen(false); };

  const openSheet = () => {
    setOpen(true);
    setTimeout(() => searchRef.current?.focus(), 120);
  };

  if (!species || species === 'other') return null;

  return (
    <div className="space-y-1.5">
      <label className={label}>Raça *</label>
      <button
        type="button"
        onClick={openSheet}
        className="w-full rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-base text-left outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:shadow-lg focus:shadow-blue-500/10 active:scale-[0.99]"
      >
        <span className={value ? 'text-slate-900 font-medium' : 'text-slate-400'}>
          {value || 'Selecionar raça…'}
        </span>
      </button>

      {/* Atalho de um toque para quem não sabe a raça — não obriga o tutor
          leigo a abrir a lista e procurar. */}
      {value !== SRD_BREED && (
        <button
          type="button"
          onClick={() => onChange(SRD_BREED)}
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 active:bg-slate-50"
        >
          Não sei / vira-lata (SRD)
        </button>
      )}

      {open && (
        <div
          ref={wrapperRef}
          className="fixed left-0 right-0 z-[200] flex flex-col justify-end"
          style={{ top: 0, height: '100dvh' }}
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-slideUp"
            style={{ maxHeight: '92%' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="px-4 pt-2 pb-3 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar raça…"
                className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xl outline-none transition-all duration-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-11 h-11 flex-shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-lg active:scale-95 transition-all"
              >✕</button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 overscroll-contain">
              {filtered.map(b => (
                <button
                  key={b}
                  type="button"
                  onPointerDown={e => { e.preventDefault(); select(b); }}
                  className={`w-full text-left px-5 py-[18px] text-[17px] border-b border-slate-100 last:border-b-0 active:bg-blue-50 transition-colors ${b === value ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-800'}`}
                >
                  {b}
                </button>
              ))}
            </div>
            <div className="flex-shrink-0" style={{ height: 'max(8px, env(safe-area-inset-bottom))' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AddPetModalProps {
  onClose: () => void;
  onComplete: () => void;
}

export function AddPetModal({ onClose, onComplete }: AddPetModalProps) {
  const [name,            setName]            = useState('');
  const [species,         setSpecies]         = useState('dog');
  const [breed,           setBreed]           = useState('');
  const [sex,             setSex]             = useState('');
  const [ageGroup,        setAgeGroup]        = useState('');
  const [birthDate,       setBirthDate]       = useState('');
  const [weightValue,     setWeightValue]     = useState('');
  const [weightUnit,      setWeightUnit]      = useState('kg');
  const [neutered,        setNeutered]        = useState(false);
  const [petPhoto,        setPetPhoto]        = useState('');
  const [petPhotoDataUrl, setPetPhotoDataUrl] = useState<string | null>(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');

  const speciesSeg = ['dog', 'cat'].includes(species) ? species : 'other';
  const today = localTodayISO();
  // Raça é obrigatória para cão/gato (a lista inclui "SRD" para quem não sabe).
  // Para "Outro" não há seletor de raça, então não bloqueia.
  const breedRequired = speciesSeg !== 'other';
  const canSubmit = name.trim().length > 0 && (!breedRequired || breed.trim().length > 0);

  const handlePhotoPickerConfirm = useCallback((dataUrl: string) => {
    setShowPhotoPicker(false);
    setPetPhoto(dataUrl);
    setPetPhotoDataUrl(dataUrl);
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!name.trim()) { setError('Preencha o nome do pet.'); return; }
    if (breedRequired && !breed.trim()) { setError('Selecione a raça do pet (use "SRD" se não souber).'); return; }

    const token = getToken();
    if (!token) { setError('Você precisa estar logado.'); return; }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        species,
        breed: breed || undefined,
        sex: sex || undefined,
        age_group: ageGroup || undefined,
        birth_date: birthDate || undefined,
        weight_value: weightValue ? parseFloat(weightValue.replace(',', '.')) : undefined,
        weight_unit: weightValue ? weightUnit : undefined,
        neutered,
      };

      const res = await fetch(`${API_BASE_URL}/pets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { detail?: string | Array<{ msg?: string }> };
        const msg = typeof data.detail === 'string'
          ? data.detail
          : Array.isArray(data.detail) ? data.detail.map(i => i.msg ?? 'Erro').join('\n') : `Erro ${res.status}`;
        throw new Error(msg);
      }

      const savedPet = await res.json() as { id: string };

      if (petPhotoDataUrl) {
        try {
          const blob = await (await fetch(petPhotoDataUrl)).blob();
          const fd = new FormData();
          fd.append('file', new File([blob], 'pet-photo.jpg', { type: 'image/jpeg' }));
          await fetch(`${API_BASE_URL}/pets/${savedPet.id}/photo`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}` }, credentials: 'include', body: fd,
          });
        } catch { /* non-fatal */ }
      }

      // Marco de ativação (North Star petmol_activated_v1 — lido em PushActionSheet).
      try { localStorage.setItem('petmol_activation_pet_created_v1', '1'); } catch { /* noop */ }

      trackV1Metric('pet_created', { pet_id: savedPet.id, species, has_photo: Boolean(petPhotoDataUrl), source: 'add_pet_modal' });
      onComplete();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar pet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalPortal>
      <>
        {showPhotoPicker && (
          <PetPhotoPicker initialSrc={petPhoto || null} onConfirm={handlePhotoPickerConfirm} onCancel={() => setShowPhotoPicker(false)} />
        )}

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fadeIn">
          <div className="flex max-h-[96dvh] w-full flex-col bg-white sm:max-w-sm rounded-[32px] animate-scaleIn overflow-hidden shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
              <div>
                <p className="text-base font-bold text-slate-900">Novo pet</p>
                <p className="text-[13px] text-slate-400 font-medium">Preencha os dados abaixo</p>
              </div>
              <button type="button" onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:scale-95 transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 space-y-5">

              {/* Foto */}
              <div className="flex flex-col items-center gap-2">
                <button type="button" onClick={() => setShowPhotoPicker(true)}
                  className="relative w-28 h-28 rounded-full bg-slate-50 border-2 border-dashed border-slate-300 flex items-center justify-center active:scale-[0.97] transition-transform">
                  {petPhoto ? (
                    <img src={petPhoto} alt="Pet" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <Camera className="w-8 h-8 text-slate-400" />
                  )}
                  <span className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#0056D2] border-[3px] border-white flex items-center justify-center shadow-md">
                    <Plus className="w-4 h-4 text-white" strokeWidth={3} />
                  </span>
                </button>
                <button type="button" onClick={() => setShowPhotoPicker(true)}
                  className="text-[13px] font-bold text-[#0056D2] active:opacity-70 transition-opacity">
                  {petPhoto ? 'Trocar foto' : 'Adicionar foto do pet'}
                </button>
                <span className="text-[11px] text-slate-400 font-medium -mt-1">Opcional</span>
              </div>

              {/* Nome */}
              <ZoomedField
                labelText="Nome do pet *"
                value={name}
                onChange={(v) => setName(sanitizePetName(v))}
                placeholder="Ex: Mel"
              />

              {/* Espécie */}
              <div className="space-y-1.5">
                <label className={label}>Espécie</label>
                <div className="flex gap-2">
                  {([{ v: 'dog', l: '🐶  Cão' }, { v: 'cat', l: '🐱  Gato' }, { v: 'other', l: 'Outro' }]).map(o => (
                    <button key={o.v} type="button" onClick={() => setSpecies(o.v)}
                      className={segBtn(speciesSeg === o.v)}>{o.l}</button>
                  ))}
                </div>
              </div>

              {/* Raça */}
              <BreedPicker species={species} value={breed} onChange={setBreed} />

              {/* Sexo */}
              <div className="space-y-1.5">
                <label className={label}>Sexo</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSex(sex === 'male' ? '' : 'male')}
                    className={segBtn(sex === 'male')}>Macho</button>
                  <button type="button" onClick={() => setSex(sex === 'female' ? '' : 'female')}
                    className={segBtn(sex === 'female')}>Fêmea</button>
                </div>
              </div>

              {/* Faixa etária */}
              <div className="space-y-1.5">
                <label className={label}>Faixa etária</label>
                <div className="flex gap-2">
                  {([{ v: 'puppy', l: 'Filhote' }, { v: 'adult', l: 'Adulto' }, { v: 'senior', l: 'Idoso' }]).map(o => (
                    <button key={o.v} type="button" onClick={() => setAgeGroup(prev => prev === o.v ? '' : o.v)}
                      className={segBtn(ageGroup === o.v)}>{o.l}</button>
                  ))}
                </div>
              </div>

              {/* Data de nascimento */}
              <div className="space-y-1.5">
                <label className={label}>Data de nascimento</label>
                <input type="date" max={today} value={birthDate} onChange={e => setBirthDate(e.target.value)}
                  className={dateInputCls} />
              </div>

              {/* Peso */}
              <ZoomedWeightField
                value={weightValue}
                unit={weightUnit}
                onValueChange={setWeightValue}
                onUnitChange={setWeightUnit}
              />

              {/* Castrado — linha inteira clicável */}
              <div
                role="switch"
                aria-checked={neutered}
                tabIndex={0}
                onClick={() => setNeutered(v => !v)}
                onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') setNeutered(v => !v); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 4, cursor: 'pointer', userSelect: 'none' }}
              >
                <span className={label}>Castrado / Esterilizado</span>
                <Toggle on={neutered} />
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white active:scale-[0.98] transition-all">
                Cancelar
              </button>
              <button type="button" onClick={handleSubmit} disabled={loading || !canSubmit}
                className="flex-1 py-3.5 rounded-2xl bg-[#0056D2] text-white text-sm font-semibold active:scale-[0.98] transition-all disabled:opacity-40 shadow-md shadow-blue-600/20">
                {loading ? 'Salvando…' : 'Adicionar pet'}
              </button>
            </div>
          </div>
        </div>
      </>
    </ModalPortal>
  );
}
