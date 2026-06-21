'use client';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Camera, X, Save } from 'lucide-react';
import { PetSpecies } from '@/lib/petTaxonomy';
import type { PetHealthProfile } from '@/lib/petHealth';
import { isPetProfileCompleted, trackV1Metric } from '@/lib/v1Metrics';
import { PetPhotoPicker } from './PetPhotoPicker';
import { ModalPortal } from '@/components/ModalPortal';
import { resolveBackendPetPhoto } from '@/lib/backendPetProfile';
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

const PHOTOS_BASE_URL = process.env.NEXT_PUBLIC_PHOTOS_BASE_URL || API_BASE_URL;
const OWN_PHOTO_HOSTS = ['petmol.app', 'petmol.com.br', 'www.petmol.com.br', 'localhost'];

const lbl = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wide';

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
      <label className={lbl}>Raça (opcional)</label>
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

// ── Photo URL helpers ─────────────────────────────────────────────────────────

const isOwnHost = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return OWN_PHOTO_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
  } catch { return false; }
};

const resolvePhotosBase = (): string => {
  const configured = String(PHOTOS_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || '')
    .replace(/\/api\/?$/, '').replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
};

const getPhotoUrl = (photoPath: string | undefined | null, version?: string): string | null => {
  if (!photoPath) return null;
  if (photoPath.startsWith('data:')) return photoPath;
  if (photoPath.startsWith('http')) {
    return isOwnHost(photoPath) ? photoPath : `/api/photo-proxy?url=${encodeURIComponent(photoPath)}`;
  }
  const base = resolvePhotosBase();
  const norm = photoPath.replace(/^\/+/, '');
  const path = norm.startsWith('uploads/') ? `/${norm}` : `/uploads/${norm}`;
  return `${base}${path}${version ? `?t=${encodeURIComponent(version)}` : ''}`;
};

// ── Props ─────────────────────────────────────────────────────────────────────

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
  initialSection?: 'food' | 'grooming';
}

function resolvePetPhoto(pet: EditPetModalProps['pet'], override?: string): string | null {
  return [override, resolveBackendPetPhoto(pet)].find(v => Boolean(v?.trim())) || null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EditPetModal({ pet, photoVersion, onClose, onSave, onDelete }: EditPetModalProps) {
  const [formData, setFormData] = useState({
    name:        pet.pet_name || pet.name || '',
    species:     (pet.species || 'dog') as PetSpecies,
    breed:       pet.breed || '',
    sex:         (pet.sex === 'male' || pet.sex === 'female' ? pet.sex : '') as 'male' | 'female' | '',
    age_group:   (pet as { age_group?: string }).age_group || '',
    birth_date:  pet.birth_date || '',
    weight:      String(pet.weight_history?.[0]?.weight || pet.weight || ''),
    weight_unit: 'kg',
    is_neutered: pet.neutered !== undefined ? pet.neutered : (pet.is_neutered || false),
    photo:       resolvePetPhoto(pet) || '',
  });
  const [photoDataUrl,    setPhotoDataUrl]    = useState<string | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [error,           setError]           = useState('');
  const [confirmDelete,   setConfirmDelete]   = useState(false);

  const speciesSeg = ['dog', 'cat'].includes(formData.species) ? formData.species : 'other';
  const today = localTodayISO();
  const canSubmit = formData.name.trim().length > 0;

  const petPhotoUrl = useMemo(() => {
    return getPhotoUrl(resolvePetPhoto(pet, formData.photo), photoVersion ? String(photoVersion) : undefined);
  }, [formData.photo, pet, photoVersion]);

  const handlePhotoPickerConfirm = useCallback((dataUrl: string) => {
    setShowPhotoPicker(false);
    setPhotoDataUrl(dataUrl);
    setFormData(prev => ({ ...prev, photo: dataUrl }));
  }, []);

  const set = <K extends keyof typeof formData>(k: K, v: typeof formData[K]) =>
    setFormData(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!formData.name.trim()) { setError('Preencha o nome do pet.'); return; }
    setLoading(true);

    try {
      const updatedPet = {
        ...pet,
        pet_name:    formData.name,
        name:        formData.name,
        species:     formData.species,
        breed:       formData.breed,
        sex:         formData.sex || undefined,
        age_group:   formData.age_group || undefined,
        birth_date:  formData.birth_date || undefined,
        neutered:    formData.is_neutered,
        is_neutered: formData.is_neutered,
        weight:      formData.weight ? parseFloat(formData.weight.replace(',', '.')) : undefined,
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

      const wasComplete = isPetProfileCompleted({
        name: pet.pet_name || pet.name, species: pet.species, breed: pet.breed,
        birth_date: pet.birth_date, sex: pet.sex,
        weight: pet.weight_history?.[0]?.weight || pet.weight, photo: pet.photo,
      });
      const isComplete = isPetProfileCompleted({
        name: formData.name, species: formData.species, breed: formData.breed,
        birth_date: formData.birth_date || undefined, sex: formData.sex || undefined,
        weight: formData.weight, photo: photoDataUrl || formData.photo,
      });
      if (!wasComplete && isComplete) {
        trackV1Metric('pet_profile_completed', {
          pet_id: pet.pet_id, source: 'edit_pet_modal',
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
        <div className="flex max-h-[96dvh] w-full flex-col bg-white sm:max-w-sm rounded-[32px] shadow-2xl overflow-hidden animate-scaleIn">

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
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
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-5">

              {/* Foto */}
              <div className="flex justify-center">
                <button type="button" onClick={() => setShowPhotoPicker(true)}
                  className="relative w-24 h-24 rounded-full overflow-hidden bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center active:opacity-80 transition-opacity">
                  {petPhotoUrl ? (
                    <img src={petPhotoUrl} alt={formData.name || 'Pet'} className="w-full h-full object-cover"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
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
                <label className={lbl}>Nome do pet *</label>
                <input type="text" value={formData.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Ex: Mel"
                  className={`${inputCls} font-semibold`} />
              </div>

              {/* Espécie */}
              <div className="space-y-1.5">
                <label className={lbl}>Espécie</label>
                <div className="flex gap-2">
                  {([{ v: 'dog', l: '🐶  Cão' }, { v: 'cat', l: '🐱  Gato' }, { v: 'other', l: 'Outro' }]).map(o => (
                    <button key={o.v} type="button" onClick={() => set('species', o.v as PetSpecies)}
                      className={segBtn(speciesSeg === o.v)}>{o.l}</button>
                  ))}
                </div>
              </div>

              {/* Raça */}
              <BreedPicker
                species={formData.species}
                value={formData.breed}
                onChange={v => set('breed', v)}
              />

              {/* Sexo */}
              <div className="space-y-1.5">
                <label className={lbl}>Sexo</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => set('sex', formData.sex === 'male' ? '' : 'male')}
                    className={segBtn(formData.sex === 'male')}>Macho</button>
                  <button type="button" onClick={() => set('sex', formData.sex === 'female' ? '' : 'female')}
                    className={segBtn(formData.sex === 'female')}>Fêmea</button>
                </div>
              </div>

              {/* Faixa etária */}
              <div className="space-y-1.5">
                <label className={lbl}>Faixa etária</label>
                <div className="flex gap-2">
                  {([{ v: 'puppy', l: 'Filhote' }, { v: 'adult', l: 'Adulto' }, { v: 'senior', l: 'Idoso' }]).map(o => (
                    <button key={o.v} type="button"
                      onClick={() => set('age_group', formData.age_group === o.v ? '' : o.v)}
                      className={segBtn(formData.age_group === o.v)}>{o.l}</button>
                  ))}
                </div>
              </div>

              {/* Data de nascimento */}
              <div className="space-y-1.5">
                <label className={lbl}>Data de nascimento</label>
                <input type="date" max={today} value={formData.birth_date}
                  onChange={e => set('birth_date', e.target.value)}
                  className={inputCls} />
              </div>

              {/* Peso */}
              <div className="space-y-1.5">
                <label className={lbl}>Peso (opcional)</label>
                <div className="flex gap-2">
                  <input type="text" inputMode="decimal" value={formData.weight}
                    onChange={e => set('weight', e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
                    placeholder="Ex: 8.5"
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10" />
                  <select value={formData.weight_unit} onChange={e => set('weight_unit', e.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-3.5 text-sm outline-none">
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </select>
                </div>
              </div>

              {/* Castrado — linha inteira clicável */}
              <div
                role="switch"
                aria-checked={formData.is_neutered}
                tabIndex={0}
                onClick={() => set('is_neutered', !formData.is_neutered)}
                onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') set('is_neutered', !formData.is_neutered); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 4, cursor: 'pointer', userSelect: 'none' }}
              >
                <span className={lbl}>Castrado / Esterilizado</span>
                <Toggle on={formData.is_neutered} />
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-slate-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
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
