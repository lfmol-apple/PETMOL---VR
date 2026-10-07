'use client';
import { useBackHandler } from '@/lib/backStack';
import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff, MapPin, MapPinOff, CalendarClock } from 'lucide-react';

import { useI18n } from '@/lib/I18nContext';
import { HomeAttentionOverlays } from '@/components/home/HomeAttentionOverlays';
import { useNotificationPermissionController } from '@/features/interactions/useNotificationPermissionController';
import { requestLocationAndPersist, stopSharingLocation } from '@/features/interactions/requestCorePermissions';
import { queryGeolocationPermission, type GeolocationPermissionState } from '@/lib/silentLocationRefresh';
import { fetchMe } from '@/lib/fetchMe';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
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
  onCloseTopAttentionModal,
  showTopAttentionModal,
  topAttentionAlerts,
  onAlertSelect,
  upcomingCount,
  upcomingUrgent,
  onOpenUpcoming,
}: HomePetHeaderProps) {
  const { t } = useI18n();
  const nameButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  useBackHandler(showPetSelector, onClosePetSelector);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Indicador de permissões (canto da foto) — reusa o controller de push
  // já existente (hook consumido do mesmo jeito em PermissionsNudgeCard.tsx
  // e em profile/page.tsx) em vez de reimplementar. "Ativo" aqui segue a
  // MESMA definição que o Perfil já usa: isSubscribed (o app realmente tem
  // uma subscription registrada), não só a permissão bruta do navegador —
  // o navegador não tem API pra "desligar" notificação por conta própria,
  // então o que o PETMOL de fato liga/desliga é a subscription.
  const {
    permission: pushPermission,
    requestPermission: requestPushPermission,
    subscribeToPush,
    isSubscribed,
    unsubscribe: unsubscribePush,
  } = useNotificationPermissionController();

  // Localização: mesma definição que o Perfil usa (handleStopSharing/
  // handleRequestGeo em profile/page.tsx) — "ativo" é ter lat/lng
  // guardados no tutor (GET /auth/me), não só a permissão do navegador.
  // Não existe API de navegador pra revogar geolocalização de dentro do
  // app; o que o PETMOL controla de fato é guardar ou apagar a posição.
  // geoPermission continua só pra saber se um novo pedido vai mostrar o
  // diálogo nativo ou se o SO já bloqueou (pra dar a orientação certa).
  const [geoPermission, setGeoPermission] = useState<GeolocationPermissionState>('unsupported');
  const [hasLocation, setHasLocation] = useState(false);
  const refreshLocationState = async () => {
    try {
      const token = getToken();
      const res = await fetchMe(API_BASE_URL, token);
      if (!res.ok) return;
      const data = await res.json();
      setHasLocation(data?.lat != null && data?.lng != null);
    } catch { /* melhor esforço */ }
  };
  useEffect(() => {
    let active = true;
    void queryGeolocationPermission().then((state) => {
      if (active) setGeoPermission(state);
    });
    void refreshLocationState();
    return () => { active = false; };
  }, []);

  const notifOff = !isSubscribed;
  const locOff = !hasLocation;

  // Popover de explicação/ação — mesmo padrão de portal fixo usado pelo
  // seletor de pets (renderSelector) logo abaixo, só que mais simples
  // (sem precisar medir posição de um botão específico: os dois ícones
  // ficam sempre no mesmo canto da foto).
  const [permPopup, setPermPopup] = useState<'push' | 'location' | null>(null);
  const [permBusy, setPermBusy] = useState(false);

  const activatePush = async () => {
    setPermBusy(true);
    try {
      const granted = pushPermission === 'granted' ? true : await requestPushPermission();
      if (granted) await subscribeToPush();
    } catch { /* melhor esforço */ } finally {
      setPermBusy(false);
      setPermPopup(null);
    }
  };

  const deactivatePush = async () => {
    setPermBusy(true);
    try {
      await unsubscribePush();
    } catch { /* melhor esforço */ } finally {
      setPermBusy(false);
      setPermPopup(null);
    }
  };

  const activateLocation = async () => {
    setPermBusy(true);
    try {
      await requestLocationAndPersist();
    } finally {
      const state = await queryGeolocationPermission();
      setGeoPermission(state);
      await refreshLocationState();
      setPermBusy(false);
      setPermPopup(null);
    }
  };

  const deactivateLocation = async () => {
    setPermBusy(true);
    try {
      await stopSharingLocation();
    } finally {
      await refreshLocationState();
      setPermBusy(false);
      setPermPopup(null);
    }
  };

  const renderPermPopup = () => {
    if (!mounted || !permPopup) return null;
    const isPush = permPopup === 'push';
    // Estado ATUAL no momento em que o popover abriu.
    const isOff = isPush ? notifOff : locOff;
    const deniedByOs = isOff && (isPush ? pushPermission === 'denied' : geoPermission === 'denied');
    const title = isOff
      ? (isPush ? 'Notificações desativadas' : 'Localização desativada')
      : (isPush ? 'Notificações ativas' : 'Localização ativa');
    const body = !isOff
      ? (isPush
          ? 'Você recebe lembretes de cuidado e alertas de pet sumido perto de você.'
          : 'Isso ajuda a avisar sobre pets sumidos perto de você.')
      : (isPush
          ? 'Precisamos de notificações pra avisar sobre lembretes de cuidado e alertas de pet sumido perto de você.'
          : 'Precisamos da localização especialmente pra avisar sobre pets sumidos perto de você.');
    return createPortal(
      <>
        <div className="fixed inset-0 z-[200]" onClick={() => setPermPopup(null)} />
        <div className="fixed left-1/2 top-1/2 z-[201] w-[calc(100vw-48px)] max-w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border border-white/60 bg-white/95 p-4 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl animate-in fade-in zoom-in duration-200">
          <p className="text-[14px] font-black text-slate-900">{title}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-slate-500">{body}</p>
          {deniedByOs ? (
            <p className="mt-2.5 text-[11.5px] leading-snug text-amber-700">
              O sistema não deixa pedir de novo por aqui — abra as configurações do aparelho e permita
              {isPush ? ' notificações' : ' localização'} para o Petmol.
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPermPopup(null)}
              disabled={permBusy}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-slate-400 active:opacity-70 disabled:opacity-40"
            >
              {deniedByOs ? 'Entendi' : 'Agora não'}
            </button>
            {!deniedByOs && isOff && (
              <button
                type="button"
                onClick={() => void (isPush ? activatePush() : activateLocation())}
                disabled={permBusy}
                className="rounded-full bg-[#0056D2] px-3.5 py-1.5 text-[12px] font-bold text-white active:scale-95 transition-transform disabled:opacity-60"
              >
                Ativar
              </button>
            )}
            {!isOff && (
              <button
                type="button"
                onClick={() => void (isPush ? deactivatePush() : deactivateLocation())}
                disabled={permBusy}
                className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[12px] font-bold text-slate-600 active:scale-95 transition-transform disabled:opacity-60"
              >
                Desativar
              </button>
            )}
          </div>
        </div>
      </>,
      document.body
    );
  };

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

  // Linha única corrida (não mais pills) — redesenho compacto da
  // identificação, 07/10/2026: "Lhasa Apso · Macho · 9a 4m · 11,6 kg".
  // Quatro pílulas com quatro fundos criavam fragmentação visual sem
  // necessidade; uma frase lê melhor e ocupa menos altura. "Castrado"
  // fica de fora (não citado no formato aprovado); continua
  // editável/visível em outras telas do pet, só não entra aqui.
  const identityLine = [
    currentPet.breed || (currentPet.species === 'cat' ? 'Gato' : currentPet.species === 'dog' ? 'Cão' : null),
    currentPet.sex === 'male' ? 'Macho' : currentPet.sex === 'female' ? 'Fêmea' : null,
    petAge ?? null,
    weightChip,
  ].filter(Boolean).join(' · ');

  const currentPetPhotoUrl = getPhotoUrl(currentPet.photo, currentPet.pet_id, photoTimestamps);

  return (
    <>    <div className="px-2 pt-1.5 space-y-1.5 sm:pt-4 sm:space-y-2">
      {/* space-y reduzido de 2/3 pra 1.5/2 no redesenho compacto
          (07/10/2026): a identificação ficou bem mais curta (uma linha
          de nome + uma linha de dados, sem pills, sem botão "Adicionar
          pet" próprio) e não precisa mais da mesma folga. Objetivo:
          Alimentação/Cuidados aparecerem mais cedo na tela sem
          sacrificar o tamanho da foto. */}
      {/* Container da Foto + Navegação Estilo Apple — padding lateral igual
          ao de HomePetDashboard/AppleControlButtons (px-2 flat, sem variar
          por breakpoint) pra foto e cards ficarem com a MESMA borda lateral
          em qualquer largura de tela; antes cada um tinha seu próprio px
          responsivo e desalinhava dependendo do tamanho da tela. */}
      <div
        className="relative group mx-auto w-full overflow-hidden rounded-[22px] border border-white/50 bg-gradient-to-br from-blue-400 to-purple-500 shadow-lg shadow-blue-500/10 ring-1 ring-black/5 sm:rounded-[28px] aspect-[1.25/1]"
        style={{
          // Teto de altura/largura REMOVIDO em qualquer breakpoint
          // (10/10/2026, pedido explícito: a foto tem que alinhar em
          // largura com o resto da tela, igual produção). A versão
          // anterior (teto só até 315px/36dvh de altura, derivando a
          // largura disso) deixava a foto mais ESTREITA que os cards/
          // botões em telas largas — o teto em altura sempre encolhe a
          // largura proporcionalmente (aspect-ratio 1.25/1), então
          // qualquer valor de teto além de ~1024px (onde o card-pai já
          // trava em lg:max-w-3xl) causa esse desalinhamento. Agora é só
          // w-full (sempre igual aos irmãos) + aspect-ratio — altura
          // segue da largura, sem distorcer, sem mudar o crop.
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

        {/* Status de Notificações/Localização — DE VOLTA pra foto, canto
            superior esquerdo (10/10/2026, correção: a versão em linha
            abaixo da foto "virou mais um botão da Home" e o estado ativo
            ficou invisível). Agora SEMPRE visíveis, os dois estados —
            Bell/MapPin azul quando ativo, BellOff/MapPinOff âmbar quando
            não. Nunca vermelho, nunca toggle (ver renderPermPopup: tocar
            ativo só confirma, nunca desativa). */}
        <div className="absolute left-2.5 top-2.5 z-20 flex items-center gap-1.5 sm:left-3 sm:top-3">
          <button
            type="button"
            onClick={() => setPermPopup('push')}
            aria-label={notifOff ? 'Notificações desativadas' : 'Notificações ativas'}
            title={notifOff ? 'Notificações desativadas' : 'Notificações ativas'}
            className={`flex h-8 w-8 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-all active:scale-90 sm:h-9 sm:w-9 ${
              notifOff
                ? 'border-amber-200/70 bg-amber-400/90 text-amber-950 hover:bg-amber-400'
                : 'border-white/40 bg-black/30 text-white hover:bg-black/50'
            }`}
          >
            {notifOff ? <BellOff className="h-4 w-4" strokeWidth={2.3} /> : <Bell className="h-4 w-4" strokeWidth={2.3} />}
          </button>
          <button
            type="button"
            onClick={() => setPermPopup('location')}
            aria-label={locOff ? 'Localização desativada' : 'Localização ativa'}
            title={locOff ? 'Localização desativada' : 'Localização ativa'}
            className={`flex h-8 w-8 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-all active:scale-90 sm:h-9 sm:w-9 ${
              locOff
                ? 'border-amber-200/70 bg-amber-400/90 text-amber-950 hover:bg-amber-400'
                : 'border-white/40 bg-black/30 text-white hover:bg-black/50'
            }`}
          >
            {locOff ? <MapPinOff className="h-4 w-4" strokeWidth={2.3} /> : <MapPin className="h-4 w-4" strokeWidth={2.3} />}
          </button>
        </div>

        {/* Botão de ação no canto inferior direito — só "editar este pet"
            (lápis). Controle pequeno e indispensável, continua sobre a
            foto; nenhum texto informativo mora mais aqui. */}
        <div className="absolute bottom-2.5 right-2.5 z-20 sm:bottom-3 sm:right-3">
          <button
            onClick={onOpenEditPetModal}
            aria-label="Editar pet"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/40 active:scale-90 sm:h-9 sm:w-9"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>


      </div>

      {/* Identificação do pet. Linha nome/Trocar-pet/Adicionar-pet
          restaurada EXATAMENTE como estava antes da compactação de
          09/10/2026 (recuperada de 3e22ea61, não reescrita de memória —
          pedido explícito do dono: "Trocar pet" à esquerda dentro do
          botão do nome, "Adicionar pet" visível à direita, ambos como
          eram). A linha única de dados (identityLine) abaixo é a única
          parte do redesenho compacto que permanece — "não mexa nas
          pills ainda". */}
      <div className="px-0.5 pb-1 min-[390px]:px-1 sm:px-1.5 sm:pb-2">
        <div className="flex w-full items-center pr-1">
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
          {/* "Próximos cuidados" — era o sino sobre a foto, mudou de
              lugar (09/10/2026, depois ganhou mais presença visual numa
              2ª rodada no mesmo dia: o ícone+número inline ficava
              pequeno/imperceptível demais). Mesmo dado exato
              (allUpcomingReminders: vacina/vermífugo/banho/ração/
              medicação/eventos, ver buildPetCareReminders em
              petCareDomain.ts), mesma regra de negócio (número só
              aparece se > 0). Agora é um botão premium ~50px com badge
              de verdade no canto (não mais número solto ao lado do
              ícone) — nome do botão é "Próximos cuidados", não "Agenda"
              (a auditoria confirmou que o dado real é cuidado do pet,
              não uma agenda genérica). */}
          <button
            type="button"
            onClick={onOpenUpcoming}
            aria-label={upcomingCount > 0 ? `Próximos cuidados — ${upcomingCount} pendência${upcomingCount === 1 ? '' : 's'}` : 'Próximos cuidados'}
            title="Próximos cuidados"
            className="relative ml-1 flex h-[50px] w-[50px] flex-shrink-0 items-center justify-center rounded-full border border-[#BFD4F0] bg-white shadow-[0_2px_10px_-3px_rgba(0,86,210,0.18)] transition-all active:scale-95"
          >
            <CalendarClock className="h-6 w-6 text-[#0056D2]" strokeWidth={2.2} />
            {upcomingCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-black leading-none text-white shadow-sm tabular-nums">
                {upcomingCount > 99 ? '99+' : upcomingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onOpenAddPetModal}
            className="ml-1 flex flex-shrink-0 items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide text-blue-700 transition-all active:scale-95 sm:px-3"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
            </svg>
            Adicionar pet
          </button>
        </div>
        {identityLine && (
          <p className="line-clamp-2 mt-1 ml-1 text-[13px] font-medium leading-snug text-slate-500 sm:mt-1.5 sm:text-[13.5px]">
            {identityLine}
          </p>
        )}

        {renderSelector()}
        {renderPermPopup()}
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
