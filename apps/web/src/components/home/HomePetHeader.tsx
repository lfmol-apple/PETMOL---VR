'use client';
import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '@/lib/I18nContext';
import { HomeAttentionOverlays } from '@/components/home/HomeAttentionOverlays';
import type { PetInteractionItem } from '@/features/interactions/types';
import type { PetHealthProfile } from '@/lib/petHealth';

function PetSilhouette({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true">
      <path fill="currentColor" d="M46 20c-11 0-20 9-20 20v12c0 14 10 24 22 24s22-10 22-24V40c0-11-9-20-20-20h-4Zm-10 20c0-5 4-10 10-10h4c6 0 10 5 10 10v12c0 8-5 14-12 14s-12-6-12-14V40Z" />
      <path fill="currentColor" d="M24 43c-5 0-9 5-9 11s4 11 9 11 9-5 9-11-4-11-9-11Zm48 0c-5 0-9 5-9 11s4 11 9 11 9-5 9-11-4-11-9-11ZM31 20c-4 0-8 4-8 9s4 9 8 9 8-4 8-9-4-9-8-9Zm34 0c-4 0-8 4-8 9s4 9 8 9 8-4 8-9-4-9-8-9Z" />
    </svg>
  );
}

interface HomePetHeaderProps {
  currentPet: PetHealthProfile;
  pets: PetHealthProfile[];
  selectedPetId: string | null;
  setSelectedPetId: (value: string) => void;
  photoTimestamps: Record<string, string | number>;
  getPhotoUrl: (photoPath: string | undefined | null, petId?: string, photoTimestamps?: Record<string, string | number>) => string | null;
  switchPetByOffset: (offset: number) => void;
  onOpenAddPetModal: () => void;
  onOpenEditPetModal: () => void;
  loggedUserId: string;
  familyOwnerNames: Record<string, string>;
  showPetSelector: boolean;
  onTogglePetSelector: () => void;
  onClosePetSelector: () => void;
  topAttentionPetCount: number;
  onOpenTopAttentionModal: () => void;
  onCloseTopAttentionModal: () => void;
  showTopAttentionModal: boolean;
  topAttentionAlerts: PetInteractionItem[];
  onAlertSelect: (alert: PetInteractionItem) => void;
  upcomingCount: number;
  // True when at least one of the bell's reminders is a real pendência
  // (overdue or due today) — the badge shows the FULL count regardless,
  // but only turns red when something genuinely needs action now; a count
  // made up entirely of "vence em 3 semanas" stays a calmer blue.
  upcomingUrgent: boolean;
  onOpenUpcoming: () => void;
  // Names of pets across the WHOLE household that need attention on the
  // basic-care minimum (vacina/vermífugo/antipulgas/ração — the items that
  // apply to every pet regardless of health condition; medication/grooming
  // excluded on purpose, since not every pet takes medication). Computed
  // once in useHomeInteractionCenter.ts and shared across the household,
  // not scoped to just the currently-selected pet.
  basicCareAttentionPetNames: string[];
}

export function HomePetHeader({
  currentPet,
  pets,
  selectedPetId,
  setSelectedPetId,
  photoTimestamps,
  getPhotoUrl,
  switchPetByOffset,
  onOpenAddPetModal,
  onOpenEditPetModal,
  loggedUserId,
  familyOwnerNames,
  showPetSelector,
  onTogglePetSelector,
  onClosePetSelector,
  topAttentionPetCount,
  onOpenTopAttentionModal,
  onCloseTopAttentionModal,
  showTopAttentionModal,
  topAttentionAlerts,
  onAlertSelect,
  upcomingCount,
  upcomingUrgent,
  onOpenUpcoming,
  basicCareAttentionPetNames,
}: HomePetHeaderProps) {
  const { t } = useI18n();
  const nameButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (showPetSelector && nameButtonRef.current) {
      const rect = nameButtonRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [showPetSelector]);

  // Dropdown de Seleção de Pets via Portal
  const renderSelector = () => {
    if (!mounted || !showPetSelector || !dropdownPos) return null;
    
    return createPortal(
      <>
        <div className="fixed inset-0 z-[200]" onClick={onClosePetSelector} />
        <div
          className="fixed left-1/2 top-1/2 z-[201] max-h-[72vh] w-[calc(100vw-32px)] max-w-[360px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] border border-white/60 bg-white/95 py-2 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl animate-in fade-in zoom-in duration-200"
        >
          <div className="px-5 py-3 border-b border-slate-100 mb-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trocar pet</span>
          </div>
          <div className="max-h-[calc(72vh-52px)] overflow-y-auto py-1">
            {pets.map((pet) => (
              <button
                key={pet.pet_id}
                onClick={() => {
                  setSelectedPetId(pet.pet_id);
                  onClosePetSelector();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${
                  pet.pet_id === selectedPetId ? 'bg-blue-50/50' : ''
                }`}
              >
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-400 to-purple-500 overflow-hidden flex-shrink-0 border-2 border-white shadow-sm ring-1 ring-black/5">
                  {getPhotoUrl(pet.photo, pet.pet_id, photoTimestamps) ? (
                    <img
                      src={getPhotoUrl(pet.photo, pet.pet_id, photoTimestamps)!}
                      alt={pet.pet_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/80">
                      <PetSilhouette className="h-7 w-7" />
                    </div>
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className={`font-black truncate text-sm tracking-tight ${pet.pet_id === selectedPetId ? 'text-blue-600' : 'text-slate-800'}`}>
                    {pet.pet_name}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate uppercase tracking-wider font-bold">
                    {pet.breed}
                  </p>
                </div>
                {pet.pet_id === selectedPetId && (
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.6)]" />
                )}
              </button>
            ))}
          </div>
        </div>
      </>,
      document.body
    );
  };

  const petAge = currentPet.birth_date && (() => {
    const birth = new Date(currentPet.birth_date);
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    if (years === 0) return `${months}m`;
    if (months === 0) return `${years} ${years === 1 ? t('common.age.year') : t('common.age.years')}`;
    return `${years}a ${months}m`;
  })();

  const latestWeight = currentPet.weight_history?.[0];
  const weightChip = latestWeight?.weight
    ? `${latestWeight.weight} ${latestWeight.weight_unit ?? 'kg'}`
    : null;

  const petChips = [
    currentPet.breed || (currentPet.species === 'cat' ? 'Gato' : currentPet.species === 'dog' ? 'Cão' : null),
    currentPet.sex === 'male' ? 'Macho' : currentPet.sex === 'female' ? 'Fêmea' : null,
    petAge ?? null,
    weightChip,
    currentPet.neutered === true ? 'Castrado' : null,
  ].filter(Boolean) as string[];

  const currentPetPhotoUrl = getPhotoUrl(currentPet.photo, currentPet.pet_id, photoTimestamps);
  // Basic-care badge: which pets in the household need attention on
  // vacina/vermífugo/antipulgas/ração — see basicCareAttentionPetIds'
  // definition (useHomeInteractionCenter.ts) for what counts as "needing
  // attention" (actually overdue).
  const hasVisibleAttention = basicCareAttentionPetNames.length > 0;

  return (
    <>    <div className="px-3 pt-2 space-y-2 sm:px-4 sm:pt-4 sm:space-y-3">
      {/* Container da Foto + Navegação Estilo Apple */}
      <div
        className="relative group mx-auto w-full overflow-hidden rounded-[22px] border border-white/50 bg-gradient-to-br from-blue-400 to-purple-500 shadow-lg shadow-blue-500/10 ring-1 ring-black/5 sm:rounded-[28px]"
        style={{
          aspectRatio: '1.25 / 1',
          maxHeight: 'min(33dvh, 285px)',
          // Sem isto, a largura (w-full, até ~576px em telas largas via
          // max-w-xl/max-w-2xl dos pais) continua livre enquanto a altura
          // é travada em 285px no desktop — a caixa real vira ~2:1 em vez
          // de 1.25:1, e o object-cover centralizado corta o topo da
          // cabeça/orelhas do pet pra preencher essa largura sobrando.
          // Travar a largura na mesma proporção mantém a caixa fiel ao
          // aspectRatio declarado em qualquer tamanho de tela.
          maxWidth: 'calc(min(33dvh, 285px) * 1.25)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transform: 'translate3d(0,0,0)',
          WebkitTransform: 'translate3d(0,0,0)',
          WebkitMaskImage: '-webkit-radial-gradient(white, black)'
        }}
      >

        <div className="w-full h-full flex items-center justify-center text-white/45">
          <PetSilhouette className="h-24 w-24 sm:h-32 sm:w-32" />
        </div>

        {/* Foto Real do Pet — mesma proporção 1:1 do picker, sem distorção */}
        {currentPetPhotoUrl && (
          <img
            src={currentPetPhotoUrl}
            alt={currentPet.pet_name}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}
            draggable={false}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}

        {/* Overlay premium gradient na parte inferior da foto */}
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

        {pets.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => switchPetByOffset(-1)}
              aria-label="Pet anterior"
              className="hidden sm:flex absolute left-4 top-1/2 z-20 h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/40 active:scale-95"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => switchPetByOffset(1)}
              aria-label="Proximo pet"
              className="hidden sm:flex absolute right-4 top-1/2 z-20 h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/40 active:scale-95"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {/* Bell de eventos futuros — canto superior esquerdo */}
        <div className="absolute left-2.5 top-2.5 z-20 sm:left-3 sm:top-3">
          <button
            type="button"
            onClick={onOpenUpcoming}
            aria-label="Próximos eventos"
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-black/30 text-white shadow-lg backdrop-blur-md transition-all hover:bg-black/50 active:scale-90 sm:h-10 sm:w-10"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2Zm6-6V11a6 6 0 0 0-5-5.92V4a1 1 0 0 0-2 0v1.08A6 6 0 0 0 6 11v5l-1.29 1.29A1 1 0 0 0 5 19h14a1 1 0 0 0 .71-1.71L18 16Z" />
            </svg>
            {upcomingCount > 0 && (
              <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full border-2 border-white text-[10px] font-black text-white flex items-center justify-center px-1 leading-none shadow-md tabular-nums ${
                upcomingUrgent ? 'bg-red-500' : 'bg-sky-500'
              }`}>
                {upcomingCount > 99 ? '99+' : upcomingCount}
              </span>
            )}
          </button>
        </div>

        {/* Botões de ação no canto inferior direito */}
        <div className="absolute bottom-2.5 right-2.5 z-20 flex gap-2 sm:bottom-3 sm:right-3">
          <button
            onClick={onOpenAddPetModal}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/40 active:scale-90 sm:h-9 sm:w-9"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={onOpenEditPetModal}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/40 active:scale-90 sm:h-9 sm:w-9"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>


      </div>

      {/* Dados de Identidade do Pet (Abaixo da Foto) */}
      <div className="px-1 pb-1 sm:px-1.5 sm:pb-2">
        <div className="flex flex-col">
          {/* Nome do Pet e Badge de Status (Alinhados na mesma linha) */}
          <div className="flex w-full items-center justify-between gap-2 pr-1">
            <button
              ref={nameButtonRef}
              onClick={onTogglePetSelector}
              className="group -ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-2xl py-1 pl-1.5 pr-2 text-left transition-all hover:bg-slate-100/50 active:scale-95 sm:gap-2 sm:py-1.5 sm:pr-2.5"
            >
              <span className="min-w-0">
                <h2 className="min-w-0 truncate text-[28px] font-black leading-none tracking-tight text-slate-900 transition-colors group-hover:text-blue-600 sm:text-3xl">
                  {currentPet.pet_name}
                </h2>
                {pets.length > 1 && (
                  <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-700 shadow-sm ring-1 ring-blue-100 group-hover:bg-blue-50 sm:mt-1">
                    Trocar pet
                  </span>
                )}
              </span>
              <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 transition-transform duration-300 ${showPetSelector ? 'rotate-180 bg-blue-100 text-blue-600' : 'text-slate-400'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Badge de atenção — alinhado à direita com o nome. Texto
                deliberadamente curto (a bolinha colorida já carrega a
                urgência) e com teto de largura menor que o do nome, pra não
                espremer o nome do pet — confirmado em produção: "Mingau"
                virava "Ming..." porque o selo antigo ("2 pets precisam de
                atenção") tomava até 52% da linha. */}
            <div
              onClick={hasVisibleAttention ? onOpenTopAttentionModal : undefined}
              className={`inline-flex max-w-[38%] flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 shadow-sm transition-all ${
                hasVisibleAttention
                  ? 'bg-rose-50 border-rose-200 text-rose-700 cursor-pointer hover:bg-rose-100 active:scale-95'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasVisibleAttention ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="truncate text-[10px] font-bold tracking-wide">
                {hasVisibleAttention
                  ? basicCareAttentionPetNames.length === 1
                    ? basicCareAttentionPetNames[0]
                    : `${basicCareAttentionPetNames.length} pets`
                  : 'Em dia'}
              </span>
            </div>
          </div>
          
          {/* Chips de dados do pet */}
          {petChips.length > 0 && (
            <div className="mt-1.5 ml-1 flex flex-wrap gap-1.5 sm:mt-2">
              {petChips.map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold leading-none text-slate-600 sm:px-2.5 sm:py-1 sm:text-[11px]"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}

        </div>

        {renderSelector()}
      </div>
      </div>

      <HomeAttentionOverlays
        showTopAttentionModal={showTopAttentionModal}
        onCloseTopAttentionModal={onCloseTopAttentionModal}
        topAttentionPetCount={topAttentionPetCount}
        topAttentionAlerts={topAttentionAlerts}
        onAlertSelect={onAlertSelect}
      />
    </>
  );
}
