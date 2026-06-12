'use client';

import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { buildArrivalCareInsights } from '@/features/interactions/arrivalInsights';
import { showBlockingNotice } from '@/features/interactions/userPromptChannel';
import { useI18n } from '@/lib/I18nContext';
import type { PetWithHealth } from '@/features/pets/types';
import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';
import type { VaccineFormData, ParasiteFormData, GroomingFormData } from '@/lib/types/homeForms';
import { ModalPortal } from '@/components/ModalPortal';
import { localTodayISO } from '@/lib/localDate';

type ArrivalPlace = {
  name: string;
  address: string;
  phone?: string;
  rating?: number;
  reviews?: number;
};

interface ArrivalAlertProps {
  arrivalPlace: ArrivalPlace;
  pets: PetWithHealth[];
  selectedPetId: string | null;
  showAttendanceOptions: boolean;
  setVaccineFormData: Dispatch<SetStateAction<VaccineFormData>>;
  setParasiteFormData: Dispatch<SetStateAction<ParasiteFormData>>;
  setGroomingFormData: Dispatch<SetStateAction<GroomingFormData>>;
  onCloseArrivalFlow: () => void;
  onOpenAttendanceOptions: () => void;
  onCloseAttendanceOptions: () => void;
  onOpenArrivalVaccineForm: () => void;
  onNavigateToSaude?: (tab: string) => void;
}

function createLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function ArrivalAlert({
  arrivalPlace,
  pets,
  selectedPetId,
  showAttendanceOptions,
  setVaccineFormData,
  setParasiteFormData,
  setGroomingFormData,
  onCloseArrivalFlow,
  onOpenAttendanceOptions,
  onCloseAttendanceOptions,
  onOpenArrivalVaccineForm,
  onNavigateToSaude,
}: ArrivalAlertProps) {
  const { t, locale } = useI18n();
  const {
    freshCurrentPet,
    overdueVaccines,
    overdueParasites,
    overdueGrooming,
    totalOverdue,
    mostRecentVaccine,
    mostRecentParasite,
  } = useMemo(() => buildArrivalCareInsights(pets, selectedPetId), [pets, selectedPetId]);

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden">
        <div className="bg-gradient-to-r from-[#0066ff] to-indigo-600 text-white p-3 rounded-t-2xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 flex items-center justify-center bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
              <span className="text-lg">📍</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold">{t('arrival.you_arrived')}</h3>
              <p className="text-xs text-blue-100">{t('arrival.automatic_detection')}</p>
            </div>
          </div>

          <div className="bg-white bg-opacity-20 rounded-lg p-2 backdrop-blur-sm">
            <p className="font-bold text-sm mb-0.5">{arrivalPlace.name}</p>
            <p className="text-xs text-blue-100 mb-1">{arrivalPlace.address}</p>
            {(arrivalPlace.phone || arrivalPlace.rating) && (
              <div className="flex items-center gap-3 text-xs text-blue-100">
                {arrivalPlace.rating && arrivalPlace.reviews && (
                  <span>⭐ {arrivalPlace.rating} ({arrivalPlace.reviews})</span>
                )}
                {arrivalPlace.phone && <span>📞 {arrivalPlace.phone}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="p-3 max-h-[70vh] overflow-y-auto">
          {totalOverdue > 0 ? (
            <div className="mb-3">
              {mostRecentVaccine && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-2 mb-1.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">💉</span>
                    <h4 className="font-bold text-red-800 text-xs">
                      {overdueVaccines.length === 1 ? t('arrival.vaccines_overdue') : `${overdueVaccines.length} ${t('arrival.vaccines_overdue')}`}
                    </h4>
                  </div>
                  <p className="text-xs text-red-900">
                    <strong>{freshCurrentPet?.pet_name}</strong> {t('arrival.pet_overdue_with')} <strong>{mostRecentVaccine.vaccine_name}</strong> {t('arrival.overdue_since')} <strong>{mostRecentVaccine.daysOverdue} {t('arrival.days')}</strong>
                    {overdueVaccines.length > 1 && ` (+ ${overdueVaccines.length - 1} outra${overdueVaccines.length > 2 ? 's' : ''})`}
                  </p>
                </div>
              )}

              {mostRecentParasite && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-2 mb-1.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🦟</span>
                    <h4 className="font-bold text-amber-800 text-xs">
                      {overdueParasites.length === 1 ? 'ANTIPULGAS ATRASADO!' : `${overdueParasites.length} CONTROLES ATRASADOS!`}
                    </h4>
                  </div>
                  <p className="text-xs text-amber-900">
                    <strong>{freshCurrentPet?.pet_name}</strong> está com <strong>{mostRecentParasite.product_name}</strong> vencido há <strong>{mostRecentParasite.daysOverdue} dias</strong>
                    {overdueParasites.length > 1 && ` (+ ${overdueParasites.length - 1} outro${overdueParasites.length > 2 ? 's' : ''})`}
                  </p>
                </div>
              )}

              {overdueGrooming.length > 0 && (
                <div className="bg-sky-50 border border-sky-300 rounded-lg p-2 mb-1.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🛁</span>
                    <h4 className="font-bold text-sky-800 text-xs">
                      {overdueGrooming.length === 1 ? 'BANHO/TOSA ATRASADO!' : `${overdueGrooming.length} SERVIÇOS ATRASADOS!`}
                    </h4>
                  </div>
                  {overdueGrooming.map((g, idx) => {
                    const typeLabels: Record<string, string> = {
                      bath: `🛁 ${t('grooming.bath')}`,
                      grooming: `✂️ ${t('grooming.grooming')}`,
                      bath_grooming: `🛁✂️ ${t('grooming.bath_plus_grooming')}`,
                    };
                    return (
                      <p key={idx} className="text-xs text-sky-900">
                        <strong>{typeLabels[g.type] || g.type}</strong> atrasado há <strong>{g.daysOverdue} dias</strong>
                      </p>
                    );
                  })}
                </div>
              )}

              <p className="text-gray-700 text-center text-xs mt-2">{t('arrival.what_came_for')}</p>
            </div>
          ) : (
            <p className="text-gray-700 mb-3 text-center text-xs">
              Gostaria de registrar uma <strong>consulta veterinária</strong>, <strong>banho & tosa</strong> ou <strong>compra</strong> para <strong>{freshCurrentPet?.pet_name}</strong>?
            </p>
          )}

          <div className="space-y-1.5 mb-3">
            <button
              onClick={() => {
                const hoje = localTodayISO();

                if (mostRecentVaccine) {
                  setVaccineFormData((prev) => ({
                    ...prev,
                    vaccine_type: mostRecentVaccine.vaccine_type,
                    vaccine_name: mostRecentVaccine.vaccine_name,
                    veterinarian: mostRecentVaccine.veterinarian || '',
                    date_administered: hoje,
                  }));
                  onOpenArrivalVaccineForm();
                  setTimeout(() => {
                    const formattedDate = new Date().toLocaleDateString(locale);
                    showBlockingNotice(`${t('alert.arrival_vaccine_registered')}\n\n💉 ${mostRecentVaccine.vaccine_name}\n📍 ${t('health.location_label')}: ${arrivalPlace.name}\n📅 ${t('health.date_label')}: ${formattedDate}\n\n${t('alert.arrival_vaccine_message')}`);
                  }, 500);
                } else {
                  setVaccineFormData((prev) => ({
                    ...prev,
                    veterinarian: '',
                    date_administered: hoje,
                  }));
                  onOpenArrivalVaccineForm();
                  setTimeout(() => {
                    const formattedDate = new Date().toLocaleDateString(locale);
                    showBlockingNotice(`${t('alert.arrival_data_prefilled')}\n\n📍 ${t('health.location_label')}: ${arrivalPlace.name}\n📅 ${t('health.date_label')}: ${formattedDate}\n\n${t('alert.arrival_fill_details')}`);
                  }, 500);
                }
              }}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white p-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-between group text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">💉</span>
                <span>{t('arrival.register_consultation')}</span>
              </div>
              <span className="text-base group-hover:translate-x-1 transition-transform">→</span>
            </button>

            <button
              onClick={() => {
                const hoje = localTodayISO();
                setGroomingFormData((prev) => ({
                  ...prev,
                  location: arrivalPlace.name,
                  location_address: arrivalPlace.address,
                  location_phone: arrivalPlace.phone || '',
                  date: hoje,
                  cost: 0,
                }));
                if (onNavigateToSaude) {
                  onNavigateToSaude('banho');
                }
              }}
              className="w-full bg-gradient-to-r from-sky-500 to-blue-500 text-white p-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-between group text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🛁</span>
                <span>{t('arrival.register_grooming')}</span>
              </div>
              <span className="text-base group-hover:translate-x-1 transition-transform">→</span>
            </button>

            <button
              onClick={() => {
                const hoje = localTodayISO();

                if (mostRecentParasite) {
                  setParasiteFormData((prev) => ({
                    ...prev,
                    type: mostRecentParasite.type,
                    product_name: mostRecentParasite.product_name,
                    purchase_location: arrivalPlace.name,
                    date_applied: hoje,
                    cost: 0,
                  }));
                  if (onNavigateToSaude) {
                    onNavigateToSaude('antiparasitario');
                  }
                  setTimeout(() => {
                    const formattedDate = new Date().toLocaleDateString(locale);
                    showBlockingNotice(`${t('alert.arrival_parasite_registered')}\n\n🦟 ${mostRecentParasite.product_name}\n📍 ${t('health.location_label')}: ${arrivalPlace.name}\n📅 ${t('health.date_label')}: ${formattedDate}\n\n${t('alert.arrival_vaccine_message')}`);
                  }, 500);
                } else {
                  setParasiteFormData((prev) => ({
                    ...prev,
                    purchase_location: arrivalPlace.name,
                    date_applied: hoje,
                    cost: 0,
                  }));
                  if (onNavigateToSaude) {
                    onNavigateToSaude('antiparasitario');
                  }
                  setTimeout(() => {
                    const formattedDate = new Date().toLocaleDateString(locale);
                    showBlockingNotice(`${t('alert.arrival_data_prefilled')}\n\n📍 ${t('health.location_label')}: ${arrivalPlace.name}\n📅 ${t('health.date_label')}: ${formattedDate}\n\n${t('alert.arrival_fill_product')}`);
                  }, 500);
                }
              }}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white p-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-between group text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🛒</span>
                <span>{t('arrival.register_purchase')}</span>
              </div>
              <span className="text-base group-hover:translate-x-1 transition-transform">→</span>
            </button>

            {!showAttendanceOptions ? (
              <button
                onClick={onOpenAttendanceOptions}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white p-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-between group text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🩺</span>
                  <span>{t('arrival.register_service')}</span>
                </div>
                <span className="text-base group-hover:translate-x-1 transition-transform">→</span>
              </button>
            ) : (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-300 rounded-lg p-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-purple-800">{t('arrival.service_type')}</span>
                  <button
                    onClick={onCloseAttendanceOptions}
                    className="text-purple-600 hover:text-purple-800 text-xs"
                  >
                    ✕ {t('arrival.back')}
                  </button>
                </div>
                <div className="space-y-1.5">
                  <button
                    onClick={() => {
                      const formattedDate = new Date().toLocaleDateString(locale);
                      showBlockingNotice(`${t('alert.consultation_registered')}\n\n📍 ${t('health.location_label')}: ${arrivalPlace.name}\n📅 ${t('health.date_label')}: ${formattedDate}\n\n${t('alert.add_more_details')}`);
                      onCloseArrivalFlow();
                    }}
                    className="w-full bg-white border border-purple-200 text-purple-800 p-2 rounded-lg font-medium hover:bg-purple-100 transition-all text-xs flex items-center gap-2"
                  >
                    <span className="text-base">👨‍⚕️</span>
                    <span>{t('arrival.consultation')}</span>
                  </button>
                  <button
                    onClick={() => {
                      const formattedDate = new Date().toLocaleDateString(locale);
                      showBlockingNotice(`${t('alert.procedure_registered')}\n\n📍 ${t('health.location_label')}: ${arrivalPlace.name}\n📅 ${t('health.date_label')}: ${formattedDate}\n\n${t('alert.add_more_details')}`);
                      onCloseArrivalFlow();
                    }}
                    className="w-full bg-white border border-purple-200 text-purple-800 p-2 rounded-lg font-medium hover:bg-purple-100 transition-all text-xs flex items-center gap-2"
                  >
                    <span className="text-base">💉</span>
                    <span>{t('arrival.procedure')}</span>
                  </button>
                  <button
                    onClick={() => {
                      const formattedDate = new Date().toLocaleDateString(locale);
                      showBlockingNotice(`${t('alert.exams_registered')}\n\n📍 ${t('health.location_label')}: ${arrivalPlace.name}\n📅 ${t('health.date_label')}: ${formattedDate}\n\n${t('alert.add_more_details')}`);
                      onCloseArrivalFlow();
                    }}
                    className="w-full bg-white border border-purple-200 text-purple-800 p-2 rounded-lg font-medium hover:bg-purple-100 transition-all text-xs flex items-center gap-2"
                  >
                    <span className="text-base">🧪</span>
                    <span>{t('arrival.exams')}</span>
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                const formattedDate = new Date().toLocaleDateString(locale);
                showBlockingNotice(`${t('alert.accommodation_registered')}\n\n📍 ${t('health.location_label')}: ${arrivalPlace.name}\n📅 ${t('health.check_in_date')}: ${formattedDate}\n\n${t('alert.add_more_info')}`);
                onCloseArrivalFlow();
              }}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-between group text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🏨</span>
                <span>{t('arrival.register_hosting')}</span>
              </div>
              <span className="text-base group-hover:translate-x-1 transition-transform">→</span>
            </button>

            <button
              onClick={onCloseArrivalFlow}
              className="w-full bg-gradient-to-r from-gray-400 to-gray-500 text-white p-2 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group text-xs"
            >
              <span className="text-lg">🚶</span>
              <span>{t('home.just_browsing')}</span>
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center mt-2">💡 {t('arrival.system_detected')}</p>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
