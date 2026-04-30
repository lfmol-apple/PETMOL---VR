'use client';
import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PetTabs } from '@/components/PetTabs';

import { useI18n } from '@/lib/I18nContext';
import { HomeAttentionOverlays } from '@/components/home/HomeAttentionOverlays';
import type { PetInteractionItem } from '@/features/interactions/types';
import type { PetHealthProfile } from '@/lib/petHealth';

interface HomePetHeaderProps {
  currentPet: PetHealthProfile;
  pets: PetHealthProfile[];
  selectedPetId: string | null;
  setSelectedPetId: (value: string) => void;
  photoTimestamps: Record<string, number>;
  getPhotoUrl: (photoPath: string | undefined | null, petId?: string, photoTimestamps?: Record<string, number>) => string | null;
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
  selectedPetNeedsAttention: boolean;
  selectedPetCareScore: number;
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
  selectedPetNeedsAttention,
  selectedPetCareScore,
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

  // Dropdown de Seleção de Pets via Portal (escapa overflow-hidden do PetTabs)
  const renderSelector = () => {
    if (!mounted || !showPetSelector || !dropdownPos) return null;
    
    return createPortal(
      <>
        <div className="fixed inset-0 z-[200]" onClick={onClosePetSelector} />
        <div
          className="fixed z-[201] w-[280px] bg-white/95 backdrop-blur-xl rounded-[28px] shadow-2xl border border-white/60 overflow-hidden py-2 animate-in fade-in zoom-in duration-200 origin-top-left ring-1 ring-black/5"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          <div className="px-5 py-2 border-b border-slate-100 mb-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('nav.select_pet')}</span>
          </div>
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
                  <div className="w-full h-full flex items-center justify-center text-xl">
                    {pet.species === 'dog' ? '🐕' : '🐱'}
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
      </>,
      document.body
    );
  };

  const petMeta = [
    currentPet.breed,
    currentPet.birth_date && (() => {
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
    })(),
    currentPet.weight_history?.length ? `${currentPet.weight_history[0].weight} kg` : null,
    currentPet.sex ? (currentPet.sex === 'male' ? t('pet.sex.male') : t('pet.sex.female')) : null,
    currentPet.neutered !== undefined ? (currentPet.neutered ? t('pet.neutered.yes') : t('pet.neutered.no')) : null,
  ].filter(Boolean).join(' · ');

  const currentPetPhotoUrl = getPhotoUrl(currentPet.photo, currentPet.pet_id, photoTimestamps);
  const hasVisibleAttention = selectedPetNeedsAttention && topAttentionPetCount > 0;

  return (
    <>    <div className="px-4 pt-4 space-y-3">
      {/* Container da Foto + Navegação Estilo Apple */}
      <div 
        className="relative group rounded-[28px] overflow-hidden shadow-xl shadow-blue-500/10 border border-white/50 ring-1 ring-black/5 bg-gradient-to-br from-blue-400 to-purple-500 h-44 sm:h-56"
        style={{ 
          backfaceVisibility: 'hidden', 
          WebkitBackfaceVisibility: 'hidden', 
          transform: 'translate3d(0,0,0)', 
          WebkitTransform: 'translate3d(0,0,0)',
          WebkitMaskImage: '-webkit-radial-gradient(white, black)'
        }}
      >
        
        {/* Emoji de Fundo para Pets sem Foto */}
        <div className="w-full h-full flex items-center justify-center opacity-40">
          <span className="text-white text-5xl sm:text-7xl transition-transform duration-500 sm:group-hover:scale-110">
            {currentPet.species === 'dog' ? '🐕' : currentPet.species === 'cat' ? '🐱' : '🐾'}
          </span>
        </div>

        {/* Foto Real do Pet (Se houver) */}
        {currentPetPhotoUrl && (
          <img
            src={currentPetPhotoUrl}
            alt={currentPet.pet_name}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ 
              backfaceVisibility: 'hidden', 
              WebkitBackfaceVisibility: 'hidden', 
              transform: 'translateZ(0)', 
              WebkitTransform: 'translateZ(0)',
              willChange: 'transform'
            }}
            draggable={false}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
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

        {/* Badge de Status de Saúde (PRESERVADO) */}
        

        {/* Botões de Ação Rápida no Canto Superior Direito */}
        <div className="absolute top-3 right-3 flex gap-2 z-20">
          <button
            onClick={onOpenAddPetModal}
            className="flex items-center justify-center w-9 h-9 bg-white/20 backdrop-blur-md text-white rounded-full transition-all border border-white/40 hover:bg-white/40 active:scale-90 shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={onOpenEditPetModal}
            className="flex items-center justify-center w-9 h-9 bg-white/20 backdrop-blur-md text-white rounded-full transition-all border border-white/40 hover:bg-white/40 active:scale-90 shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>


      </div>

      {/* Dados de Identidade do Pet (Abaixo da Foto) */}
      <div className="px-1.5 pb-2">
        <div className="flex flex-col">
          {/* Nome do Pet e Badge de Status (Alinhados na mesma linha) */}
          <div className="flex flex-wrap items-center justify-between gap-2 w-full pr-1">
            <button
              ref={nameButtonRef}
              onClick={onTogglePetSelector}
              className="group min-w-0 flex items-center gap-2 -ml-1 pl-1.5 pr-3 py-1.5 rounded-2xl hover:bg-slate-100/50 transition-all active:scale-95 text-left"
            >
              <h2 className="min-w-0 break-words text-2xl sm:text-3xl font-black text-slate-900 tracking-tighter leading-none group-hover:text-blue-600 transition-colors">
                {currentPet.pet_name}
              </h2>
              <div className={`w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center transition-transform duration-300 ${showPetSelector ? 'rotate-180 bg-blue-100 text-blue-600' : 'text-slate-400'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Badge de atenção — alinhado à direita com o nome */}
            <div
              onClick={hasVisibleAttention ? onOpenTopAttentionModal : undefined}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border shadow-sm transition-all ${
                hasVisibleAttention
                  ? 'bg-rose-50 border-rose-200 text-rose-700 cursor-pointer hover:bg-rose-100 active:scale-95'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${hasVisibleAttention ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="text-[10px] font-bold tracking-wide">
                {hasVisibleAttention
                  ? `${topAttentionPetCount} ${topAttentionPetCount === 1 ? 'pet' : 'pets'} com atenção`
                  : 'Em dia'}
              </span>
            </div>
          </div>
          
          {/* Metadados em Linha (Raça · Idade · Peso · Sexo) */}
          <div className="mt-1.5 ml-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-[11.5px] font-bold text-slate-700 tracking-tight">
              {currentPet.breed}
            </span>
            {petMeta.split(' · ').slice(1).join(' · ') && (
              <>
                <span className="opacity-40 text-slate-500 font-black tracking-tighter">·</span>
                <span className="text-[11.5px] font-bold text-slate-600 tracking-tight">
                  {petMeta.split(' · ').slice(1).join(' · ')}
                </span>
              </>
            )}
          </div>

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
