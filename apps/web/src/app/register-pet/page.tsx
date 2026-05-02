'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { PetPhotoPicker } from '@/components/PetPhotoPicker';
import { localTodayISO } from '@/lib/localDate';
import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';
import { trackV1Metric } from '@/lib/v1Metrics';

type PetFieldKey = 'name' | 'species' | 'sex';

type SpeciesType = 'dog' | 'cat' | '';
type SexType = 'male' | 'female' | '';

type AgeOptionKey = 'puppy' | 'adult' | 'senior' | '';

const AGE_OPTIONS: { key: AgeOptionKey; label: string }[] = [
  { key: 'puppy', label: 'Filhote' },
  { key: 'adult', label: 'Adulto' },
  { key: 'senior', label: 'Idoso' },
];

const SPECIES_OPTIONS: { key: SpeciesType; label: string; emoji: string }[] = [
  { key: 'dog', label: 'Cão', emoji: '🐶' },
  { key: 'cat', label: 'Gato', emoji: '🐱' },
];

const SEX_OPTIONS: { key: SexType; label: string }[] = [
  { key: 'male', label: 'Macho' },
  { key: 'female', label: 'Fêmea' },
];

function formatWeight(value: string) {
  return value.replace(',', '.').replace(/[^0-9.]/g, '');
}

export default function RegisterPetPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<SpeciesType>('');
  const [sex, setSex] = useState<SexType>('');
  const [ageGroup, setAgeGroup] = useState<AgeOptionKey>('');
  const [weightValue, setWeightValue] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');
  const [petPhoto, setPetPhoto] = useState('');
  const [petPhotoDataUrl, setPetPhotoDataUrl] = useState<string | null>(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [firstValuePetId, setFirstValuePetId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<PetFieldKey, string>>({ name: '', species: '', sex: '' });
  const [currentField, setCurrentField] = useState<PetFieldKey>('name');

  const nameRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push('/login');
      return;
    }
    nameRef.current?.focus();
  }, [router]);

  const today = localTodayISO();

  const showOptionalDetails = step === 5;
  const weightNumber = parseFloat(formatWeight(weightValue));
  const hasWeight = Number.isFinite(weightNumber) && weightNumber > 0;
  const canContinueStep1 = name.trim().length > 0;
  const canContinueStep2 = species !== '';
  const canContinueStep3 = sex !== '';

  const fieldClass = (active: boolean, error: boolean) =>
    `w-full rounded-2xl border px-5 py-4 text-base font-semibold text-slate-900 outline-none transition-all ${error ? 'border-rose-400 ring-4 ring-rose-500/10' : active ? 'border-blue-400 ring-4 ring-blue-500/10' : 'border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10'}`;

  const setFieldError = (field: PetFieldKey, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  };

  const focusField = (field: PetFieldKey) => {
    if (field === 'name') nameRef.current?.focus();
    if (field === 'sex') weightRef.current?.focus();
    setCurrentField(field);
  };

  const handlePhotoPickerConfirm = useCallback((dataUrl: string) => {
    setShowPhotoPicker(false);
    setPetPhoto(dataUrl);
    setPetPhotoDataUrl(dataUrl);
    setPhotoProcessing(false);
  }, []);

  const handleNext = () => {
    if (step === 1) {
      if (!canContinueStep1) {
        setFieldError('name', 'Informe o nome do pet.');
        focusField('name');
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!canContinueStep2) {
        setFieldError('species', 'Escolha cão ou gato.');
        return;
      }
      setStep(3);
      return;
    }

    if (step === 3) {
      if (!canContinueStep3) {
        setFieldError('sex', 'Selecione o sexo.');
        return;
      }
      setStep(4);
      return;
    }

    if (step === 4) {
      setStep(5);
      return;
    }

    if (step === 5) {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (loading || photoProcessing) return;
    if (step === 1) {
      router.push('/home');
      return;
    }
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmit = async () => {
    const nextErrors: Record<PetFieldKey, string> = { name: '', species: '', sex: '' };
    if (!name.trim()) nextErrors.name = 'Informe o nome do pet.';
    if (!species) nextErrors.species = 'Escolha a espécie.';
    if (!sex) nextErrors.sex = 'Selecione o sexo.';
    setErrors(nextErrors);

    if (nextErrors.name || nextErrors.species || nextErrors.sex) {
      const firstInvalid = (Object.keys(nextErrors) as PetFieldKey[]).find((field) => nextErrors[field]);
      if (firstInvalid) focusField(firstInvalid);
      return;
    }

    const token = getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        species,
        sex,
      };

      if (hasWeight) {
        payload.weight_value = weightNumber;
        payload.weight_unit = weightUnit;
      }

      if (petPhotoDataUrl) {
        payload.photo = petPhotoDataUrl;
      }

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
            ? data.detail.map((item) => item.msg ?? 'Erro').join('\n')
            : `Erro ${res.status}`;
        throw new Error(msg);
      }

      const savedPet = await res.json() as { id?: string; pet_id?: string };
      const savedPetId = savedPet.id || savedPet.pet_id;
      if (!savedPetId) throw new Error('Pet criado mas id não retornado.');

      if (petPhotoDataUrl) {
        const blob = await (await fetch(petPhotoDataUrl)).blob();
        const fd = new FormData();
        fd.append('file', new File([blob], 'pet-photo.jpg', { type: 'image/jpeg' }));
        await fetch(`${API_BASE_URL}/pets/${savedPetId}/photo`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
      }

      localStorage.setItem('petmol_activation_pet_created_v1', '1');
      localStorage.setItem('petmol_checkup_v1', JSON.stringify({
        petId: savedPetId,
        petName: name.trim(),
        vaccines: 'pending',
        vermifugo: 'pending',
        antipulgas: 'pending',
        coleira: 'pending',
        food: 'pending',
      }));

      trackV1Metric('pet_created', {
        pet_id: savedPetId,
        species,
        sex,
        has_photo: Boolean(petPhotoDataUrl),
      });

      setFirstValuePetId(savedPetId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar o pet.';
      setFieldError('name', message);
      focusField('name');
    } finally {
      setLoading(false);
    }
  };

  if (firstValuePetId) {
    const petLabel = name.trim() || 'seu pet';
    return (
      <BrandBackground showLogo={false}>
        <div className="min-h-[calc(100dvh-40px)] w-full px-4 py-8 flex items-center justify-center">
          <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-[32px] border border-white/60 shadow-premium p-6">
            <div className="flex justify-center mb-5">
              <PetmolTextLogo className="text-5xl drop-shadow-sm" color="#2563EB" />
            </div>
            <h1 className="text-2xl font-black text-slate-900">Hoje com {petLabel}</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">O PETMOL já separou os primeiros cuidados para revisar.</p>
            <p className="mt-3 text-base font-black text-blue-600">✓ Pronto. Agora o PETMOL já começa a cuidar do {petLabel}.</p>
            <div className="mt-5 grid gap-3">
              {[
                { title: 'Vacina', body: 'Confira se a carteirinha está em dia.' },
                { title: 'Vermífugo', body: 'Acompanhe o próximo reforço.' },
                { title: 'Ração', body: 'Veja como evitar faltar com o estoque.' },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="font-black text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{item.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
              Essas sugestões mostram valor imediato sem salvar nada extra automaticamente.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/food?pet_id=${encodeURIComponent(firstValuePetId)}&mode=main&source=onboarding`)}
              className="mt-5 w-full rounded-2xl bg-[#0056D2] px-5 py-4 text-base font-black text-white shadow-lg active:scale-[0.99]"
            >
              Cadastrar ração
            </button>
            <button
              type="button"
              onClick={() => router.push('/home')}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-bold text-slate-600"
            >
              Ir para home
            </button>
          </div>
        </div>
      </BrandBackground>
    );
  }

  return (
    <BrandBackground showLogo={false}>
      <div className="min-h-[calc(100dvh-40px)] w-full px-4 py-8 flex items-center justify-center">
        <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-[32px] border border-white/60 shadow-premium p-6 overflow-hidden">
          <div className="flex justify-center mb-5">
            <PetmolTextLogo className="text-5xl drop-shadow-sm" color="#2563EB" />
          </div>

          <div className="mb-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-500">Cadastro do pet</p>
            <p className="mt-2 text-sm font-bold text-slate-900">Passo {step} de 5</p>
          </div>

          <div className="space-y-5 transition-all duration-200 ease-out">
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-black text-slate-900">Qual o nome do seu pet?</p>
                  <p className="text-sm text-slate-500 mt-2">Um nome e você já começa.</p>
                </div>
                <div>
                  <label className="sr-only" htmlFor="pet-name">Nome do pet</label>
                  <input
                    id="pet-name"
                    ref={nameRef}
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setFieldError('name', '');
                    }}
                    placeholder="Ex: Mel"
                    className={fieldClass(currentField === 'name', Boolean(errors.name))}
                  />
                  {errors.name && <p className="mt-2 text-sm text-rose-600 font-semibold">{errors.name}</p>}
                </div>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canContinueStep1}
                  className="mt-4 w-full rounded-2xl bg-[#0056D2] px-5 py-4 text-base font-black text-white shadow-lg active:scale-[0.99] disabled:opacity-50"
                >
                  Continuar
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-black text-slate-900">É cão ou gato?</p>
                  <p className="text-sm text-slate-500 mt-2">Toque na opção certa.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {SPECIES_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setSpecies(option.key);
                        setFieldError('species', '');
                      }}
                      className={`rounded-3xl border p-5 text-left text-base font-bold transition ${species === option.key ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                    >
                      <span className="text-3xl">{option.emoji}</span>
                      <div className="mt-3">{option.label}</div>
                    </button>
                  ))}
                </div>
                {errors.species && <p className="text-sm text-rose-600 font-semibold">{errors.species}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={handleBack} className="py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-600 font-bold">Voltar</button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="py-3.5 rounded-2xl bg-[#0056D2] text-white font-black disabled:opacity-50"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-black text-slate-900">Qual o sexo?</p>
                  <p className="text-sm text-slate-500 mt-2">Ajuda o PETMOL a personalizar os cuidados.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {SEX_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setSex(option.key);
                        setFieldError('sex', '');
                      }}
                      className={`rounded-3xl border p-5 text-base font-bold transition ${sex === option.key ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {errors.sex && <p className="text-sm text-rose-600 font-semibold">{errors.sex}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={handleBack} className="py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-600 font-bold">Voltar</button>
                  <button type="button" onClick={handleNext} className="py-3.5 rounded-2xl bg-[#0056D2] text-white font-black">Continuar</button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-black text-slate-900">Quer adicionar uma foto?</p>
                  <p className="text-sm text-slate-500 mt-2">Isso ajuda a reconhecer o pet mais rápido.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoProcessing(true);
                    setShowPhotoPicker(true);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left text-base font-bold text-slate-700 shadow-sm hover:border-slate-300"
                >
                  {petPhoto ? 'Trocar foto' : 'Tirar foto ou escolher da galeria'}
                </button>
                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={handleBack} className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-bold text-slate-600">Voltar</button>
                  <button type="button" onClick={handleNext} className="flex-1 rounded-2xl bg-[#0056D2] px-5 py-4 text-base font-black text-white">Pular</button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-black text-slate-900">Quer ajudar a cuidar melhor?</p>
                  <p className="text-sm text-slate-500 mt-2">Idade e peso ajudam o app a ser mais útil.</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {AGE_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setAgeGroup(option.key)}
                      className={`rounded-2xl border px-3 py-4 text-sm font-bold ${ageGroup === option.key ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Peso aproximado (opcional)</label>
                  <div className="mt-2 flex gap-2">
                    <input
                      ref={weightRef}
                      type="text"
                      inputMode="decimal"
                      value={weightValue}
                      onChange={(e) => setWeightValue(formatWeight(e.target.value))}
                      placeholder="Ex: 8.5"
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                    />
                    <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none">
                      <option value="kg">kg</option>
                      <option value="lb">lb</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={handleBack} className="py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-600 font-bold">Voltar</button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="py-3.5 rounded-2xl bg-[#0056D2] text-white font-black disabled:opacity-50"
                  >
                    {loading ? 'Salvando...' : 'Finalizar cadastro'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPhotoPicker && (
        <PetPhotoPicker
          initialSrc={petPhoto || null}
          onConfirm={handlePhotoPickerConfirm}
          onCancel={() => {
            setPhotoProcessing(false);
            setShowPhotoPicker(false);
          }}
        />
      )}
    </BrandBackground>
  );
}
