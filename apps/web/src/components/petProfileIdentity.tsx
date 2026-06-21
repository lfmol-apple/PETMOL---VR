'use client';

import type { ReactNode } from 'react';
import {
  v1InputClass,
} from '@/lib/v1OnboardingStyles';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';

export const PET_PROFILE_SPECIES_OPTIONS = [
  { value: 'dog', label: 'Cão', emoji: '🐶', hint: 'Canino' },
  { value: 'cat', label: 'Gato', emoji: '🐱', hint: 'Felino' },
  { value: 'other', label: 'Outro', emoji: '🐾', hint: 'Outros perfis' },
] as const;

export const PET_PROFILE_AGE_OPTIONS = [
  { value: 'baby', label: 'Filhote', hint: '0 a 12 meses', years: 0.5 },
  { value: 'young', label: 'Jovem', hint: '1 a 3 anos', years: 2 },
  { value: 'adult', label: 'Adulto', hint: '4 a 8 anos', years: 6 },
  { value: 'senior', label: 'Sênior', hint: '9+ anos', years: 11 },
] as const;

export const PET_PROFILE_SEX_OPTIONS = [
  { value: 'male', label: 'Macho' },
  { value: 'female', label: 'Fêmea' },
] as const;

export type PetProfileSpeciesValue = (typeof PET_PROFILE_SPECIES_OPTIONS)[number]['value'];
export type PetProfileAgeBucket = (typeof PET_PROFILE_AGE_OPTIONS)[number]['value'];
export type PetProfileSexValue = (typeof PET_PROFILE_SEX_OPTIONS)[number]['value'];

export function estimateBirthDate(years: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - Math.round(years * 12));
  return dateToLocalISO(date);
}

export function formatPetAge(birthDate: string | undefined): string | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return null;
  if (months < 12) return `${Math.max(months, 0)} ${months === 1 ? 'mes' : 'meses'}`;

  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths === 0) return `${years} ${years === 1 ? 'ano' : 'anos'}`;
  return `${years} ${years === 1 ? 'ano' : 'anos'} e ${remMonths} ${remMonths === 1 ? 'mes' : 'meses'}`;
}

export function inferAgeBucket(birthDate: string | undefined): PetProfileAgeBucket {
  if (!birthDate) return 'young';

  const birth = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return 'young';

  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;

  if (months <= 12) return 'baby';
  if (months <= 36) return 'young';
  if (months <= 96) return 'adult';
  return 'senior';
}

type PetProfileHeroProps = {
  name: string;
  species: PetProfileSpeciesValue;
  ageLabel?: string | null;
  photoSrc?: string | null;
  onPhotoClick: () => void;
  onPhotoError?: () => void;
  actionSlot?: ReactNode;
};

export function PetProfileHero({
  name,
  species,
  ageLabel,
  photoSrc,
  onPhotoClick,
  onPhotoError,
  actionSlot,
}: PetProfileHeroProps) {
  const selectedSpecies = PET_PROFILE_SPECIES_OPTIONS.find((option) => option.value === species) || PET_PROFILE_SPECIES_OPTIONS[2];
  const petHeaderName = name.trim() || 'Seu pet';
  const petHeaderLine = [selectedSpecies.label, ageLabel].filter(Boolean).join(' • ');

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <button
          type="button"
          onClick={onPhotoClick}
          className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-[18px] bg-slate-100 shadow-sm ring-1 ring-slate-200"
        >
          {photoSrc ? (
            <img src={photoSrc} alt={petHeaderName} className="h-full w-full object-cover" onError={onPhotoError} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[1.8rem]">{selectedSpecies.emoji}</div>
          )}
          <span className="absolute bottom-1 right-1 rounded-full bg-[#0056D2] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-white">
            Foto
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Perfil do pet</p>
          <h1 className="mt-0.5 truncate text-[1.35rem] font-black tracking-tight text-slate-950">{petHeaderName}</h1>
          <p className="mt-0.5 text-[13px] text-slate-600">{petHeaderLine || 'Nome, espécie e idade'}</p>
        </div>
      </div>
      {actionSlot}
    </div>
  );
}

type PetProfileIdentitySectionProps = {
  name: string;
  species: PetProfileSpeciesValue;
  sex: PetProfileSexValue | '';
  ageMode: 'approx' | 'exact';
  ageBucket: PetProfileAgeBucket;
  birthDate: string;
  onNameChange: (value: string) => void;
  onSpeciesChange: (value: PetProfileSpeciesValue) => void;
  onSexChange: (value: PetProfileSexValue) => void;
  onAgeModeChange: (value: 'approx' | 'exact') => void;
  onAgeBucketChange: (value: PetProfileAgeBucket) => void;
  onBirthDateChange: (value: string) => void;
  error?: string;
  stageLabel?: string;
};

export function PetProfileIdentitySection({
  name,
  species,
  sex,
  ageMode,
  ageBucket,
  birthDate,
  onNameChange,
  onSpeciesChange,
  onSexChange,
  onAgeModeChange,
  onAgeBucketChange,
  onBirthDateChange,
  error,
  stageLabel,
}: PetProfileIdentitySectionProps) {
  return (
    <div className="space-y-3.5">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Identidade</p>
            <h2 className="mt-0.5 text-lg font-black tracking-tight text-slate-950">Nome, espécie, sexo e idade</h2>
          </div>
          {stageLabel ? <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">{stageLabel}</div> : null}
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-700">Nome do pet</span>
        <input
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Nome do pet"
          className={v1InputClass}
          required
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-700">Espécie</span>
          <span className="text-[11px] text-slate-400">Escolha rápida</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {PET_PROFILE_SPECIES_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSpeciesChange(option.value)}
              className={`rounded-2xl border px-2 py-2 text-center transition-all ${species === option.value ? 'border-[#0056D2] bg-blue-50 text-[#0047ad] shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
            >
              <div className="text-base leading-none">{option.emoji}</div>
              <div className="mt-1 text-[12px] font-bold">{option.label}</div>
              <div className="mt-0.5 text-[10px] leading-3 text-slate-500">{option.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-[24px] border border-white bg-gradient-to-b from-slate-50 to-slate-100/50 p-4 shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Idade</p>
            <p className="text-[11px] text-slate-500">Aproximada ou data exata.</p>
          </div>
          <div className="inline-flex rounded-full bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => onAgeModeChange('approx')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${ageMode === 'approx' ? 'bg-[#0056D2] text-white' : 'text-slate-500'}`}
            >
              Aproximada
            </button>
            <button
              type="button"
              onClick={() => onAgeModeChange('exact')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${ageMode === 'exact' ? 'bg-[#0056D2] text-white' : 'text-slate-500'}`}
            >
              Data exata
            </button>
          </div>
        </div>

        {ageMode === 'approx' ? (
          <div className="grid grid-cols-2 gap-2">
            {PET_PROFILE_AGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onAgeBucketChange(option.value)}
                className={`rounded-2xl border px-3 py-2.5 text-left transition-all ${ageBucket === option.value ? 'border-[#0056D2] bg-white shadow-sm ring-2 ring-blue-100' : 'border-slate-200 bg-white/90 hover:border-slate-300'}`}
              >
                <div className="text-[13px] font-bold text-slate-900">{option.label}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{option.hint}</div>
              </button>
            ))}
          </div>
        ) : (
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Nascimento</span>
            <input
              type="date"
              value={birthDate}
              onChange={(event) => onBirthDateChange(event.target.value)}
              max={localTodayISO()}
              className={v1InputClass}
            />
          </label>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-700">Sexo</span>
          <span className="text-xs text-slate-400">Opcional agora</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {PET_PROFILE_SEX_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSexChange(option.value)}
              className={`rounded-2xl border px-2 py-2.5 text-[12px] font-semibold transition-all ${sex === option.value ? 'border-[#0056D2] bg-blue-50 text-[#0047ad]' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}