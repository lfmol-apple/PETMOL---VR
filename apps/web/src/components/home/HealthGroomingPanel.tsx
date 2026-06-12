'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { PremiumPanelShell } from '@/components/premium';
import { IosSwitch } from '@/components/ui/IosSwitch';
import type { GroomingRecord, PlaceDetails } from '@/lib/types/home';
import type { GroomingFormData } from '@/lib/types/homeForms';

interface HealthGroomingPanelProps {
  petName?: string;
  editingGrooming: GroomingRecord | null;
  groomingFormData: GroomingFormData;
  setGroomingFormData: Dispatch<SetStateAction<GroomingFormData>>;
  groomingDueAlerts: { petName: string; type: string; daysOverdue: number }[];
  setGroomingDueAlerts: (alerts: { petName: string; type: string; daysOverdue: number }[]) => void;
  groomingRecords: GroomingRecord[];
  handleDeleteGrooming: (record: GroomingRecord) => Promise<void>;
  handleEditGrooming: (record: GroomingRecord) => void;
  handleSaveGrooming: () => void;
  handleCancelEditGrooming: () => void;
  showPlaceSuggestions: boolean;
  setShowPlaceSuggestions: (v: boolean) => void;
  searchingPlaces: boolean;
  placeSuggestions: PlaceDetails[];
  searchPlaces: (q: string) => void;
  selectPlace: (place: PlaceDetails) => void;
}

function createLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function hasLaterGroomingRecord(records: GroomingRecord[], record: GroomingRecord): boolean {
  const recordTime = new Date(record.date || '0').getTime();
  return records.some((candidate) => {
    if (candidate.id === record.id || candidate.type !== record.type) return false;
    const candidateTime = new Date(candidate.date || '0').getTime();
    return !Number.isNaN(candidateTime) && (Number.isNaN(recordTime) || candidateTime > recordTime);
  });
}

export function HealthGroomingPanel({
  petName,
  editingGrooming,
  groomingFormData,
  setGroomingFormData,
  groomingDueAlerts,
  setGroomingDueAlerts,
  groomingRecords,
  handleDeleteGrooming,
  handleEditGrooming,
  handleSaveGrooming,
  handleCancelEditGrooming,
  showPlaceSuggestions,
  setShowPlaceSuggestions,
  searchingPlaces,
  placeSuggestions,
  searchPlaces,
  selectPlace,
}: HealthGroomingPanelProps) {
  const { t } = useI18n();

  function formatDateTimeReminder(dateStr: string, timeStr?: string) {
    const date = createLocalDate(dateStr);
    const dateFormatted = date.toLocaleDateString('pt-BR');
    if (timeStr) return `${dateFormatted} às ${timeStr}`;
    return dateFormatted;
  }

  return (
    <PremiumPanelShell title={t('health.grooming')} icon="🛁" subtitle={petName}>
      <div className="space-y-4 sm:space-y-6">
        {/* Formulário de Registro */}
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 sm:p-6 border border-blue-200">
          {/* Banner de lembretes pendentes */}
          {groomingDueAlerts.length > 0 && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2">
              <span className="text-lg mt-0.5">🔔</span>
              <div className="flex-1 min-w-0">
                {groomingDueAlerts.map((a, i) => (
                  <p key={i} className="text-sm font-medium text-amber-800">
                    {a.daysOverdue === 0
                      ? `Hoje é dia do ${a.type} de ${a.petName}!`
                      : `${a.type} de ${a.petName} está em atraso há ${a.daysOverdue} dia${a.daysOverdue > 1 ? 's' : ''}!`}
                  </p>
                ))}
              </div>
              <button onClick={() => setGroomingDueAlerts([])} className="text-amber-500 hover:text-amber-700 text-lg leading-none">×</button>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-blue-900 flex items-center gap-1.5">
              <span className="text-xl">🛁</span>
              {editingGrooming ? t('grooming.edit_service') : t('grooming.new_service')}
            </h3>
            <div className="flex items-center gap-2">
              {editingGrooming && (
                <button
                  onClick={handleCancelEditGrooming}
                  className="text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  {t('grooming.cancel_edit')}
                </button>
              )}
              <button
                type="button"
                onClick={() => window.open(
                  'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('petshop'),
                  '_blank', 'noopener,noreferrer'
                )}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md ring-2 ring-purple-300"
              >
                <span className="text-sm sm:text-base">🛁</span>
                <span className="hidden sm:inline">Encontre petshops perto de vc</span>
                <span className="sm:hidden">Petshops</span>
                <span className="text-white/70 text-xs">›</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {/* Tipo de Serviço */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('grooming.service_type_label')} *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'bath' as const, icon: '🛁', labelKey: 'grooming.bath', frequency: 14 },
                  { value: 'grooming' as const, icon: '✂️', labelKey: 'grooming.grooming_only', frequency: 45 },
                  { value: 'bath_grooming' as const, icon: '🛁✂️', labelKey: 'grooming.bath_grooming', frequency: 45 },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setGroomingFormData((prev) => ({ ...prev, type: option.value, frequency_days: option.frequency }))}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border-2 transition-all ${
                      groomingFormData.type === option.value
                        ? 'border-[#0056D2] bg-blue-50 text-[#0047ad]'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <span className="text-lg">{option.icon}</span>
                    <span className="text-xs font-semibold">{t(option.labelKey as Parameters<typeof t>[0])}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Data + Horário */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('grooming.service_date_label')} *
                </label>
                <input
                  type="date"
                  value={groomingFormData.date}
                  onChange={(e) => setGroomingFormData((prev) => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('grooming.scheduled_time')} 🕐
                </label>
                <input
                  type="time"
                  value={groomingFormData.scheduled_time}
                  onChange={(e) => setGroomingFormData((prev) => ({ ...prev, scheduled_time: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm"
                  placeholder="--:--"
                />
                <p className="mt-1 text-xs text-gray-400">{t('grooming.time_reminder_hint')}</p>
              </div>
            </div>

            {/* Local com Autocomplete */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('grooming.location_label')}
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
                  if (placeSuggestions.length > 0) setShowPlaceSuggestions(true);
                }}
                placeholder={t('grooming.location_search')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] uppercase"
              />

              {showPlaceSuggestions && placeSuggestions.length > 0 && (
                <div className="absolute z-[200] w-full mt-1 border border-gray-300 max-h-48 overflow-y-auto bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
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
                <div className="absolute right-3 top-10 text-blue-500">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              )}

              {groomingFormData.location_address && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-sm font-medium text-blue-900 mb-1">✓ Estabelecimento selecionado</div>
                  <div className="text-xs text-[#0047ad]">📍 {groomingFormData.location_address}</div>
                  {groomingFormData.location_phone && (
                    <div className="text-xs text-[#0047ad] mt-1">📞 {groomingFormData.location_phone}</div>
                  )}
                  <button
                    type="button"
                    onClick={() => setGroomingFormData((prev) => ({
                      ...prev,
                      location: '',
                      location_address: '',
                      location_phone: '',
                      location_place_id: '',
                    }))}
                    className="text-xs text-red-600 hover:text-red-800 mt-2 underline"
                  >
                    Limpar seleção
                  </button>
                </div>
              )}

              <p className="text-xs text-gray-500 mt-1">{t('grooming.location_hint')}</p>
            </div>

            {/* Custo + Frequência */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  💰 Valor (R$) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={groomingFormData.cost || ''}
                  onChange={(e) => setGroomingFormData((prev) => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                  step="0.01"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm ${
                    !groomingFormData.cost || groomingFormData.cost <= 0 ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">🔁 Repetir em</label>
                <select
                  value={groomingFormData.frequency_days}
                  onChange={(e) => setGroomingFormData((prev) => ({ ...prev, frequency_days: parseInt(e.target.value, 10) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm bg-white"
                >
                  <option value={7}>7 dias</option>
                  <option value={14}>14 dias</option>
                  <option value={21}>21 dias</option>
                  <option value={30}>30 dias</option>
                  <option value={45}>45 dias</option>
                  <option value={60}>60 dias</option>
                </select>
              </div>
            </div>

            {/* Lembrete */}
            <div className="bg-white border border-blue-200 rounded-lg p-3 space-y-2">
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

            {/* Botão Salvar */}
            <div className="sticky bottom-0 bg-white z-10 pt-3 -mx-4 px-4 pb-3 border-t border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
              <button
                onClick={handleSaveGrooming}
                className="w-full px-4 py-3 bg-gradient-to-r from-[#0066ff] to-cyan-500 text-white rounded-xl font-semibold hover:from-[#0056D2] hover:to-cyan-600 text-base"
              >
                {editingGrooming ? `💾 ${t('grooming.update')}` : `💾 ${t('grooming.save_record')}`}
              </button>
            </div>
          </div>
        </div>

        {/* Histórico de Serviços */}
        {groomingRecords.length > 0 && (
          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              📋 {t('grooming.service_history')} ({groomingRecords.length})
            </h3>
            <div className="space-y-3">
              {groomingRecords.map((record) => {
                const typeLabels: Record<string, string> = {
                  bath: `🛁 ${t('grooming.bath')}`,
                  grooming: `✂️ ${t('grooming.grooming_only')}`,
                  bath_grooming: `🛁✂️ ${t('grooming.bath_plus_grooming')}`,
                };
                const nextTypeLabel: Record<string, string> = {
                  bath: 'Próximo Banho',
                  grooming: 'Próxima Tosa',
                  bath_grooming: 'Próximo Banho e Tosa',
                };

                const latestGroomIdForType = groomingRecords
                const isGroomHistory = hasLaterGroomingRecord(groomingRecords, record);
                const nextRecommendedDate = record.next_recommended_date ? createLocalDate(record.next_recommended_date) : null;
                const nextRecommendedDaysLeft = nextRecommendedDate
                  ? Math.ceil((nextRecommendedDate.getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000))
                  : null;
                const isGroomOverdue = !isGroomHistory && nextRecommendedDaysLeft !== null && nextRecommendedDaysLeft < 0;
                const isGroomUrgent = !isGroomHistory && nextRecommendedDaysLeft !== null && nextRecommendedDaysLeft >= 0 && nextRecommendedDaysLeft <= 7;

                return (
                  <div
                    key={record.id}
                    className={`bg-white border rounded-lg p-4 hover:shadow-md transition-shadow ${
                      isGroomHistory ? 'border-gray-100 opacity-75' : 'border-gray-200'
                    }`}
                  >
                    {isGroomHistory && (
                      <span className="inline-block text-[10px] font-semibold bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full mb-2">
                        Histórico — substituído por registro mais recente
                      </span>
                    )}
                    <div className="flex items-center justify-between mb-2">
                       <div className="flex items-center gap-2">
                        <div className="relative">
                          <span className="font-bold text-gray-900 text-sm">{typeLabels[record.type]}</span>
                          {isGroomOverdue && (
                            <div className="absolute -top-3 -left-3 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold animate-pulse shadow-sm border border-white/50 z-10">
                              !
                            </div>
                          )}
                          {isGroomUrgent && !isGroomOverdue && (
                            <div className="absolute -top-3 -left-3 w-6 h-6 flex items-center justify-center animate-pulse z-10">
                              <span
                                className="absolute inset-0 bg-amber-400 shadow-sm ring-2 ring-white"
                                style={{ clipPath: 'polygon(50% 0%, 100% 92%, 0% 92%)' }}
                              />
                              <span className="relative mt-1 text-[11px] font-black text-amber-950 leading-none">!</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {record.cost && record.cost > 0 && (
                        <span className="text-sm font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                          R$ {record.cost.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-gray-500 mb-2">
                      🗓 {formatDateTimeReminder(record.date, record.scheduled_time)}
                    </div>

                    {(record.location || record.location_address) && (
                      <div className="mb-1">
                        {record.location && <div className="text-xs font-medium text-gray-700">📍 {record.location}</div>}
                        {record.location_address && (
                          <div className="text-xs text-gray-400 pl-5 leading-snug">{record.location_address}</div>
                        )}
                        {record.location_phone && (
                          <div className="text-xs text-[#0056D2] pl-5">📞 {record.location_phone}</div>
                        )}
                      </div>
                    )}

                    {record.groomer && <div className="text-xs text-gray-600 mb-2">👤 {record.groomer}</div>}

                    <div className="flex flex-col gap-2 mt-3 pt-2 border-t border-gray-100">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditGrooming(record)}
                          className="px-3 py-1 bg-blue-100 text-[#0047ad] rounded-lg hover:bg-blue-200 text-sm font-medium transition-colors"
                          title={t('common.edit')}
                        >
                          ✏️ {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleDeleteGrooming(record)}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium transition-colors"
                          title={t('common.delete')}
                        >
                          🗑️ {t('common.delete')}
                        </button>
                      </div>
                      {!isGroomHistory && record.next_recommended_date && (
                        <div className="text-xs text-blue-600 font-medium">
                          🔔 {nextTypeLabel[record.type]}: {createLocalDate(record.next_recommended_date).toLocaleDateString('pt-BR')}
                          {record.scheduled_time ? ` às ${record.scheduled_time}` : ''}
                        </div>
                      )}
                    </div>

                    {record.notes && (
                      <div className="mt-2 text-xs text-gray-500 italic">💬 {record.notes}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </PremiumPanelShell>
  );
}
