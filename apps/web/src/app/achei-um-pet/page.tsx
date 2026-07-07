'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';

interface MissingPetRecord {
  id: string;
  pet_name: string;
  species: string | null;
  breed: string | null;
  characteristics: string | null;
  contact: string;
  last_seen_location: string | null;
  missing_date: string | null;
  missing_time: string | null;
  photo_url: string | null;
  status: 'active' | 'found';
  current_radius_km: number;
  created_at: string;
  found_at: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

function formatMissingDate(date: string | null, time: string | null): string {
  if (!date) return 'Data não informada';
  const [yr, mo, dy] = date.split('-');
  const label = `${dy}/${mo}/${yr}`;
  return time ? `${label} às ${time}` : label;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'há menos de 1 hora';
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'há 1 dia';
  return `há ${d} dias`;
}

export default function AcheiUmPetPage() {
  const [pets, setPets] = useState<MissingPetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'all'>('active');

  // Report-found state
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportContact, setReportContact] = useState('');
  const [reportLocation, setReportLocation] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reportedIds, setReportedIds] = useState<string[]>([]);

  const fetchPets = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API_BASE_URL}/missing-pets${filter === 'all' ? '?include_found=true' : ''}`;
      const res = await fetch(url);
      if (res.ok) setPets(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => { void fetchPets(); }, [fetchPets]);

  const handleOpenReport = (id: string) => {
    setReportingId(id);
    setReportContact('');
    setReportLocation('');
    setReportNotes('');
  };

  const handleSubmitReport = async (petId: string) => {
    if (!reportContact.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/missing-pets/${petId}/report-found`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finder_contact: reportContact.trim(),
          finder_location: reportLocation.trim() || null,
          notes: reportNotes.trim() || null,
          finder_photos: [],
        }),
      });
      if (res.ok) {
        setReportedIds(ids => [...ids, petId]);
        setReportingId(null);
      }
    } catch { /* silent */ }
    setSubmitting(false);
  };

  const activeCount = pets.filter(p => p.status === 'active').length;

  return (
    <div className="min-h-screen bg-[#0E0C0B] text-white">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0E0C0B]/95 backdrop-blur-xl border-b border-white/8">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-900/50 border border-red-700/40 flex items-center justify-center">
              <span className="text-lg">🚨</span>
            </div>
            <div>
              <p className="text-[15px] font-black text-white leading-tight">Pets Desaparecidos</p>
              <p className="text-[11px] text-white/40 leading-none">PETMOL · Rede de ajuda</p>
            </div>
          </div>
          <Link
            href="/"
            className="px-3.5 py-1.5 rounded-full bg-white/8 border border-white/10 text-[12px] font-bold text-white/70 hover:bg-white/15 transition-colors"
          >
            Abrir App
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Hero */}
        <div className="bg-gradient-to-br from-red-950/60 via-[#1A0A08] to-[#0E0C0B] rounded-3xl border border-red-900/30 px-5 py-5">
          <div className="flex items-start gap-4">
            <div className="text-4xl flex-shrink-0 mt-0.5">🐾</div>
            <div>
              <h1 className="text-xl font-black text-white leading-tight">
                Ajude a encontrar um pet perdido
              </h1>
              <p className="text-[13px] text-white/50 mt-1.5 leading-relaxed">
                Estes pets precisam de você. Se reconhecer algum, avise o tutor imediatamente.
                {activeCount > 0 && (
                  <> <strong className="text-red-400">{activeCount} {activeCount === 1 ? 'alerta ativo' : 'alertas ativos'}</strong> agora.</>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(['active', 'all'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-[13px] font-bold transition-all ${
                filter === f
                  ? 'bg-red-700 text-white shadow-lg shadow-red-900/40'
                  : 'bg-white/8 text-white/50 border border-white/10 hover:bg-white/12'
              }`}
            >
              {f === 'active' ? 'Desaparecidos' : 'Todos (incl. encontrados)'}
            </button>
          ))}
        </div>

        {/* Cards */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-[13px] text-white/30">Buscando alertas...</p>
          </div>
        ) : pets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <span className="text-5xl">🎉</span>
            <p className="text-lg font-black text-white">Nenhum pet desaparecido</p>
            <p className="text-[13px] text-white/40">Ótima notícia! Todos estão sendo encontrados.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pets.map(pet => (
              <PetCard
                key={pet.id}
                pet={pet}
                reported={reportedIds.includes(pet.id)}
                reportingOpen={reportingId === pet.id}
                reportContact={reportContact}
                reportLocation={reportLocation}
                reportNotes={reportNotes}
                submitting={submitting}
                onOpenReport={() => handleOpenReport(pet.id)}
                onCancelReport={() => setReportingId(null)}
                onChangeContact={setReportContact}
                onChangeLocation={setReportLocation}
                onChangeNotes={setReportNotes}
                onSubmitReport={() => handleSubmitReport(pet.id)}
              />
            ))}
          </div>
        )}

        {/* CTA — Download app */}
        <div className="bg-white/5 border border-white/10 rounded-3xl px-5 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-900/40 border border-blue-700/30 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">🐾</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-[14px]">Baixe o PETMOL</p>
            <p className="text-[12px] text-white/40 mt-0.5 leading-tight">
              Receba alertas de pets perdidos perto de você e ajude a comunidade.
            </p>
          </div>
          <Link
            href="/"
            className="flex-shrink-0 px-4 py-2 rounded-full bg-blue-600 text-white text-[13px] font-black active:scale-95 transition-all"
          >
            Instalar
          </Link>
        </div>

        <p className="text-center text-[11px] text-white/20 pb-4">
          petmol.com.br · Rede de tutores conectados
        </p>
      </main>
    </div>
  );
}

function PetCard({
  pet,
  reported,
  reportingOpen,
  reportContact,
  reportLocation,
  reportNotes,
  submitting,
  onOpenReport,
  onCancelReport,
  onChangeContact,
  onChangeLocation,
  onChangeNotes,
  onSubmitReport,
}: {
  pet: MissingPetRecord;
  reported: boolean;
  reportingOpen: boolean;
  reportContact: string;
  reportLocation: string;
  reportNotes: string;
  submitting: boolean;
  onOpenReport: () => void;
  onCancelReport: () => void;
  onChangeContact: (v: string) => void;
  onChangeLocation: (v: string) => void;
  onChangeNotes: (v: string) => void;
  onSubmitReport: () => void;
}) {
  const isFound = pet.status === 'found';
  const speciesEmoji = pet.species === 'cat' ? '🐈' : '🐕';

  return (
    <div className={`relative rounded-3xl overflow-hidden border transition-all ${
      isFound
        ? 'border-emerald-700/30 bg-emerald-950/20'
        : 'border-red-900/30 bg-[#160A08]'
    }`}>

      {/* Found badge */}
      {isFound && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-emerald-600 text-white text-[11px] font-black px-3 py-1.5 rounded-full shadow-lg">
          <span>✓</span> Encontrado com o PETMOL
        </div>
      )}

      {/* Photo */}
      {pet.photo_url ? (
        <div className="relative w-full h-52 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pet.photo_url}
            alt={pet.pet_name}
            className={`w-full h-full object-cover ${isFound ? 'opacity-50 grayscale' : ''}`}
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#160A08] to-transparent" />
        </div>
      ) : (
        <div className={`w-full h-28 flex items-center justify-center ${isFound ? 'bg-slate-900/30' : 'bg-red-950/20'}`}>
          <span className="text-6xl opacity-30">{speciesEmoji}</span>
        </div>
      )}

      {/* Content */}
      <div className="px-4 pt-3 pb-4 space-y-3">

        {/* Name + time */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className={`text-xl font-black leading-tight ${isFound ? 'text-white/50 line-through' : 'text-white'}`}>
              {pet.pet_name}
            </h2>
            <p className="text-[12px] text-white/40 mt-0.5">
              {[pet.species === 'cat' ? 'Gato' : 'Cão', pet.breed].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className="text-[11px] text-white/30 flex-shrink-0 mt-1">{timeAgo(pet.created_at)}</span>
        </div>

        {/* Missing date */}
        <div className="flex items-center gap-1.5 text-[12px] text-white/50">
          <span>🕐</span>
          <span>Desapareceu {formatMissingDate(pet.missing_date, pet.missing_time)}</span>
        </div>

        {/* Location */}
        {pet.last_seen_location && (
          <div className="flex items-start gap-1.5 text-[12px] text-white/60">
            <span className="flex-shrink-0 mt-0.5">📍</span>
            <span className="leading-snug">{pet.last_seen_location}</span>
          </div>
        )}

        {/* Characteristics */}
        {pet.characteristics && (
          <div className="bg-white/5 rounded-2xl px-3.5 py-2.5 border border-white/8">
            <p className="text-[11px] font-bold text-white/40 uppercase tracking-wide mb-1">Características</p>
            <p className="text-[13px] text-white/70 leading-relaxed">{pet.characteristics}</p>
          </div>
        )}

        {/* Found date */}
        {isFound && pet.found_at && (
          <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-700/30 rounded-2xl px-3.5 py-2.5">
            <span className="text-emerald-400 text-lg">🎉</span>
            <div>
              <p className="text-[12px] font-bold text-emerald-400">Encontrado com o PETMOL!</p>
              <p className="text-[11px] text-emerald-500/60">{formatDate(pet.found_at)}</p>
            </div>
          </div>
        )}

        {/* Success state */}
        {reported && !isFound && (
          <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-700/30 rounded-2xl px-3.5 py-2.5">
            <span className="text-emerald-400 text-lg">✓</span>
            <p className="text-[13px] font-bold text-emerald-400">Aviso enviado! O tutor foi notificado.</p>
          </div>
        )}

        {/* Actions */}
        {!isFound && !reported && (
          <>
            <div className="flex gap-2 pt-1">
              <a
                href={`https://wa.me/${pet.contact.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Vi o anúncio de ${pet.pet_name} no PETMOL e tenho informações.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#25D366] text-white font-black text-[14px] active:scale-[0.98] transition-all shadow-md shadow-green-900/30"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Avisar tutor
              </a>
              <button
                type="button"
                onClick={reportingOpen ? onCancelReport : onOpenReport}
                className={`px-4 py-3 rounded-2xl text-[13px] font-bold active:scale-[0.98] transition-all border ${
                  reportingOpen
                    ? 'bg-white/10 border-white/20 text-white/40'
                    : 'bg-white/8 border-white/10 text-white/60'
                }`}
              >
                {reportingOpen ? 'Cancelar' : '✓ Encontrei'}
              </button>
            </div>

            {/* Inline report form */}
            {reportingOpen && (
              <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-4 space-y-3 mt-1">
                <p className="text-[13px] font-bold text-white/70">Deixe seu contato — o tutor será notificado agora:</p>

                <div>
                  <label className="block text-[11px] font-bold text-white/40 uppercase tracking-wide mb-1">Telefone / WhatsApp *</label>
                  <input
                    type="tel"
                    value={reportContact}
                    onChange={e => onChangeContact(e.target.value)}
                    placeholder="(31) 99999-9999"
                    className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-white/25 outline-none focus:border-white/30 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-white/40 uppercase tracking-wide mb-1">CEP de onde você está (opcional)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={reportLocation}
                    onChange={e => onChangeLocation(e.target.value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9))}
                    placeholder="00000-000"
                    className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-white/25 outline-none focus:border-white/30 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-white/40 uppercase tracking-wide mb-1">Observações (opcional)</label>
                  <textarea
                    value={reportNotes}
                    onChange={e => onChangeNotes(e.target.value)}
                    placeholder="Ex: O pet está com uma coleira azul..."
                    rows={2}
                    className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-white/25 outline-none focus:border-white/30 transition-colors resize-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={onSubmitReport}
                  disabled={!reportContact.trim() || submitting}
                  className="w-full py-3 rounded-xl bg-emerald-600 text-white font-black text-[14px] active:scale-[0.98] transition-all disabled:opacity-40"
                >
                  {submitting ? 'Enviando...' : 'Notificar tutor'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
