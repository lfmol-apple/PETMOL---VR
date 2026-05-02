'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { PetPhotoPicker } from '@/components/PetPhotoPicker';
import { localTodayISO } from '@/lib/localDate';
import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';
import { trackV1Metric } from '@/lib/v1Metrics';

type PetFieldKey = 'name' | 'species' | 'size';

const DOG_BREEDS = ['SRD (Sem Raça Definida)', 'Labrador Retriever', 'Golden Retriever', 'Bulldog Francês', 'Shih Tzu', 'Poodle', 'Outro'];
const CAT_BREEDS = ['SRD (Sem Raça Definida)', 'Siamês', 'Persa', 'Maine Coon', 'Sphynx', 'Outro'];
const MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024;

export default function RegisterPetPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [species, setSpecies] = useState<'dog' | 'cat' | ''>('');
  const [sizeProfile, setSizeProfile] = useState<'small' | 'medium' | 'large' | ''>('');
  const [weightValue, setWeightValue] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');
  const [breed, setBreed] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState('');
  const [neutered, setNeutered] = useState(false);
  const [petPhoto, setPetPhoto] = useState('');
  const [petPhotoDataUrl, setPetPhotoDataUrl] = useState<string | null>(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [medicalAccepted, setMedicalAccepted] = useState(false);
  const [pushConsents, setPushConsents] = useState({ health: true, operational: true, offers: false });
  const [firstValuePetId, setFirstValuePetId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<PetFieldKey, string>>({ name: '', species: '', size: '' });
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
  const breedOptions = species === 'dog' ? DOG_BREEDS : species === 'cat' ? CAT_BREEDS : ['SRD (Sem Raça Definida)', 'Outro'];

  const hasApproxWeight = Number.isFinite(parseFloat(weightValue.replace(',', '.'))) && parseFloat(weightValue.replace(',', '.')) > 0;
  const hasSizeSignal = Boolean(sizeProfile || hasApproxWeight);
  const canContinue = name.trim().length > 0 && Boolean(species) && hasSizeSignal && medicalAccepted;

  const fieldClass = (field: PetFieldKey) =>
    `w-full px-4 py-3 rounded-2xl border text-[15px] outline-none transition-all bg-white ${
      errors[field]
        ? 'border-rose-400 ring-4 ring-rose-500/10'
        : currentField === field
          ? 'border-blue-400 ring-4 ring-blue-500/10'
          : 'border-slate-200'
    }`;

  const setFieldError = (field: PetFieldKey, value: string) => setErrors((prev) => ({ ...prev, [field]: value }));

  const focusError = (field: PetFieldKey) => {
    if (field === 'name') nameRef.current?.focus();
    if (field === 'size') weightRef.current?.focus();
    const el = field === 'name' ? nameRef.current : field === 'size' ? weightRef.current : null;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setCurrentField(field);
  };

  const estimatedWeightFromSize = (): number | undefined => {
    if (hasApproxWeight) return parseFloat(weightValue.replace(',', '.'));
    if (sizeProfile === 'small') return 6;
    if (sizeProfile === 'medium') return 16;
    if (sizeProfile === 'large') return 30;
    return undefined;
  };

  const handlePhotoPickerConfirm = useCallback((dataUrl: string) => {
    setShowPhotoPicker(false);
    setPetPhoto(dataUrl);
    setPetPhotoDataUrl(dataUrl);
    setPhotoProcessing(false);
    if (errors.name) setFieldError('name', '');
  }, [errors.name]);

  const handleCancel = () => {
    if (loading || photoProcessing) return;
    router.push('/home');
  };

  const handleSubmit = async () => {
    const nextErrors: Record<PetFieldKey, string> = { name: '', species: '', size: '' };
    if (!name.trim()) nextErrors.name = 'Informe o nome do pet.';
    if (!species) nextErrors.species = 'Escolha a espécie.';
    if (!hasSizeSignal) nextErrors.size = 'Informe o porte ou peso aproximado.';
    setErrors(nextErrors);

    const firstInvalid = (Object.keys(nextErrors) as PetFieldKey[]).find((k) => nextErrors[k]);
    if (firstInvalid) {
      focusError(firstInvalid);
      return;
    }

    const token = getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        species,
        breed: breed || undefined,
        birth_date: birthDate || undefined,
        sex: sex || undefined,
        weight_value: estimatedWeightFromSize(),
        weight_unit: estimatedWeightFromSize() ? weightUnit : undefined,
        photo: petPhotoDataUrl || undefined,
        neutered,
      };

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
            ? data.detail.map((i) => i.msg ?? 'Erro').join('\n')
            : `Erro ${res.status}`;
        throw new Error(msg);
      }

      const savedPet = await res.json() as { id?: string; pet_id?: string };
      const savedPetId = savedPet.id || savedPet.pet_id;
      if (!savedPetId) {
        throw new Error('Pet criado, mas o identificador não foi retornado para enviar a foto.');
      }

      if (petPhotoDataUrl) {
        const blob = await (await fetch(petPhotoDataUrl)).blob();
        const fd = new FormData();
        fd.append('file', new File([blob], 'pet-photo.jpg', { type: 'image/jpeg' }));
        const photoRes = await fetch(`${API_BASE_URL}/pets/${savedPetId}/photo`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
          body: fd,
        });
        if (!photoRes.ok) {
          const data = await photoRes.json().catch(() => ({})) as { detail?: string };
          console.warn(data.detail || 'Pet criado com foto embutida; upload de arquivo não concluído.');
        }
      }

      localStorage.setItem('petmol_medical_disclaimer_v1', 'true');
      localStorage.setItem('petmol_activation_pet_created_v1', '1');
      localStorage.setItem('petmol_notification_consents_v1', JSON.stringify(pushConsents));
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
        source: 'register_pet',
        has_photo: Boolean(petPhotoDataUrl),
      });
      setFirstValuePetId(savedPetId);
    } catch (err: unknown) {
      setFieldError('name', err instanceof Error ? err.message : 'Erro ao salvar o pet.');
      focusError('name');
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
            <div className="mt-5 grid gap-3">
              {[
                { title: 'Vacina anual', body: 'Confira se a carteirinha está em dia.' },
                { title: 'Vermífugo', body: 'Acompanhe o próximo reforço com lembrete.' },
                { title: 'Ração', body: 'Cadastre a duração para evitar faltar.' },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="font-black text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{item.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
              Os intervalos são recomendações gerais. Consulte um veterinário.
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
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600"
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
        <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-[32px] border border-white/60 shadow-premium p-6">
          <div className="flex justify-center mb-5">
            <PetmolTextLogo className="text-5xl drop-shadow-sm" color="#2563EB" />
          </div>

          <h1 className="mt-1 text-2xl font-black text-slate-900">Cadastrar pet</h1>
          <p className="text-sm text-slate-500 mt-1">Só o mínimo para começar agora.</p>

          <div className="mt-5 space-y-3 max-h-[65dvh] overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => setShowPhotoPicker(true)}
              disabled={photoProcessing || loading}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-3 text-left disabled:opacity-60 active:scale-[0.99] transition-transform"
            >
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                {petPhoto ? <img src={petPhoto} alt="Foto do pet" className="w-full h-full object-cover" /> : <span className="text-2xl">📷</span>}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">{petPhoto ? 'Foto selecionada' : 'Adicionar foto do pet'}</p>
                <p className="text-xs text-slate-500">
                  {photoProcessing ? 'Preparando foto...' : petPhoto ? 'Toque para trocar.' : 'Câmera ou galeria. Opcional.'}
                </p>
              </div>
            </button>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Nome do pet *</label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onFocus={() => setCurrentField('name')}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setFieldError('name', e.target.value.trim() ? '' : 'Informe o nome do pet.');
                }}
                placeholder="Ex: Baby"
                className={fieldClass('name')}
              />
              {errors.name && <p className="mt-1 text-xs text-rose-600 font-semibold">{errors.name}</p>}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Espécie *</label>
              <div className={`${errors.species ? 'border-rose-400 ring-4 ring-rose-500/10' : currentField === 'species' ? 'border-blue-400 ring-4 ring-blue-500/10' : 'border-slate-200'} rounded-2xl border p-1 bg-white`}>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onClick={() => { setSpecies('dog'); setBreed(''); setFieldError('species', ''); setCurrentField('species'); }} className={`py-2.5 rounded-xl text-sm font-semibold ${species === 'dog' ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}>🐶 Cachorro</button>
                  <button type="button" onClick={() => { setSpecies('cat'); setBreed(''); setFieldError('species', ''); setCurrentField('species'); }} className={`py-2.5 rounded-xl text-sm font-semibold ${species === 'cat' ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}>🐱 Gato</button>
                </div>
              </div>
              {errors.species && <p className="mt-1 text-xs text-rose-600 font-semibold">{errors.species}</p>}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Porte ou peso aproximado *</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'small', label: 'Pequeno' },
                  { key: 'medium', label: 'Médio' },
                  { key: 'large', label: 'Grande' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setSizeProfile(opt.key as 'small' | 'medium' | 'large'); setCurrentField('size'); setFieldError('size', ''); }}
                    className={`py-2.5 rounded-xl border text-sm font-semibold ${sizeProfile === opt.key ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  ref={weightRef}
                  type="text"
                  inputMode="decimal"
                  value={weightValue}
                  onFocus={() => setCurrentField('size')}
                  onChange={(e) => {
                    setWeightValue(e.target.value);
                    if (errors.size) setFieldError('size', (sizeProfile || e.target.value.trim()) ? '' : 'Informe o porte ou peso aproximado.');
                  }}
                  placeholder="ou digite o peso"
                  className={fieldClass('size')}
                />
                <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} className="h-[50px] rounded-2xl border border-slate-200 px-3 bg-white">
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </div>
              {errors.size && <p className="mt-1 text-xs text-rose-600 font-semibold">{errors.size}</p>}
            </div>

            <div className="pt-1">
              <button type="button" onClick={() => setShowMoreDetails((v) => !v)} className="text-sm font-semibold text-slate-600 hover:text-blue-600">
                {showMoreDetails ? 'Ocultar detalhes' : 'Adicionar mais detalhes'}
              </button>
              {showMoreDetails && (
                <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Raça (opcional)</label>
                    <select value={breed} onChange={(e) => setBreed(e.target.value)} className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-[15px] outline-none">
                      <option value="">Selecionar raça</option>
                      {breedOptions.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Sexo (opcional)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setSex(sex === 'male' ? '' : 'male')} className={`py-2.5 rounded-xl border text-sm font-semibold ${sex === 'male' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>Macho</button>
                      <button type="button" onClick={() => setSex(sex === 'female' ? '' : 'female')} className={`py-2.5 rounded-xl border text-sm font-semibold ${sex === 'female' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>Fêmea</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Data de nascimento (opcional)</label>
                    <input type="date" max={today} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-[15px] outline-none" />
                  </div>
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <span className="text-sm text-slate-700">Castrado (opcional)</span>
                    <input type="checkbox" checked={neutered} onChange={(e) => setNeutered(e.target.checked)} />
                  </label>
                </div>
              )}
            </div>

            <label className={`flex items-start gap-3 rounded-2xl border px-3 py-3 ${medicalAccepted ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
              <input
                type="checkbox"
                checked={medicalAccepted}
                onChange={(e) => setMedicalAccepted(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm font-semibold text-slate-700">
                Os intervalos são recomendações gerais. Consulte um veterinário.
              </span>
            </label>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-black text-slate-900">Quais notificações deseja receber?</p>
              <div className="mt-3 grid gap-2">
                {[
                  { key: 'health', label: 'Saúde' },
                  { key: 'operational', label: 'Operacional (ração)' },
                  { key: 'offers', label: 'Ofertas' },
                ].map((item) => (
                  <label key={item.key} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={pushConsents[item.key as keyof typeof pushConsents]}
                      onChange={(e) => setPushConsents((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading || photoProcessing}
                className="py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-600 text-[13px] font-black uppercase tracking-widest disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || photoProcessing || !canContinue}
                className="py-3.5 rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white text-[13px] font-black uppercase tracking-widest disabled:opacity-40"
              >
                {loading ? 'Salvando...' : 'Continuar'}
              </button>
            </div>
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
