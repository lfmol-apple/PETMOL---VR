'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { PetDocumentVault } from '@/components/PetDocumentVault';
import { API_BASE_URL } from '@/lib/api';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import type { VaccineRecord } from '@/lib/petHealth';
import type { VetHistoryDocument } from '@/lib/types/homeForms';
import type { PetEventRecord } from '@/lib/petEvents';
import type { ParasiteControl, GroomingRecord } from '@/lib/types/home';
import { ModalPortal } from '@/components/ModalPortal';

// ── Types ─────────────────────────────────────────────────────────────────

type VaultPet = {
  pet_id: string;
  pet_name: string;
  species?: string;
  breed?: string;
  birth_date?: string;
  health_data?: {
    parasite_controls?: ParasiteControl[];
    grooming_records?: GroomingRecord[];
  };
};

interface MedicalVaultModalProps {
  currentPet: VaultPet | null | undefined;
  setShowMedicalVault: (value: boolean) => void;
  setVetHistoryDocs: Dispatch<SetStateAction<VetHistoryDocument[]>>;
  vaccines?: VaccineRecord[];
  parasiteControls?: ParasiteControl[];
  groomingRecords?: GroomingRecord[];
  petEvents?: PetEventRecord[];
  vetHistoryDocs?: VetHistoryDocument[];
  pendingFiles?: File[];
  onFilesConsumed?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────

const DOC_FOLDERS = [
  { id: 'exam',         icon: '🔬', label: 'Exames',           bg: 'bg-blue-50',   border: 'border-blue-200'   },
  { id: 'vaccine',      icon: '📔', label: 'Carteirinha',      bg: 'bg-green-50',  border: 'border-green-200'  },
  { id: 'prescription', icon: '📋', label: 'Receitas',         bg: 'bg-purple-50', border: 'border-purple-200' },
  { id: 'report',       icon: '📄', label: 'Laudos',           bg: 'bg-indigo-50', border: 'border-indigo-200' },
  { id: 'comprovante',  icon: '🧾', label: 'Comprovantes',     bg: 'bg-amber-50',  border: 'border-amber-200'  },
  { id: 'other',        icon: '📎', label: 'Outros',           bg: 'bg-gray-50',   border: 'border-gray-200'   },
];

const EVENT_ICONS: Record<string, string> = {
  consulta: '🩺', retorno: '🔁', exame_lab: '🔬', exame_imagem: '📷',
  cirurgia: '✂️', odonto: '🦷', medicacao: '💊', emergencia: '🚨',
  racao: '🥣', outro: '📝',
};

// ── Utils ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${d} ${months[m - 1]} ${y}`;
}

// ── Build unified event list ───────────────────────────────────────────────

type AppEvent = {
  date: string;
  icon: string;
  label: string;
  sub: string;
  detail?: string;
  section: string;
};

// Types already covered by dedicated data sources (vaccines[], parasites[], grooming[])
// — exclude from petEvents to avoid duplication in timeline and PDF
const DEDUPLICATED_EVENT_TYPES = new Set([
  'vaccine',
  'dewormer', 'flea_tick', 'heartworm', 'collar', 'leishmaniasis',
  'bath', 'grooming', 'bath_grooming',
]);

function buildAllEvents(
  vaccines: VaccineRecord[],
  parasites: ParasiteControl[],
  grooming: GroomingRecord[],
  petEvts: PetEventRecord[],
): AppEvent[] {
  const events: AppEvent[] = [];

  vaccines
    .filter((v) => v.date_administered)
    .forEach((v) => events.push({
      date: v.date_administered!,
      icon: '💉',
      label: v.vaccine_name || 'Vacina',
      sub: [v.veterinarian ? `Dr(a). ${v.veterinarian}` : '', v.clinic_name || ''].filter(Boolean).join(' · '),
      section: 'Vacinas',
    }));

  const parasiteIcons: Record<string, string> = { dewormer: '🪱', flea_tick: '🦟', collar: '⭕', heartworm: '💓', leishmaniasis: '🛡️' };
  const parasiteLabels: Record<string, string> = { dewormer: 'Vermífugo', flea_tick: 'Antipulgas/Carrapato', collar: 'Coleira', heartworm: 'Filária', leishmaniasis: 'Leishmaniose' };
  parasites
    .filter((p) => p.date_applied)
    .forEach((p) => events.push({
      date: p.date_applied!,
      icon: parasiteIcons[p.type] ?? '🦟',
      label: parasiteLabels[p.type] ?? 'Antiparasitário',
      sub: [p.product_name, p.veterinarian ? `Dr(a). ${p.veterinarian}` : ''].filter(Boolean).join(' · '),
      detail: p.next_due_date ? `Próxima: ${fmtDate(p.next_due_date)}` : undefined,
      section: 'Antiparasitários',
    }));

  grooming
    .filter((g) => g.date)
    .forEach((g) => {
      const label = g.type === 'bath' ? 'Banho' : g.type === 'grooming' ? 'Tosa' : 'Banho e Tosa';
      events.push({
        date: g.date,
        icon: '🛁',
        label,
        sub: [g.groomer, g.location].filter(Boolean).join(' · '),
        section: 'Higiene',
      });
    });

  petEvts
    .filter((ev) => ev.scheduled_at && ev.source !== 'document' && !DEDUPLICATED_EVENT_TYPES.has(ev.type))
    .forEach((ev) => events.push({
      date: ev.scheduled_at.split('T')[0],
      icon: EVENT_ICONS[ev.type] ?? '📝',
      label: ev.title,
      sub: [ev.professional_name ? `Dr(a). ${ev.professional_name}` : '', ev.location_name || ''].filter(Boolean).join(' · '),
      detail: ev.cost ? `R$ ${Number(ev.cost).toFixed(2)}` : undefined,
      section: 'Consultas e Eventos',
    }));

  return events.sort((a, b) => b.date.localeCompare(a.date));
}

// ── Component ──────────────────────────────────────────────────────────────

export function MedicalVaultModal({
  currentPet,
  setShowMedicalVault,
  setVetHistoryDocs,
  vaccines = [],
  parasiteControls,
  groomingRecords,
  petEvents = [],
  vetHistoryDocs = [],
  pendingFiles,
  onFilesConsumed,
}: MedicalVaultModalProps) {
  const [openedCategory, setOpenedCategory] = useState<string | null>(null);
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  type ZipPhase = 'idle' | 'generating' | 'downloading' | 'done';
  const [zipPhase, setZipPhase] = useState<ZipPhase>('idle');
  const [zipProgress, setZipProgress] = useState(0);
  type PdfPhase = 'idle' | 'generating' | 'preview';
  const [pdfPhase, setPdfPhase] = useState<PdfPhase>('idle');
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [localPending, setLocalPending] = useState<File[] | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const pdfContentRef = useRef<HTMLDivElement>(null);
  const pdfZoomRef = useRef(1);

  useEffect(() => {
    if (!currentPet?.pet_id) return;
    const token = localStorage.getItem('petmol_token');
    if (!token) return;
    fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (Array.isArray(data)) setVetHistoryDocs(data); })
      .catch(() => {});
  }, [currentPet?.pet_id, setVetHistoryDocs]);

  useEffect(() => {
    const container = pdfScrollRef.current;
    const content = pdfContentRef.current;
    if (!container || !content || pdfPages.length === 0) return;

    let scale = 1, tx = 0, ty = 0;
    let pinchActive = false, pinchLastDist = 0, pinchLastMidX = 0, pinchLastMidY = 0;
    let panActive = false, panBaseTx = 0, panBaseTy = 0, panBaseX = 0, panBaseY = 0;
    let lastTap = 0;

    const clampAndApply = (animated: boolean) => {
      const cW = container.clientWidth;
      const cH = container.clientHeight;
      const elH = content.offsetHeight;
      scale = Math.max(1, Math.min(5, scale));
      if (scale <= 1.005) {
        scale = 1; tx = 0;
        ty = Math.min(0, Math.max(cH - elH, ty));
      } else {
        tx = Math.min(0, Math.max(cW - cW * scale, tx));
        ty = Math.min(0, Math.max(cH - elH * scale, ty));
      }
      content.style.transition = animated ? 'transform 0.2s ease-out' : 'none';
      content.style.transform = (scale === 1 && tx === 0 && ty === 0) ? 'none' : `translate(${tx}px,${ty}px) scale(${scale})`;
      pdfZoomRef.current = scale;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchActive = true; panActive = false;
        pinchLastDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        const r = container.getBoundingClientRect();
        pinchLastMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
        pinchLastMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      } else if (e.touches.length === 1 && !pinchActive) {
        panActive = true;
        panBaseTx = tx; panBaseTy = ty;
        panBaseX = e.touches[0].clientX; panBaseY = e.touches[0].clientY;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (pinchActive && e.touches.length >= 2) {
        e.preventDefault();
        const newDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        const r = container.getBoundingClientRect();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
        const f = newDist / pinchLastDist;
        tx = midX - f * (midX - tx) + (midX - pinchLastMidX);
        ty = midY - f * (midY - ty) + (midY - pinchLastMidY);
        scale *= f;
        pinchLastDist = newDist; pinchLastMidX = midX; pinchLastMidY = midY;
        clampAndApply(false);
      } else if (panActive && e.touches.length === 1 && !pinchActive) {
        e.preventDefault();
        tx = panBaseTx + (scale > 1.05 ? e.touches[0].clientX - panBaseX : 0);
        ty = panBaseTy + (e.touches[0].clientY - panBaseY);
        clampAndApply(false);
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinchActive) {
        pinchActive = false;
        clampAndApply(true);
        if (e.touches.length === 1) {
          panActive = true;
          panBaseTx = tx; panBaseTy = ty;
          panBaseX = e.touches[0].clientX; panBaseY = e.touches[0].clientY;
        }
      } else if (e.touches.length === 0 && !pinchActive) {
        panActive = false;
        clampAndApply(true);
        if (e.changedTouches.length === 1) {
          const now = Date.now();
          if (now - lastTap < 300) {
            if (scale > 1.5) {
              scale = 1; tx = 0; ty = 0;
            } else {
              const r = container.getBoundingClientRect();
              const tapX = e.changedTouches[0].clientX - r.left;
              const tapY = e.changedTouches[0].clientY - r.top;
              scale = 2.5;
              tx = tapX * (1 - 2.5);
              ty = tapY * (1 - 2.5);
            }
            clampAndApply(true);
          }
          lastTap = now;
        }
      }
    };

    container.addEventListener('touchstart', onStart, { passive: false });
    container.addEventListener('touchmove', onMove, { passive: false });
    container.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', onStart);
      container.removeEventListener('touchmove', onMove);
      container.removeEventListener('touchend', onEnd);
    };
  }, [pdfPages]);

  if (!currentPet) return null;

  const parasites  = parasiteControls ?? currentPet.health_data?.parasite_controls ?? [];
  const grooming   = groomingRecords  ?? currentPet.health_data?.grooming_records  ?? [];
  const allEvents  = buildAllEvents(vaccines, parasites, grooming, petEvents);

  // Group by year for expanded view
  const byYear: Record<string, AppEvent[]> = {};
  allEvents.forEach((ev) => {
    const y = ev.date.split('-')[0];
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(ev);
  });
  const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a));

  const refreshDocuments = () => {
    const token = localStorage.getItem('petmol_token');
    if (!token) return;
    fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const docs = Array.isArray(data) ? data : [];
        setVetHistoryDocs(docs);
      })
      .catch(() => showAppToast('Erro ao sincronizar', { tone: 'warning' }));
  };

  const handleExportPDF = async () => {
    setExporting(true);
    setPdfPhase('generating');
    try {
      const token = localStorage.getItem('petmol_token');
      if (!token) { showAppToast('Sessão expirada. Faça login novamente.', { tone: 'warning' }); setPdfPhase('idle'); return; }
      const res = await fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/export-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('backend_error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfBlob(blob);
      setPdfBlobUrl(url);

      // Render all pages via PDF.js so iOS shows every page at the correct width
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const targetWidth = window.innerWidth;
        const dataUrls: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const baseVp = page.getViewport({ scale: 1 });
          const scale = targetWidth / baseVp.width;
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp, canvas }).promise;
          dataUrls.push(canvas.toDataURL('image/jpeg', 0.92));
        }
        setPdfPages(dataUrls);
      } catch (pdfErr) {
        // Mostra erro temporariamente para diagnóstico
        showAppToast('PDF.js: ' + String(pdfErr).slice(0, 80), { tone: 'warning' });
      }
      setPdfPhase('preview');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        showAppToast('Não foi possível gerar o PDF. Tente novamente.', { tone: 'warning' });
      }
      setPdfPhase('idle');
    } finally {
      setExporting(false);
    }
  };

  const handleSharePDF = async () => {
    if (!pdfBlob || !pdfBlobUrl) return;
    const safe = currentPet!.pet_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const fileName = `historico-${safe}.pdf`;
    let shared = false;
    try {
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: `Histórico de ${currentPet!.pet_name}` });
        shared = true;
      }
    } catch (_) {}
    if (!shared) {
      const a = document.createElement('a');
      a.href = pdfBlobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleDownloadPDF = () => {
    if (!pdfBlobUrl) return;
    const safe = currentPet!.pet_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const a = document.createElement('a');
    a.href = pdfBlobUrl;
    a.download = `historico-${safe}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleClosePDFPreview = () => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlob(null);
    setPdfBlobUrl(null);
    setPdfPages([]);
    setPdfPhase('idle');
    pdfZoomRef.current = 1;
    if (pdfContentRef.current) { pdfContentRef.current.style.transform = 'none'; pdfContentRef.current.style.transition = 'none'; }
  };

  const handleExportZip = async () => {
    setZipPhase('generating');
    setZipProgress(0);
    try {
      const authToken = localStorage.getItem('petmol_token');
      if (!authToken) {
        showAppToast('Sessão expirada. Faça login novamente.', { tone: 'warning' });
        setZipPhase('idle');
        return;
      }

      const tokenRes = await fetch(`${API_BASE_URL}/pets/${currentPet!.pet_id}/export-zip/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!tokenRes.ok) throw new Error();
      const { token: dlToken } = await tokenRes.json();

      const downloadUrl = `${window.location.origin}${API_BASE_URL}/pets/download/zip/${dlToken}`;

      // Blocks while server builds the ZIP (generating phase); resolves when first bytes arrive
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error();

      setZipPhase('downloading');

      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : null;
      const reader = response.body!.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value as Uint8Array<ArrayBuffer>);
        received += value.byteLength;
        if (total) setZipProgress(Math.min(99, Math.round((received / total) * 100)));
      }

      setZipProgress(100);

      const blob = new Blob(chunks, { type: 'application/zip' });
      const safe = currentPet!.pet_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const fileName = `documentos-${safe}.zip`;

      // Try Web Share API; any failure (including NotAllowedError after async gap) falls back to a.click()
      let shared = false;
      try {
        const zipFile = new File([blob], fileName, { type: 'application/zip' });
        if (
          typeof navigator.share === 'function' &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [zipFile] })
        ) {
          await navigator.share({ files: [zipFile], title: `Documentos de ${currentPet!.pet_name}` });
          shared = true;
        }
      } catch (_) {
        // share failed or was cancelled — fall through to anchor download
      }

      if (!shared) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }

      setZipPhase('done');
    } catch (err) {
      showAppToast('Não foi possível gerar o ZIP. Tente novamente.', { tone: 'warning' });
      setZipPhase('idle');
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const inVault = openedCategory !== null;
  const selectedFolder = DOC_FOLDERS.find((f) => f.id === openedCategory);

  const lastVaccine = vaccines
    .filter((v) => v.date_administered)
    .sort((a, b) => (b.date_administered || '').localeCompare(a.date_administered || ''))[0];

  const handleQuickUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLocalPending(Array.from(files));
    setOpenedCategory('all');
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-[32px] shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92dvh] overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <div className="bg-white border-b border-blue-100 px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {inVault && (
                <button
                  onClick={() => setOpenedCategory(null)}
                  className="text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
                  aria-label="Voltar"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-5 h-5">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
              )}
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                <span className="text-xl">{inVault ? (selectedFolder?.icon ?? '🗂️') : '📓'}</span>
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 truncate">
                  {inVault
                    ? (selectedFolder?.label ?? 'Todos os documentos')
                    : `Caderneta de ${currentPet.pet_name}`}
                </h2>
                {!inVault && (
                  <p className="text-slate-500 text-xs truncate">Documentos e histórico de saúde</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowMedicalVault(false)}
                className="w-9 h-9 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500 text-lg transition-colors"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 flex flex-col">

          {/* ─── ZIP progress / done — full-height centered overlay ── */}
          {zipPhase !== 'idle' && !inVault && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6 text-center">
              {zipPhase === 'done' ? (
                <>
                  <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center text-5xl">✅</div>
                  <div>
                    <p className="font-bold text-slate-900 text-xl">ZIP baixado!</p>
                    <p className="text-slate-500 text-sm mt-1">Arquivo salvo no dispositivo</p>
                  </div>
                  <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button
                      type="button"
                      onClick={() => setZipPhase('idle')}
                      className="w-full py-3 rounded-2xl border border-slate-300 bg-white text-slate-700 font-semibold text-[14px] hover:bg-slate-50 transition-colors"
                      style={{ touchAction: 'manipulation' }}
                    >
                      Baixar novamente
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMedicalVault(false)}
                      className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[14px] transition-colors shadow-md shadow-blue-500/25"
                      style={{ touchAction: 'manipulation' }}
                    >
                      ← Voltar ao início
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center text-5xl">🗜️</div>
                  <div>
                    <p className="font-bold text-slate-900 text-xl">
                      {zipPhase === 'generating' ? 'Gerando ZIP…' : `Baixando… ${zipProgress}%`}
                    </p>
                    <p className="text-slate-500 text-sm mt-1">
                      {zipPhase === 'generating' ? 'Compactando seus documentos' : 'Não feche esta tela'}
                    </p>
                  </div>
                  <div className={`w-full max-w-xs h-2.5 rounded-full overflow-hidden ${(zipPhase === 'generating' || zipProgress === 0) ? 'bg-blue-300 animate-pulse' : 'bg-slate-200'}`}>
                    {zipProgress > 0 && (
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-300"
                        style={{ width: `${zipProgress}%` }}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── HOME ──────────────────────────────────────────────────── */}
          {!inVault && zipPhase === 'idle' && pdfPhase === 'idle' && (
            <div className="flex flex-col gap-2 p-3">

              {/* Carteirinha hero */}
              <div className="rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 p-2.5 shadow-md">
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <p className="text-white text-base font-bold leading-tight">{currentPet.pet_name}</p>
                    <p className="text-blue-200 text-xs mt-0.5">
                      {currentPet.species === 'cat' ? 'Gato' : currentPet.species === 'dog' ? 'Cachorro' : currentPet.species || 'Pet'}
                      {currentPet.breed ? ` · ${currentPet.breed}` : ''}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-xl border border-white/20">
                    {currentPet.species === 'cat' ? '🐱' : '🐶'}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <div className="flex-1 bg-white/10 rounded-xl px-2 py-1 border border-white/10">
                    <p className="text-blue-200 text-[9px] uppercase tracking-wide font-medium">Última vacina</p>
                    <p className="text-white font-bold text-sm mt-0.5">
                      {lastVaccine ? fmtDate(lastVaccine.date_administered) : '—'}
                    </p>
                  </div>
                  <div className="flex-1 bg-white/10 rounded-xl px-2 py-1 border border-white/10">
                    <p className="text-blue-200 text-[9px] uppercase tracking-wide font-medium">Documentos</p>
                    <p className="text-white font-bold text-sm mt-0.5">{vetHistoryDocs.length} {vetHistoryDocs.length === 1 ? 'arquivo' : 'arquivos'}</p>
                  </div>
                  <div className="flex-1 bg-white/10 rounded-xl px-2 py-1 border border-white/10">
                    <p className="text-blue-200 text-[9px] uppercase tracking-wide font-medium">Eventos</p>
                    <p className="text-white font-bold text-sm mt-0.5">{allEvents.length}</p>
                  </div>
                </div>
              </div>

              {/* Pending share banner */}
              {pendingFiles && pendingFiles.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <span className="text-xl flex-shrink-0">📎</span>
                  <p className="text-[13px] text-emerald-800 font-semibold leading-snug flex-1">
                    {pendingFiles.length === 1
                      ? '1 arquivo recebido — escolha uma pasta para salvar'
                      : `${pendingFiles.length} arquivos recebidos — escolha uma pasta para salvar`}
                  </p>
                </div>
              )}

              {/* Botão adicionar */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="sr-only"
                  onChange={(e) => handleQuickUpload(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all text-white text-[14px] font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/25"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span className="text-xl">+</span>
                  Adicionar documento
                </button>
              </div>

              {/* 4 categorias principais em destaque */}
              {(() => {
                const main = [
                  { id: 'vaccine',      icon: '💉', label: 'Vacinas',   accent: 'text-green-700',  badge: 'bg-green-100 text-green-700',  card: 'bg-green-50 border-green-200'  },
                  { id: 'exam',         icon: '🔬', label: 'Exames',    accent: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700',    card: 'bg-blue-50 border-blue-200'    },
                  { id: 'report',       icon: '📄', label: 'Laudos',    accent: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-700',card: 'bg-indigo-50 border-indigo-200'},
                  { id: 'prescription', icon: '💊', label: 'Receitas',  accent: 'text-purple-700', badge: 'bg-purple-100 text-purple-700',card: 'bg-purple-50 border-purple-200'},
                ] as const;
                return (
                  <div className="grid grid-cols-2 gap-2">
                    {main.map((f) => {
                      const docs = vetHistoryDocs.filter((d) => (d.category || 'other') === f.id);
                      const recent = docs.slice().sort((a, b) => (b.document_date || b.created_at || '').localeCompare(a.document_date || a.created_at || '')).at(0);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setOpenedCategory(f.id)}
                          className={`flex flex-col gap-1 p-2.5 rounded-2xl border transition-all active:scale-[0.97] hover:shadow-md text-left ${f.card}`}
                          style={{ touchAction: 'manipulation' }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xl">{f.icon}</span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${docs.length > 0 ? f.badge : 'bg-slate-100 text-slate-400'}`}>
                              {docs.length}
                            </span>
                          </div>
                          <p className={`font-black text-[13px] leading-tight ${f.accent}`}>{f.label}</p>
                          <p className="text-[10px] text-slate-400 leading-tight truncate">
                            {recent ? fmtDate(recent.document_date || recent.created_at) : 'Nenhum'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Outros — comprovantes e outros em row compacta */}
              <div className="grid grid-cols-2 gap-2">
                {DOC_FOLDERS.filter((f) => f.id === 'comprovante' || f.id === 'other').map((folder) => {
                  const count = vetHistoryDocs.filter((d) => (d.category || 'other') === folder.id).length;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => setOpenedCategory(folder.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl border transition-all active:scale-[0.96] ${folder.bg} ${folder.border}`}
                      style={{ touchAction: 'manipulation' }}
                    >
                      <span className="text-xl">{folder.icon}</span>
                      <p className="font-semibold text-slate-700 text-[13px] flex-1 text-left">{folder.label}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${count > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Eventos — collapsible */}
              <div className="rounded-2xl border border-indigo-200 bg-white overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setEventsExpanded((v) => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span className="text-xl">📋</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-indigo-900 text-[14px]">Linha do tempo</p>
                    <p className="text-xs text-indigo-400 mt-0.5">
                      {allEvents.length === 0 ? 'Nenhum evento registrado' : `${allEvents.length} evento${allEvents.length !== 1 ? 's' : ''} · toque para expandir`}
                    </p>
                  </div>
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    className={`w-4 h-4 text-indigo-400 transition-transform flex-shrink-0 ${eventsExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {eventsExpanded && (
                  <div className="border-t border-slate-100">
                    {allEvents.length === 0 ? (
                      <p className="text-center text-slate-400 text-sm py-8">Nenhum evento registrado ainda.</p>
                    ) : (
                      <div className="p-3 space-y-5">
                        {years.map((year) => (
                          <div key={year}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex-1 h-px bg-slate-200" />
                              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{year}</span>
                              <div className="flex-1 h-px bg-slate-200" />
                            </div>
                            <div className="space-y-1.5 pl-1">
                              {byYear[year].map((ev, i) => (
                                <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                                  <span className="text-base flex-shrink-0 mt-0.5">{ev.icon}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <p className="text-[13px] font-semibold text-slate-900 truncate">{ev.label}</p>
                                      <span className="text-[11px] text-slate-400 flex-shrink-0">{fmtDate(ev.date)}</span>
                                    </div>
                                    {ev.sub && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{ev.sub}</p>}
                                    {ev.detail && <p className="text-[10px] text-slate-400 mt-0.5">{ev.detail}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Exportar */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportPDF}
                  disabled={exporting}
                  className="flex-1 flex items-center gap-2 px-3 py-3 rounded-2xl border border-blue-200 bg-blue-50 hover:bg-blue-100 active:scale-[0.98] transition-all disabled:opacity-60"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span className="text-lg">{exporting ? '⏳' : '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-blue-900 text-[13px] leading-tight">
                      {exporting ? 'Gerando…' : 'Exportar PDF'}
                    </p>
                    <p className="text-[10px] text-blue-500 mt-0.5">Histórico completo</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleExportZip}
                  className="flex-1 flex items-center gap-2 px-3 py-3 rounded-2xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 active:scale-[0.98] transition-all"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span className="text-lg">🗜️</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-emerald-900 text-[13px] leading-tight">Exportar ZIP</p>
                    <p className="text-[10px] text-emerald-600 mt-0.5">Arquivos originais</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ─── VAULT ────────────────────────────────────────────────── */}
          {inVault && (
            <div className="px-4 py-4 sm:p-6">
              <PetDocumentVault
                petId={currentPet.pet_id}
                onDocsChanged={refreshDocuments}
                initialCategory={openedCategory === 'all' ? 'all' : openedCategory ?? 'all'}
                hideCategoryTabs={openedCategory !== 'all'}
                pendingFiles={localPending ?? pendingFiles}
                onFilesConsumed={() => { setLocalPending(undefined); onFilesConsumed?.(); }}
              />
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-slate-200 px-4 py-3 bg-slate-50 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => {
              if (inVault) { setOpenedCategory(null); }
              else { refreshDocuments(); setShowMedicalVault(false); }
            }}
            className="px-4 py-2 bg-[#0056D2] text-white rounded-lg font-semibold text-sm hover:bg-[#0047ad] transition-colors"
          >
            {inVault ? '← Voltar' : '✓ Fechar'}
          </button>
          <p className="text-xs text-slate-400 ml-auto">Arquivos privados e protegidos</p>
        </div>

      </div>
    </div>

    {/* ── PDF full-screen viewer ── */}
    {pdfPhase !== 'idle' && (
      <div className="fixed inset-0 z-[60] flex flex-col bg-white">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
          <button
            type="button"
            onClick={handleClosePDFPreview}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors flex-shrink-0"
            style={{ touchAction: 'manipulation' }}
            aria-label="Voltar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-5 h-5 text-slate-600">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 text-sm truncate">Histórico de {currentPet.pet_name}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Histórico completo de saúde</p>
          </div>
        </div>

        {/* Content */}
        {pdfPhase === 'generating' ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="w-24 h-24 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center text-6xl animate-pulse">📄</div>
            <div>
              <p className="font-bold text-slate-900 text-xl">Gerando PDF…</p>
              <p className="text-slate-500 text-sm mt-2">Preparando o histórico de saúde</p>
            </div>
            <div className="w-64 h-2.5 rounded-full bg-blue-300 animate-pulse" />
          </div>
        ) : pdfPages.length > 0 ? (
          <div
            ref={pdfScrollRef}
            className="flex-1 overflow-hidden bg-slate-100 relative"
            style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' as const }}
          >
            <div ref={pdfContentRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transformOrigin: '0 0', willChange: 'transform' }}>
              {pdfPages.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`Página ${i + 1}`}
                  style={{ width: '100%', display: 'block' }}
                  draggable={false}
                />
              ))}
            </div>
          </div>
        ) : pdfBlobUrl ? (
          <iframe
            src={pdfBlobUrl}
            className="flex-1 w-full"
            title={`Histórico de ${currentPet.pet_name}`}
            style={{ border: 'none', minHeight: 0 }}
          />
        ) : null}

        {/* Bottom actions */}
        {pdfPhase === 'preview' && (
          <div className="flex gap-3 p-4 border-t border-slate-200 bg-white flex-shrink-0">
            <button
              type="button"
              onClick={handleSharePDF}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 font-bold text-[15px] hover:bg-blue-100 active:scale-[0.98] transition-all"
              style={{ touchAction: 'manipulation' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              Compartilhar
            </button>
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-[15px] transition-all shadow-md shadow-blue-500/25"
              style={{ touchAction: 'manipulation' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Salvar
            </button>
          </div>
        )}
      </div>
    )}
    </ModalPortal>
  );
}
