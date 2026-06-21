'use client';

import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { trackV1Metric } from '@/lib/v1Metrics';
import { PetPhotoPicker } from './PetPhotoPicker';
import { ModalPortal } from '@/components/ModalPortal';
import { localTodayISO } from '@/lib/localDate';

// ── Breed data ────────────────────────────────────────────────────────────────

const DOG_BREEDS = [
  'SRD (Sem Raça Definida)','Affenpinscher','Afghan Hound (Galgo Afegão)','Airedale Terrier',
  'Akita Americano','Akita Japonês','Malamute do Alasca','American Bully','American Pit Bull Terrier',
  'American Staffordshire Terrier','Pastor Australiano','Basenji','Basset Hound','Beagle',
  'Bernese Mountain Dog','Bichon Frisé','Bloodhound','Border Collie','Border Terrier',
  'Boston Terrier','Boxer','Braco Alemão','Bull Terrier','Bulldog Americano','Bulldog Francês',
  'Bulldog Inglês','Bullmastiff','Cairn Terrier','Cane Corso','Cavalier King Charles Spaniel',
  'Chihuahua','Chow Chow','Cocker Spaniel Americano','Cocker Spaniel Inglês','Collie',
  'Corgi Cardigan','Corgi Pembroke','Dachshund (Salsicha)','Dálmata','Doberman Pinscher',
  'Dogue Alemão','Dogue de Bordeaux','Dogo Argentino','Fila Brasileiro','Fox Terrier',
  'Golden Retriever','Greyhound','Husky Siberiano','Jack Russell Terrier','Labrador Retriever',
  'Lhasa Apso','Maltês','Mastiff Inglês','Miniature Pinscher','Old English Sheepdog','Papillón',
  'Pastor Alemão','Pastor Belga Malinois','Pekingese','Pointer','Pomerânia (Spitz Anão)',
  'Poodle Gigante','Poodle Médio','Poodle Miniatura','Poodle Toy','Pug','Rottweiler','Samoyed',
  'Schnauzer Gigante','Schnauzer Médio','Schnauzer Miniatura','Shar-Pei','Shiba Inu','Shih Tzu',
  'St. Bernard','Staffordshire Bull Terrier','Vizsla','Weimaraner','West Highland White Terrier',
  'Whippet','Yorkshire Terrier','Outro',
];

const CAT_BREEDS = [
  'SRD (Sem Raça Definida)','Abissínio','American Shorthair','Bengal','Birmanês','British Shorthair',
  'Devon Rex','Exótico','Maine Coon','Munchkin','Persa','Ragdoll','Siamês','Sphynx','Outro',
];

// ── Shared primitives ─────────────────────────────────────────────────────────

const G   = 'divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm';
const ROW = 'bg-white px-4 py-3.5';

// iOS-style toggle
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      className={`relative flex-shrink-0 w-[51px] h-[31px] rounded-full transition-colors duration-200 focus:outline-none ${on ? 'bg-[#30D158]' : 'bg-black/10'}`}
    >
      <span className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] bg-white rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-transform duration-200 ${on ? 'translate-x-[20px]' : 'translate-x-0'}`} />
    </button>
  );
}

function Seg({ opts, val, onChange }: { opts: { l: string; v: string }[]; val: string; onChange: (v: string) => void }) {
  return (
    <div className="flex h-9 rounded-xl bg-slate-100 p-0.5 gap-0.5">
      {opts.map(o => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`flex-1 rounded-[0.6rem] text-xs font-semibold transition-all ${val === o.v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

// Breed search with typeahead
function BreedPicker({ species, value, onChange }: { species: string; value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const breeds = species === 'dog' ? DOG_BREEDS : species === 'cat' ? CAT_BREEDS : [];
  const q = query.trim().toLowerCase();
  const filtered = q ? breeds.filter(b => b.toLowerCase().includes(q)).slice(0, 10) : breeds.slice(0, 10);

  useEffect(() => { setQuery(value); }, [value]);
  useEffect(() => { setQuery(''); onChange(''); }, [species]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (breed: string) => { setQuery(breed); onChange(breed); setOpen(false); inputRef.current?.blur(); };

  if (!species || species === 'other') return null;

  return (
    <div className={ROW}>
      <label className="block text-xs text-slate-500 mb-1.5">Raça</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(''); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar raça…"
          className="w-full bg-transparent text-sm outline-none text-slate-700 placeholder:text-slate-400"
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-20 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
            {filtered.map(b => (
              <button key={b} type="button"
                onPointerDown={e => { e.preventDefault(); select(b); }}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-800 border-b border-slate-100 last:border-b-0 active:bg-blue-50 hover:bg-blue-50">
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
  const [birthDate,       setBirthDate]       = useState('');
  const [weightValue,     setWeightValue]     = useState('');
  const [weightUnit,      setWeightUnit]      = useState('kg');
  const [sex,             setSex]             = useState('');
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
        birth_date: birthDate || undefined,
        sex: sex || undefined,
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
          <div className="flex max-h-[96dvh] w-full flex-col bg-slate-50 sm:max-w-sm rounded-[32px] animate-scaleIn overflow-hidden shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 bg-white border-b border-slate-100">
              <div>
                <p className="text-base font-bold text-slate-900">Novo pet</p>
                <p className="text-[13px] text-slate-400 font-medium">Preencha os dados abaixo</p>
              </div>
              <button type="button" onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:scale-95 transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">

              {/* Photo + name */}
              <div className={G}>
                <div className={`${ROW} flex items-center gap-4`}>
                  <button type="button" onClick={() => setShowPhotoPicker(true)}
                    className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0 flex items-center justify-center active:opacity-70 transition-opacity">
                    {petPhoto ? (
                      <img src={petPhoto} alt="Pet" className="w-full h-full object-cover" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
                        stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14.5 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.5 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.5a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 9.5 4z" />
                        <circle cx="12" cy="13" r="3" />
                      </svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <input type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder="Nome do pet"
                      className="w-full text-sm font-semibold bg-transparent outline-none placeholder:text-slate-400 text-slate-900" />
                    <p className="text-xs text-slate-400 mt-0.5">Foto opcional — toque para adicionar</p>
                  </div>
                </div>
              </div>

              {/* Species + sex */}
              <div className={G}>
                <div className={`${ROW} space-y-2`}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo de animal</p>
                  <Seg
                    opts={[{ l: 'Cão', v: 'dog' }, { l: 'Gato', v: 'cat' }, { l: 'Outro', v: 'other' }]}
                    val={speciesSeg}
                    onChange={v => setSpecies(v)}
                  />
                </div>
                <div className={`${ROW} space-y-2`}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sexo</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['male', 'female'] as const).map(v => (
                      <button key={v} type="button" onClick={() => setSex(sex === v ? '' : v)}
                        className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                          sex === v ? 'border-[#0056D2] bg-blue-50 text-[#0047ad]' : 'border-slate-200 bg-white text-slate-600'
                        }`}>
                        {v === 'male' ? 'Macho' : 'Fêmea'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Raça + detalhes */}
              <div className={G}>
                <BreedPicker species={species} value={breed} onChange={setBreed} />

                <div className={ROW}>
                  <label className="block text-xs text-slate-500 mb-1.5">Data de nascimento</label>
                  <input type="date" max={today} value={birthDate} onChange={e => setBirthDate(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none text-slate-700" />
                </div>
                <div className={`${ROW} flex items-center gap-3`}>
                  <span className="text-sm text-slate-800 flex-1">Peso</span>
                  <input type="text" inputMode="decimal" value={weightValue}
                    onChange={e => setWeightValue(e.target.value)} placeholder="0.0"
                    className="w-16 text-right text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400" />
                  <select value={weightUnit} onChange={e => setWeightUnit(e.target.value)}
                    className="text-sm bg-transparent outline-none text-slate-500">
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </select>
                </div>
                <div className={`${ROW} flex items-center justify-between`}>
                  <span className="text-sm text-slate-800">Castrado / Esterilizado</span>
                  <Toggle on={neutered} onChange={() => setNeutered(v => !v)} />
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 bg-white/90 backdrop-blur-md px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-3">
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
