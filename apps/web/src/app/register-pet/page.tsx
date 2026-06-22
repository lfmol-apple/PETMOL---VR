'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { PetPhotoPicker } from '@/components/PetPhotoPicker';
import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';
import { trackV1Metric } from '@/lib/v1Metrics';
import { subscribeToPush } from '@/features/notifications/pushService';
import { Camera } from 'lucide-react';

// ── Breed data ────────────────────────────────────────────────────────────────

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

// ── BreedPicker ───────────────────────────────────────────────────────────────

type SpeciesType = 'dog' | 'cat' | 'other' | '';

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

function BreedPicker({
  species, value, onChange,
}: { species: SpeciesType; value: string; onChange: (v: string) => void }) {
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

  const select = (breed: string) => {
    setQuery(breed);
    onChange(breed);
    setOpen(false);
    inputRef.current?.blur();
  };

  if (!species || species === 'other') return null;

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Raça (opcional)</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(''); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar raça…"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
            {filtered.map(b => (
              <button
                key={b}
                type="button"
                onPointerDown={e => { e.preventDefault(); select(b); }}
                className="w-full text-left px-4 py-3 text-sm text-slate-800 border-b border-slate-100 last:border-b-0 active:bg-blue-50 hover:bg-blue-50"
              >
                {b}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function formatWeight(v: string) { return v.replace(',', '.').replace(/[^0-9.]/g, ''); }

export default function RegisterPetPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [species, setSpecies] = useState<SpeciesType>('');
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | ''>('');
  const [weightValue, setWeightValue] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');
  const [ageGroup, setAgeGroup] = useState<'puppy' | 'adult' | 'senior' | ''>('');
  const [neutered, setNeutered] = useState(false);
  const [petPhoto, setPetPhoto] = useState('');
  const [petPhotoDataUrl, setPetPhotoDataUrl] = useState<string | null>(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; species?: string; sex?: string; general?: string }>({});
  const [savedPetId, setSavedPetId] = useState<string | null>(null);
  const [notifStep, setNotifStep] = useState<'ask' | 'done'>('ask');
  const [notifLoading, setNotifLoading] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    nameRef.current?.focus();
  }, [router]);

  const weightNumber = parseFloat(formatWeight(weightValue));
  const hasWeight = Number.isFinite(weightNumber) && weightNumber > 0;

  const validate = () => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = 'Informe o nome do pet.';
    if (!species) e.species = 'Escolha a espécie.';
    if (!sex) e.sex = 'Selecione o sexo.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const token = getToken();
    if (!token) { router.push('/login'); return; }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = { name: name.trim(), species, sex, neutered };
      if (breed) payload.breed = breed;
      if (ageGroup) payload.age_group = ageGroup;
      if (hasWeight) { payload.weight_value = weightNumber; payload.weight_unit = weightUnit; }
      if (petPhotoDataUrl) payload.photo = petPhotoDataUrl;

      const res = await fetch(`${API_BASE_URL}/pets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { detail?: string | Array<{ msg?: string }> };
        const msg = typeof data.detail === 'string'
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail.map(i => i.msg ?? 'Erro').join('\n')
            : `Erro ${res.status}`;
        throw new Error(msg);
      }

      const saved = await res.json() as { id?: string; pet_id?: string };
      const petId = saved.id || saved.pet_id;
      if (!petId) throw new Error('Pet criado mas id não retornado.');

      if (petPhotoDataUrl) {
        const blob = await (await fetch(petPhotoDataUrl)).blob();
        const fd = new FormData();
        fd.append('file', new File([blob], 'pet-photo.jpg', { type: 'image/jpeg' }));
        await fetch(`${API_BASE_URL}/pets/${petId}/photo`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
      }

      localStorage.setItem('petmol_activation_pet_created_v1', '1');
      localStorage.setItem('petmol_checkup_v1', JSON.stringify({
        petId, petName: name.trim(),
        vaccines: 'pending', vermifugo: 'pending', antipulgas: 'pending', coleira: 'pending', food: 'pending',
      }));

      trackV1Metric('pet_created', { pet_id: petId, species, sex, has_photo: Boolean(petPhotoDataUrl) });
      setSavedPetId(petId);
    } catch (err: unknown) {
      setErrors({ general: err instanceof Error ? err.message : 'Erro ao salvar o pet.' });
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────

  if (savedPetId) {
    const label = name.trim() || 'seu pet';
    return (
      <BrandBackground showLogo={false}>
        <div className="min-h-[calc(100dvh-40px)] w-full px-4 py-8 flex items-center justify-center">
          <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-[32px] border border-white/60 shadow-premium p-6">
            <div className="flex justify-center mb-5">
              <PetmolTextLogo className="text-5xl drop-shadow-sm" color="#2563EB" />
            </div>
            <h1 className="text-2xl font-black text-slate-900">Vamos cadastrar a ração do {label}</h1>

            {notifStep === 'ask' ? (
              <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm font-black text-slate-900">Posso te avisar quando a ração estiver acabando?</p>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">Assim você nunca precisa lembrar — o PETMOL avisa na hora certa.</p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={notifLoading}
                    onClick={async () => {
                      setNotifLoading(true);
                      try {
                        const token = getToken();
                        if (token) await subscribeToPush(token);
                      } finally {
                        setNotifLoading(false);
                        setNotifStep('done');
                      }
                    }}
                    className="flex-1 rounded-xl bg-[#0056D2] py-3 text-xs font-black text-white disabled:opacity-50 active:scale-[0.98]"
                  >
                    {notifLoading ? 'Ativando…' : 'Sim, quero avisos'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifStep('done')}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-xs font-bold text-slate-600 active:bg-slate-50"
                  >
                    Agora não
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button type="button"
                  onClick={() => router.push(`/food?pet_id=${encodeURIComponent(savedPetId)}&mode=main&source=onboarding`)}
                  className="mt-6 w-full rounded-2xl bg-[#0056D2] px-5 py-4 text-base font-black text-white shadow-lg active:scale-[0.99]">
                  Cadastrar ração
                </button>
                <button type="button" onClick={() => router.push('/home')}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-bold text-slate-600">
                  Ir para home
                </button>
              </>
            )}
          </div>
        </div>
      </BrandBackground>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  const segBtn = (active: boolean) =>
    `flex-1 py-3 rounded-xl border text-sm font-semibold transition-all ${
      active ? 'border-[#0056D2] bg-blue-50 text-[#0047ad]' : 'border-slate-200 bg-white text-slate-600'
    }`;

  return (
    <BrandBackground showLogo={false}>
      <div className="min-h-[calc(100dvh-40px)] w-full px-4 py-6 flex items-start justify-center">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex justify-center mb-5">
            <PetmolTextLogo className="text-5xl drop-shadow-sm" color="#2563EB" />
          </div>

          <div className="bg-white/95 backdrop-blur-xl rounded-[32px] border border-white/60 shadow-premium overflow-hidden">
            {/* Title */}
            <div className="px-6 pt-6 pb-2">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-500">Cadastro do pet</p>
              <p className="mt-1 text-xl font-black text-slate-900">Conte-nos sobre ele</p>
            </div>

            {/* Scrollable form body */}
            <div className="px-6 pb-4 space-y-5 overflow-y-auto overflow-x-hidden max-h-[calc(100dvh-260px)]">

              {/* Photo */}
              <div className="flex justify-center pt-2">
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
                  {petPhoto && (
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-end justify-center pb-1">
                      <span className="text-[9px] font-bold text-white opacity-0 hover:opacity-100">Trocar</span>
                    </div>
                  )}
                </button>
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Nome do pet *</label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); if (errors.name) setErrors(p => ({ ...p, name: '' })); }}
                  placeholder="Ex: Mel"
                  className={`w-full rounded-2xl border px-4 py-3.5 text-sm font-semibold outline-none transition-all ${
                    errors.name ? 'border-rose-400 ring-4 ring-rose-500/10' : 'border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10'
                  }`}
                />
                {errors.name && <p className="text-xs text-rose-600 font-semibold">{errors.name}</p>}
              </div>

              {/* Species */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Espécie *</label>
                <div className="flex gap-2">
                  {([
                    { v: 'dog', l: '🐶  Cão' },
                    { v: 'cat', l: '🐱  Gato' },
                    { v: 'other', l: 'Outro' },
                  ] as { v: SpeciesType; l: string }[]).map(o => (
                    <button key={o.v} type="button"
                      onClick={() => { setSpecies(o.v); if (errors.species) setErrors(p => ({ ...p, species: '' })); }}
                      className={segBtn(species === o.v)}>
                      {o.l}
                    </button>
                  ))}
                </div>
                {errors.species && <p className="text-xs text-rose-600 font-semibold">{errors.species}</p>}
              </div>

              {/* Breed search — shown only for dog/cat */}
              <BreedPicker species={species} value={breed} onChange={setBreed} />

              {/* Sex */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Sexo *</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setSex('male'); if (errors.sex) setErrors(p => ({ ...p, sex: '' })); }}
                    className={segBtn(sex === 'male')}>Macho</button>
                  <button type="button" onClick={() => { setSex('female'); if (errors.sex) setErrors(p => ({ ...p, sex: '' })); }}
                    className={segBtn(sex === 'female')}>Fêmea</button>
                </div>
                {errors.sex && <p className="text-xs text-rose-600 font-semibold">{errors.sex}</p>}
              </div>

              {/* Age */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Faixa etária (opcional)</label>
                <div className="flex gap-2">
                  {([
                    { v: 'puppy', l: 'Filhote' },
                    { v: 'adult', l: 'Adulto' },
                    { v: 'senior', l: 'Idoso' },
                  ] as { v: 'puppy' | 'adult' | 'senior'; l: string }[]).map(o => (
                    <button key={o.v} type="button"
                      onClick={() => setAgeGroup(prev => prev === o.v ? '' : o.v)}
                      className={segBtn(ageGroup === o.v)}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Weight */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Peso (opcional)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={weightValue}
                    onChange={e => setWeightValue(formatWeight(e.target.value))}
                    placeholder="Ex: 8.5"
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                  />
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
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Castrado / Esterilizado</span>
                <Toggle on={neutered} />
              </div>

              {errors.general && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errors.general}
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="px-6 pt-3 pb-6 border-t border-slate-100 flex gap-2">
              <button type="button" onClick={() => router.push('/home')}
                className="flex-shrink-0 py-3.5 px-5 rounded-2xl border border-slate-200 bg-white text-slate-600 text-sm font-bold">
                Voltar
              </button>
              <button type="button" onClick={handleSubmit} disabled={loading}
                className="flex-1 py-3.5 rounded-2xl bg-[#0056D2] text-white text-sm font-black disabled:opacity-50">
                {loading ? 'Salvando…' : 'Finalizar cadastro'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showPhotoPicker && (
        <PetPhotoPicker
          initialSrc={petPhoto || null}
          onConfirm={dataUrl => { setPetPhoto(dataUrl); setPetPhotoDataUrl(dataUrl); setShowPhotoPicker(false); }}
          onCancel={() => setShowPhotoPicker(false)}
        />
      )}
    </BrandBackground>
  );
}
