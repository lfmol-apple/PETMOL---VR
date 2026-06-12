'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { PremiumPanelShell } from '@/components/premium';
import { IosSwitch } from '@/components/ui/IosSwitch';
import type { ParasiteControl, ParasiteControlType } from '@/lib/types/home';
import type { ParasiteFormData } from '@/lib/types/homeForms';
import { dateToLocalISO } from '@/lib/localDate';

interface HealthParasiteControlPanelProps {
  petName?: string;
  parasiteControls: ParasiteControl[];
  showParasiteForm: boolean;
  setShowParasiteForm: (value: boolean) => void;
  editingParasite: ParasiteControl | null;
  parasiteFormData: ParasiteFormData;
  setParasiteFormData: Dispatch<SetStateAction<ParasiteFormData>>;
  handleDeleteParasite: (parasite: ParasiteControl) => void;
  handleEditParasite: (parasite: ParasiteControl) => void;
  handleSaveParasite: () => void;
  resetParasiteForm: () => void;
}

const PARASITE_TYPES: Array<{
  value: ParasiteControlType;
  labelKey: 'parasite.dewormer' | 'parasite.flea_tick' | 'parasite.collar';
  icon: string;
  frequencyDays: number;
  applicationForm: ParasiteFormData['application_form'];
}> = [
  { value: 'dewormer', labelKey: 'parasite.dewormer', icon: '🪱', frequencyDays: 90, applicationForm: 'oral' },
  { value: 'flea_tick', labelKey: 'parasite.flea_tick', icon: '🦟', frequencyDays: 30, applicationForm: 'topical' },
  { value: 'collar', labelKey: 'parasite.collar', icon: '⭕', frequencyDays: 180, applicationForm: 'collar' },
];

function createLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function calculateNextDose(dateApplied: string, frequencyDays: number): string {
  const date = createLocalDate(dateApplied);
  date.setDate(date.getDate() + frequencyDays);
  return dateToLocalISO(date);
}

export function HealthParasiteControlPanel({
  petName,
  parasiteControls,
  showParasiteForm,
  setShowParasiteForm,
  editingParasite,
  parasiteFormData,
  setParasiteFormData,
  handleDeleteParasite,
  handleEditParasite,
  handleSaveParasite,
  resetParasiteForm,
}: HealthParasiteControlPanelProps) {
  const { t, locale } = useI18n();

  return (
    <PremiumPanelShell title={t('health.parasite_control')} icon="💊" subtitle={petName}>
      <div className="space-y-6">
        {!showParasiteForm && (
          <button
            onClick={() => setShowParasiteForm(true)}
            className="w-full bg-gradient-to-r from-amber-400 to-orange-400 text-white py-3 px-4 rounded-lg font-semibold hover:from-amber-500 hover:to-orange-500 transition-all shadow-md"
          >
            ➕ {t('parasite.register_application')}
          </button>
        )}

        {showParasiteForm && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <span>🦠</span>
                {editingParasite ? t('parasite.edit_record') : t('parasite.new_record')}
              </h3>
              <button onClick={resetParasiteForm} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            <p className="text-xs text-gray-500 bg-white border border-blue-100 rounded-lg px-3 py-2">
              📝 {t('parasite.reminders_organizational')} {t('parasite.consult_vet')}
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de Controle *</label>
              <div className="grid grid-cols-3 gap-2">
                {PARASITE_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => {
                      setParasiteFormData((prev) => ({
                        ...prev,
                        type: type.value,
                        frequency_days: type.frequencyDays,
                        application_form: type.applicationForm,
                      }));
                      window.setTimeout(() => {
                        const formElement = document.querySelector('[data-parasite-form]');
                        if (formElement) formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 150);
                    }}
                    className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg border-2 transition-all ${
                      parasiteFormData.type === type.value
                        ? 'border-amber-500 bg-amber-100 text-amber-900'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-amber-300'
                    }`}
                  >
                    <span className="text-xl">{type.icon}</span>
                    <span className="text-[11px] font-semibold leading-tight text-center">{t(type.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div data-parasite-form>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {parasiteFormData.type === 'dewormer' && `🪱 ${t('parasite.dewormer')} *`}
                {parasiteFormData.type === 'flea_tick' && `🦟 ${t('parasite.flea_tick')} *`}
                {parasiteFormData.type === 'collar' && `⭕ ${t('parasite.collar')} *`}
                {!parasiteFormData.type && 'Produto *'}
              </label>
              <input
                type="text"
                list={`products-${parasiteFormData.type}`}
                value={parasiteFormData.product_name}
                onChange={(e) => setParasiteFormData((prev) => ({ ...prev, product_name: e.target.value }))}
                placeholder={t('parasite.type_or_choose')}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                autoComplete="off"
              />
              <datalist id={`products-${parasiteFormData.type}`}>
                {parasiteFormData.type === 'dewormer' && (<><option value="Drontal Plus" /><option value="Endogard" /><option value="Vercom" /><option value="Milbemax" /><option value="Panacur" /><option value="Total Full" /><option value="Canex" /></>)}
                {parasiteFormData.type === 'flea_tick' && (<><option value="Bravecto" /><option value="Simparic" /><option value="NexGard" /><option value="Advocate" /><option value="Revolution" /><option value="Frontline" /><option value="Advantage" /><option value="Comfortis" /></>)}
                {parasiteFormData.type === 'collar' && (<><option value="Seresto" /><option value="Scalibor" /><option value="Preventic" /></>)}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {parasiteFormData.type === 'collar' ? t('parasite.collar_date') : t('parasite.application_date')} *
                </label>
                <input
                  type="date"
                  value={parasiteFormData.date_applied}
                  onChange={(e) => setParasiteFormData((prev) => ({ ...prev, date_applied: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {parasiteFormData.type === 'collar' ? 'Validade (dias) *' : 'Repetir a cada *'}
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={parasiteFormData.frequency_days > 365 ? 0 : parasiteFormData.frequency_days}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (value > 0) {
                        setParasiteFormData((prev) => ({ ...prev, frequency_days: value }));
                      }
                    }}
                    className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                  >
                    <option value={0}>Personalizado</option>
                    <option value={15}>15 dias</option>
                    <option value={21}>21 dias</option>
                    <option value={30}>30 dias ⭐</option>
                    <option value={60}>60 dias</option>
                    <option value={90}>90 dias ⭐</option>
                    <option value={120}>120 dias</option>
                    <option value={150}>150 dias</option>
                    <option value={180}>180 dias ⭐</option>
                    <option value={240}>240 dias ⭐</option>
                    <option value={365}>365 dias</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={parasiteFormData.frequency_days}
                    onChange={(e) => setParasiteFormData((prev) => ({ ...prev, frequency_days: parseInt(e.target.value, 10) || 30 }))}
                    className="w-14 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-center font-semibold text-sm"
                  />
                </div>
              </div>
            </div>

            {parasiteFormData.date_applied && parasiteFormData.frequency_days > 0 && (
              <div className="bg-amber-100 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-800">
                📅 {parasiteFormData.type === 'collar' ? 'Trocar coleira em: ' : 'Próxima aplicação: '}
                <span className="font-semibold">{calculateNextDose(parasiteFormData.date_applied, parasiteFormData.frequency_days)}</span>
                <span className="text-amber-600 ml-1">({parasiteFormData.frequency_days} dias)</span>
              </div>
            )}

            {parasiteFormData.type !== 'collar' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Formato</label>
                  <select
                    value={parasiteFormData.application_form}
                    onChange={(e) => setParasiteFormData((prev) => ({ ...prev, application_form: e.target.value as ParasiteFormData['application_form'] }))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                  >
                    {parasiteFormData.type === 'dewormer' && (<><option value="oral">💊 Comprimido/Oral</option><option value="topical">💧 Pasta/Suspensão</option></>)}
                    {parasiteFormData.type === 'flea_tick' && (<><option value="topical">💧 Pipeta/Tópico</option><option value="oral">💊 Comprimido</option><option value="collar">⭕ Coleira</option></>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Dosagem <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <input
                    type="text"
                    value={parasiteFormData.dosage}
                    onChange={(e) => setParasiteFormData((prev) => ({ ...prev, dosage: e.target.value }))}
                    placeholder={
                      parasiteFormData.application_form === 'topical' ? '1 pipeta' :
                      parasiteFormData.application_form === 'oral' ? '1 comprimido' : 'dose/qtd'
                    }
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
            )}
            {parasiteFormData.type === 'collar' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Formato</label>
                <select value="collar" disabled className="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-500">
                  <option value="collar">⭕ Coleira (Leishmaniose)</option>
                </select>
              </div>
            )}

            {parasiteFormData.type === 'collar' && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <span>⚠️</span>
                <p className="text-xs text-red-800">
                  <span className="font-bold">Leishmaniose — Doença Grave.</span> Vacina descontinuada no Brasil. Use coleira repelente + tópico mensal. Evite passeios no amanhecer/entardecer. Consulte seu veterinário.
                </p>
              </div>
            )}

            <div className="bg-white border border-blue-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">🔔 Lembrete de compra</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600">
                    {parasiteFormData.reminder_enabled ? '✅ Ativado' : '⭕ Desativado'}
                  </span>
                  <IosSwitch
                    checked={parasiteFormData.reminder_enabled}
                    onChange={() => setParasiteFormData((prev) => ({ ...prev, reminder_enabled: !prev.reminder_enabled }))}
                    size="sm"
                  />
                </div>
              </div>
              {parasiteFormData.reminder_enabled && (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={parasiteFormData.alert_days_before || 7}
                    onChange={(e) => setParasiteFormData((prev) => ({ ...prev, alert_days_before: parseInt(e.target.value, 10) }))}
                    className="w-full p-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-[#0056D2] bg-white text-sm"
                  >
                    <option value={3}>3 dias antes</option>
                    <option value={5}>5 dias antes</option>
                    <option value={7}>7 dias antes</option>
                    <option value={10}>10 dias antes</option>
                    <option value={15}>15 dias antes</option>
                    <option value={20}>20 dias antes</option>
                    <option value={30}>30 dias antes</option>
                  </select>
                  <input
                    type="time"
                    value={parasiteFormData.reminder_time || '09:00'}
                    onChange={(e) => setParasiteFormData((prev) => ({ ...prev, reminder_time: e.target.value }))}
                    className="w-full p-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-[#0056D2] bg-white text-sm"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">💰 Custo (R$) <span className="text-gray-400 font-normal text-xs">(opcional)</span></label>
                <input
                  type="number"
                  value={parasiteFormData.cost}
                  onChange={(e) => setParasiteFormData((prev) => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                  step="0.01"
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">🏪 Local <span className="text-gray-400 font-normal text-xs">(opcional)</span></label>
                <input
                  type="text"
                  list="purchase-locations"
                  autoComplete="off"
                  value={parasiteFormData.purchase_location || ''}
                  onChange={(e) => setParasiteFormData((prev) => ({ ...prev, purchase_location: e.target.value.toUpperCase() }))}
                  placeholder="Petz, Cobasi…"
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                />
                <datalist id="purchase-locations">
                  <option value="Petz" /><option value="Cobasi" /><option value="Petland" /><option value="Petlove.com.br" /><option value="Amazon.com.br" /><option value="Pague Menos" /><option value="Clínica veterinária" /><option value="Outro" />
                </datalist>
              </div>
            </div>

            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              ⚕️ Registro pessoal para organização. Consulte seu veterinário sobre produtos, dosagens e frequências.
            </p>

            <div className="sticky bottom-0 bg-white z-10 pt-3 pb-3 -mx-4 px-4 border-t border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] flex gap-2">
              <button
                onClick={handleSaveParasite}
                className="flex-1 bg-gradient-to-r from-amber-400 to-orange-400 text-white py-3 px-4 rounded-xl font-semibold hover:from-amber-500 hover:to-orange-500 transition-all text-base"
              >
                {editingParasite ? `💾 ${t('common.save')}` : `✅ ${t('common.save')}`}
              </button>
              <button
                onClick={resetParasiteForm}
                className="px-5 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-all font-medium text-base"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="font-bold text-gray-800">📋 {t('parasite.history_records')} ({parasiteControls.length} {t('parasite.records_count')})</h3>

          {parasiteControls.length === 0 && !showParasiteForm && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">🦠</div>
              <p>Nenhum registro ainda</p>
              <p className="text-sm">Clique em &quot;Registrar Aplicação&quot; para começar</p>
            </div>
          )}

          {parasiteControls.map((control) => {
            const controlTime = new Date(control.date_applied || '0').getTime();
            const isHistory = parasiteControls.some((item) => {
              if (item.id === control.id || item.type !== control.type) return false;
              const itemTime = new Date(item.date_applied || '0').getTime();
              return !Number.isNaN(itemTime) && (Number.isNaN(controlTime) || itemTime > controlTime);
            });

            const nextDate = new Date(control.next_due_date || '');
            const today = new Date();
            const daysLeft = Math.ceil((nextDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
            const isOverdue = !isHistory && daysLeft < 0;
            const isUrgent = !isHistory && daysLeft <= 7 && daysLeft >= 0;

            return (
              <div
                key={control.id}
                className={`border-2 rounded-xl p-4 transition-all ${
                  isHistory
                    ? 'border-gray-100 bg-gray-50/40 opacity-80'
                    : isOverdue
                    ? 'border-red-300 bg-red-50'
                    : isUrgent
                    ? 'border-yellow-300 bg-yellow-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {isHistory && (
                  <span className="inline-block text-[10px] font-semibold bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full mb-2">
                    Histórico — substituído por registro mais recente
                  </span>
                )}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="relative">
                        <span className="text-2xl">
                          {control.type === 'dewormer' && '🪱'}
                          {control.type === 'flea_tick' && '🦟'}
                          {control.type === 'heartworm' && '❤️'}
                          {control.type === 'collar' && '⭕'}
                          {control.type === 'leishmaniasis' && '💉'}
                        </span>
                        {isOverdue && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold animate-pulse shadow-sm border border-white/50 z-10">
                            !
                          </div>
                        )}
                        {isUrgent && !isOverdue && (
                          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 flex items-center justify-center animate-pulse z-10">
                            <span
                              className="absolute inset-0 bg-amber-400 shadow-sm ring-2 ring-white"
                              style={{ clipPath: 'polygon(50% 0%, 100% 92%, 0% 92%)' }}
                            />
                            <span className="relative mt-1 text-[11px] font-black text-amber-950 leading-none">!</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-gray-800">{control.product_name}</div>
                        <div className="text-xs text-gray-500">
                          {control.type === 'dewormer' && `${t('parasite.worm_control')} (${t('parasite.every_3_months')})`}
                          {control.type === 'flea_tick' && t('parasite.flea')}
                          {control.type === 'heartworm' && t('parasite.heartworm')}
                          {control.type === 'collar' && t('parasite.collar_repellent')}
                          {control.type === 'leishmaniasis' && t('parasite.leishmaniasis')}
                        </div>
                        {control.application_form && (
                          <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            {control.application_form === 'oral' && '💊 Comprimido'}
                            {control.application_form === 'topical' && '💧 Pipeta'}
                            {control.application_form === 'collar' && '⭕ Coleira'}
                            {control.application_form === 'injection' && '💉 Injeção'}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-sm space-y-1 text-gray-700">
                      <div>📅 {t('health.applied_date')}: {createLocalDate(control.date_applied).toLocaleDateString(locale)}</div>
                      <div className={isOverdue ? 'text-red-600 font-bold' : isUrgent ? 'text-yellow-700 font-bold' : ''}>
                        📅 {t('health.next_date')}: {nextDate.toLocaleDateString(locale)}
                        {isOverdue && ` (${t('health.days_overdue')} ${Math.abs(daysLeft)} ${t('health.days_remaining')}) ⚠️`}
                        {isUrgent && ` (${daysLeft} ${t('health.days_remaining')}) ⚠️`}
                      </div>
                      {control.type === 'collar' && control.collar_expiry_date && (
                        <div className="text-[#0047ad] font-medium">
                          ⭕ {t('health.collar_expiry')}: {createLocalDate(control.collar_expiry_date).toLocaleDateString(locale)}
                        </div>
                      )}
                      {control.dosage && <div>💊 Dose: {control.dosage}</div>}
                      {control.veterinarian && <div>👨‍⚕️ {control.veterinarian}</div>}
                      {control.cost && control.cost > 0 && <div>💰 R$ {control.cost.toFixed(2)}</div>}
                      {control.purchase_location && <div className="text-sm text-gray-600">🏪 {control.purchase_location}</div>}
                      <div className="flex items-center gap-2 mt-2">
                        {control.reminder_enabled !== false ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                            🔔 Lembrete ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-300">
                            🔕 Sem lembrete
                          </span>
                        )}
                        {control.reminder_enabled !== false && control.alert_days_before && (
                          <span className="text-xs text-gray-500">
                            (alerta {control.alert_days_before} dias antes)
                          </span>
                        )}
                      </div>
                      {control.notes && <div className="text-xs text-gray-600 mt-2">📝 {control.notes}</div>}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => handleEditParasite(control)}
                      className="px-3 py-1 bg-blue-100 text-[#0047ad] rounded-lg hover:bg-blue-200 text-sm font-medium transition-colors"
                      title="Editar"
                    >
                      ✏️ {t('common.edit')}
                    </button>
                    <button
                      onClick={() => handleDeleteParasite(control)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium transition-colors"
                      title="Excluir"
                    >
                      🗑️ {t('common.delete')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PremiumPanelShell>
  );
}
