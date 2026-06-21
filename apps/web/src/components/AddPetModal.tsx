'use client';

import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { trackV1Metric } from '@/lib/v1Metrics';
import { PetPhotoPicker } from './PetPhotoPicker';
import { ModalPortal } from '@/components/ModalPortal';
import { localTodayISO } from '@/lib/localDate';

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

const label = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wide';

const segBtn = (active: boolean) =>
  `flex-1 py-3 rounded-xl border text-sm font-semibold transition-all ${
    active ? 'border-[#0056D2] bg-blue-50 text-[#0047ad]' : 'border-slate-200 bg-white text-slate-600'
  }`;

const inputCls = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10';

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

// Typeahead com isMounted para não limpar raça existente no mount
function BreedPicker({ species, value, onChange }: { species: string; value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(false);

  const breeds = species === 'dog' ? DOG_BREEDS : species === 'cat' ? CAT_BREEDS : [];
  const q = query.trim().toLowerCase();
  const filtered = q ? breeds.filter(b => b.toLowerCase().includes(q)).slice(0, 10) : breeds.slice(0, 10);

  useEffect(() => { setQuery(value); }, [value]);
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    setQuery(''); onChange('');
  }, [species]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (breed: string) => { setQuery(breed); onChange(breed); setOpen(false); inputRef.current?.blur(); };

  if (!species || species === 'other') return null;

  return (
    <div className="space-y-1.5">
      <label className={label}>Raça (opcional)</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(''); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar raça…"
          className={inputCls}
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
            {filtered.map(b => (
              <button key={b} type="button"
                onPointerDown={e => { e.preventDefault(); select(b); }}
                className="w-full text-left px-4 py-3 text-sm text-slate-800 border-b border-slate-100 last:border-b-0 active:bg-blue-50 hover:bg-blue-50">
                {b}
              </button>
            ))}
          </div>
        )}
      </div>
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
  const canSubmit = name.trim().length > 0;

  const handlePhotoPickerConfirm = useCallback((dataUrl: string) => {
    setShowPhotoPicker(false);
    setPetPhoto(dataUrl);
    setPetPhotoDataUrl(dataUrl);
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!name.trim()) { setError('Preencha o nome do pet.'); return; }

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
              <div className="flex justify-center">
                <button type="button" onClick={() => setShowPhotoPicker(true)}
                  className="relative w-24 h-24 rounded-full overflow-hidden bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center active:opacity-80 transition-opacity">
                  {petPhoto ? (
                    <img src={petPhoto} alt="Pet" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Camera className="w-6 h-6 text-slate-400" />
                      <span className="text-[10px] font-semibold text-slate-400">Foto</span>
                    </div>
                  )}
                </button>
              </div>

              {/* Nome */}
              <div className="space-y-1.5">
                <label className={label}>Nome do pet *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Ex: Mel"
                  className={`${inputCls} font-semibold`} />
              </div>

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
                  className={inputCls} />
              </div>

              {/* Peso */}
              <div className="space-y-1.5">
                <label className={label}>Peso (opcional)</label>
                <div className="flex gap-2">
                  <input type="text" inputMode="decimal" value={weightValue}
                    onChange={e => setWeightValue(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
                    placeholder="Ex: 8.5"
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10" />
                  <select value={weightUnit} onChange={e => setWeightUnit(e.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-3.5 text-sm outline-none">
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </select>
                </div>
              </div>

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
