'use client';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { PetSpecies } from '@/lib/petTaxonomy';
import type { PetHealthProfile } from '@/lib/petHealth';
import { isPetProfileCompleted, trackV1Metric } from '@/lib/v1Metrics';
import { PetPhotoPicker } from './PetPhotoPicker';
import { ModalPortal } from '@/components/ModalPortal';
import { resolveBackendPetPhoto } from '@/lib/backendPetProfile';
import { localTodayISO } from '@/lib/localDate';

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

const PHOTOS_BASE_URL = process.env.NEXT_PUBLIC_PHOTOS_BASE_URL || API_BASE_URL;
const OWN_PHOTO_HOSTS = ['petmol.app', 'petmol.com.br', 'www.petmol.com.br', 'localhost'];

const G   = 'divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm';
const ROW = 'bg-white px-4 py-3.5';

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
      {opts.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`flex-1 rounded-[0.6rem] text-xs font-semibold transition-all ${val === o.v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

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

const isOwnHost = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return OWN_PHOTO_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
};

const resolvePhotosBase = (): string => {
  const configured = String(PHOTOS_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
};

const getPhotoUrl = (photoPath: string | undefined | null, version?: string): string | null => {
  if (!photoPath) return null;
  if (photoPath.startsWith('data:')) return photoPath;
  if (photoPath.startsWith('http')) {
    if (isOwnHost(photoPath)) return photoPath;
    return `/api/photo-proxy?url=${encodeURIComponent(photoPath)}`;
  }

  const photosBase = resolvePhotosBase();
  const normalized = photoPath.replace(/^\/+/, '');
  const path = normalized.startsWith('uploads/') ? `/${normalized}` : `/uploads/${normalized}`;
  const cacheKey = version ? `?t=${encodeURIComponent(version)}` : '';
  return `${photosBase}${path}${cacheKey}`;
};

interface EditPetModalProps {
  pet: PetHealthProfile & { id?: string; name?: string; weight?: number; is_neutered?: boolean; insurance_provider?: string };
  photoVersion?: string | number;
  onClose: () => void;
  onSave: (updatedPet: Partial<PetHealthProfile> & {
    pet_id: string;
    name?: string;
    is_neutered?: boolean;
    weight?: number;
    insurance_provider?: string;
    health_data?: Record<string, unknown>;
    primary_vet?: { name: string; clinic: string; phone: string };
    _photoUpdated?: boolean;
  }) => void | Promise<void>;
  onDelete?: (petId: string) => void;
  /** Kept for API compatibility — not rendered */
  initialSection?: 'food' | 'grooming';
}

function resolvePetPhotoValue(pet: EditPetModalProps['pet'], currentPhoto?: string): string | null {
  const candidates = [
    currentPhoto,
    resolveBackendPetPhoto(pet),
  ];
  return candidates.find((value): value is string => Boolean(value && value.trim())) || null;
}

export function EditPetModal({ pet, photoVersion, onClose, onSave, onDelete }: EditPetModalProps) {
  const [formData, setFormData] = useState<{
    name: string;
    species: PetSpecies;
    breed: string;
    birth_date: string;
    sex: 'male' | 'female' | '';
    weight: string;
    weight_unit: string;
    is_neutered: boolean;
    photo: string;
  }>({
    name: pet.pet_name || pet.name || '',
    species: pet.species || 'dog',
    breed: pet.breed || '',
    birth_date: pet.birth_date || '',
    sex: pet.sex === 'male' || pet.sex === 'female' ? pet.sex : '',
    weight: String(pet.weight_history?.[0]?.weight || pet.weight || ''),
    weight_unit: 'kg',
    is_neutered: pet.neutered !== undefined ? pet.neutered : (pet.is_neutered || false),
    photo: resolvePetPhotoValue(pet) || '',
  });
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const speciesSeg = ['dog', 'cat'].includes(formData.species) ? formData.species : 'other';
  const today = localTodayISO();
  const canSubmit = formData.name.trim().length > 0;

  const petPhotoUrl = useMemo(() => {
    const photoPath = resolvePetPhotoValue(pet, formData.photo);
    return getPhotoUrl(photoPath, photoVersion ? String(photoVersion) : undefined);
  }, [formData.photo, pet, photoVersion]);

  const handlePhotoPickerConfirm = useCallback((dataUrl: string) => {
    setShowPhotoPicker(false);
    setPhotoDataUrl(dataUrl);
    setFormData(prev => ({ ...prev, photo: dataUrl }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!formData.name.trim()) { setError('Preencha o nome do pet.'); return; }
    setLoading(true);

    try {
      const updatedPet = {
        ...pet,
        pet_name: formData.name,
        name: formData.name,
        species: formData.species,
        breed: formData.breed,
        birth_date: formData.birth_date || undefined,
        sex: formData.sex || undefined,
        neutered: formData.is_neutered,
        is_neutered: formData.is_neutered,
        weight: formData.weight ? parseFloat(formData.weight.replace(',', '.')) : undefined,
      };

      let photoUpdated = false;

      if (photoDataUrl) {
        const token = getToken();
        const blob = await (await fetch(photoDataUrl)).blob();
        const fd = new FormData();
        fd.append('file', new File([blob], 'pet-photo.jpg', { type: 'image/jpeg' }));
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE_URL}/pets/${pet.pet_id}/photo`, {
          method: 'POST', headers, credentials: 'include', body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { detail?: string };
          throw new Error(data.detail || 'Falha no upload da foto');
        }
        photoUpdated = true;
      }

      await onSave({ ...updatedPet, _photoUpdated: photoUpdated });

      const profileWasComplete = isPetProfileCompleted({
        name: pet.pet_name || pet.name,
        species: pet.species,
        breed: pet.breed,
        birth_date: pet.birth_date,
        sex: pet.sex,
        weight: pet.weight_history?.[0]?.weight || pet.weight,
        photo: pet.photo,
      });
      const profileIsComplete = isPetProfileCompleted({
        name: formData.name,
        species: formData.species,
        breed: formData.breed,
        birth_date: formData.birth_date || undefined,
        sex: formData.sex || undefined,
        weight: formData.weight,
        photo: photoDataUrl || formData.photo,
      });
      if (!profileWasComplete && profileIsComplete) {
        trackV1Metric('pet_profile_completed', {
          pet_id: pet.pet_id,
          source: 'edit_pet_modal',
          has_photo: Boolean(photoDataUrl || formData.photo),
        });
      }

      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar alterações.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fadeIn">
        <div className="flex max-h-[96dvh] w-full flex-col bg-slate-50 sm:max-w-sm rounded-[32px] shadow-2xl overflow-hidden animate-scaleIn">

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-4 bg-white border-b border-slate-100">
            <div>
              <p className="text-base font-bold text-slate-900">Editar pet</p>
              <p className="text-[13px] text-slate-400 font-medium">Preencha os dados abaixo</p>
            </div>
            <button type="button" onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:scale-95 transition-all">
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 space-y-4">

              {/* Photo + name */}
              <div className={G}>
                <div className={`${ROW} flex items-center gap-4`}>
                  <button type="button" onClick={() => setShowPhotoPicker(true)}
                    className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0 flex items-center justify-center active:opacity-70 transition-opacity">
                    {petPhotoUrl ? (
                      <img src={petPhotoUrl} alt={formData.name || 'Pet'} className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
                        stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14.5 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.5 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.5a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 9.5 4z" />
                        <circle cx="12" cy="13" r="3" />
                      </svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <input type="text" value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Nome do pet"
                      className="w-full text-sm font-semibold bg-transparent outline-none text-slate-900 placeholder:text-slate-400" />
                    <p className="text-xs text-slate-400 mt-0.5">Toque na foto para alterar</p>
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
                    onChange={(v) => setFormData(prev => ({ ...prev, species: v as PetSpecies, breed: prev.breed }))}
                  />
                </div>
                <div className={`${ROW} space-y-2`}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sexo</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['male', 'female'] as const).map((v) => (
                      <button key={v} type="button"
                        onClick={() => setFormData(prev => ({ ...prev, sex: prev.sex === v ? '' : v }))}
                        className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                          formData.sex === v ? 'border-[#0056D2] bg-blue-50 text-[#0047ad]' : 'border-slate-200 bg-white text-slate-600'
                        }`}>
                        {v === 'male' ? 'Macho' : 'Fêmea'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Detalhes extras */}
              <div className={G}>
                <button type="button" onClick={() => setExtrasOpen(v => !v)}
                  className={`${ROW} flex w-full items-center justify-between`}>
                  <span className="text-sm font-medium text-slate-800">Detalhes extras</span>
                  <span className={`text-slate-400 text-xs transition-transform ${extrasOpen ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {extrasOpen && (
                  <>
                    <BreedPicker
                      species={formData.species}
                      value={formData.breed}
                      onChange={(v) => setFormData(prev => ({ ...prev, breed: v }))}
                    />
                    <div className={ROW}>
                      <label className="block text-xs text-slate-500 mb-1.5">Data de nascimento</label>
                      <input type="date" max={today} value={formData.birth_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, birth_date: e.target.value }))}
                        className="w-full bg-transparent text-sm outline-none text-slate-700" />
                    </div>
                    <div className={`${ROW} flex items-center gap-3`}>
                      <span className="text-sm text-slate-800 flex-1">Peso</span>
                      <input type="text" inputMode="decimal" value={formData.weight}
                        onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                        placeholder="0.0"
                        className="w-16 text-right text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400" />
                      <select value={formData.weight_unit}
                        onChange={(e) => setFormData(prev => ({ ...prev, weight_unit: e.target.value }))}
                        className="text-sm bg-transparent outline-none text-slate-500">
                        <option value="kg">kg</option>
                        <option value="lb">lb</option>
                      </select>
                    </div>
                    <div className={`${ROW} flex items-center justify-between`}>
                      <span className="text-sm text-slate-800">Castrado / Esterilizado</span>
                      <Toggle on={formData.is_neutered} onChange={() => setFormData(prev => ({ ...prev, is_neutered: !prev.is_neutered }))} />
                    </div>
                  </>
                )}
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-slate-100 bg-white/90 backdrop-blur-md px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
              {confirmDelete ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 space-y-2">
                  <p className="text-sm font-semibold text-rose-700 text-center">Excluir {formData.name || 'este pet'} permanentemente?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white active:scale-[0.98] transition-transform">
                      Cancelar
                    </button>
                    <button type="button" onClick={() => { onDelete?.(pet.pet_id!); onClose(); }}
                      className="flex-1 py-2.5 rounded-xl bg-rose-600 text-sm font-semibold text-white active:scale-[0.98] transition-transform">
                      Confirmar exclusão
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-3">
                    <button type="button" onClick={onClose}
                      className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white active:scale-[0.98] transition-all">
                      Cancelar
                    </button>
                    <button type="submit" disabled={loading || !canSubmit}
                      className="flex flex-1 items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#0056D2] text-white text-sm font-semibold active:scale-[0.98] transition-all disabled:opacity-40 shadow-md shadow-blue-600/20">
                      <Save className="w-4 h-4" />
                      {loading ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                  {onDelete && (
                    <button type="button" onClick={() => setConfirmDelete(true)}
                      className="w-full py-2 text-xs font-semibold text-rose-500 hover:text-rose-700 active:scale-[0.98] transition-transform">
                      Excluir pet
                    </button>
                  )}
                </>
              )}
            </div>
          </form>
        </div>
      </div>

      {showPhotoPicker && (
        <PetPhotoPicker
          initialSrc={petPhotoUrl}
          onConfirm={handlePhotoPickerConfirm}
          onCancel={() => setShowPhotoPicker(false)}
        />
      )}
    </ModalPortal>
  );
}
