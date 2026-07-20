'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';
import { getToken } from '@/lib/auth-token';

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

type PhotoMatchResult = MissingPetRecord & {
  score: number;
  analysis: string | null;
  confidence_level?: 'strong_candidate' | 'review_candidate' | 'weak_candidate' | 'unlikely' | 'unknown';
  confidence_label?: string;
  requires_human_confirmation?: boolean;
  distance_km: number | null;
};

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
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0E0C0B]" />}>
      <AcheiUmPetInner />
    </Suspense>
  );
}

function AcheiUmPetInner() {
  const searchParams = useSearchParams();
  const focusedId = searchParams.get('id');
  const retry = searchParams.get('retry') === '1';

  const [pets, setPets] = useState<MissingPetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'all'>('active');

  // Report-found state
  const [reportingId, setReportingId] = useState<string | null>(focusedId);
  const [reportContact, setReportContact] = useState('');
  const [reportLocation, setReportLocation] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [reportCep, setReportCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [reportPhotos, setReportPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [reportedIds, setReportedIds] = useState<string[]>([]);
  const [compatScore, setCompatScore] = useState<number | null>(null);
  const [compatAnalysis, setCompatAnalysis] = useState<string>('');
  const [preScore, setPreScore] = useState<number | null>(null);
  const [preAnalysis, setPreAnalysis] = useState<string>('');
  const [preLoading, setPreLoading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const matchInputRef = useRef<HTMLInputElement>(null);
  const matchCameraInputRef = useRef<HTMLInputElement>(null);
  const [matchPhotos, setMatchPhotos] = useState<string[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [matchResults, setMatchResults] = useState<PhotoMatchResult[]>([]);
  const [matchAnalyzed, setMatchAnalyzed] = useState<number | null>(null);

  // Inicializa reportedIds do localStorage e verifica dismissals no backend
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('petmol_finder_reported_ids') ?? '[]') as string[];

    // ?retry=1 vem do push de dismiss — limpa o focusedId do localStorage imediatamente
    if (retry && focusedId && stored.includes(focusedId)) {
      const updated = stored.filter((id) => id !== focusedId);
      localStorage.setItem('petmol_finder_reported_ids', JSON.stringify(updated));
      setReportedIds(updated);
      return;
    }

    if (stored.length === 0) return;
    setReportedIds(stored);

    // Checa com o backend quais foram descartados (requer login)
    const token = getToken();
    if (!token || stored.length === 0) return;

    void (async () => {
      const dismissed: string[] = [];
      await Promise.allSettled(
        stored.map(async (mpId) => {
          try {
            const res = await fetch(`${API_BASE_URL}/missing-pets/${mpId}/my-report-status`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json() as { dismissed?: boolean };
              if (data.dismissed) dismissed.push(mpId);
            }
          } catch { /* silent */ }
        }),
      );
      if (dismissed.length > 0) {
        const updated = stored.filter((id) => !dismissed.includes(id));
        localStorage.setItem('petmol_finder_reported_ids', JSON.stringify(updated));
        setReportedIds(updated);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reportPhotos.length === 0 || !focusedId) {
      setPreScore(null); setPreAnalysis('');
      return;
    }
    let cancelled = false;
    const run = async () => {
      setPreLoading(true);
      setPreScore(null);
      try {
        const res = await fetch(`${API_BASE_URL}/missing-pets/${focusedId}/analyze-photo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ finder_photos: reportPhotos }),
        });
        if (!cancelled && res.ok) {
          const d = await res.json() as { score?: number | null; analysis?: string | null };
          if (d.score != null) { setPreScore(d.score); setPreAnalysis(d.analysis ?? ''); }
        }
      } catch { /* silent */ }
      if (!cancelled) setPreLoading(false);
    };
    void run();
    return () => { cancelled = true; };
  }, [reportPhotos, focusedId]);

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

  const handleCepChange = async (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    setReportCep(formatted);
    if (digits.length === 8) {
      setCepLoading(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
        if (!data.erro) {
          const parts = [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean);
          if (parts.length) setReportLocation(parts.join(', '));
        }
      } catch { /* silent */ }
      setCepLoading(false);
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      setReportPhotos(prev => prev.length < 2 ? [...prev, result] : prev);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleMatchPhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      setMatchPhotos([result]);
      setMatchResults([]);
      setMatchAnalyzed(null);
      setMatchError('');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRunPhotoMatch = async () => {
    if (matchPhotos.length === 0 || matchLoading) return;
    setMatchLoading(true);
    setMatchError('');
    setMatchResults([]);
    setMatchAnalyzed(null);
    try {
      const res = await fetch(`${API_BASE_URL}/missing-pets/match-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finder_photos: matchPhotos, limit: 20 }),
      });
      if (!res.ok) throw new Error('match_failed');
      const data = await res.json() as { analyzed?: number; matches?: PhotoMatchResult[]; message?: string | null };
      setMatchAnalyzed(data.analyzed ?? null);
      setMatchResults(data.matches ?? []);
      if (!data.matches || data.matches.length === 0) {
        setMatchError(data.message || 'Não encontramos candidatos com confiança mínima. Você ainda pode olhar a lista abaixo.');
      }
    } catch {
      setMatchError('Não foi possível analisar a foto agora. Tente novamente.');
    } finally {
      setMatchLoading(false);
    }
  };

  const handleOpenReport = (id: string) => {
    setReportingId(id);
    setReportContact('');
    setReportLocation('');
    setReportNotes('');
    setReportCep('');
    setCepLoading(false);
    setReportPhotos([]);
    setCompatScore(null);
    setCompatAnalysis('');
    setPreScore(null);
    setPreAnalysis('');
    setPreLoading(false);
  };

  const handleSubmitReport = async (petId: string) => {
    if (!reportContact.trim()) return;
    setSubmitting(true);
    try {
      // Pega user_id do token JWT (sub) se o achador estiver logado — para o push de agradecimento
      let finderUserId: string | null = null;
      try {
        const token = getToken();
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string };
          if (payload.sub) finderUserId = payload.sub;
        }
      } catch { /* JWT inválido — prossegue sem user_id */ }

      const res = await fetch(`${API_BASE_URL}/missing-pets/${petId}/report-found`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finder_contact: reportContact.trim(),
          finder_location: reportLocation.trim() || null,
          notes: reportNotes.trim() || null,
          finder_photos: reportPhotos,
          finder_user_id: finderUserId,
          pre_score: preScore,
          pre_analysis: preAnalysis || null,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { compatibility_score?: number | null; compatibility_analysis?: string | null };
        const finalScore = data.compatibility_score ?? preScore;
        const finalAnalysis = data.compatibility_analysis ?? preAnalysis;
        if (finalScore != null) {
          setCompatScore(finalScore);
          setCompatAnalysis(finalAnalysis ?? '');
        }
        setReportedIds(ids => [...ids, petId]);
        setReportingId(null);
        try {
          const stored = JSON.parse(localStorage.getItem('petmol_finder_reported_ids') ?? '[]') as string[];
          if (!stored.includes(petId)) {
            localStorage.setItem('petmol_finder_reported_ids', JSON.stringify([...stored, petId]));
          }
        } catch { /* best effort */ }
      }
    } catch { /* silent */ }
    setSubmitting(false);
  };

  // Modo focado: vem do banner vermelho com ?id=
  if (focusedId) {
    const pet = pets.find(p => p.id === focusedId);
    const reported = reportedIds.includes(focusedId);
    const whatsappMsg = pet ? encodeURIComponent(`Olá! Vi um pet parecido com ${pet.pet_name} e já avisei pelo PETMOL. Posso te encontrar.`) : '';
    const whatsappHref = pet ? `https://wa.me/55${pet.contact.replace(/\D/g, '')}?text=${whatsappMsg}` : '#';

    // ── Tela de sucesso ──────────────────────────────────────────────────────
    if (reported) {
      return (
        <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg,#059669 0%,#065f46 100%)' }}>
          {/* Foto de fundo desfocada */}
          {pet?.photo_url && (
            <div className="absolute inset-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolvePetPhotoUrl(pet.photo_url) ?? ''} alt="" className="w-full h-full object-cover opacity-10 blur-sm scale-105" />
            </div>
          )}
          {/* Botão voltar no topo */}
          <div className="relative z-10 flex items-center px-4 pt-safe pt-4">
            <Link
              href="/home"
              className="flex items-center gap-1.5 text-white/80 text-[14px] font-semibold active:opacity-60 transition-opacity"
            >
              <span className="text-xl leading-none">‹</span>
              Voltar
            </Link>
          </div>
          <div className="relative flex flex-col items-center justify-center flex-1 px-6 py-8 text-white text-center">
            <div className="text-8xl mb-2" style={{ filter: 'drop-shadow(0 4px 24px rgba(0,0,0,0.3))' }}>🐾</div>
            <h1 className="text-[36px] font-black leading-tight mt-2">Que incrível!</h1>
            <p className="text-[17px] text-emerald-100 mt-3 leading-relaxed max-w-xs">
              Você acabou de fazer a diferença na vida de uma família. O tutor de <strong className="text-white">{pet?.pet_name}</strong> já foi notificado.
            </p>

            {/* Resultado de compatibilidade */}
            {compatScore != null && (
              <div className="mt-5 w-full max-w-xs bg-white/15 backdrop-blur-sm rounded-2xl px-5 py-5 border border-white/20 text-center">
                <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-200 mb-3">Análise de IA</p>
                <div className="w-28 h-28 rounded-full mx-auto flex items-center justify-center border-[4px] border-white/60 mb-3"
                  style={{ background: compatScore >= 70 ? 'rgba(52,211,153,0.35)' : compatScore >= 40 ? 'rgba(251,191,36,0.35)' : 'rgba(239,68,68,0.35)' }}>
                  <span className="text-[44px] font-black text-white leading-none">{compatScore}%</span>
                </div>
                <p className="text-[13px] text-white leading-snug">{compatAnalysis || 'Análise de compatibilidade concluída.'}</p>
              </div>
            )}

            <div className="mt-8 w-full max-w-xs space-y-3">
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-5 py-4 text-left border border-white/20">
                <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-200 mb-2">O que fazer agora</p>
                <p className="text-[14px] text-white leading-relaxed">
                  Fique com {pet?.pet_name ?? 'o pet'} em local seguro e aguarde o tutor ligar no número que você informou.
                </p>
              </div>

              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl bg-white text-emerald-700 font-black text-[16px] shadow-xl active:scale-95 transition-transform"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-[#25D366]"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Chamar tutor no WhatsApp
              </a>

              <Link
                href="/home"
                className="flex items-center justify-center w-full py-4 rounded-2xl border border-white/30 text-white font-bold text-[15px] active:scale-95 transition-transform"
              >
                Voltar ao início
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // ── Tela do achador ──────────────────────────────────────────────────────
    return (
      <div className="min-h-screen bg-white flex flex-col">

        {/* Foto hero — ocupa topo da tela */}
        <div className="relative w-full flex-shrink-0 bg-[#0E0C0B]" style={{ height: '46vh', minHeight: 280, maxHeight: 430 }}>
          {pet?.photo_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolvePetPhotoUrl(pet.photo_url) ?? ''} alt="" className="absolute inset-0 w-full h-full object-cover opacity-35 blur-xl scale-110" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolvePetPhotoUrl(pet.photo_url) ?? ''} alt={pet?.pet_name ?? ''} className="relative z-[1] w-full h-full object-contain" />
            </>
          ) : (
            <div className="w-full h-full bg-rose-50 flex items-center justify-center">
              <span className="text-8xl opacity-30">{pet?.species === 'cat' ? '🐱' : '🐶'}</span>
            </div>
          )}

          {/* Gradiente sobre a foto */}
          <div className="absolute inset-0 z-[2] bg-gradient-to-b from-black/40 via-transparent to-black/80" />

          {/* Botão voltar */}
          <Link
            href="/home"
            className="absolute top-4 left-4 z-[3] w-10 h-10 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center text-white active:opacity-70"
          >
            <span className="text-xl leading-none">‹</span>
          </Link>

          {/* Badge urgência */}
          <div className="absolute top-4 right-4 z-[3] flex items-center gap-1.5 bg-rose-600 text-white text-[11px] font-black px-3 py-1.5 rounded-full shadow-lg">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            ALERTA ATIVO
          </div>

          {/* Nome do pet sobre a foto */}
          {!loading && pet && (
            <div className="absolute bottom-0 inset-x-0 z-[3] px-5 pb-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/70 mb-0.5">
                {pet.species === 'cat' ? 'Gato' : 'Cachorro'}{pet.breed ? ` · ${pet.breed}` : ''}
              </p>
              <h1 className="text-[32px] font-black text-white leading-none" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
                {pet.pet_name}
              </h1>
              {pet.last_seen_location && (
                <p className="text-[13px] text-white/80 mt-1 flex items-center gap-1">
                  <span>📍</span>{pet.last_seen_location}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Conteúdo inferior — fundo branco */}
        <div className="flex-1 flex flex-col px-5 pt-5 pb-8 gap-4 max-w-lg mx-auto w-full">

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !pet ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-4xl">🎉</p>
              <p className="font-black text-slate-900 text-lg">Pet já foi encontrado!</p>
              <p className="text-slate-500 text-[13px]">Que ótima notícia para a família.</p>
              <Link href="/home" className="inline-block mt-4 px-6 py-3 rounded-full bg-slate-100 text-slate-700 font-bold text-[14px]">
                Voltar ao início
              </Link>
            </div>
          ) : (
            <>
              {/* Chamada de ação */}
              <div>
                <h2 className="text-[22px] font-black text-slate-900 leading-tight">
                  Pode ser {pet.pet_name}?
                </h2>
                <p className="text-[14px] text-slate-500 mt-1">
                  Deixe seu telefone. O tutor recebe as fotos como possível match e confirma se é o pet.
                </p>
              </div>

              {/* Campo de telefone — principal e em destaque */}
              <div>
                <label className="block text-[12px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Seu WhatsApp *
                </label>
                <input
                  type="tel"
                  autoFocus
                  value={reportContact}
                  onChange={e => setReportContact(e.target.value)}
                  placeholder="(31) 9 9999-9999"
                  className="w-full border-2 border-slate-200 rounded-2xl px-4 py-4 text-[20px] font-bold text-slate-900 placeholder-slate-300 outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Onde está */}
              <div>
                <label className="block text-[12px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Onde você está — CEP (opcional)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={reportCep}
                  onChange={e => void handleCepChange(e.target.value)}
                  placeholder="00000-000"
                  className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-[16px] text-slate-900 placeholder-slate-300 outline-none focus:border-emerald-500 transition-colors"
                />
                {cepLoading && (
                  <p className="text-[12px] text-slate-400 mt-1.5 flex items-center gap-1.5">
                    <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin inline-block" />
                    Buscando endereço...
                  </p>
                )}
                {!cepLoading && reportLocation && reportCep.replace(/\D/g, '').length === 8 && reportLocation !== reportCep.replace(/\D/g, '') && (
                  <p className="text-[12px] text-emerald-600 mt-1.5 font-semibold">📍 {reportLocation}</p>
                )}
              </div>

              {/* Observações */}
              <div>
                <label className="block text-[12px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Observações (opcional)
                </label>
                <textarea
                  value={reportNotes}
                  onChange={e => setReportNotes(e.target.value)}
                  placeholder="Ex: Está em boa saúde, sem coleira, dentro do meu quintal..."
                  rows={2}
                  className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-[15px] text-slate-900 placeholder-slate-300 outline-none focus:border-emerald-500 transition-colors resize-none"
                />
              </div>

              {/* Foto de referência — para o achador comparar */}
              {pet?.photo_url && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolvePetPhotoUrl(pet.photo_url) ?? ''}
                    alt={pet.pet_name}
                    className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-amber-200"
                  />
                  <div>
                    <p className="text-[12px] font-bold text-amber-700 uppercase tracking-widest">Foto de referência</p>
                    <p className="text-[14px] font-bold text-slate-900 mt-0.5">{pet.pet_name}</p>
                    <p className="text-[12px] text-slate-500">Compare com as suas fotos abaixo</p>
                  </div>
                </div>
              )}

              {/* Fotos do pet (até 2) */}
              <div>
                <label className="block text-[12px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Fotos do pet — até 2 (opcional)
                </label>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoCapture}
                />
                <div className="flex gap-2">
                  {reportPhotos.map((photo, idx) => (
                    <div key={idx} className="relative flex-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt={`Foto ${idx + 1}`} className="w-full h-32 object-cover rounded-2xl border-2 border-emerald-400" />
                      <button
                        type="button"
                        onClick={() => setReportPhotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-[13px] leading-none"
                      >×</button>
                    </div>
                  ))}
                  {reportPhotos.length < 2 && (
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className={`flex-1 border-2 border-dashed border-slate-200 rounded-2xl py-4 flex flex-col items-center gap-1 text-slate-400 active:border-emerald-400 active:text-emerald-500 transition-colors ${reportPhotos.length === 0 ? 'min-h-[8rem]' : 'h-32'}`}
                    >
                      <span className="text-2xl">📷</span>
                      <span className="text-[12px] font-bold">{reportPhotos.length === 0 ? 'Tirar ou escolher foto' : 'Adicionar 2ª foto'}</span>
                      {reportPhotos.length === 0 && <span className="text-[10px]">A IA verifica se é o mesmo pet</span>}
                    </button>
                  )}
                </div>
              </div>

              {/* Análise de compatibilidade — aparece quando há fotos */}
              {(preLoading || preScore != null) && (
                <div className={`rounded-2xl border px-4 py-5 text-center ${
                  preLoading ? 'border-slate-200 bg-slate-50' :
                  preScore! >= 70 ? 'border-emerald-200 bg-emerald-50' :
                  preScore! >= 40 ? 'border-amber-200 bg-amber-50' :
                  'border-rose-200 bg-rose-50'
                }`}>
                  {preLoading ? (
                    <div className="flex items-center gap-3 justify-center py-2">
                      <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-slate-400 animate-spin flex-shrink-0" />
                      <p className="text-[14px] text-slate-500 font-semibold">IA analisando as fotos...</p>
                    </div>
                  ) : (
                    <>
                      <div className={`w-28 h-28 rounded-full mx-auto flex items-center justify-center mb-3 ${
                        preScore! >= 70 ? 'bg-emerald-100' :
                        preScore! >= 40 ? 'bg-amber-100' : 'bg-rose-100'
                      }`} style={{ border: `4px solid ${preScore! >= 70 ? '#34d399' : preScore! >= 40 ? '#fbbf24' : '#f87171'}` }}>
                        <span className={`text-[44px] font-black leading-none ${
                          preScore! >= 70 ? 'text-emerald-700' :
                          preScore! >= 40 ? 'text-amber-700' : 'text-rose-700'
                        }`}>{preScore}%</span>
                      </div>
                      <p className={`text-[15px] font-black ${
                        preScore! >= 70 ? 'text-emerald-800' :
                        preScore! >= 40 ? 'text-amber-800' : 'text-rose-800'
                      }`}>
                        {preScore! >= 90 ? 'Muito parecido — ainda precisa confirmação do tutor' :
                         preScore! >= 75 ? 'Parecido — precisa confirmação humana' :
                         'Baixa confiança — confira manualmente'}
                      </p>
                      {preAnalysis && <p className="text-[12px] text-slate-500 mt-1.5 leading-snug">{preAnalysis}</p>}
                    </>
                  )}
                </div>
              )}

              {/* Botões */}
              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  onClick={() => handleSubmitReport(focusedId)}
                  disabled={!reportContact.trim() || submitting}
                  className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-[17px] shadow-lg shadow-emerald-200 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Enviando aviso...' : `Enviar possível match para o tutor`}
                </button>

                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl border-2 border-[#25D366] text-[#25D366] font-black text-[16px] active:scale-[0.98] transition-all"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Ligar no WhatsApp direto
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

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

        {/* Photo-first matching */}
        <section className="rounded-[28px] border border-emerald-500/25 bg-gradient-to-br from-emerald-950/70 via-[#10201A] to-[#0E0C0B] px-4 py-4 shadow-2xl shadow-black/30">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-400/15 border border-emerald-300/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">📷</span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[21px] font-black text-white leading-tight">
                Encontrou um pet?
              </h1>
              <p className="text-[13px] text-white/55 mt-1 leading-relaxed">
                Tire uma foto e a IA procura os alertas mais parecidos para você.
              </p>
            </div>
          </div>

          <input
            ref={matchInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.bmp,.tiff,.tif,.avif,image/*"
            className="hidden"
            onChange={handleMatchPhotoCapture}
          />
          <input
            ref={matchCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleMatchPhotoCapture}
          />

          <div className="mt-4 grid gap-3">
            {matchPhotos[0] ? (
              <div className="relative overflow-hidden rounded-3xl border border-emerald-300/20 bg-black/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={matchPhotos[0]} alt="Foto enviada" className="w-full h-64 object-contain bg-black" />
                <button
                  type="button"
                  onClick={() => {
                    setMatchPhotos([]);
                    setMatchResults([]);
                    setMatchAnalyzed(null);
                    setMatchError('');
                  }}
                  className="absolute right-3 top-3 h-9 w-9 rounded-full bg-black/65 text-white text-xl leading-none backdrop-blur active:scale-95"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="rounded-3xl border-2 border-dashed border-emerald-300/30 bg-white/5 px-4 py-6 text-center">
                <span className="block text-5xl">📸</span>
                <span className="mt-3 block text-[18px] font-black text-white">Comece com uma foto do pet</span>
                <span className="mt-1 block text-[12px] text-white/45">Use uma foto já tirada ou abra a câmera.</span>
                <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => matchInputRef.current?.click()}
                    className="rounded-2xl bg-emerald-500 px-4 py-3.5 text-[15px] font-black text-white shadow-lg shadow-emerald-950/30 active:scale-[0.98] transition-transform"
                  >
                    Escolher da galeria
                  </button>
                  <button
                    type="button"
                    onClick={() => matchCameraInputRef.current?.click()}
                    className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3.5 text-[15px] font-black text-white/80 active:scale-[0.98] transition-transform"
                  >
                    Tirar foto agora
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={matchPhotos[0] ? handleRunPhotoMatch : () => matchInputRef.current?.click()}
              disabled={matchLoading}
              className="w-full rounded-2xl bg-emerald-500 py-4 text-[16px] font-black text-white shadow-lg shadow-emerald-950/40 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {matchLoading ? 'IA procurando candidatos...' : matchPhotos[0] ? 'Buscar pets parecidos' : 'Escolher foto da galeria'}
            </button>
          </div>

          {matchLoading && (
            <div className="mt-4 rounded-2xl bg-white/6 border border-white/10 px-4 py-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="mt-3 text-center text-[13px] font-semibold text-white/60">
                Comparando a foto com os alertas ativos...
              </p>
            </div>
          )}

          {!matchLoading && matchAnalyzed != null && matchResults.length > 0 && (
            <div className="mt-5 space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[12px] font-black uppercase tracking-widest text-emerald-200/70">Candidatos para revisar</p>
                  <p className="text-[12px] text-white/45">IA analisou {matchAnalyzed} alertas. O tutor ainda precisa confirmar.</p>
                </div>
                <button
                  type="button"
                  onClick={() => matchInputRef.current?.click()}
                  className="rounded-full bg-white/8 px-3 py-1.5 text-[12px] font-bold text-white/65 border border-white/10"
                >
                  Trocar foto
                </button>
              </div>

              {matchResults.map((pet) => (
                <Link
                  key={pet.id}
                  href={`/achei-um-pet?id=${pet.id}`}
                  className="flex gap-3 rounded-3xl bg-white/8 border border-white/10 p-2.5 active:scale-[0.99] transition-transform"
                >
                  <div className="relative h-28 w-28 overflow-hidden rounded-2xl bg-black flex-shrink-0">
                    {pet.photo_url ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={resolvePetPhotoUrl(pet.photo_url) ?? ''} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 blur-md scale-110" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={resolvePetPhotoUrl(pet.photo_url) ?? ''} alt={pet.pet_name} className="relative h-full w-full object-contain" />
                      </>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl opacity-40">{pet.species === 'cat' ? '🐱' : '🐶'}</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 py-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[12px] font-black ${
                        pet.score >= 90 ? 'bg-emerald-400 text-emerald-950' :
                        pet.score >= 75 ? 'bg-amber-300 text-amber-950' :
                        'bg-white/15 text-white/70'
                      }`}>
                        {pet.score}%
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-white/35">
                        {pet.confidence_label || (pet.score >= 90 ? 'muito parecido' : pet.score >= 75 ? 'precisa revisar' : 'baixa confiança')}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-[20px] font-black leading-tight text-white">{pet.pet_name}</p>
                    <p className="truncate text-[12px] text-white/45">
                      {[pet.species === 'cat' ? 'Gato' : 'Cão', pet.breed].filter(Boolean).join(' · ')}
                    </p>
                    {pet.analysis && <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-white/60">{pet.analysis}</p>}
                    <p className="mt-1 text-[11px] font-semibold text-white/35">Não confirma sozinho. Toque e envie para o tutor revisar.</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {!matchLoading && matchError && (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-[13px] font-semibold text-amber-100">
              {matchError}
            </div>
          )}
        </section>

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
    <div className={`relative rounded-[28px] overflow-hidden border transition-all shadow-2xl shadow-black/25 ${
      isFound
        ? 'border-emerald-700/30 bg-emerald-950/20'
        : 'border-red-900/30 bg-[#160A08]'
    }`}>

      {/* Found badge */}
      {isFound && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-emerald-600 text-white text-[11px] font-black px-3 py-1.5 rounded-full shadow-lg">
          <span>✓</span> Encontrado com o PETMOL
        </div>
      )}

      {/* Photo */}
      {pet.photo_url ? (
        <Link href={`/achei-um-pet?id=${pet.id}`} className="relative block w-full overflow-hidden bg-[#0E0C0B]" style={{ height: 'min(68vh, 520px)', minHeight: 360 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvePetPhotoUrl(pet.photo_url) ?? ''}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xl scale-110"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvePetPhotoUrl(pet.photo_url) ?? ''}
            alt={pet.pet_name}
            className={`relative z-[1] w-full h-full object-contain ${isFound ? 'opacity-60 grayscale' : ''}`}
          />
          <div className="absolute inset-0 z-[2] bg-gradient-to-b from-black/30 via-transparent to-black/85" />
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white backdrop-blur">
            <span className={`h-2 w-2 rounded-full ${isFound ? 'bg-emerald-400' : 'bg-red-500 animate-pulse'}`} />
            {isFound ? 'Encontrado' : 'Desaparecido'}
          </div>
          {!isFound && (
            <div className="absolute top-3 right-3 z-10 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-black text-red-700 shadow-lg">
              {timeAgo(pet.created_at)}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-4">
            <p className="text-[12px] font-bold uppercase tracking-widest text-white/65">
              {[pet.species === 'cat' ? 'Gato' : 'Cão', pet.breed].filter(Boolean).join(' · ')}
            </p>
            <h2 className={`mt-1 text-[34px] font-black leading-none ${isFound ? 'text-white/65 line-through' : 'text-white'}`} style={{ textShadow: '0 2px 16px rgba(0,0,0,0.55)' }}>
              {pet.pet_name}
            </h2>
          </div>
        </Link>
      ) : (
        <Link href={`/achei-um-pet?id=${pet.id}`} className={`block w-full h-72 flex items-center justify-center ${isFound ? 'bg-slate-900/30' : 'bg-red-950/20'}`}>
          <span className="text-6xl opacity-30">{speciesEmoji}</span>
        </Link>
      )}

      {/* Content */}
      <div className="px-4 pt-3 pb-4 space-y-3">

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/6 border border-white/8 px-3 py-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Quando</p>
            <p className="mt-0.5 text-[12px] font-bold text-white/75 leading-snug">{formatMissingDate(pet.missing_date, pet.missing_time)}</p>
          </div>
          <Link
            href={`/achei-um-pet?id=${pet.id}`}
            className="rounded-2xl bg-red-700/20 border border-red-500/25 px-3 py-2.5 active:scale-[0.98] transition-transform"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-red-200/70">Ver foto</p>
            <p className="mt-0.5 text-[12px] font-black text-white leading-snug">Abrir detalhes</p>
          </Link>
        </div>

        {/* Location */}
        {pet.last_seen_location && (
          <div className="flex items-start gap-2 rounded-2xl bg-white/5 px-3.5 py-3 text-[12px] text-white/68 border border-white/8">
            <span className="flex-shrink-0 mt-0.5">📍</span>
            <span className="leading-snug line-clamp-2">{pet.last_seen_location}</span>
          </div>
        )}

        {/* Characteristics */}
        {pet.characteristics && (
          <div className="bg-white/5 rounded-2xl px-3.5 py-3 border border-white/8">
            <p className="text-[11px] font-bold text-white/40 uppercase tracking-wide mb-1">Características</p>
            <p className="text-[13px] text-white/70 leading-relaxed line-clamp-3">{pet.characteristics}</p>
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
