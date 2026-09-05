'use client';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Camera, Plus, Save } from 'lucide-react';
import { PetSpecies } from '@/lib/petTaxonomy';
import type { PetHealthProfile } from '@/lib/petHealth';
import { isPetProfileCompleted, trackV1Metric } from '@/lib/v1Metrics';
import { PetPhotoPicker } from './PetPhotoPicker';
import { SheetAvatar, SheetHeader, SheetShell } from '@/components/ui/sheet';
import { resolveBackendPetPhoto } from '@/lib/backendPetProfile';
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

const PHOTOS_BASE_URL = process.env.NEXT_PUBLIC_PHOTOS_BASE_URL || '';
const OWN_PHOTO_HOSTS = ['petmol.app', 'petmol.com.br', 'www.petmol.com.br', 'localhost'];

const lbl = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wide';

const segBtn = (active: boolean) =>
  `flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
    active ? 'border-[#0056D2] bg-blue-50 text-[#0047ad]' : 'border-slate-300 bg-white text-slate-600'
  }`;

const inputCls = 'w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3.5 text-base outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:shadow-lg focus:shadow-blue-500/10';
// iOS: input[type=date] tem largura intrínseca e valor centralizado — força
// encolher, tira o chrome nativo e alinha à esquerda como os outros campos.
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
      <p className={lbl}>{labelText}</p>
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
              <p className={`${lbl} mb-4`}>{labelText}</p>
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
      <p className={lbl}>Peso (opcional)</p>
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
              <p className={`${lbl} mb-4`}>Peso</p>
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

  // Abre a folha já mostrando a lista inteira rolável — sem dar foco no
  // campo de busca (isso abria o teclado e comprimia a lista). O teclado
  // só sobe quando o tutor toca no campo "Buscar raça…".
  const openSheet = () => setOpen(true);

  if (!species || species === 'other') return null;

  return (
    <div className="space-y-1.5">
      <label className={lbl}>Raça (opcional)</label>
      <button
        type="button"
        onClick={openSheet}
        className="w-full rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-base text-left outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:shadow-lg focus:shadow-blue-500/10 active:scale-[0.99]"
      >
        <span className={value ? 'text-slate-900 font-medium' : 'text-slate-400'}>
          {value || 'Selecionar raça…'}
        </span>
      </button>

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
            <div className="overflow-y-auto flex-1 min-h-0 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              {filtered.map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => select(b)}
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
    <>
    <SheetShell open onClose={onClose} size="md" hideHandle z={90}>
          <SheetHeader
            tone="petmol"
            withHandle
            title={`Editar ${pet.pet_name || pet.name || 'pet'}`}
            onClose={onClose}
            media={
              <SheetAvatar
                src={petPhotoUrl}
                alt={formData.name || 'Pet'}
                fallback={pet.species === 'cat' ? '🐱' : '🐶'}
              />
            }
          />

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <SheetShell.Body className="space-y-5">

              {/* Foto */}
              <div className="flex flex-col items-center gap-2">
                <button type="button" onClick={() => setShowPhotoPicker(true)}
                  className="relative w-28 h-28 rounded-full bg-slate-50 border-2 border-dashed border-slate-300 flex items-center justify-center active:scale-[0.97] transition-transform">
                  {petPhotoUrl ? (
                    <img src={petPhotoUrl} alt={formData.name || 'Pet'} className="w-full h-full object-cover rounded-full"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <Camera className="w-8 h-8 text-slate-400" />
                  )}
                  <span className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#0056D2] border-[3px] border-white flex items-center justify-center shadow-md">
                    <Plus className="w-4 h-4 text-white" strokeWidth={3} />
                  </span>
                </button>
                <button type="button" onClick={() => setShowPhotoPicker(true)}
                  className="text-[13px] font-bold text-[#0056D2] active:opacity-70 transition-opacity">
                  {petPhotoUrl ? 'Trocar foto' : 'Adicionar foto do pet'}
                </button>
              </div>

              {/* Nome */}
              <ZoomedField
                labelText="Nome do pet *"
                value={formData.name}
                onChange={v => set('name', sanitizePetName(v))}
                placeholder="Ex: Mel"
              />

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
                  className={dateInputCls} />
              </div>

              {/* Peso */}
              <ZoomedWeightField
                value={formData.weight}
                unit={formData.weight_unit}
                onValueChange={v => set('weight', v)}
                onUnitChange={u => set('weight_unit', u)}
              />

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
            </SheetShell.Body>

            {/* Footer */}
            <SheetShell.Footer>
              <div className="space-y-2">
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
            </SheetShell.Footer>
          </form>
    </SheetShell>

    {showPhotoPicker && (
      <PetPhotoPicker
        initialSrc={petPhotoUrl}
        onConfirm={handlePhotoPickerConfirm}
        onCancel={() => setShowPhotoPicker(false)}
      />
    )}
    </>
  );
}
