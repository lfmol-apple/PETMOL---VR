'use client';

import type { Dispatch, SetStateAction } from 'react';
import { PremiumPanelShell } from '@/components/premium';
import { IosSwitch } from '@/components/ui/IosSwitch';
import { parsePetEventExtraData, type PetEventRecord } from '@/lib/petEvents';
import type { EventFormState } from '@/hooks/usePetEventManagement';
import { localTodayISO } from '@/lib/localDate';
import { ProductBarcodeScanner } from '@/components/ProductBarcodeScanner';
import type { ScannedProduct } from '@/lib/productScanner';

interface HealthMedicationPanelProps {
  petName: string | undefined;
  selectedPetId: string | null;
  eventFormData: EventFormState;
  setEventFormData: Dispatch<SetStateAction<EventFormState>>;
  editingEventId: string | null;
  eventSaving: boolean;
  petEvents: PetEventRecord[];
  eventsLoading: boolean;
  saveMedication: () => Promise<void>;
  cancelMedicationForm: () => void;
  openEditEvent: (event: PetEventRecord) => void;
  handleDeleteEvent: (eventId: string) => void;
}

export function HealthMedicationPanel({
  petName,
  selectedPetId,
  eventFormData,
  setEventFormData,
  editingEventId,
  eventSaving,
  petEvents,
  eventsLoading,
  saveMedication,
  cancelMedicationForm,
  openEditEvent,
  handleDeleteEvent,
}: HealthMedicationPanelProps) {
  const applyCustomInterval = (value: string) => {
    const days = parseInt(value, 10);
    setEventFormData(prev => {
      const next = { ...prev, custom_interval_days: value };
      if (Number.isFinite(days) && days > 0 && prev.scheduled_at) {
        const base = new Date(prev.scheduled_at);
        if (!Number.isNaN(base.getTime())) {
          base.setDate(base.getDate() + days);
          next.reminder_date = base.toISOString().slice(0, 10);
          next.next_due_date = base.toISOString().slice(0, 10);
        }
      }
      return next;
    });
  };

  return (
    <PremiumPanelShell title="Medicação" icon="💊" subtitle={petName}>
      <div className="space-y-4">
        {/* Formulário de nova medicação */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
          <h4 className="font-bold text-gray-800 text-sm">
            {editingEventId ? '✏️ Editar medicação' : 'Novo registro médico'}
          </h4>

          {/* Tipo fixo: Prescrição / Medicação */}
          <div className="bg-gradient-to-r from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">💊</span>
              <span className="font-semibold text-gray-800">Prescrição / Medicação</span>
            </div>
          </div>

          {/* Escanear é a via principal de identificação — mais preciso que
              digitar a mão. */}
          <ProductBarcodeScanner
            label="Escanear medicamento"
            expectedCategory="medication"
            defaultMode="scan"
            petId={selectedPetId ?? undefined}
            petName={petName}
            onProductConfirmed={(product: ScannedProduct) => {
              setEventFormData(prev => ({
                ...prev,
                title: [product.brand, product.name].filter(Boolean).join(' ').trim() || prev.title,
                notes: [prev.notes, product.barcode ? `Código de barras: ${product.barcode}` : ''].filter(Boolean).join('\n'),
              }));
            }}
          />

          {/* Nome do medicamento */}
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">
              Nome do medicamento *
            </label>
            <input
              type="text"
              placeholder="Ex: Amoxicilina, Prednisolona..."
              value={eventFormData.title}
              onChange={e => setEventFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>

          {/* Data e hora */}
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">Data e hora *</label>
            <input
              type="datetime-local"
              value={eventFormData.scheduled_at}
              onChange={e => setEventFormData(prev => ({ ...prev, scheduled_at: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>

          {/* Veterinário prescritor */}
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">
              Veterinário prescritor
            </label>
            <input
              type="text"
              placeholder="Dr. Nome"
              value={eventFormData.professional_name}
              onChange={e =>
                setEventFormData(prev => ({ ...prev, professional_name: e.target.value }))
              }
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>

          {/* Dose + Via */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Dose</label>
              <input
                type="text"
                placeholder="Ex: 1 comprimido, 5ml"
                value={eventFormData.dose}
                onChange={e => setEventFormData(prev => ({ ...prev, dose: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Via</label>
              <select
                value={eventFormData.route}
                onChange={e => setEventFormData(prev => ({ ...prev, route: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              >
                <option value="oral">💊 Oral</option>
                <option value="injetavel">💉 Injetável</option>
                <option value="topico">🖐 Tópico</option>
                <option value="oftalmico">👁️ Oftálmico</option>
                <option value="auricular">👂 Auricular</option>
                <option value="inalatorio">💨 Inalatório</option>
              </select>
            </div>
          </div>

          {/* Frequência */}
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">Frequência</label>
            <select
              value={eventFormData.frequency}
              onChange={e => setEventFormData(prev => ({ ...prev, frequency: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="dose_unica">💊 Dose única</option>
              <option value="1x_dia">1× ao dia</option>
              <option value="2x_dia">2× ao dia</option>
              <option value="3x_dia">3× ao dia</option>
              <option value="8h">A cada 8 horas</option>
              <option value="12h">A cada 12 horas</option>
              <option value="48h">A cada 48 horas</option>
              <option value="personalizado">Intervalo personalizado</option>
              <option value="semanal">Semanal</option>
              <option value="conforme_necessidade">Conforme necessidade (SOS)</option>
            </select>
          </div>

          {eventFormData.frequency === 'personalizado' && (
            <div className="grid grid-cols-2 gap-2 p-3 bg-purple-50 rounded-xl border border-purple-200">
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">
                  Próxima dose em
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    placeholder="15"
                    value={eventFormData.custom_interval_days}
                    onChange={e => applyCustomInterval(e.target.value)}
                    className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">dias</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">
                  Total de doses
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  placeholder="2"
                  value={eventFormData.total_doses}
                  onChange={e => setEventFormData(prev => ({ ...prev, total_doses: e.target.value }))}
                  className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
                />
              </div>
            </div>
          )}

          {/* Lembrete de medicação */}
          <div className="flex items-center justify-between gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <span className="text-sm font-medium text-amber-800">
              🔔 Quero lembretes desta medicação
            </span>
            <IosSwitch
              checked={eventFormData.reminder_enabled}
              onChange={() => {
                setEventFormData(prev => {
                  if (prev.reminder_enabled) return { ...prev, reminder_enabled: false, reminder_date: '' };
                  const today = localTodayISO();
                  const evDate = prev.scheduled_at.split('T')[0];
                  const autoDate = prev.reminder_date
                    ? prev.reminder_date
                    : evDate >= today
                      ? evDate
                      : today;
                  return { ...prev, reminder_enabled: true, reminder_date: autoDate };
                });
              }}
              size="sm"
            />
          </div>

          {/* Configuração de lembretes — multi-time */}
          {eventFormData.reminder_enabled && (
            <div className="space-y-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">
                  📅 Data do 1º lembrete
                </label>
                <input
                  type="date"
                  value={eventFormData.reminder_date}
                  onChange={e =>
                    setEventFormData(prev => ({ ...prev, reminder_date: e.target.value }))
                  }
                  className="w-full border border-amber-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                />
              </div>

              {/* Horários de lembrete — múltiplos horários por dia */}
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1.5">
                  ⏰ Horários dos lembretes
                </label>
                <div className="space-y-2">
                  {eventFormData.reminder_times.map((time, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={time}
                        onChange={e => {
                          const updated = [...eventFormData.reminder_times];
                          updated[idx] = e.target.value;
                          setEventFormData(prev => ({
                            ...prev,
                            reminder_times: updated,
                            reminder_time: updated[0] || '08:00',
                          }));
                        }}
                        className="flex-1 border border-amber-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      />
                      {eventFormData.reminder_times.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = eventFormData.reminder_times.filter(
                              (_, i) => i !== idx,
                            );
                            setEventFormData(prev => ({
                              ...prev,
                              reminder_times: updated,
                              reminder_time: updated[0] || '08:00',
                            }));
                          }}
                          className="w-8 h-8 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-sm hover:bg-red-200 transition-colors flex-shrink-0"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {eventFormData.reminder_times.length < 6 && (
                    <button
                      type="button"
                      onClick={() => {
                        const last =
                          eventFormData.reminder_times[eventFormData.reminder_times.length - 1] ||
                          '08:00';
                        const [h, m] = last.split(':').map(Number);
                        const nextH = (h + 8) % 24;
                        const suggested = `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                        setEventFormData(prev => ({
                          ...prev,
                          reminder_times: [...prev.reminder_times, suggested],
                        }));
                      }}
                      className="w-full py-2 border border-dashed border-amber-300 rounded-xl text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      + Adicionar horário
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-amber-600 mt-1.5 px-1">
                  Ex: 08:00 / 14:00 / 20:00 para 3× ao dia
                </p>
              </div>

              {eventFormData.frequency !== 'personalizado' && (
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">
                  📆 Duração do tratamento
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    placeholder="Ex: 7"
                    value={eventFormData.treatment_days}
                    onChange={e =>
                      setEventFormData(prev => ({ ...prev, treatment_days: e.target.value }))
                    }
                    className="w-full border border-amber-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">dias</span>
                </div>
              </div>
              )}

              <p className="text-xs text-amber-700 bg-amber-100 rounded-lg px-2 py-1.5">
                {(() => {
                  const freqLabel: Record<string, string> = {
                    dose_unica: 'dose única',
                    '1x_dia': '1× ao dia',
                    '2x_dia': '2× ao dia',
                    '3x_dia': '3× ao dia',
                    '8h': 'a cada 8h',
                    '12h': 'a cada 12h',
                    '48h': 'a cada 48h',
                    personalizado: eventFormData.custom_interval_days
                      ? `a cada ${eventFormData.custom_interval_days} dias`
                      : 'em intervalo personalizado',
                    semanal: 'semanalmente',
                    conforme_necessidade: 'conforme necessidade',
                  };
                  const freq = freqLabel[eventFormData.frequency] || eventFormData.frequency;
                  const times =
                    eventFormData.reminder_times.length > 0
                      ? eventFormData.reminder_times.join(', ')
                      : eventFormData.reminder_time || '08:00';
                  const end = eventFormData.frequency === 'personalizado'
                    ? eventFormData.total_doses
                      ? ` · ${eventFormData.total_doses} dose(s) no total`
                      : ''
                    : eventFormData.treatment_days
                    ? ` por ${eventFormData.treatment_days} dias`
                    : '';
                  return `Lembretes ${freq} às ${times}${end}`;
                })()}
              </p>
            </div>
          )}

          {/* Custo + Re-avaliação */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Custo (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={eventFormData.cost}
                onChange={e => setEventFormData(prev => ({ ...prev, cost: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>
            {!eventFormData.reminder_enabled && (
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">
                  Re-avaliação / revisão
                </label>
                <input
                  type="date"
                  value={eventFormData.next_due_date}
                  onChange={e =>
                    setEventFormData(prev => ({ ...prev, next_due_date: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={cancelMedicationForm}
              className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-xl hover:bg-gray-50 active:scale-95 transition-all"
            >
              {editingEventId ? 'Cancelar' : 'Limpar'}
            </button>
            <button
              disabled={eventSaving || !eventFormData.title.trim() || !eventFormData.scheduled_at}
              onClick={saveMedication}
              className="flex-1 bg-[#0056D2] hover:bg-[#004ab8] text-white text-sm font-bold py-2 rounded-xl disabled:opacity-50 active:scale-95 transition-all"
            >
              {eventSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>

        {/* Lista de medicações */}
        {(() => {
          const medicationEvents = petEvents.filter(
            ev => ev.type === 'medicacao' || ev.type === 'medication',
          );

          if (eventsLoading)
            return (
              <div className="text-center py-8 text-gray-400 text-sm">Carregando...</div>
            );

          if (medicationEvents.length === 0)
            return (
              <div className="text-center py-10 text-gray-400">
                <div className="text-4xl mb-2">📋</div>
                <p className="text-sm">Nenhum evento registrado</p>
                <p className="text-xs mt-1">
                  Use &ldquo;+ Registrar&rdquo; para adicionar consultas, exames e mais
                </p>
              </div>
            );

          return (
            <div className="space-y-2">
              <h3 className="font-bold text-gray-800 text-sm">
                📋 Medicações Registradas ({medicationEvents.length})
              </h3>
              {medicationEvents.map(ev => {
                const dateStr = new Intl.DateTimeFormat('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                }).format(new Date((ev.scheduled_at || '').replace(' ', 'T')));

                let badgeCls = 'bg-yellow-100 text-yellow-700';
                let badgeTxt = 'Pendente';

                try {
                  const ex = parsePetEventExtraData(ev.extra_data);
                  const totalConfigured = ex.total_doses || ex.treatment_days;
                  if (totalConfigured) {
                    const applied = (ex.applied_dates || []).length;
                    const total = parseInt(String(totalConfigured), 10);
                    if (applied >= total) {
                      badgeCls = 'bg-green-100 text-green-700';
                      badgeTxt = 'Concluído';
                    } else {
                      badgeCls = 'bg-purple-100 text-purple-700';
                      badgeTxt = `Em tratamento (${applied}/${total})`;
                    }
                  } else if (ev.status === 'completed') {
                    badgeCls = 'bg-green-100 text-green-700';
                    badgeTxt = 'Feito';
                  }
                } catch {
                  if (ev.status === 'completed') {
                    badgeCls = 'bg-green-100 text-green-700';
                    badgeTxt = 'Feito';
                  }
                }

                return (
                  <div key={ev.id} className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="flex items-start gap-3">
                      <div className="relative flex-shrink-0 mt-0.5">
                        <span className="text-2xl leading-none">💊</span>
                        {(() => {
                          const todayStr = localTodayISO();
                          const eventDateStr = (ev.scheduled_at || '').split('T')[0] || (ev.scheduled_at || '').split(' ')[0];
                          const isToday = eventDateStr === todayStr;
                          const isNotDone = badgeTxt !== 'Concluído' && badgeTxt !== 'Feito';
                          
                          if (isToday && isNotDone) {
                            return (
                              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold animate-pulse shadow-sm border border-white/50 z-10">
                                !
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{ev.title}</p>
                        <p className="text-xs text-gray-500">
                          {dateStr}
                          {ev.professional_name ? ` · ${ev.professional_name}` : ''}
                        </p>
                        {ev.cost != null && (
                          <p className="text-xs text-green-700 font-medium mt-0.5">
                            R$ {Number(ev.cost).toFixed(2)}
                          </p>
                        )}
                        {ev.notes && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{ev.notes}</p>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${badgeCls}`}
                      >
                        {badgeTxt}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-2 pl-9">
                      <button
                        onClick={() => openEditEvent(ev)}
                        className="flex-1 text-xs font-medium text-purple-600 border border-purple-200 bg-purple-50 hover:bg-purple-100 rounded-lg py-1.5 transition-colors"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(ev.id)}
                        className="flex-1 text-xs font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg py-1.5 transition-colors"
                      >
                        🗑 Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </PremiumPanelShell>
  );
}
