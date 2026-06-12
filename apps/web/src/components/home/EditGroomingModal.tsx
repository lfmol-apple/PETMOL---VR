'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { IosSwitch } from '@/components/ui/IosSwitch';
import type { GroomingRecord } from '@/lib/types/home';
import type { GroomingFormData, GroomingFormSetter } from '@/lib/types/homeForms';

type PlaceSuggestion = {
  place_id: string;
  name: string;
  rating?: number;
  formatted_address: string;
  formatted_phone_number?: string;
};

interface EditGroomingModalProps {
  editingGrooming: GroomingRecord;
  groomingFormData: GroomingFormData;
  setGroomingFormData: GroomingFormSetter;
  handleCancelEditGrooming: () => void;
  searchPlaces: (query: string) => void;
  placeSuggestions: PlaceSuggestion[];
  selectPlace: (place: PlaceSuggestion) => void;
  showPlaceSuggestions: boolean;
  setShowPlaceSuggestions: Dispatch<SetStateAction<boolean>>;
  searchingPlaces: boolean;
  handleSaveGrooming: () => void;
}

function createLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function EditGroomingModal({
  editingGrooming,
  groomingFormData,
  setGroomingFormData,
  handleCancelEditGrooming,
  searchPlaces,
  placeSuggestions,
  selectPlace,
  showPlaceSuggestions,
  setShowPlaceSuggestions,
  searchingPlaces,
  handleSaveGrooming,
}: EditGroomingModalProps) {
  const { t, locale } = useI18n();

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[70] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto overflow-hidden">
        <div className="sticky top-0 bg-gradient-to-r from-[#0066ff] to-cyan-500 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-t-2xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <span className="text-2xl sm:text-3xl flex-shrink-0">✏️</span>
              <div className="min-w-0">
                <h2 className="text-base sm:text-xl font-bold truncate">{t('grooming.edit_record')}</h2>
                <p className="text-blue-100 text-xs sm:text-sm truncate">
                  {groomingFormData.type === 'bath'
                    ? `🛁 ${t('grooming.bath')}`
                    : groomingFormData.type === 'grooming'
                      ? `✂️ ${t('grooming.grooming')}`
                      : `🛁✂️ ${t('grooming.bath')} + ${t('grooming.grooming')}`} • {createLocalDate(editingGrooming.date).toLocaleDateString(locale)}
                </p>
              </div>
            </div>
            <button
              onClick={handleCancelEditGrooming}
              className="text-white hover:text-gray-200 text-xl sm:text-2xl transition-colors flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
          <button
            type="button"
            onClick={() => window.open(
              'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('petshop'),
              '_blank',
              'noopener,noreferrer'
            )}
            className="w-full flex items-center justify-center sm:justify-between px-3 sm:px-4 py-3 sm:py-3.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md ring-2 ring-purple-300"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl">🛁</span>
              <span className="hidden sm:inline">Encontre petshops perto de vc</span>
              <span className="sm:hidden">Encontre petshops</span>
            </div>
            <span className="text-white/70 text-xs sm:text-sm ml-2 sm:ml-0">Maps ›</span>
          </button>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('grooming.service_type')} *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setGroomingFormData((prev) => ({ ...prev, type: 'bath', frequency_days: 14 }));
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border-2 transition-all ${
                  groomingFormData.type === 'bath'
                    ? 'border-[#0056D2] bg-blue-50 text-[#0047ad] shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <span className="text-lg">🛁</span>
                <span className="text-xs font-semibold">{t('grooming.bath')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setGroomingFormData((prev) => ({ ...prev, type: 'grooming', frequency_days: 45 }));
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border-2 transition-all ${
                  groomingFormData.type === 'grooming'
                    ? 'border-[#0056D2] bg-blue-50 text-[#0047ad] shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <span className="text-lg">✂️</span>
                <span className="text-xs font-semibold">{t('grooming.grooming')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setGroomingFormData((prev) => ({ ...prev, type: 'bath_grooming', frequency_days: 45 }));
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border-2 transition-all ${
                  groomingFormData.type === 'bath_grooming'
                    ? 'border-[#0056D2] bg-blue-50 text-[#0047ad] shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <span className="text-lg">🛁✂️</span>
                <span className="text-xs font-semibold">{t('grooming.complete')}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('grooming.service_date')} *
            </label>
            <input
              type="date"
              value={groomingFormData.date}
              onChange={(e) => setGroomingFormData((prev) => ({ ...prev, date: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
            />
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('grooming.location')}
            </label>
            <input
              type="text"
              value={groomingFormData.location}
              onChange={(e) => {
                const value = e.target.value.toUpperCase();
                setGroomingFormData((prev) => ({ ...prev, location: value }));
                searchPlaces(value);
              }}
              onFocus={() => {
                if (placeSuggestions.length > 0) {
                  setShowPlaceSuggestions(true);
                }
              }}
              placeholder={t('grooming.location_placeholder')}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0056D2] focus:border-transparent uppercase"
            />

            {showPlaceSuggestions && placeSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 border border-gray-300 max-h-60 overflow-y-auto bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
                {placeSuggestions.map((place) => (
                  <button
                    key={place.place_id}
                    type="button"
                    onClick={() => selectPlace(place)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                  >
                    <div className="font-semibold text-gray-800 flex items-center gap-2">
                      🏪 {place.name}
                      {place.rating && <span className="text-xs text-yellow-600">⭐ {place.rating}</span>}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">{place.formatted_address}</div>
                    {place.formatted_phone_number && (
                      <div className="text-sm text-[#0056D2] mt-1">📞 {place.formatted_phone_number}</div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {searchingPlaces && (
              <div className="absolute right-4 top-11 text-blue-500">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            )}

            {groomingFormData.location_address && (
              <div className="mt-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <div className="text-sm font-semibold text-blue-900 mb-2">{t('grooming.establishment_selected')}</div>
                <div className="text-sm text-[#0047ad] space-y-1">
                  <div>📍 {groomingFormData.location_address}</div>
                  {groomingFormData.location_phone && <div>📞 {groomingFormData.location_phone}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setGroomingFormData((prev) => ({
                      ...prev,
                      location: '',
                      location_address: '',
                      location_phone: '',
                      location_place_id: '',
                    }));
                  }}
                  className="text-sm text-red-600 hover:text-red-800 mt-2 underline"
                >
                  {t('grooming.clear_selection')}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('grooming.cost')} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={groomingFormData.cost || ''}
                onChange={(e) => setGroomingFormData((prev) => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
                step="0.01"
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-[#0056D2] focus:border-transparent ${
                  !groomingFormData.cost || groomingFormData.cost <= 0 ? 'border-red-300' : 'border-gray-300'
                }`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('grooming.next_in_days')}
              </label>
              <input
                type="number"
                value={groomingFormData.frequency_days || ''}
                onChange={(e) => setGroomingFormData((prev) => ({ ...prev, frequency_days: parseInt(e.target.value, 10) || 14 }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
              />
            </div>
          </div>

          <div className="bg-white border border-blue-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-800">🔔 Lembrete de próximo serviço</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600">
                  {groomingFormData.reminder_enabled ? '✅ Ativado' : '⭕ Desativado'}
                </span>
                <IosSwitch
                  checked={groomingFormData.reminder_enabled}
                  onChange={() => setGroomingFormData((prev) => ({ ...prev, reminder_enabled: !prev.reminder_enabled }))}
                  size="sm"
                />
              </div>
            </div>
            {groomingFormData.reminder_enabled && (
              <select
                value={groomingFormData.alert_days_before}
                onChange={(e) => setGroomingFormData((prev) => ({ ...prev, alert_days_before: parseInt(e.target.value, 10) }))}
                className="w-full p-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-[#0056D2] bg-white text-sm"
              >
                <option value={1}>1 dia antes</option>
                <option value={2}>2 dias antes</option>
                <option value={3}>3 dias antes (recomendado)</option>
                <option value={5}>5 dias antes</option>
                <option value={7}>7 dias antes</option>
              </select>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleCancelEditGrooming}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSaveGrooming}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-[#0066ff] to-cyan-500 text-white rounded-xl font-semibold hover:from-[#0056D2] hover:to-cyan-600 transition-all shadow-md"
            >
              💾 {t('grooming.update')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
