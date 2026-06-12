'use client';

// RESPONSABILIDADE: timeline histórica somente leitura (READ).
// HealthModal = gestão ativa de saúde e rotina (WRITE). Modais complementares, não duplicados.

import { AuthenticatedDocumentImage } from '@/components/AuthenticatedDocumentImage';
import { useI18n } from '@/lib/I18nContext';
import { API_BASE_URL } from '@/lib/api';
import { ModalPortal } from '@/components/ModalPortal';
import type { VaccineRecord } from '@/lib/petHealth';
import type { PetEventRecord } from '@/lib/petEvents';
import type { DocFolderModalState, VetHistoryDocument } from '@/lib/types/homeForms';
import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';
import type { PetWithHealth } from '@/features/pets/types';

type HistoryTab = 'resumo' | 'detalhado';
interface VetHistoryModalProps {
  currentPet: PetWithHealth | null;
  historicoTab: HistoryTab;
  setHistoricoTab: (tab: HistoryTab) => void;
  vaccines: VaccineRecord[];
  petEvents: PetEventRecord[];
  vetHistoryDocs: VetHistoryDocument[];
  onClose: () => void;
  onOpenHealthOptions: () => void;
  onOpenGrooming: () => void;
  onOpenFood: () => void;
  onOpenHealthTab: (tab: string) => void;
  onOpenDocumentFolder: (folder: DocFolderModalState) => void;
  onNavigateToSaude?: (tab: string) => void;
}

export function VetHistoryModal({
  currentPet,
  historicoTab,
  setHistoricoTab,
  vaccines,
  petEvents,
  vetHistoryDocs,
  onClose,
  onOpenHealthOptions,
  onOpenGrooming,
  onOpenFood,
  onOpenHealthTab,
  onOpenDocumentFolder,
  onNavigateToSaude,
}: VetHistoryModalProps) {
  const { t, locale } = useI18n();

  if (!currentPet) return null;

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-50 animate-fadeIn">
      <div className="w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden overflow-x-hidden flex flex-col bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 animate-scaleIn">
        <div className="bg-gradient-to-r from-violet-500 to-purple-500 text-white p-3 sm:p-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="text-xl sm:text-2xl flex-shrink-0">🩺</span>
              <div className="min-w-0">
                <h2 className="text-base sm:text-xl font-bold truncate">{t('hist.title')}</h2>
                <p className="text-violet-100 text-xs sm:text-sm truncate">{currentPet?.pet_name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-11 h-11 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-xl text-white text-xl transition-colors"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setHistoricoTab('resumo')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${historicoTab === 'resumo' ? 'bg-white text-violet-700 shadow' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              📋 {t('hist.tab_summary')}
            </button>
            <button
              onClick={() => setHistoricoTab('detalhado')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${historicoTab === 'detalhado' ? 'bg-white text-violet-700 shadow' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              🗂 {t('hist.tab_detailed')}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-20">
          {historicoTab === 'resumo' && (() => {
            const grAll = (currentPet?.health_data?.grooming_records || []).map((g: GroomingRecord) => ({ date: g.date, label: g.type === 'bath' ? t('grooming.bath') : g.type === 'grooming' ? t('grooming.grooming') : t('grooming.bath_plus_grooming'), icon: '🛁' }));
            const vcAll = vaccines.filter((v) => v.date_administered).map((v) => ({ date: v.date_administered, label: v.vaccine_name || t('common.vaccine'), icon: '💉' }));
            const paAll = (currentPet?.health_data?.parasite_controls || []).map((p: ParasiteControl) => ({ date: p.date_applied, label: p.type === 'dewormer' ? t('event.type.dewormer') : p.type === 'flea_tick' ? t('event.type.flea_tick') : t('event.type.parasite_control'), icon: '🦟' }));
            const dcAll = vetHistoryDocs.filter((d) => d.document_date || d.created_at).map((d) => ({ date: d.document_date || d.created_at?.split('T')[0], label: d.title || 'Documento', icon: '📄', evId: d.event_id || null }));
            const evAllIcons: Record<string, string> = { consulta: '🩺', retorno: '🔁', exame_lab: '🔬', exame_imagem: '📷', cirurgia: '✂️', odonto: '🦷', medicacao: '💊', emergencia: '🚨', outro: '📝' };
            const seenEvIds = new Set<string>();
            const evAll = petEvents
              .filter((ev) => {
                if (!ev.scheduled_at) return false;
                if (ev.source === 'document') return false;
                if (seenEvIds.has(ev.id)) return false;
                seenEvIds.add(ev.id);
                return true;
              })
              .map((ev) => ({ date: ev.scheduled_at.split('T')[0], label: ev.title, icon: evAllIcons[ev.type] || '📝', evId: ev.id }));

            const manualEvIdSet = new Set(petEvents.filter((ev) => ev.source !== 'document').map((ev) => ev.id));
            const dcAllFiltered = dcAll.filter((d) => !(d.evId && manualEvIdSet.has(d.evId)));
            const allEvts = [...grAll, ...vcAll, ...paAll, ...dcAllFiltered, ...evAll].filter((e) => e.date);
            const byDate: Record<string, { icon: string; label: string }[]> = {};

            allEvts.forEach((event) => {
              if (!event.date) return;
              if (!byDate[event.date]) byDate[event.date] = [];
              byDate[event.date].push({ icon: event.icon, label: event.label });
            });

            const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

            if (sortedDates.length === 0) {
              return (
                <div className="text-center py-10 px-6">
                  <div className="text-5xl mb-3">📋</div>
                  <p className="text-gray-500 text-sm mb-6">Nenhum registro encontrado.</p>
                  <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                    <button
                      onClick={onOpenHealthOptions}
                      className="flex flex-col items-center gap-2 p-4 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-2xl transition-all active:scale-95"
                    >
                      <span className="text-2xl">🏥</span>
                      <span className="text-xs font-semibold text-sky-700">Saúde</span>
                    </button>
                    <button
                      onClick={() => onNavigateToSaude?.('banho')}
                      className="flex flex-col items-center gap-2 p-4 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-2xl transition-all active:scale-95"
                    >
                      <span className="text-2xl">🛁</span>
                      <span className="text-xs font-semibold text-teal-700">Higiene</span>
                    </button>
                    <button
                      onClick={() => onNavigateToSaude?.('alimentacao')}
                      className="flex flex-col items-center gap-2 p-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-2xl transition-all active:scale-95"
                    >
                      <span className="text-2xl">🍽️</span>
                      <span className="text-xs font-semibold text-amber-700">Alimentação</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div className="p-4 space-y-2">
                {sortedDates.map((date) => {
                  const items = byDate[date];
                  const [yr, mo, dy] = date.split('-').map(Number);
                  const currentDate = new Date(yr, mo - 1, dy);
                  const label = currentDate.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
                  return (
                    <div key={date} className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex-shrink-0 text-sm font-semibold text-gray-700 w-28">{label}</div>
                      <div className="flex-1 flex flex-wrap gap-1.5">
                        {items.map((item, index) => (
                          <span key={index} className="inline-flex items-center gap-1 bg-white border border-gray-200 text-gray-700 text-xs rounded-full px-2 py-0.5">
                            {item.icon} {item.label}
                          </span>
                        ))}
                      </div>
                      <span className="flex-shrink-0 text-xs text-gray-400 font-medium">{items.length}×</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {historicoTab === 'detalhado' && (
            <div className="p-3 sm:p-6">
              {(() => {
                const groomingEvents = (currentPet?.health_data?.grooming_records || []).map((g: GroomingRecord) => ({
                  type: 'grooming' as const,
                  icon: '🛁',
                  color: 'teal',
                  title: g.type === 'bath' ? t('grooming.bath') : g.type === 'grooming' ? t('grooming.grooming') : t('grooming.bath_plus_grooming'),
                  date: g.date,
                  location: g.location || g.groomer || 'Não informado',
                  subtitle: g.groomer ? `${g.groomer}` : '',
                  cost: g.cost || 0,
                }));

                const vaccineEvents = vaccines
                  .filter((v) => v.date_administered)
                  .map((v) => ({
                    type: 'vaccine' as const,
                    icon: '💉',
                    color: 'green',
                    title: v.vaccine_name,
                    date: v.date_administered,
                    location: v.veterinarian || v.clinic_name || 'Não informado',
                    subtitle: v.veterinarian ? `Dr(a). ${v.veterinarian}` : '',
                    cost: 0,
                  }));

                const parasiteEvents = (currentPet?.health_data?.parasite_controls || []).map((p: ParasiteControl) => {
                  let icon = '🦟';
                  let title = t('event.type.parasite_control');

                  if (p.type === 'dewormer') {
                    icon = '🪱';
                    title = t('event.type.dewormer');
                  } else if (p.type === 'flea_tick') {
                    icon = '🦟';
                    title = t('parasite.flea_tick');
                  } else if (p.type === 'collar') {
                    icon = '⭕';
                    title = t('parasite.collar_repellent');
                  } else if (p.type === 'heartworm') {
                    icon = '💓';
                    title = t('parasite.heartworm');
                  } else if (p.type === 'leishmaniasis') {
                    icon = '🛡️';
                    title = t('parasite.leishmaniasis');
                  }

                  return {
                    type: 'parasite' as const,
                    icon,
                    color: 'amber',
                    title,
                    subtitle: p.product_name || '',
                    date: p.date_applied,
                    location: p.veterinarian || p.purchase_location || 'Não informado',
                    cost: p.cost || 0,
                  };
                });

                const parseDate = (dateStr: string) => {
                  const [year, month, day] = dateStr.split('-').map(Number);
                  return new Date(year, month - 1, day).getTime();
                };

                const docCategoryIcon: Record<string, string> = {
                  exam: '🔬', vaccine: '💉', prescription: '📋',
                  report: '📄', photo: '📸', other: '📎',
                };
                const docCategoryColor: Record<string, string> = {
                  exam: 'blue', vaccine: 'green', prescription: 'purple',
                  report: 'indigo', photo: 'pink', other: 'gray',
                };
                const docCategoryLabel: Record<string, string> = {
                  exam: 'Exames', vaccine: 'Vacinas', prescription: 'Receitas',
                  report: 'Laudos', photo: 'Fotos', other: 'Outros documentos',
                };
                const manualEventIdSet = new Set(
                  petEvents
                    .filter((ev) => ev.source !== 'document')
                    .map((ev) => ev.id)
                );
                const docsByDate: Record<string, VetHistoryDocument[]> = {};
                vetHistoryDocs
                  .filter((d) => (d.document_date || d.created_at) && !(d.event_id && manualEventIdSet.has(d.event_id)))
                  .forEach((d) => {
                    const date = (d.document_date || d.created_at?.split('T')[0]) as string;
                    if (!docsByDate[date]) docsByDate[date] = [];
                    docsByDate[date].push(d);
                  });
                const documentEvents = Object.entries(docsByDate).map(([date, docs]) => {
                  const catCount: Record<string, number> = {};
                  docs.forEach((d) => {
                    const category = d.category || 'other';
                    catCount[category] = (catCount[category] || 0) + 1;
                  });
                  const dominantCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
                  const estabCount: Record<string, number> = {};
                  docs.forEach((d) => {
                    if (d.establishment_name) estabCount[d.establishment_name] = (estabCount[d.establishment_name] || 0) + 1;
                  });
                  const establishment = Object.entries(estabCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
                  return {
                    type: 'doc_date_group' as const,
                    date,
                    docs,
                    icon: docs.length === 1 ? (docCategoryIcon[docs[0].category || 'other'] ?? '📄') : '📁',
                    color: docCategoryColor[dominantCat] ?? 'blue',
                    title: docs.length === 1
                      ? (docs[0].title || docCategoryLabel[docs[0].category || 'other'] || 'Documento')
                      : `${docs.length} documentos`,
                    establishment,
                  };
                });

                const petEventColors: Record<string, string> = { consulta: 'blue', retorno: 'blue', exame_lab: 'indigo', exame_imagem: 'indigo', cirurgia: 'purple', odonto: 'teal', medicacao: 'pink', emergencia: 'amber', outro: 'gray' };
                const petEventIcons: Record<string, string> = { consulta: '🩺', retorno: '🔁', exame_lab: '🔬', exame_imagem: '📷', cirurgia: '✂️', odonto: '🦷', medicacao: '💊', emergencia: '🚨', outro: '📝' };
                const consultaEvents = petEvents
                  .filter((ev) => ev.scheduled_at && ev.source !== 'document')
                  .map((ev) => ({
                    type: ev.type,
                    icon: petEventIcons[ev.type] || '📝',
                    color: petEventColors[ev.type] || 'blue',
                    title: ev.title,
                    date: ev.scheduled_at.split('T')[0],
                    location: ev.location_name || ev.professional_name || 'Não informado',
                    subtitle: ev.professional_name ? `Dr(a). ${ev.professional_name}` : '',
                    cost: ev.cost || 0,
                    id: ev.id,
                    isPetEvent: true as const,
                    evStatus: ev.status as string,
                    evExtraData: ev.extra_data as string | null,
                  }));

                const allEvents = [...groomingEvents, ...vaccineEvents, ...parasiteEvents, ...documentEvents, ...consultaEvents]
                  .sort((a, b) => parseDate(b.date) - parseDate(a.date));

                const formatDate = (dateStr: string) => {
                  const [year, month, day] = dateStr.split('-').map(Number);
                  const date = new Date(year, month - 1, day);
                  return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
                };

                const getColorClasses = (color: string) => {
                  const colors: Record<string, { border: string; bg: string; badge: string; line: string }> = {
                    green: { border: 'border-green-500', bg: 'bg-green-100', badge: 'bg-green-100 text-green-700', line: 'bg-green-400' },
                    blue: { border: 'border-blue-500', bg: 'bg-blue-100', badge: 'bg-blue-100 text-[#0047ad]', line: 'bg-blue-400' },
                    purple: { border: 'border-purple-500', bg: 'bg-purple-100', badge: 'bg-purple-100 text-purple-700', line: 'bg-purple-400' },
                    teal: { border: 'border-teal-500', bg: 'bg-teal-100', badge: 'bg-teal-100 text-teal-700', line: 'bg-teal-400' },
                    amber: { border: 'border-amber-500', bg: 'bg-amber-100', badge: 'bg-amber-100 text-amber-700', line: 'bg-amber-400' },
                    indigo: { border: 'border-indigo-500', bg: 'bg-indigo-100', badge: 'bg-indigo-100 text-indigo-700', line: 'bg-indigo-400' },
                    pink: { border: 'border-pink-500', bg: 'bg-pink-100', badge: 'bg-pink-100 text-pink-700', line: 'bg-pink-400' },
                    gray: { border: 'border-gray-400', bg: 'bg-gray-100', badge: 'bg-gray-100 text-gray-700', line: 'bg-gray-400' },
                  };
                  return colors[color] || colors.blue;
                };

                const eventsByYear: Record<string, typeof allEvents> = {};
                allEvents.forEach((event) => {
                  const year = event.date.split('-')[0];
                  if (!eventsByYear[year]) {
                    eventsByYear[year] = [];
                  }
                  eventsByYear[year].push(event);
                });

                const years = Object.keys(eventsByYear).sort((a, b) => parseInt(b) - parseInt(a));

                if (allEvents.length === 0) {
                  return (
                    <div className="text-center py-10 px-4">
                      <div className="text-4xl sm:text-5xl mb-3">🏥</div>
                      <p className="text-gray-600 text-base mb-6">{t('vet_history.no_procedures')}</p>
                      <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                        <button
                          onClick={onOpenHealthOptions}
                          className="flex flex-col items-center gap-2 p-4 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-2xl transition-all active:scale-95"
                        >
                          <span className="text-2xl">🏥</span>
                          <span className="text-xs font-semibold text-sky-700">Saúde</span>
                        </button>
                        <button
                          onClick={onOpenGrooming}
                          className="flex flex-col items-center gap-2 p-4 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-2xl transition-all active:scale-95"
                        >
                          <span className="text-2xl">🛁</span>
                          <span className="text-xs font-semibold text-teal-700">Higiene</span>
                        </button>
                        <button
                          onClick={onOpenFood}
                          className="flex flex-col items-center gap-2 p-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-2xl transition-all active:scale-95"
                        >
                          <span className="text-2xl">🍽️</span>
                          <span className="text-xs font-semibold text-amber-700">Alimentação</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-8">
                    {years.map((year) => (
                      <div key={year} className="relative">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="flex-1 h-px bg-gradient-to-r from-gray-300 to-transparent"></div>
                          <div className="text-lg font-bold text-gray-700 bg-gray-100 px-4 py-2 rounded-lg">
                            📅 {year}
                          </div>
                          <div className="flex-1 h-px bg-gradient-to-l from-gray-300 to-transparent"></div>
                          <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                            {eventsByYear[year].length} {eventsByYear[year].length !== 1 ? t('vet_history.events') : t('vet_history.event')}
                          </span>
                        </div>

                        <div className="relative pl-8">
                          <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200"></div>

                          <div className="space-y-3">
                            {eventsByYear[year].map((event, idx) => {
                              const colors = getColorClasses(event.color);
                              const eventSubtitle = 'subtitle' in event ? event.subtitle : '';
                              const eventLocation = 'location' in event ? event.location : event.establishment || 'Não informado';
                              const eventCost = 'cost' in event ? event.cost : 0;

                              if (event.type === 'doc_date_group' && 'docs' in event) {
                                const docs = event.docs;
                                const thumbs = docs.filter((d) => d.mime_type?.startsWith('image/') && d.storage_key).slice(0, 3);
                                const catSet = Array.from(new Set(docs.map((d) => docCategoryLabel[d.category || 'other'] ?? 'Documento')));
                                return (
                                  <div key={idx} className="relative">
                                    <div className={`absolute -left-[21px] top-3 w-5 h-5 rounded-full ${colors.line} border-2 border-white shadow-md z-10`}></div>
                                    <button
                                      className={`w-full bg-white rounded-xl border-l-4 ${colors.border} shadow-sm hover:shadow-lg active:scale-[0.99] transition-all p-4 flex flex-col gap-2 text-left`}
                                      onClick={() => onOpenDocumentFolder({
                                        cat: (docs[0].category || 'other'),
                                        title: event.title,
                                        icon: event.icon,
                                        color: event.color,
                                        docs,
                                      })}
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className={`w-11 h-11 ${colors.bg} rounded-full flex items-center justify-center flex-shrink-0`}>
                                          <span className="text-2xl">{event.icon}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="font-semibold text-gray-900 truncate">{event.title}</span>
                                            <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(event.date)}</span>
                                          </div>
                                          {event.establishment && (
                                            <div className="text-sm text-indigo-700 font-medium mt-0.5 truncate">📍 {event.establishment}</div>
                                          )}
                                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                            {catSet.map((category: string, categoryIndex: number) => (
                                              <span key={categoryIndex} className={`${colors.badge} px-2 py-0.5 rounded-full text-xs font-medium`}>{category}</span>
                                            ))}
                                            {docs.length > 1 && (
                                              <span className="text-xs text-gray-400">{docs.length} arquivos · Abrir ▸</span>
                                            )}
                                            {docs.length === 1 && <span className="text-xs text-gray-400">Abrir ▸</span>}
                                          </div>
                                        </div>
                                      </div>
                                      {thumbs.length > 0 && (
                                        <div className="flex gap-1.5 pl-14">
                                          {thumbs.map((doc, previewIndex) => (
                                            <div key={previewIndex} className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 bg-gray-100">
                                              <AuthenticatedDocumentImage
                                                petId={currentPet?.pet_id || ''}
                                                docId={doc.id!}
                                                alt=""
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                              />
                                            </div>
                                          ))}
                                          {docs.length > 3 && (
                                            <div className="w-14 h-14 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                                              <span className="text-xs font-semibold text-gray-500">+{docs.length - 3}</span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </button>
                                  </div>
                                );
                              }

                              const isPetEvt = 'isPetEvent' in event && event.isPetEvent;
                              return (
                                <div key={idx} className="relative">
                                  <div className={`absolute -left-[21px] top-3 w-5 h-5 rounded-full ${colors.line} border-2 border-white shadow-md z-10`}></div>
                                  <div
                                    className={`bg-white rounded-lg border-l-4 ${colors.border} hover:shadow-md transition-all ${isPetEvt ? '' : 'cursor-pointer'}`}
                                    onClick={isPetEvt ? undefined : () => {
                                      if (onNavigateToSaude && (event.type === 'vaccine' || event.type === 'parasites' || event.type === 'grooming')) {
                                        onNavigateToSaude(event.type === 'vaccine' ? 'vacinas' : event.type === 'grooming' ? 'banho' : 'antiparasitario');
                                      } else {
                                        onOpenHealthTab(event.type === 'grooming' ? 'grooming' : event.type === 'vaccine' ? 'vaccines' : 'parasites');
                                      }
                                    }}
                                  >
                                    <div className="p-4">
                                      <div className="flex items-start gap-3">
                                        <div className={`w-12 h-12 ${colors.bg} rounded-full flex items-center justify-center flex-shrink-0`}>
                                          <span className="text-2xl">{event.icon}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-start justify-between gap-2 mb-1">
                                            <div className="flex-1 min-w-0">
                                              <div className="font-semibold text-gray-900 text-base leading-tight break-words">{event.title}</div>
                                              {eventSubtitle && <div className="text-sm text-gray-600 mt-1 break-words">{eventSubtitle}</div>}
                                            </div>
                                            <span className="text-sm font-medium text-gray-500 whitespace-nowrap flex-shrink-0">{formatDate(event.date)}</span>
                                          </div>
                                          <div className="text-sm text-gray-600 mb-2 break-words">📍 {eventLocation}</div>
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {(() => {
                                              if (isPetEvt && event.type === 'medicacao') {
                                                try {
                                                  const extraData = JSON.parse('evExtraData' in event ? String(event.evExtraData || '{}') : '{}');
                                                  if (extraData.treatment_days) {
                                                    const applied = (extraData.applied_dates || []).length;
                                                    const total = parseInt(extraData.treatment_days);
                                                    if (applied >= total) {
                                                      return <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium">✓ Concluído ({applied}/{total})</span>;
                                                    }
                                                    return <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-medium">💊 Em tratamento ({applied}/{total})</span>;
                                                  }
                                                } catch {}
                                              }
                                              return <span className={`${colors.badge} px-2 py-1 rounded text-xs font-medium`}>✓ {t('vet_history.completed')}</span>;
                                            })()}
                                            {Number(eventCost) > 0 && <span className="text-sm text-gray-500 font-medium">R$ {Number(eventCost).toFixed(2)}</span>}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    {isPetEvt && (() => {
                                      const evtDocs = vetHistoryDocs.filter((d) => d.event_id === ('id' in event ? event.id : undefined));
                                      if (evtDocs.length === 0) return null;
                                      return (
                                        <div className="border-t border-gray-100">
                                          <button
                                            onClick={() => onOpenDocumentFolder({
                                              cat: evtDocs[0]?.category || 'other',
                                              title: event.title,
                                              icon: event.icon,
                                              color: event.color,
                                              docs: evtDocs,
                                            })}
                                            className="w-full text-xs font-medium text-indigo-600 hover:bg-indigo-50 py-2.5 transition-colors rounded-b-lg flex items-center justify-center gap-1.5"
                                          >
                                            <span>👁️</span>
                                            <span>{evtDocs.length === 1 ? 'Ver 1 documento' : `Ver ${evtDocs.length} documentos`} anexados</span>
                                          </button>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}