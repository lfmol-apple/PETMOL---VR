'use client';
import { getToken } from '@/lib/auth-token';
import { useState, useEffect, useRef, useMemo } from 'react';
import { AuthenticatedDocumentImage } from '@/components/AuthenticatedDocumentImage';
import { API_BASE_URL } from '@/lib/api';
import { buildDocumentFilename, fetchDocumentBlob, shareOrDownload, triggerBrowserDownload } from '@/lib/documentFile';
import { useI18n } from '@/lib/I18nContext';
import { trackV1Metric } from '@/lib/v1Metrics';
import { groupVaultDocumentsByMonth } from '@/components/petDocuments/vaultHelpers';
import type { VaultPetDocument } from '@/components/petDocuments/types';
import { localTodayISO } from '@/lib/localDate';
import type {
  PetDocument,
  BatchDocItem,
  BatchConfirm,
  DiscoveredItem,
  EditingDoc,
  PetDocumentVaultProps,
} from '@/features/documents/types';
import { fmtBytes, fmtDate, resolveDocDate } from '@/features/documents/utils';
import { loadImageElement, buildPdfFromJpeg, convertImageFileToPdf } from '@/features/documents/fileProcessing';


// ── Establishment Input (local suggestions — sem API externa) ──────────────

const LS_RECENTS_KEY = 'petmol_recent_establishments';

function getRecentEstablishments(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(LS_RECENTS_KEY) || '[]'); } catch { return []; }
}

function saveRecentEstablishment(name: string) {
  if (!name.trim() || typeof window === 'undefined') return;
  try {
    const existing = getRecentEstablishments();
    const updated = [
      name.trim(),
      ...existing.filter((n) => n.toLowerCase() !== name.trim().toLowerCase()),
    ].slice(0, 20);
    localStorage.setItem(LS_RECENTS_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

function EstablishmentInput({
  value,
  onChange,
  historyNames,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  historyNames: string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const recents = getRecentEstablishments();

  const allNames = [
    ...recents,
    ...historyNames.filter((n) => !recents.some((r) => r.toLowerCase() === n.toLowerCase())),
  ];

  const filtered = value.trim().length === 0
    ? allNames.slice(0, 8)
    : allNames.filter((n) => n.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? 'Ex: Clínica VetCenter'}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 border border-gray-200 max-h-52 overflow-y-auto bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
          {filtered.map((name, i) => {
            const isRecent = recents.some((r) => r.toLowerCase() === name.toLowerCase());
            return (
              <li
                key={i}
                onMouseDown={() => { onChange(name); setOpen(false); }}
                className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 flex items-center gap-2"
              >
                <span>{isRecent ? '🕐' : '🏥'}</span>
                <span className="text-gray-800">{name}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Auto-title helper ────────────────────────────────────────────────────────

const CATEGORY_TITLE_MAP: Record<string, string> = {
  exam: 'EXAME',
  prescription: 'RECEITA',
  vaccine: 'CARTEIRINHA',
  report: 'LAUDO',
  comprovante: 'COMPROVANTE',
  other: 'DOCUMENTO',
};

function autoDocTitle(category: string, dateISO: string, idx: number, total: number): string {
  const base = CATEGORY_TITLE_MAP[category] ?? 'DOCUMENTO';
  const [y, m, d] = dateISO.split('-');
  const dateBR = y && m && d ? `${d}/${m}/${y}` : '';
  const seq = total > 1 ? ` (${idx + 1}/${total})` : '';
  return dateBR ? `${base} ${dateBR}${seq}` : `${base}${seq}`;
}

// ── Main component ──────────────────────────────────────────────────────────

export function PetDocumentVault({ petId, onDocsChanged, eventId, initialCategory, hideCategoryTabs, pendingFiles, onFilesConsumed }: PetDocumentVaultProps) {
  const { t } = useI18n();

  const CATEGORY_TABS = [
    { id: 'all',    label: t('doc.cat.all'),    icon: '📁' },
    { id: 'health', label: t('doc.cat.health'), icon: '💊' },
    { id: 'exam',   label: t('doc.cat.exams'),  icon: '🔬' },
  ];

  const HEALTH_CATS = ['vaccine', 'prescription', 'report', 'comprovante'];

  const CATEGORY_OPTIONS = [
    { value: 'exam',         label: '🔬 ' + t('upload.type_exam') },
    { value: 'vaccine',      label: '📔 Carteirinha de Vacinação' },
    { value: 'prescription', label: '📋 ' + t('upload.type_prescription') },
    { value: 'report',       label: '📄 ' + t('upload.type_report') },
    { value: 'comprovante',  label: '🧾 ' + t('upload.type_comprovante') },
    { value: 'other',        label: '📎 ' + t('upload.type_other') },
  ];

  const [docs, setDocs] = useState<PetDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [cameraUploadMode, setCameraUploadMode] = useState<'image' | 'pdf'>('image');

  // Batch confirmation (replaces old per-doc ConfirmItem[])
  const [batchConfirm, setBatchConfirm] = useState<BatchConfirm | null>(null);

  // Per-doc inline editing
  const [editingDoc, setEditingDoc] = useState<EditingDoc | null>(null);

  // Full-screen document viewer
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);   // blob: URL
  const [viewerApiUrl, setViewerApiUrl] = useState<string | null>(null); // API URL (fallback)
  const [viewerMime, setViewerMime] = useState<string>('');
  const [viewerTitle, setViewerTitle] = useState<string>('');
  const [viewerDocMimeType, setViewerDocMimeType] = useState<string>(''); // MIME type real (ex: application/pdf)
  const [viewerStorageKey, setViewerStorageKey] = useState<string>('');   // storage_key para extensão
  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);  // dedicated open flag — prevents white flash
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerDocIndex, setViewerDocIndex] = useState<number>(-1);
  const [viewerEditOpen, setViewerEditOpen] = useState(false);
  const [viewerChromeVisible, setViewerChromeVisible] = useState(true);
  // docId → blob URL; lifecycle managed by evictDistantCache + closeViewer
  const viewerBlobCache = useRef<Map<string, string>>(new Map());
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  // Direct-DOM transform target (set by image wrapper ref)
  const viewerContentRef = useRef<HTMLDivElement>(null);
  // Always holds latest navigateViewer — avoids stale closure in passive listeners
  const navigateViewerRef = useRef<(delta: -1 | 1) => void>(() => {});
  // Latest chrome-toggle setter — avoids stale closure
  const setChromeRef = useRef<(v: (p: boolean) => boolean) => void>(() => {});

  // Keep chrome setter ref fresh
  setChromeRef.current = setViewerChromeVisible;

  // Reset transform and chrome whenever the displayed doc changes
  useEffect(() => {
    const el = viewerContentRef.current;
    if (el) { el.style.transition = 'none'; el.style.transform = 'none'; }
    setViewerChromeVisible(true);
    setViewerZoom(1);
  }, [viewerDocIndex]);

  // ── Native passive gesture handler (pinch/pan/swipe/tap) ───────────
  // All transforms applied directly to DOM — zero React re-renders during gesture.
  // passive:true lets the browser keep compositing on the GPU without waiting for JS.
  useEffect(() => {
    const container = viewerContainerRef.current;
    if (!container || !viewerOpen) return;

    // Live gesture state (plain vars, no React)
    let scale = 1, tx = 0, ty = 0;
    let lastTap = 0;
    // 1-finger
    let f1StartX = 0, f1StartY = 0, f1StartTime = 0;
    let panActive = false, panBaseTx = 0, panBaseTy = 0, panBaseX = 0, panBaseY = 0;
    // 2-finger
    let pinchActive = false;
    let pinchLastDist = 0, pinchLastMidX = 0, pinchLastMidY = 0;

    function getContent(): HTMLDivElement | null {
      return viewerContentRef.current;
    }

    function applyTransform(animated = false) {
      // Clamp
      if (scale < 0.85) { scale = 1; tx = 0; ty = 0; }
      if (scale > 10) scale = 10;
      if (scale <= 1.01) { tx = 0; ty = 0; scale = Math.max(1, scale); }
      else {
        const W = window.innerWidth, H = window.innerHeight;
        const maxTx = W * (scale - 1) / 2;
        const maxTy = H * (scale - 1) / 2;
        tx = Math.max(-maxTx, Math.min(maxTx, tx));
        ty = Math.max(-maxTy, Math.min(maxTy, ty));
      }
      const el = getContent();
      if (!el) return;
      el.style.transition = animated ? 'transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)' : 'none';
      el.style.transform = scale === 1 ? 'none' : `translate(${tx}px,${ty}px) scale(${scale})`;
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        pinchActive = true;
        panActive = false;
        const t1 = e.touches[0], t2 = e.touches[1];
        pinchLastDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        pinchLastMidX = (t1.clientX + t2.clientX) / 2;
        pinchLastMidY = (t1.clientY + t2.clientY) / 2;
        return;
      }
      if (e.touches.length === 1 && !pinchActive) {
        f1StartX = e.touches[0].clientX;
        f1StartY = e.touches[0].clientY;
        f1StartTime = Date.now();
        if (scale > 1.05) {
          panActive = true;
          panBaseTx = tx; panBaseTy = ty;
          panBaseX = f1StartX; panBaseY = f1StartY;
        }
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (pinchActive && e.touches.length >= 2) {
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        const f = dist / pinchLastDist;
        // Translate so pinch midpoint stays fixed (transform-origin: 0 0)
        tx = midX - f * (midX - tx) + (midX - pinchLastMidX);
        ty = midY - f * (midY - ty) + (midY - pinchLastMidY);
        scale = scale * f;
        pinchLastDist = dist; pinchLastMidX = midX; pinchLastMidY = midY;
        applyTransform(false);
        return;
      }
      if (panActive && e.touches.length === 1) {
        tx = panBaseTx + (e.touches[0].clientX - panBaseX);
        ty = panBaseTy + (e.touches[0].clientY - panBaseY);
        applyTransform(false);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      // Went from 2-finger to 1-finger
      if (pinchActive && e.touches.length === 1) {
        applyTransform(true);
        setViewerZoom(scale);
        pinchActive = false;
        if (scale > 1.05) {
          panActive = true;
          panBaseTx = tx; panBaseTy = ty;
          panBaseX = e.touches[0].clientX; panBaseY = e.touches[0].clientY;
        }
        return;
      }
      if (pinchActive && e.touches.length === 0) {
        pinchActive = false;
        applyTransform(true);
        setViewerZoom(scale);
        return;
      }
      if (e.touches.length === 0) {
        panActive = false;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - f1StartX;
        const dy = touch.clientY - f1StartY;
        const elapsed = Date.now() - f1StartTime;
        const dist = Math.hypot(dx, dy);

        // Tap (short, small movement)
        if (dist < 12 && elapsed < 260) {
          const now = Date.now();
          if (now - lastTap < 300) {
            // Double-tap: toggle 1× ↔ 2.5×
            lastTap = 0;
            if (scale > 1.5) {
              scale = 1; tx = 0; ty = 0;
            } else {
              const W = window.innerWidth, H = window.innerHeight;
              scale = 2.5;
              // Pivot on tap point (transform-origin 0 0)
              tx = touch.clientX - touch.clientX * scale + (W / 2) * (scale - 1) - (touch.clientX - W / 2) * (scale - 1);
              ty = touch.clientY - touch.clientY * scale + (H / 2) * (scale - 1) - (touch.clientY - H / 2) * (scale - 1);
              // Simplified: keep tap point at same screen position
              tx = touch.clientX * (1 - scale);
              ty = touch.clientY * (1 - scale);
            }
            applyTransform(true);
            setViewerZoom(scale);
          } else {
            lastTap = now;
            // Single tap: toggle chrome after 300ms if not followed by another tap
            const snapLastTap = now;
            setTimeout(() => {
              if (lastTap === snapLastTap) setChromeRef.current((v) => !v);
            }, 310);
          }
          return;
        }

        // Swipe → navigate (only at 1×)
        if (scale <= 1.05 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 450) {
          navigateViewerRef.current(dx < 0 ? 1 : -1);
        }
      }
    }

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerOpen]);

  const closeViewer = () => {
    setViewerOpen(false);  // set first — removes overlay immediately, no white flash
    const el = viewerContentRef.current;
    if (el) { el.style.transition = 'none'; el.style.transform = 'none'; }
    setViewerChromeVisible(true);
    setViewerZoom(1);
    viewerBlobCache.current.forEach(blobUrl => URL.revokeObjectURL(blobUrl));
    viewerBlobCache.current.clear();
    setViewerUrl(null);
    setViewerApiUrl(null);
    setViewerError(null);
    setViewerLoading(false);
    setViewerZoom(1);
    setViewerEditOpen(false);
  };

  // Add-link state
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkCategory, setLinkCategory] = useState(hideCategoryTabs && initialCategory ? initialCategory : 'other');
  const [savingLink, setSavingLink] = useState(false);
  const [createTimelineEvent, setCreateTimelineEvent] = useState(true);

  // Import state
  const [showImportForm, setShowImportForm] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredItem[]>([]);
  const [selectedDiscover, setSelectedDiscover] = useState<Set<string>>(new Set());
  const [importCategory, setImportCategory] = useState(hideCategoryTabs && initialCategory ? initialCategory : 'other');
  const [activeCategory, setActiveCategory] = useState<string>(initialCategory ?? 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cardDeleteDocId, setCardDeleteDocId] = useState<string | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [vaultToast, setVaultToast] = useState<string | null>(null);

  function showVaultToast(msg: string) {
    setVaultToast(msg);
    setTimeout(() => setVaultToast(null), 3500);
  }

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchDocs = async () => {
    const token = getToken();
    if (!token || !petId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log('[PetDocumentVault] docs recebidos:', data.length, data);
        setDocs(Array.isArray(data) ? data : []);
      } else {
        console.error('[PetDocumentVault] erro ao buscar docs:', res.status, await res.text());
      }
    } catch (e) {
      console.error('[PetDocumentVault] fetchDocs exception:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  useEffect(() => {
    // iPad com Safari desktop UA não inclui 'iPad' — detectar via maxTouchPoints
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(ios);
  }, []);

  // ── Filtered docs ─────────────────────────────────────────────────────

  const baseDocs = eventId != null ? docs.filter((d) => d.event_id === eventId) : docs;
  const filtered = activeCategory === 'all'
    ? baseDocs
    : activeCategory === 'health'
    ? baseDocs.filter((d) => HEALTH_CATS.includes(d.category || 'other'))
    : baseDocs.filter((d) => (d.category || 'other') === activeCategory);

  const searchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((d) =>
      (d.title || '').toLowerCase().includes(q) ||
      (d.establishment_name || '').toLowerCase().includes(q) ||
      (d.notes || '').toLowerCase().includes(q)
    );
  }, [filtered, searchQuery]);

  const groupedDocs = useMemo(
    () => groupVaultDocumentsByMonth(searchFiltered as VaultPetDocument[]),
    [searchFiltered]
  );

  const navigableDocs = useMemo(
    () => searchFiltered.filter((d) => !((d.kind === 'link') && !!d.url_masked) && !!d.storage_key),
    [searchFiltered]
  );

  // Auto-upload files received via PWA share target (runs once on mount)
  const autoUploadRef = useRef<File[] | undefined>(
    pendingFiles && pendingFiles.length > 0 ? pendingFiles : undefined
  );
  useEffect(() => {
    const files = autoUploadRef.current;
    if (!files?.length) return;
    autoUploadRef.current = undefined;
    setTimeout(() => {
      handleUpload(files).then(() => onFilesConsumed?.());
    }, 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Upload ────────────────────────────────────────────────────────────

  const handleUpload = async (files: FileList | File[]) => {
    const token = getToken();
    if (!token || !petId || uploading) return;

    const fileArray = Array.from(files);

    // Use file's lastModified as date — more reliable than AI extraction for camera photos
    const fileDate = fileArray.reduce<string | null>((best, f) => {
      if (best || !f.lastModified) return best;
      const d = new Date(f.lastModified);
      if (isNaN(d.getTime())) return best;
      return d.toISOString().split('T')[0];
    }, null);

    // Derive clean title from original filename (strip extension + normalize separators)
    const fileNames = fileArray.map((f) => {
      const base = f.name.replace(/\.[^/.]+$/, '');
      return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() || 'DOCUMENTO';
    });
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      form.append('create_timeline_event', createTimelineEvent ? 'true' : 'false');
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        trackV1Metric('document_uploaded', {
          pet_id: petId,
          file_count: Array.from(files).length,
          source: 'pet_document_vault',
        });
        await fetchDocs();

        const created: { id: string; title?: string; category?: string; icon?: string; mime_type?: string; document_date?: string; establishment_name?: string }[] = data.created || [];

        // Always show BatchConfirm so user names & confirms the entire batch at once
        if (created.length > 0) {
          const uploadDate = fileDate || localTodayISO();
          const batchDocs: BatchDocItem[] = created.map((d, index) => {
            const cat = hideCategoryTabs && initialCategory ? initialCategory : (d.category || 'other');
            return {
              id: d.id,
              title: d.title || '',
              category: d.category || 'other',
              icon: d.icon || '📄',
              mime_type: d.mime_type || null,
              customTitle: autoDocTitle(cat, uploadDate, index, created.length),
              customCategory: cat,
              isAutoTitle: true,
            };
          });

          setBatchConfirm({
            docs: batchDocs,
            detectedDate: null,
            detectedEstablishment: null,
            sharedDate: fileDate || localTodayISO(),
            sharedEstablishment: '',  // never pre-fill from API — extraction is unreliable
            saving: false,
          });
        }

        if (data.errors?.length && !data.zip_extracted) {
          showVaultToast(`⚠️ ${data.errors.join(' | ')}`);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showVaultToast(err.detail || 'Erro ao enviar arquivo — tente novamente.');
      }
    } catch {
      showVaultToast('Erro ao enviar arquivo — verifique sua conexão.');
    } finally {
      setUploading(false);
    }
  };

  const openCameraPicker = (mode: 'image' | 'pdf') => {
    setCameraUploadMode(mode);
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
      cameraInputRef.current.click();
    }
  };

  const handleCameraSelection = async (files: FileList) => {
    if (!files.length) return;
    if (cameraUploadMode === 'image') {
      await handleUpload(files);
      return;
    }

    setUploading(true);
    try {
      const convertedFiles = await Promise.all(
        Array.from(files).map(async (file) => {
          if (file.type === 'application/pdf') return file;
          if (!file.type.startsWith('image/')) return file;
          return convertImageFileToPdf(file);
        })
      );
      await handleUpload(convertedFiles);
    } catch (error) {
      console.error('[PetDocumentVault] erro ao converter foto em PDF:', error);
      showVaultToast('Não foi possível converter a foto. Tente novamente.');
      setUploading(false);
    }
  };

  const handleSaveBatch = async () => {
    if (!batchConfirm) return;
    const token = getToken();
    if (!token) return;
    setBatchConfirm((prev) => prev ? { ...prev, saving: true } : prev);
    try {
      // 1) Bulk apply shared date + establishment to all docs in this batch
      await fetch(`${API_BASE_URL}/pets/${petId}/documents`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_ids: batchConfirm.docs.map((d) => d.id),
          document_date: batchConfirm.sharedDate || null,
          establishment_name: batchConfirm.sharedEstablishment.trim() || null,
        }),
      });
      // 2) Per-doc PATCH for title + category if user changed them
      await Promise.all(
        batchConfirm.docs
          .filter((d) =>
            d.customTitle !== d.title ||
            d.customCategory !== d.category
          )
          .map((d) =>
            fetch(`${API_BASE_URL}/pets/${petId}/documents/${d.id}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: d.customTitle.trim().toUpperCase(), category: d.customCategory }),
            })
          )
      );
      setBatchConfirm(null);
      if (batchConfirm.sharedEstablishment.trim()) {
        saveRecentEstablishment(batchConfirm.sharedEstablishment.trim());
      }
      await fetchDocs();
      onDocsChanged?.();
    } catch {
      // silent
    } finally {
      setBatchConfirm((prev) => prev ? { ...prev, saving: false } : prev);
    }
  };

  // ── Per-doc inline edit ────────────────────────────────────────────────

  const startEdit = (doc: PetDocument) => {
    setEditingDoc({
      id: doc.id,
      title: doc.title || 'Documento',
      category: doc.category || 'other',
      date: doc.document_date || localTodayISO(),
      establishment: doc.establishment_name || '',
      saving: false,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingDoc) return;
    const token = getToken();
    if (!token) return;
    setEditingDoc((prev) => prev ? { ...prev, saving: true } : prev);
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/${editingDoc.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editingDoc.title.trim() || null,
          category: editingDoc.category,
          document_date: editingDoc.date || null,
          establishment_name: editingDoc.establishment.trim() || null,
        }),
      });
      if (res.ok) {
        if (editingDoc.establishment.trim()) saveRecentEstablishment(editingDoc.establishment.trim());
        setEditingDoc(null);
        await fetchDocs();
        onDocsChanged?.();
      }
    } catch {
      // silent
    } finally {
      setEditingDoc((prev) => prev ? { ...prev, saving: false } : prev);
    }
  };

  // ── Add link ──────────────────────────────────────────────────────────

  const handleAddLink = async () => {
    const token = getToken();
    if (!token || !linkUrl.trim() || savingLink) return;
    setSavingLink(true);
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/link`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: linkUrl.trim(), title: linkTitle.trim() || undefined, category: linkCategory, create_timeline_event: createTimelineEvent }),
      });
      if (res.ok) {
        setShowLinkForm(false);
        setLinkUrl('');
        setLinkTitle('');
        await fetchDocs();
      } else {
        const err = await res.json().catch(() => ({}));
        showVaultToast(err.detail || 'Erro ao salvar link. Tente novamente.');
      }
    } catch {
      showVaultToast('Erro ao salvar link — verifique sua conexão.');
    } finally {
      setSavingLink(false);
    }
  };

  // ── Import ────────────────────────────────────────────────────────────

  const handleImportLink = async () => {
    const token = getToken();
    if (!token || !importUrl.trim() || importing) return;
    setImporting(true);
    setImportStatus(null);
    setDiscovered([]);
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/import-link`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: importUrl.trim(), category: importCategory }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportStatus(data.detail || 'Erro ao importar');
        return;
      }
      if (data.link_saved) {
        setImportStatus('✅ Salvo como link (download não disponível)');
        await fetchDocs();
      } else if (data.imported?.length > 0) {
        setImportStatus(`✅ ${data.imported.length} arquivo(s) importado(s)`);
        await fetchDocs();
      } else if (data.discovered?.length > 0) {
        setDiscovered(data.discovered);
        setSelectedDiscover(new Set(data.discovered.map((d: DiscoveredItem) => d.url)));
        setImportStatus(`🔍 ${data.discovered.length} arquivo(s) encontrado(s). Selecione para baixar:`);
      } else {
        setImportStatus('⚠️ Nenhum arquivo encontrado no link');
      }
    } catch {
      setImportStatus('Erro de conexão');
    } finally {
      setImporting(false);
    }
  };

  const handleImportItems = async () => {
    const token = getToken();
    if (!token || !selectedDiscover.size || importing) return;
    setImporting(true);
    try {
      const items = discovered
        .filter((d) => selectedDiscover.has(d.url))
        .map((d) => ({ url: d.url, title: d.title }));
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/import-items`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items, category: importCategory }),
      });
      const data = await res.json();
      if (res.ok) {
        const count = data.imported?.length ?? 0;
        const errs = data.errors?.length ?? 0;
        setImportStatus(`✅ ${count} importado(s)${errs ? `, ${errs} falha(s)` : ''}`);
        setDiscovered([]);
        await fetchDocs();
      } else {
        setImportStatus(data.detail || 'Erro ao importar itens');
      }
    } catch {
      setImportStatus('Erro de conexão');
    } finally {
      setImporting(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────

  const reclassifyDoc = async (doc: PetDocument) => {
    const token = getToken();
    if (!token || reclassifyingId) return;
    setReclassifyingId(doc.id);
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/${doc.id}/reclassify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const updated = await res.json();
        setDocs((prev) => prev.map((d) => d.id === updated.id ? { ...d, ...updated } : d));
      }
    } catch {
      // silently ignore
    } finally {
      setReclassifyingId(null);
    }
  };

  const handleDelete = async (docId: string) => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok || res.status === 204) {
        setDocs((prev) => prev.filter((d) => d.id !== docId));
        if (viewerOpen && navigableDocs[viewerDocIndex]?.id === docId) {
          closeViewer();
        }
      }
    } finally {
      setCardDeleteDocId(null);
    }
  };

  // ── View ──────────────────────────────────────────────────────────────

  const handleView = async (doc: PetDocument) => {
    if (doc.kind === 'link' && doc.url_masked) {
      showVaultToast(`🔗 Link: ${doc.url_masked} (URL real ocultada por segurança)`);
      return;
    }
    if (!doc.storage_key) return;

    const apiUrl = `${API_BASE_URL}/pets/${petId}/documents/${doc.id}/file`;

    // Detectar mime
    const mt = doc.mime_type ?? '';
    const nameForExt = doc.storage_key || doc.title || '';
    const ext = nameForExt.split('.').pop()?.toLowerCase() ?? '';
    const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp'];
    const mime = mt.startsWith('image/') || imageExts.includes(ext) ? 'image'
               : mt === 'application/pdf' || ext === 'pdf' ? 'pdf'
               : 'other';

    setViewerDocIndex(navigableDocs.findIndex((d) => d.id === doc.id));
    setViewerTitle(doc.title ?? 'Documento');
    setViewerMime(mime);
    setViewerDocMimeType(doc.mime_type ?? '');
    setViewerStorageKey(doc.storage_key ?? '');
    setViewerApiUrl(apiUrl);
    setViewerUrl(null);
    setViewerError(null);
    setViewerZoom(1);

    // Arquivos não visualizáveis — download direto, sem abrir viewer
    if (mime === 'other') {
      try {
        const blob = await fetchDocumentBlob(petId, doc.id, { download: true });
        const blobUrl = URL.createObjectURL(blob);
        const fileName = buildDocumentFilename(doc.title ?? 'Documento', doc.mime_type ?? '', doc.storage_key);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      } catch {
        showVaultToast('Não foi possível baixar o arquivo.');
      }
      return;
    }

    // Imagens e PDFs: viewer interno — sem window.open (elimina tela branca no iOS)
    setViewerOpen(true);
    setViewerLoading(true);
    try {
      const blob = await fetchDocumentBlob(petId, doc.id, { download: false });
      const blobUrl = URL.createObjectURL(blob);
      viewerBlobCache.current.set(doc.id, blobUrl);
      setViewerUrl(blobUrl);
    } catch (err: unknown) {
      console.error('[handleView] erro ao baixar arquivo:', err);
      setViewerError('Não foi possível carregar o arquivo.');
    } finally {
      setViewerLoading(false);
    }
  };

  // ── Viewer navigation & prefetch cache ──────────────────────────────

  const prefetchDocBlob = async (doc: PetDocument) => {
    if (viewerBlobCache.current.has(doc.id)) return;
    try {
      const blob = await fetchDocumentBlob(petId, doc.id, { download: false });
      // Guard against race: another navigation may have cached it while we awaited
      if (!viewerBlobCache.current.has(doc.id)) {
        viewerBlobCache.current.set(doc.id, URL.createObjectURL(blob));
      }
    } catch { /* silent — prefetch failure is non-fatal */ }
  };

  const evictDistantCache = (currentId: string, prevId?: string, nextId?: string) => {
    const keep = new Set([currentId, prevId, nextId].filter(Boolean) as string[]);
    viewerBlobCache.current.forEach((blobUrl, docId) => {
      if (!keep.has(docId)) {
        URL.revokeObjectURL(blobUrl);
        viewerBlobCache.current.delete(docId);
      }
    });
  };

  const loadViewerDoc = async (doc: PetDocument, atIndex: number) => {
    const mt = doc.mime_type ?? '';
    const nameForExt = doc.storage_key || doc.title || '';
    const ext = nameForExt.split('.').pop()?.toLowerCase() ?? '';
    const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp'];
    const mime = mt.startsWith('image/') || imageExts.includes(ext) ? 'image'
               : mt === 'application/pdf' || ext === 'pdf' ? 'pdf'
               : 'other';
    setViewerTitle(doc.title ?? 'Documento');
    setViewerMime(mime);
    setViewerDocMimeType(doc.mime_type ?? '');
    setViewerStorageKey(doc.storage_key ?? '');
    setViewerError(null);
    setViewerZoom(1);

    const cached = viewerBlobCache.current.get(doc.id);
    if (cached) {
      // Cache hit — instant display, no spinner
      setViewerUrl(cached);
      setViewerLoading(false);
    } else {
      setViewerUrl(null);
      setViewerLoading(true);
      try {
        const blob = await fetchDocumentBlob(petId, doc.id, { download: false });
        const blobUrl = URL.createObjectURL(blob);
        viewerBlobCache.current.set(doc.id, blobUrl);
        setViewerUrl(blobUrl);
      } catch {
        setViewerError('Não foi possível carregar o arquivo.');
      } finally {
        setViewerLoading(false);
      }
    }

    // Prefetch immediate neighbors in background
    const prev = atIndex > 0 ? navigableDocs[atIndex - 1] : null;
    const next = atIndex < navigableDocs.length - 1 ? navigableDocs[atIndex + 1] : null;
    if (prev) void prefetchDocBlob(prev);
    if (next) void prefetchDocBlob(next);

    // Evict anything not in {current, prev, next} to bound memory
    evictDistantCache(doc.id, prev?.id, next?.id);
  };

  const navigateViewer = async (delta: -1 | 1) => {
    const nextIdx = viewerDocIndex + delta;
    if (nextIdx < 0 || nextIdx >= navigableDocs.length) return;
    setViewerDocIndex(nextIdx);
    await loadViewerDoc(navigableDocs[nextIdx], nextIdx);
  };
  // Keep ref always fresh (called from passive touch effect below)
  navigateViewerRef.current = navigateViewer;

  // ── Total size ────────────────────────────────────────────────────────

  const totalBytes = docs.reduce((acc, d) => acc + (d.size_bytes ?? 0), 0);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}>
      {/* Toast */}
      {vaultToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[700] px-4 py-3 rounded-2xl bg-slate-800 text-white text-sm font-semibold shadow-xl max-w-sm w-[calc(100%-2rem)] flex items-center gap-2">
          <span className="flex-1 text-[13px]">{vaultToast}</span>
          <button onClick={() => setVaultToast(null)} className="text-xs font-bold text-slate-300 hover:text-white underline flex-shrink-0">OK</button>
        </div>
      )}

      {/* ── STANDALONE EDIT SHEET (works from card list) ── */}
      {viewerEditOpen && editingDoc && !viewerOpen && (
        <>
          <style>{`
            @keyframes vaultFadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes vaultSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
          `}</style>
          <div onClick={() => setViewerEditOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.5)', animation: 'vaultFadeIn 0.2s ease' }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 601, background: '#fff', borderRadius: '24px 24px 0 0', boxShadow: '0 -2px 24px rgba(0,0,0,0.14)', paddingBottom: 'env(safe-area-inset-bottom)', display: 'flex', flexDirection: 'column', maxHeight: '82dvh', animation: 'vaultSlideUp 0.24s cubic-bezier(0.32,0.72,0,1)' }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8 }}>
              <div style={{ width: 40, height: 4, borderRadius: 4, background: '#dedede' }} />
            </div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 14px', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: '#111', letterSpacing: -0.3 }}>Editar documento</span>
              <button onClick={() => setViewerEditOpen(false)} style={{ width: 40, height: 40, borderRadius: 12, background: '#f2f2f2', border: 'none', fontSize: 16, color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', flexShrink: 0 } as React.CSSProperties}>✕</button>
            </div>
            {/* Form body */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Nome</label>
                <input type="text" value={editingDoc.title} onChange={(e) => setEditingDoc((p) => p ? { ...p, title: e.target.value } : p)} style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e8e8ea', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: '#111', outline: 'none', background: '#f9f9f9' }} />
              </div>
              {!hideCategoryTabs && (
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Categoria</label>
                <select value={editingDoc.category} onChange={(e) => setEditingDoc((p) => p ? { ...p, category: e.target.value } : p)} style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e8e8ea', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: '#111', outline: 'none', background: '#f9f9f9', appearance: 'none' }}>
                  {CATEGORY_OPTIONS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                </select>
              </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>📅 Data</label>
                <input type="date" value={editingDoc.date} onChange={(e) => setEditingDoc((p) => p ? { ...p, date: e.target.value } : p)} style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e8e8ea', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: '#111', outline: 'none', background: '#f9f9f9' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>🏥 Estabelecimento</label>
                <EstablishmentInput value={editingDoc.establishment} onChange={(v) => setEditingDoc((p) => p ? { ...p, establishment: v } : p)} historyNames={(docs.map((d) => d.establishment_name).filter((v, i, a) => !!v && a.indexOf(v) === i) as string[])} className="" placeholder="Ex: Clínica VetCenter" />
              </div>
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                <button
                  type="button"
                  onClick={() => {
                    setCardDeleteDocId(editingDoc.id);
                    setViewerEditOpen(false);
                  }}
                  style={{ width: '100%', height: 46, borderRadius: 14, border: '1px solid #fecaca', background: '#fff7f7', color: '#b91c1c', fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
                >
                  Excluir documento
                </button>
              </div>
            </div>
            {/* Footer */}
            <div style={{ flexShrink: 0, display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid #f0f0f0' }}>
              <button onClick={() => setViewerEditOpen(false)} style={{ flex: 1, height: 52, borderRadius: 16, cursor: 'pointer', background: '#f2f2f2', border: 'none', fontSize: 15, fontWeight: 600, color: '#666', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}>Cancelar</button>
              <button onClick={async () => { await handleSaveEdit(); setViewerEditOpen(false); }} disabled={editingDoc.saving} style={{ flex: 2, height: 52, borderRadius: 16, cursor: 'pointer', background: '#0056D2', border: 'none', fontSize: 15, fontWeight: 700, color: '#fff', WebkitTapHighlightColor: 'transparent', opacity: editingDoc.saving ? 0.6 : 1 } as React.CSSProperties}>
                {editingDoc.saving ? '⏳ Salvando…' : '✓ Salvar'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── CARD DELETE CONFIRMATION SHEET ───────────────────────────── */}
      {cardDeleteDocId && (() => {
        const docToDelete = docs.find((d) => d.id === cardDeleteDocId);
        return (
          <>
            <style>{`
              @keyframes vaultFadeIn { from { opacity: 0 } to { opacity: 1 } }
              @keyframes vaultSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
            `}</style>
            <div onClick={() => setCardDeleteDocId(null)} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.5)', animation: 'vaultFadeIn 0.2s ease' }} />
            <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 601, background: '#fff', borderRadius: '24px 24px 0 0', boxShadow: '0 -2px 24px rgba(0,0,0,0.14)', paddingBottom: 'env(safe-area-inset-bottom)', animation: 'vaultSlideUp 0.24s cubic-bezier(0.32,0.72,0,1)' }}>
              {/* Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8 }}>
                <div style={{ width: 40, height: 4, borderRadius: 4, background: '#dedede' }} />
              </div>
              {/* Body */}
              <div style={{ padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ width: 56, height: 56, borderRadius: 18, background: '#fff0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 2 }}>🗑️</div>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111', letterSpacing: -0.3 }}>Excluir documento?</p>
                <p style={{ margin: 0, fontSize: 14, color: '#666', lineHeight: 1.6 }}>
                  <strong style={{ color: '#333' }}>&ldquo;{docToDelete?.title || 'Documento'}&rdquo;</strong> será removido permanentemente. Esta ação não pode ser desfeita.
                </p>
              </div>
              {/* Footer */}
              <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid #f0f0f0' }}>
                <button onClick={() => setCardDeleteDocId(null)} style={{ flex: 1, height: 52, borderRadius: 16, background: '#f2f2f2', border: 'none', fontSize: 15, fontWeight: 600, color: '#666', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}>Cancelar</button>
                <button onClick={() => handleDelete(cardDeleteDocId)} style={{ flex: 1, height: 52, borderRadius: 16, background: '#dc2626', border: 'none', fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}>Excluir</button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── FULL-SCREEN DOCUMENT VIEWER ─────────────────────────────── */}
      {viewerOpen && (
        <div
          ref={viewerContainerRef}
          style={{
            position: 'fixed', inset: 0,
            zIndex: 500, backgroundColor: '#000',
            overflow: 'hidden',
            userSelect: 'none', WebkitUserSelect: 'none',
            touchAction: 'none',
          } as React.CSSProperties}
        >
          {/* ── Toolbar — glass gradient overlay at top ── */}
          <div
            style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              zIndex: 10,
              display: 'grid',
              gridTemplateColumns: '56px 1fr auto',
              alignItems: 'center',
              height: 'calc(64px + env(safe-area-inset-top))',
              paddingTop: 'env(safe-area-inset-top)',
              paddingLeft: 'max(env(safe-area-inset-left), 8px)',
              paddingRight: 'max(env(safe-area-inset-right), 8px)',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)',
              opacity: viewerChromeVisible ? 1 : 0,
              pointerEvents: viewerChromeVisible ? 'auto' : 'none',
              transition: 'opacity 0.25s ease',
            } as React.CSSProperties}
          >
            {/* Col 1 — Close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
              <button
                onClick={closeViewer}
                style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: 'rgba(255,255,255,0.18)', border: 'none',
                  color: '#fff', fontSize: 16, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  WebkitTapHighlightColor: 'transparent',
                } as React.CSSProperties}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Col 2 — Title + indicator */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, padding: '0 8px' }}>
              <p style={{
                color: '#fff', fontSize: 14, fontWeight: 600, margin: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                lineHeight: 1.3, maxWidth: '100%', textAlign: 'center',
              }}>
                {viewerTitle || (viewerLoading ? 'Carregando…' : 'Documento')}
              </p>
              {navigableDocs.length > 1 && viewerDocIndex >= 0 && (
                <span style={{
                  color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2,
                  fontFeatureSettings: '"tnum"', userSelect: 'none',
                  fontWeight: 600, letterSpacing: '0.04em',
                } as React.CSSProperties}>
                  {viewerDocIndex + 1} de {navigableDocs.length}
                </span>
              )}
            </div>

            {/* Col 3 — Safe actions only. Delete stays out of the document preview. */}
            {viewerUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Compartilhar / Baixar */}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!viewerUrl) return;
                    const filename = buildDocumentFilename(viewerTitle || 'documento', viewerDocMimeType, viewerStorageKey);
                    try {
                      const blob = await fetch(viewerUrl).then((r) => r.blob());
                      await shareOrDownload(blob, filename, viewerTitle || 'Documento');
                    } catch (err) {
                      if ((err as Error)?.name !== 'AbortError') {
                        triggerBrowserDownload(viewerUrl, filename);
                      }
                    }
                  }}
                  style={{
                    width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                    background: 'rgba(255,255,255,0.13)', color: '#fff', fontSize: 17,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  } as React.CSSProperties}
                  aria-label="Compartilhar"
                  title="Compartilhar"
                >
                  ↑
                </button>
                {/* Edit */}
                <button
                  onClick={() => {
                    const doc = navigableDocs[viewerDocIndex];
                    if (!doc) return;
                    startEdit(doc);
                    setViewerEditOpen(true);
                  }}
                  style={{
                    width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                    background: 'rgba(255,255,255,0.13)', border: 'none',
                    color: '#fff', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  } as React.CSSProperties}
                  aria-label="Editar documento"
                  title="Editar"
                >
                  ✏️
                </button>
              </div>
            ) : (
              <div style={{ width: 44, height: 44 }} />
            )}
          </div>

          {/* ── Edit bottom sheet ── */}
          {viewerEditOpen && editingDoc && (
            <>
              <div onClick={() => setViewerEditOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', animation: 'vaultFadeIn 0.2s ease' }} />
              <style>{`
                @keyframes vaultFadeIn { from { opacity: 0 } to { opacity: 1 } }
                @keyframes vaultSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
              `}</style>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 51, background: '#fff', borderRadius: '24px 24px 0 0', boxShadow: '0 -2px 24px rgba(0,0,0,0.14)', paddingBottom: 'env(safe-area-inset-bottom)', display: 'flex', flexDirection: 'column', maxHeight: '72dvh', animation: 'vaultSlideUp 0.24s cubic-bezier(0.32,0.72,0,1)' }}>
                {/* Handle */}
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8 }}>
                  <div style={{ width: 40, height: 4, borderRadius: 4, background: '#dedede' }} />
                </div>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 14px', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: '#111', letterSpacing: -0.3 }}>Editar documento</span>
                  <button onClick={() => setViewerEditOpen(false)} style={{ width: 40, height: 40, borderRadius: 12, background: '#f2f2f2', border: 'none', fontSize: 16, color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', flexShrink: 0 } as React.CSSProperties}>✕</button>
                </div>
                {/* Form body */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Nome</label>
                    <input type="text" value={editingDoc.title} onChange={(e) => setEditingDoc((p) => p ? { ...p, title: e.target.value } : p)} style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e8e8ea', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: '#111', outline: 'none', background: '#f9f9f9' }} />
                  </div>
                  {!hideCategoryTabs && (
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Categoria</label>
                    <select value={editingDoc.category} onChange={(e) => setEditingDoc((p) => p ? { ...p, category: e.target.value } : p)} style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e8e8ea', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: '#111', outline: 'none', background: '#f9f9f9', appearance: 'none' }}>
                      {CATEGORY_OPTIONS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                    </select>
                  </div>
                  )}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>📅 Data</label>
                    <input type="date" value={editingDoc.date} onChange={(e) => setEditingDoc((p) => p ? { ...p, date: e.target.value } : p)} style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e8e8ea', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: '#111', outline: 'none', background: '#f9f9f9' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>🏥 Estabelecimento</label>
                    <EstablishmentInput value={editingDoc.establishment} onChange={(v) => setEditingDoc((p) => p ? { ...p, establishment: v } : p)} historyNames={(docs.map((d) => d.establishment_name).filter((v, i, a) => !!v && a.indexOf(v) === i) as string[])} className="" placeholder="Ex: Clínica VetCenter" />
                  </div>
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setCardDeleteDocId(editingDoc.id);
                        setViewerEditOpen(false);
                      }}
                      style={{ width: '100%', height: 46, borderRadius: 14, border: '1px solid #fecaca', background: '#fff7f7', color: '#b91c1c', fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
                    >
                      Excluir documento
                    </button>
                  </div>
                </div>
                {/* Footer */}
                <div style={{ flexShrink: 0, display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid #f0f0f0' }}>
                  <button onClick={() => setViewerEditOpen(false)} style={{ flex: 1, height: 52, borderRadius: 16, cursor: 'pointer', background: '#f2f2f2', border: 'none', fontSize: 15, fontWeight: 600, color: '#666', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}>Cancelar</button>
                  <button onClick={async () => { await handleSaveEdit(); setViewerEditOpen(false); if (editingDoc) setViewerTitle(editingDoc.title.trim() || viewerTitle); }} disabled={editingDoc.saving} style={{ flex: 2, height: 52, borderRadius: 16, cursor: 'pointer', background: '#0056D2', border: 'none', fontSize: 15, fontWeight: 700, color: '#fff', WebkitTapHighlightColor: 'transparent', opacity: editingDoc.saving ? 0.6 : 1 } as React.CSSProperties}>
                    {editingDoc.saving ? '⏳ Salvando…' : '✓ Salvar'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── Content area ── */}
          <div style={{ position: 'absolute', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>

            {/* Navigation arrows — hidden when chrome is hidden */}
            {viewerChromeVisible && navigableDocs.length > 1 && (
              <>
                <button
                  onClick={() => { if (viewerDocIndex > 0) void navigateViewer(-1); }}
                  style={{
                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                    zIndex: 10, width: 40, height: 56, borderRadius: 20,
                    background: viewerDocIndex <= 0 ? 'transparent' : 'rgba(0,0,0,0.45)',
                    border: viewerDocIndex <= 0 ? 'none' : '1px solid rgba(255,255,255,0.12)',
                    color: '#fff', fontSize: 26,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: viewerDocIndex <= 0 ? 'default' : 'pointer',
                    opacity: viewerDocIndex <= 0 ? 0 : 0.85,
                    transition: 'opacity 0.2s, background 0.2s',
                    pointerEvents: viewerDocIndex <= 0 ? 'none' : 'auto',
                    WebkitTapHighlightColor: 'transparent',
                  } as React.CSSProperties}
                  aria-label="Documento anterior"
                >
                  ‹
                </button>
                <button
                  onClick={() => { if (viewerDocIndex < navigableDocs.length - 1) void navigateViewer(1); }}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    zIndex: 10, width: 40, height: 56, borderRadius: 20,
                    background: viewerDocIndex >= navigableDocs.length - 1 ? 'transparent' : 'rgba(0,0,0,0.45)',
                    border: viewerDocIndex >= navigableDocs.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.12)',
                    color: '#fff', fontSize: 26,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: viewerDocIndex >= navigableDocs.length - 1 ? 'default' : 'pointer',
                    opacity: viewerDocIndex >= navigableDocs.length - 1 ? 0 : 0.85,
                    transition: 'opacity 0.2s, background 0.2s',
                    pointerEvents: viewerDocIndex >= navigableDocs.length - 1 ? 'none' : 'auto',
                    WebkitTapHighlightColor: 'transparent',
                  } as React.CSSProperties}
                  aria-label="Próximo documento"
                >
                  ›
                </button>
              </>
            )}

            {/* Floating zoom bar — image only (PDF has native zoom), hidden when chrome hidden */}
            {viewerChromeVisible && !viewerLoading && !viewerError && viewerUrl && viewerMime === 'image' && (
              <div style={{
                position: 'absolute', bottom: 'calc(20px + env(safe-area-inset-bottom))', left: '50%',
                transform: 'translateX(-50%)', zIndex: 10, display: 'flex', alignItems: 'center',
                background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                borderRadius: 24, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden',
                transition: 'opacity 0.25s ease',
              } as React.CSSProperties}>
                <button
                  onClick={() => {
                    const el = viewerContentRef.current;
                    if (!el) return;
                    const m = new DOMMatrix(getComputedStyle(el).transform);
                    const s = Math.max(1, m.m11 * 0.7);
                    const W = window.innerWidth, H = window.innerHeight;
                    const newTx = s <= 1 ? 0 : Math.max(-W*(s-1)/2, Math.min(W*(s-1)/2, m.m41 * 0.7));
                    const newTy = s <= 1 ? 0 : Math.max(-H*(s-1)/2, Math.min(H*(s-1)/2, m.m42 * 0.7));
                    el.style.transition = 'transform 0.2s ease';
                    el.style.transform = s <= 1 ? 'none' : `translate(${newTx}px,${newTy}px) scale(${s})`;
                    setViewerZoom(s);
                  }}
                  style={{ width: 48, height: 44, background: 'transparent', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
                  aria-label="Reduzir zoom"
                >−</button>
                <button
                  onClick={() => {
                    const el = viewerContentRef.current;
                    if (!el) return;
                    el.style.transition = 'transform 0.22s ease';
                    el.style.transform = 'none';
                    setViewerZoom(1);
                  }}
                  style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, minWidth: 44, textAlign: 'center', fontFeatureSettings: '"tnum"', userSelect: 'none', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 } as React.CSSProperties}
                  aria-label="Resetar zoom"
                >{Math.round(viewerZoom * 100)}%</button>
                <button
                  onClick={() => {
                    const el = viewerContentRef.current;
                    if (!el) return;
                    const m = new DOMMatrix(getComputedStyle(el).transform);
                    const s = Math.min(8, m.m11 <= 1 ? 2 : m.m11 * 1.4);
                    el.style.transition = 'transform 0.2s ease';
                    el.style.transform = `translate(${m.m41}px,${m.m42}px) scale(${s})`;
                    setViewerZoom(s);
                  }}
                  style={{ width: 48, height: 44, background: 'transparent', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
                  aria-label="Aumentar zoom"
                >+</button>
              </div>
            )}

            {/* Loading */}
            {viewerLoading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, backgroundColor: '#000' }}>
                <div style={{
                  width: 52, height: 52,
                  border: '3px solid rgba(255,255,255,0.08)',
                  borderTopColor: 'rgba(255,255,255,0.8)',
                  borderRadius: '50%',
                  animation: 'vaultSpin 0.7s linear infinite',
                }} />
                <style>{`@keyframes vaultSpin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: 0, letterSpacing: 0.1 }}>Carregando documento…</p>
              </div>
            )}

            {/* Error */}
            {!viewerLoading && viewerError && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '32px 24px', textAlign: 'center' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 20, fontSize: 34,
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  ⚠️
                </div>
                <div style={{ maxWidth: 260 }}>
                  <p style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: '0 0 8px', letterSpacing: -0.2 }}>
                    Não foi possível carregar
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                    {viewerError}
                  </p>
                </div>
                <button
                  onClick={closeViewer}
                  style={{
                    marginTop: 8, padding: '12px 28px', borderRadius: 14, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
                    color: '#fff', fontSize: 14, fontWeight: 600,
                    WebkitTapHighlightColor: 'transparent',
                  } as React.CSSProperties}
                >
                  Fechar
                </button>
              </div>
            )}

            {/* Image — direct-DOM transform, zero React re-renders during gesture */}
            {!viewerLoading && !viewerError && viewerMime === 'image' && viewerUrl && (
              <div
                ref={viewerContentRef}
                style={{
                  position: 'absolute', inset: 0,
                  willChange: 'transform',
                  transformOrigin: '0 0',
                } as React.CSSProperties}
              >
                <img
                  src={viewerUrl}
                  alt={viewerTitle}
                  style={{
                    width: '100dvw',
                    height: '100dvh',
                    objectFit: 'contain',
                    display: 'block',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    pointerEvents: 'none',
                  } as React.CSSProperties}
                  draggable={false}
                />
              </div>
            )}

            {/* PDF — native browser renderer (WebKit/Chrome PDF plugin handles pinch natively) */}
            {!viewerLoading && !viewerError && viewerMime === 'pdf' && viewerUrl && (
              <div
                ref={viewerContentRef}
                style={{
                  position: 'absolute', inset: 0,
                  willChange: 'transform',
                  transformOrigin: '0 0',
                } as React.CSSProperties}
              >
                {isIOS ? (
                  <embed
                    src={viewerUrl}
                    type="application/pdf"
                    style={{ width: '100dvw', height: '100dvh', border: 'none', display: 'block' } as React.CSSProperties}
                  />
                ) : (
                  <iframe
                    src={viewerUrl}
                    title={viewerTitle}
                    style={{ width: '100dvw', height: '100dvh', border: 'none', display: 'block' } as React.CSSProperties}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden file inputs (triggered by FAB) */}
      <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.zip" className="hidden" onChange={(e) => e.target.files && handleUpload(e.target.files)} />
      {/* Scanner input – sem capture → iOS mostra "Digitalizar Documentos" */}
      <input ref={cameraInputRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => e.target.files && handleCameraSelection(e.target.files)} />


      {/* ── BATCH CONFIRM PANEL ──────────────────────────────────────── */}
      {batchConfirm && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setBatchConfirm(null)} />

          <div className="relative w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-[24px] shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-lg font-bold text-gray-900 leading-tight">
                    {batchConfirm.docs.length === 1
                      ? 'Confirmar documento'
                      : `Confirmar ${batchConfirm.docs.length} documentos`}
                  </h4>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Confirme a data — o nome foi gerado automaticamente.
                  </p>
                </div>
                <button
                  onClick={() => setBatchConfirm(null)}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors text-sm"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 pb-2 space-y-5">

              {/* Date + Establishment */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                    Data do atendimento
                  </label>
                  <input
                    type="date"
                    value={batchConfirm.sharedDate}
                    onChange={(e) =>
                      setBatchConfirm((prev) => {
                        if (!prev) return prev;
                        const newDate = e.target.value;
                        return {
                          ...prev,
                          sharedDate: newDate,
                          docs: prev.docs.map((d, i) =>
                            d.isAutoTitle
                              ? { ...d, customTitle: autoDocTitle(d.customCategory, newDate, i, prev.docs.length) }
                              : d
                          ),
                        };
                      })
                    }
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                    Estabelecimento (opcional)
                  </label>
                  <EstablishmentInput
                    value={batchConfirm.sharedEstablishment}
                    onChange={(v) =>
                      setBatchConfirm((prev) => prev ? { ...prev, sharedEstablishment: v } : prev)
                    }
                    historyNames={(docs.map((d) => d.establishment_name).filter((v, i, a) => !!v && a.indexOf(v) === i) as string[])}
                    placeholder="Ex: Clínica VetCenter"
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white transition-colors"
                  />
                </div>
              </div>

              {/* Per-doc list */}
              <div className="space-y-4">
                {batchConfirm.docs.length > 1 && (
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {batchConfirm.docs.length} documentos
                  </p>
                )}
                {batchConfirm.docs.map((item, idx) => (
                  <div key={item.id} className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">
                      {batchConfirm.docs.length > 1 ? `Documento ${idx + 1} — ` : ''}{item.icon} Nome
                      {item.isAutoTitle && <span className="normal-case font-normal text-blue-500 ml-1">· toque para editar</span>}
                    </label>
                    <input
                      type="text"
                      value={item.customTitle}
                      onChange={(e) =>
                        setBatchConfirm((prev) =>
                          prev ? {
                            ...prev,
                            docs: prev.docs.map((d) =>
                              d.id === item.id ? { ...d, customTitle: e.target.value, isAutoTitle: false } : d
                            ),
                          } : prev
                        )
                      }
                      placeholder="Ex: EXAME DE SANGUE"
                      className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-900 uppercase focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white transition-colors"
                    />
                    {!hideCategoryTabs && (
                      <select
                        value={item.customCategory}
                        onChange={(e) =>
                          setBatchConfirm((prev) =>
                            prev ? {
                              ...prev,
                              docs: prev.docs.map((d) =>
                                d.id === item.id
                                  ? {
                                      ...d,
                                      customCategory: e.target.value,
                                      ...(d.isAutoTitle ? { customTitle: autoDocTitle(e.target.value, prev.sharedDate, idx, prev.docs.length) } : {}),
                                    }
                                  : d
                              ),
                            } : prev
                          )
                        }
                        className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white transition-colors"
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pt-4 pb-8 sm:pb-6 flex-shrink-0 space-y-3">
              <button
                onClick={handleSaveBatch}
                disabled={batchConfirm.saving}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl text-base font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {batchConfirm.saving
                  ? '⏳ Salvando…'
                  : `Salvar ${batchConfirm.docs.length > 1 ? `${batchConfirm.docs.length} documentos` : 'documento'}`}
              </button>
              <button
                onClick={() => setBatchConfirm(null)}
                className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Pular
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add link form ────────────────────────────────────────────── */}
      {showLinkForm && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
          <h4 className="font-bold text-indigo-800 text-sm">🔗 Salvar link externo</h4>
          <input
            type="url"
            placeholder="https://..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            type="text"
            placeholder="Título (opcional)"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {!hideCategoryTabs && (
          <select
            value={linkCategory}
            onChange={(e) => { setLinkCategory(e.target.value); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          )}
          <label className="flex items-center gap-2 text-xs text-indigo-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={createTimelineEvent}
              onChange={(e) => setCreateTimelineEvent(e.target.checked)}
              className="rounded accent-indigo-600"
            />
            Registrar na linha do tempo
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleAddLink}
              disabled={!linkUrl.trim() || savingLink}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {savingLink ? 'Salvando…' : 'Salvar Link'}
            </button>
            <button
              onClick={() => setShowLinkForm(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Import form ──────────────────────────────────────────────── */}
      {showImportForm && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
          <h4 className="font-bold text-emerald-800 text-sm">⬇️ Importar do portal veterinário</h4>
          <p className="text-xs text-emerald-700">
            Cole o link do portal (ex: max.cfaz.net). O servidor tentará baixar os arquivos automaticamente.
          </p>
          <input
            type="url"
            placeholder="https://..."
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          {!hideCategoryTabs && (
          <select
            value={importCategory}
            onChange={(e) => { setImportCategory(e.target.value); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleImportLink}
              disabled={!importUrl.trim() || importing}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {importing ? 'Importando…' : 'Tentar Importar'}
            </button>
            <button
              onClick={() => { setShowImportForm(false); setDiscovered([]); setImportStatus(null); }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
          </div>

          {importStatus && (
            <p className="text-sm text-emerald-800 bg-emerald-100 rounded-lg px-3 py-2">{importStatus}</p>
          )}

          {/* Discovered items checklist */}
          {discovered.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-800">Selecione os arquivos para baixar:</span>
                <button
                  onClick={() =>
                    setSelectedDiscover(
                      selectedDiscover.size === discovered.length
                        ? new Set()
                        : new Set(discovered.map((d) => d.url))
                    )
                  }
                  className="text-xs text-emerald-600 underline"
                >
                  {selectedDiscover.size === discovered.length ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>
              {discovered.map((item) => (
                <label key={item.url} className="flex items-start gap-2 p-2 bg-white rounded-lg border border-emerald-200 cursor-pointer hover:bg-emerald-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedDiscover.has(item.url)}
                    onChange={(e) => {
                      const next = new Set(selectedDiscover);
                      if (e.target.checked) next.add(item.url);
                      else next.delete(item.url);
                      setSelectedDiscover(next);
                    }}
                    className="mt-0.5 accent-emerald-600"
                  />
                  <span className="text-xs text-gray-700 break-all">{item.title}</span>
                </label>
              ))}
              <button
                onClick={handleImportItems}
                disabled={!selectedDiscover.size || importing}
                className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {importing ? 'Baixando…' : `⬇️ Baixar ${selectedDiscover.size} arquivo(s)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Search ──────────────────────────────────────────────────── */}
      {docs.length > 0 && (
        <div style={{ position: 'relative' }}>
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#9ca3af', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, clínica ou nota…"
            style={{
              width: '100%', boxSizing: 'border-box',
              border: '1.5px solid #e8e8ea', borderRadius: 14,
              padding: '10px 14px 10px 36px',
              fontSize: 16, color: '#111', outline: 'none',
              background: '#f9f9f9',
              WebkitAppearance: 'none',
            } as React.CSSProperties}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: '#d1d5db', border: 'none', borderRadius: '50%',
                width: 18, height: 18, fontSize: 10, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              } as React.CSSProperties}
              aria-label="Limpar busca"
            >✕</button>
          )}
        </div>
      )}

      {/* ── Category filter tabs ────────────────────────────────────── */}
      {!hideCategoryTabs && <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' } as React.CSSProperties}>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 2, minWidth: 'max-content' }}>
          {CATEGORY_TABS.map((tab) => {
            const count = tab.id === 'all'
              ? baseDocs.length
              : baseDocs.filter((d) => (d.category || 'other') === tab.id).length;
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '7px 13px', borderRadius: 20,
                  fontSize: 13, fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#fff' : '#6b7280',
                  background: isActive ? '#0056D2' : 'rgba(0,0,0,0.05)',
                  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'background 0.15s, color 0.15s',
                  WebkitTapHighlightColor: 'transparent',
                } as React.CSSProperties}
              >
                <span style={{ fontSize: 14 }}>{tab.icon}</span>
                <span>{tab.label}</span>
                {count > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, lineHeight: 1,
                    padding: '2px 5px', borderRadius: 10,
                    background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.07)',
                    color: isActive ? '#fff' : '#9ca3af',
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>}

      {/* ── Documents list ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#c0c0c8', letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {searchFiltered.length} {searchFiltered.length !== 1 ? 'Documentos' : 'Documento'}
        </span>
      </div>

      {loading && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#c0c0c8', fontSize: 13 }}>
          ⏳ Carregando…
        </div>
      )}

      {!loading && searchFiltered.length === 0 && (
        <div style={{ padding: '48px 16px', textAlign: 'center' }}>
          {searchQuery.trim() ? (
            <>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#9ca3af', margin: '0 0 4px', letterSpacing: -0.2 }}>
                Nenhum resultado
              </p>
              <p style={{ fontSize: 13, color: '#d1d5db', margin: 0 }}>
                Tente outro nome, clínica ou categoria
              </p>
            </>
          ) : docs.length === 0 ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 14 }}>🩺</div>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#6b7280', margin: '0 0 6px', letterSpacing: -0.3 }}>
                Histórico clínico vazio
              </p>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 2px', lineHeight: 1.55 }}>
                Escaneie exames, receitas ou a carteirinha de vacina.
              </p>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0, lineHeight: 1.55 }}>
                Tudo aqui antes da próxima consulta.
              </p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#9ca3af', margin: '0 0 4px', letterSpacing: -0.2 }}>
                Nenhum documento nesta categoria
              </p>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {groupedDocs.map(([groupLabel, groupItems]) => (
          <div key={groupLabel}>
            {/* Month divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#c0c0c8', textTransform: 'uppercase', letterSpacing: 0.8, flexShrink: 0 }}>{groupLabel}</span>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
            </div>

            {/* iOS table card group - Premium Edition */}
            <div className="bg-white rounded-[24px] overflow-hidden shadow-premium border border-slate-100/60 mb-2">
              {groupItems.map((doc, idx) => {
                const mt = doc.mime_type ?? '';
                const nameForExt = doc.storage_key || doc.title || '';
                const ext = nameForExt.split('.').pop()?.toLowerCase() ?? '';
                const isImg = mt.startsWith('image/') || ['jpg','jpeg','png','webp','gif','heic','heif','bmp'].includes(ext);
                return (
                  <div
                    key={doc.id}
                    className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors ${
                      idx < groupItems.length - 1 ? 'border-b border-slate-50' : ''
                    }`}
                    onClick={() => handleView(doc)}
                  >
                    {/* Icon / thumb */}
                    {isImg && doc.storage_key ? (
                      <div className="w-12 h-12 rounded-[14px] overflow-hidden shrink-0 border border-slate-200/50 shadow-sm relative group">
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors z-10" />
                        <AuthenticatedDocumentImage petId={petId} docId={doc.id} alt={doc.title ?? ''} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-[14px] bg-slate-100/80 flex items-center justify-center text-2xl shrink-0 border border-slate-200/50 shadow-sm">
                        {doc.icon}
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="m-0 text-[15px] font-bold text-slate-900 tracking-tight truncate leading-tight">
                        {doc.title || 'Documento'}
                      </p>
                      <p className="m-0 mt-0.5 text-xs font-semibold text-slate-500 truncate">
                        {fmtDate(resolveDocDate(doc.document_date, doc.created_at)) || 'Sem data'}
                        {doc.establishment_name ? ` · ${doc.establishment_name}` : ''}
                      </p>
                    </div>

                    {/* Inline actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); reclassifyDoc(doc); }}
                        disabled={reclassifyingId === doc.id}
                        style={{ width: 36, height: 36, borderRadius: 10, background: 'none', border: 'none', fontSize: 14, color: '#a78bfa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', opacity: reclassifyingId === doc.id ? 0.5 : 1 } as React.CSSProperties}
                        aria-label="Reclassificar com IA"
                        title="Reclassificar com IA"
                      >
                        {reclassifyingId === doc.id ? '⏳' : '✨'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(doc); setViewerEditOpen(true); }}
                        style={{ width: 36, height: 36, borderRadius: 10, background: 'none', border: 'none', fontSize: 15, color: '#d1d5db', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
                        aria-label="Editar"
                      >
                        ✏️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── FAB ──────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes vaultFabIn { from { transform: scale(0.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes vaultFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vaultSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
      <button
        onClick={() => setFabOpen(true)}
        disabled={uploading}
        style={{
          position: 'fixed', right: 20, bottom: 'calc(24px + env(safe-area-inset-bottom))', zIndex: 200,
          width: 56, height: 56, borderRadius: 28,
          background: uploading ? '#94a3b8' : '#0056D2',
          border: 'none',
          boxShadow: uploading
            ? '0 4px 16px rgba(0,0,0,0.18)'
            : '0 4px 20px rgba(0,86,210,0.45), 0 2px 8px rgba(0,86,210,0.2)',
          color: '#fff', fontSize: 28, fontWeight: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: uploading ? 'not-allowed' : 'pointer',
          WebkitTapHighlightColor: 'transparent',
          animation: 'vaultFabIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        } as React.CSSProperties}
        aria-label="Adicionar documento"
      >
        {uploading ? '⏳' : '+'}
      </button>

      {/* FAB bottom sheet */}
      {fabOpen && (
        <>
          <div
            onClick={() => setFabOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.5)', animation: 'vaultFadeIn 0.2s ease' }}
          />
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 401,
            background: '#fff', borderRadius: '24px 24px 0 0',
            boxShadow: '0 -2px 24px rgba(0,0,0,0.14)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            animation: 'vaultSlideUp 0.24s cubic-bezier(0.32,0.72,0,1)',
          }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <div style={{ width: 40, height: 4, borderRadius: 4, background: '#dedede' }} />
            </div>
            {/* Title */}
            <div style={{ padding: '8px 20px 14px' }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: '#111', letterSpacing: -0.3 }}>Adicionar documento</span>
            </div>
            {/* Options */}
            <div style={{ padding: '0 12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => { setFabOpen(false); openCameraPicker('image'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 18, background: '#f0f7ff', border: 'none', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent', width: '100%' } as React.CSSProperties}
              >
                <div style={{ width: 48, height: 48, borderRadius: 14, background: '#0056D2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>📷</div>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111', letterSpacing: -0.2 }}>Câmera</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>Fotografar documento</p>
                </div>
              </button>
              <button
                onClick={() => { setFabOpen(false); openCameraPicker('pdf'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 18, background: '#fffbeb', border: 'none', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent', width: '100%' } as React.CSSProperties}
              >
                <div style={{ width: 48, height: 48, borderRadius: 14, background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>📄</div>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111', letterSpacing: -0.2 }}>Foto como PDF</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>Fotografar e converter em PDF</p>
                </div>
              </button>
              <button
                onClick={() => { setFabOpen(false); fileInputRef.current?.click(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 18, background: '#f6f6f8', border: 'none', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent', width: '100%' } as React.CSSProperties}
              >
                <div style={{ width: 48, height: 48, borderRadius: 14, background: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>📂</div>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111', letterSpacing: -0.2 }}>Arquivo</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>PDF, imagem, ZIP · até 20 MB</p>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
