'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { BrowserCodeReader, BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { ModalPortal } from '@/components/ModalPortal';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import {
  identifyProductByBarcode,
  saveToScanHistory,
  loadScanHistory,
  getSearchSuggestions,
  type ProductCategory,
  type ScannedProduct,
  type ScanHistoryEntry,
} from '@/lib/productScanner';
import { saveLocalProduct } from '@/features/product-detection/cache';
import { trackEvent } from '@/lib/analytics/storage';
import {
  confirmProductLookup,
  resolvePhotoProductCandidate,
  scoreGtinResolution,
  type ProductDetectionConfidence,
  type ProductDetectionOrigin,
  type ProductDetectionResultType,
} from '@/features/product-detection/resolver';
import { buildPartialFoodName, extractFoodFields } from '@/features/product-detection/foodParser';
import { submitLearningConfirmation, findLocalCorrection, type ScanDecisionSource } from '@/features/product-detection/learningStore';

type Step =
  | 'entry'
  | 'scanning'
  | 'resolving'
  | 'not-found'
  | 'photo-capture'
  | 'photo-processing'
  | 'manual'
  | 'confirm';

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  food: 'Ração / Alimento',
  antiparasite: 'Antipulgas / Carrapatos',
  dewormer: 'Vermífugo',
  collar: 'Coleira Antiparasitária',
  medication: 'Medicamento',
  hygiene: 'Higiene',
  other: 'Produto Pet',
};

const CATEGORY_EMOJI: Record<ProductCategory, string> = {
  food: '🥣',
  antiparasite: '🛡️',
  dewormer: '🪱',
  collar: '📿',
  medication: '💊',
  hygiene: '🛁',
  other: '📦',
};

const CATEGORY_HINT: Record<ProductCategory, string> = {
  food: 'Ex: Royal Canin, Premier, Hills...',
  antiparasite: 'Ex: Bravecto, Nexgard, Simparica...',
  dewormer: 'Ex: Drontal, Milbemax...',
  collar: 'Ex: Seresto, Scalibor...',
  medication: 'Ex: nome do remédio...',
  hygiene: 'Ex: shampoo, tapete higiênico...',
  other: 'Ex: nome ou marca do produto...',
};

const STEP_TITLE: Record<Step, string> = {
  entry: 'Adicionar produto',
  scanning: 'Escanear código',
  resolving: 'Identificando...',
  'not-found': 'Produto não encontrado',
  'photo-capture': 'Foto da embalagem',
  'photo-processing': 'Analisando...',
  manual: 'Buscar produto',
  confirm: 'Confirmar produto',
};

type CuratedProduct = { name: string; brand?: string };

const CURATED_CATALOG: Partial<Record<ProductCategory, CuratedProduct[]>> = {
  antiparasite: [
    { name: 'Bravecto', brand: 'MSD' },
    { name: 'NexGard', brand: 'Boehringer' },
    { name: 'Simparica', brand: 'Zoetis' },
    { name: 'Frontline Plus', brand: 'Boehringer' },
    { name: 'Advantage', brand: 'Elanco' },
    { name: 'Revolution', brand: 'Zoetis' },
    { name: 'Comfortis', brand: 'Elanco' },
    { name: 'Credelio', brand: 'Elanco' },
    { name: 'Vectra 3D', brand: 'Ceva' },
  ],
  dewormer: [
    { name: 'Drontal Plus', brand: 'Elanco' },
    { name: 'Milbemax', brand: 'Elanco' },
    { name: 'Panacur', brand: 'MSD' },
    { name: 'Canex Plus', brand: 'Virbac' },
    { name: 'Selemax', brand: 'MSD' },
    { name: 'Vermivet', brand: 'Biovet' },
    { name: 'Drontal Gatos', brand: 'Elanco' },
  ],
  medication: [
    { name: 'Vacina V8', brand: 'Polivalente' },
    { name: 'Vacina V10', brand: 'Polivalente' },
    { name: 'Vacina Antirrábica', brand: 'Polivalente' },
    { name: 'Vanguard Plus 5', brand: 'Zoetis' },
    { name: 'Vanguard Plus 10', brand: 'Zoetis' },
    { name: 'Nobivac DHPPi', brand: 'MSD' },
    { name: 'Defensor', brand: 'Zoetis' },
    { name: 'Canigen DHPPi', brand: 'Virbac' },
    { name: 'Versifel CVR', brand: 'Zoetis' },
    { name: 'Leucogen', brand: 'Virbac' },
  ],
  collar: [
    { name: 'Seresto', brand: 'Elanco' },
    { name: 'Scalibor', brand: 'MSD' },
    { name: 'Foresto', brand: 'Elanco' },
    { name: 'Bolfo', brand: 'Bayer' },
  ],
};

const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
];

// Retail-only, checksum-protected formats. Used for the single-shot photo
// pre-scan (no live framing by the user), where CODE_128/CODE_39/ITF are too
// prone to false-positive decodes off busy packaging art.
const RETAIL_BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];

interface PhotoProductIdentifyResponse {
  found: boolean;
  product_name?: string | null;
  name?: string | null;
  probable_name?: string | null;
  brand?: string | null;
  category?: ProductCategory | null;
  weight?: string | null;
  weight_value?: number | null;
  weight_unit?: string | null;
  variant?: string | null;
  size?: string | null;
  manufacturer?: string | null;
  presentation?: string | null;
  confidence?: number | null;
  reason?: string | null;
  species?: string | null;
  life_stage?: string | null;
  line?: string | null;
  flavor?: string | null;
  visible_text?: string | null;
  raw_text_blobs?: string[] | null;
}

interface PhotoIdentifyOutcome {
  product: ScannedProduct | null;
  errorCode: 'photo_ai_not_found' | 'photo_ai_error' | 'photo_ai_timeout' | 'photo_invalid_type' | 'photo_too_large' | null;
  origin?: ProductDetectionOrigin;
  resultType?: ProductDetectionResultType;
  confidence?: ProductDetectionConfidence;
  probableName?: string;
  visibleText?: string;
  species?: string;
  lifeStage?: string;
  detectedWeight?: string;
  detectedBrand?: string;
  assistedConfirmation?: boolean;
  productName?: string;
  rawTextBlobs?: string[];
  strongTerms?: string[];
  mediumTerms?: string[];
  weakTerms?: string[];
  termConflicts?: string[];
}

interface StructuredFoodFields {
  marca?: string;
  linha?: string;
  especie?: string;
  fase?: string;
  proteina?: string;
  peso?: string;
}

interface FoodPhotoIdentifyOutcome extends PhotoIdentifyOutcome {
  structuredFields: StructuredFoodFields;
  extractedRawText: string;
  decisionReason: string;
}

const MAX_PRODUCT_PHOTO_BYTES = 4 * 1024 * 1024; // usado apenas para compressão interna, não como bloqueio

function hasUsefulProductPartial(payload: PhotoProductIdentifyResponse): boolean {
  return Boolean(
    payload.product_name?.trim() ||
    payload.brand?.trim() ||
    payload.weight?.trim() ||
    payload.weight_value != null ||
    payload.weight_unit?.trim() ||
    payload.species?.trim() ||
    payload.life_stage?.trim() ||
    payload.line?.trim() ||
    payload.variant?.trim() ||
    payload.probable_name?.trim() ||
    (payload.raw_text_blobs?.length ?? 0) > 0 ||
    payload.visible_text?.trim(),
  );
}

function getDetectedWeight(payload: PhotoProductIdentifyResponse): string | undefined {
  if (payload.weight?.trim()) return payload.weight.trim();
  if (payload.weight_value != null && payload.weight_unit?.trim()) {
    const value = Number.isInteger(payload.weight_value)
      ? String(payload.weight_value)
      : String(payload.weight_value).replace('.', ',');
    return `${value} ${payload.weight_unit.trim().toLowerCase()}`;
  }
  return undefined;
}

function shouldOpenAssistedConfirmation(payload: PhotoProductIdentifyResponse): boolean {
  const detectedWeight = getDetectedWeight(payload);
  const partialProductName = payload.product_name?.trim() || payload.probable_name?.trim();
  return Boolean(
    payload.brand?.trim() &&
    payload.species?.trim() &&
    payload.life_stage?.trim() &&
    detectedWeight &&
    partialProductName,
  );
}

function normalizeFoodSpecies(value?: string): string | undefined {
  const token = value?.trim().toLowerCase();
  if (!token) return undefined;
  if (['cao', 'cão', 'dog', 'canine'].includes(token)) return 'cão';
  if (['gato', 'cat', 'feline'].includes(token)) return 'gato';
  return token;
}

function normalizeFoodLifeStage(value?: string): string | undefined {
  const token = value?.trim().toLowerCase();
  if (!token) return undefined;
  if (['filhote', 'puppy', 'kitten', 'junior'].includes(token)) return 'filhote';
  if (['adulto', 'adult', 'adulta'].includes(token)) return 'adulto';
  if (['senior', 'sênior', 'mature'].includes(token)) return 'sênior';
  return token;
}

function detectFoodProtein(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/\b(frango|salm[aã]o|carne|boi|cordeiro|peixe|peru|atum)\b/i);
  return match?.[1]?.toLowerCase();
}

function buildFoodDecisionName(fields: StructuredFoodFields, fallbackName?: string): string | undefined {
  const primary = [fields.marca, fields.linha].filter(Boolean).join(' ').trim();
  const speciesStage = [fields.especie, fields.fase].filter(Boolean).join(' ').trim();
  const finalName = [primary || fallbackName, speciesStage, fields.proteina, fields.peso]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return finalName || fallbackName;
}

function isFoodSpeciesIncompatible(species?: string): boolean {
  if (!species) return false;
  const normalized = species.trim().toLowerCase();
  return !['dog', 'cat', 'cão', 'cao', 'gato', 'feline', 'canine'].includes(normalized);
}

function shouldAssistFoodConfirmation(outcome: PhotoIdentifyOutcome, product: ScannedProduct): boolean {
  return Boolean(
    outcome.confidence?.level === 'low' ||
    (outcome.termConflicts?.length ?? 0) > 0 ||
    !product.brand?.trim() ||
    !product.name?.trim() ||
    product.category !== 'food' ||
    isFoodSpeciesIncompatible(outcome.species),
  );
}

function clearPendingScannedProduct(): void {
  try {
    sessionStorage.removeItem('petmol_pending_scanned_product');
  } catch {
    // non-blocking
  }
}

async function normalizeFoodPackageImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const MAX_DIM = 1920;
    const ratio = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    // Ajuste leve para estabilizar OCR de embalagem sem pipeline pesado.
    ctx.filter = 'contrast(1.08) brightness(1.02)';
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });
    if (!blob) return file;
    return new File([blob], file.name, { type: 'image/jpeg' });
  } catch {
    return compressImageForAnalysis(file);
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('file_reader_invalid_result'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('file_reader_failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compressão interna para análise AI: redimensiona para máx 1920px e qualidade 0.85.
 * Preserva qualidade suficiente para OCR, barcode e identificação de rótulo.
 * Foto original não é modificada — compressoão ocorre apenas para o payload da API.
 */
async function compressImageForAnalysis(file: File): Promise<File> {
  // Só comprime se maior que o limite (preserva arquivos pequenos intactos)
  if (file.size <= MAX_PRODUCT_PHOTO_BYTES) return file;

  return new Promise<File>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX_DIM = 1920;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

async function tryReadBarcodeFromPhoto(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const MAX_DIM = 1920;
    const ratio = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return null; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    // TRY_HARDER is deliberately off here: this runs once on a static photo
    // that may show neighboring products or busy packaging art, unlike the
    // live scanner where the user is actively framing a barcode. A missed
    // read just falls through to the AI pipeline; a forced false read skips
    // it (and its hallucination guard) entirely.
    const hints = new Map<DecodeHintType, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, RETAIL_BARCODE_FORMATS],
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    const result = reader.decodeFromCanvas(canvas);
    if (!RETAIL_BARCODE_FORMATS.includes(result.getBarcodeFormat())) return null;
    const barcode = result.getText().replace(/\D/g, '');
    return /^\d{8,14}$/.test(barcode) ? barcode : null;
  } catch {
    return null;
  }
}

function validateProductPhotoFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'photo_invalid_type';
  }
  // Sem limite de tamanho: imagens grandes são comprimidas internamente antes da análise
  return null;
}

function resolveScannerErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof (error as { name?: unknown }).name === 'string') {
    const name = (error as { name: string }).name;
    if (name === 'NotAllowedError') return 'permission_denied';
    if (name === 'NotFoundError') return 'camera_not_found';
    if (name === 'NotReadableError') return 'camera_busy';
    if (name === 'OverconstrainedError') return 'rear_camera_unavailable';
    if (name === 'SecurityError') return 'camera_security_blocked';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'camera_error';
}

function describeScannerError(errorCode: string | null): string | null {
  if (!errorCode) return null;

  switch (errorCode) {
    case 'permission_denied':
      return 'A permissão da câmera foi negada. Você ainda pode tirar uma foto da embalagem ou digitar o código.';
    case 'camera_not_found':
      return 'Nenhuma câmera disponível foi encontrada neste dispositivo.';
    case 'camera_busy':
      return 'A câmera parece estar em uso por outro app. Feche outros apps e tente novamente.';
    case 'rear_camera_unavailable':
      return 'A câmera traseira não ficou disponível. Vamos seguir com foto ou código manual.';
    case 'camera_unavailable':
      return 'Este navegador não expôs acesso à câmera.';
    case 'camera_element_missing':
      return 'Não conseguimos iniciar a área da câmera. Você pode continuar por foto ou código.';
    case 'video_dimensions_timeout':
      return 'A câmera abriu, mas não entregou imagem a tempo. Tente novamente ou use outro caminho.';
    case 'video_play_timeout':
      return 'A câmera demorou demais para começar a reproduzir.';
    case 'camera_security_blocked':
      return 'O navegador bloqueou o acesso à câmera por segurança.';
    case 'manual_invalid_barcode':
      return 'Digite um EAN/GTIN válido com 8 a 14 números.';
    case 'lookup_timeout':
      return 'A busca demorou demais. Você pode continuar pelo código, foto ou nome do produto.';
    case 'product_not_found':
      return 'O código foi lido, mas ainda não encontramos o produto. Continue sem travar pela foto, código ou nome.';
    case 'photo_barcode_not_found':
      return 'Não localizamos um código de barras na foto. Vamos tentar ler a embalagem visualmente.';
    case 'photo_ai_not_found':
      return 'A foto foi analisada, mas não foi possível identificar o produto com segurança. Tente outra imagem ou digite o nome.';
    case 'photo_ai_timeout':
      return 'A leitura da foto demorou demais. A foto foi mantida para você tentar outra imagem ou seguir pela confirmação assistida.';
    case 'photo_ai_error':
      return 'A leitura visual da embalagem falhou agora. Você pode tentar outra foto ou digitar o produto.';
    case 'photo_invalid_type':
      return 'Selecione uma imagem válida do celular, como JPEG, PNG ou WEBP.';
    case 'photo_too_large':
      return 'A foto está muito grande. Use uma imagem de até 4MB.';
    default:
      return 'Não foi possível usar a câmera agora. Você pode continuar por foto, código manual ou nome do produto.';
  }
}

export interface ProductDetectionSheetProps {
  petId: string;
  petName?: string;
  hint?: ProductCategory;
  defaultMode?: 'scan' | 'manual' | 'photo';
  photoEntry?: 'camera' | 'gallery';
  allowScanning?: boolean;
  onProductConfirmed: (product: ScannedProduct) => void;
  onClose: () => void;
}

export function ProductDetectionSheetGold({
  petId,
  petName,
  hint,
  defaultMode,
  photoEntry,
  allowScanning = true,
  onProductConfirmed,
  onClose,
}: ProductDetectionSheetProps) {
  const cooldownRef = useRef(false);
  const cameraPhotoInputRef = useRef<HTMLInputElement>(null);
  const galleryPhotoInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanningActiveRef = useRef(false);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeResolveRef = useRef(0);
  // learning: rastreia como o produto foi resolvido e qual era a sugestão original da IA
  const decisionSourceRef = useRef<ScanDecisionSource>('manual');
  const aiSuggestedNameRef = useRef<string | undefined>(undefined);
  const aiConfidenceRef = useRef<number | undefined>(undefined);
  const decisionScoreRef = useRef<number | undefined>(undefined);
  const decisionResultTypeRef = useRef<ProductDetectionResultType>('fallback');
  const assistedConfirmationRef = useRef(false);
  const probableNameRef = useRef<string | undefined>(undefined);
  const productNameRef = useRef<string | undefined>(undefined);
  const visibleTextRef = useRef<string | undefined>(undefined);
  const rawTextBlobsRef = useRef<string[]>([]);
  const speciesRef = useRef<string | undefined>(undefined);
  const lifeStageRef = useRef<string | undefined>(undefined);
  const detectedWeightRef = useRef<string | undefined>(undefined);
  const detectedBrandRef = useRef<string | undefined>(undefined);
  const strongTermsRef = useRef<string[]>([]);
  const mediumTermsRef = useRef<string[]>([]);
  const weakTermsRef = useRef<string[]>([]);
  const termConflictsRef = useRef<string[]>([]);
  const scanHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scannerBootingRef = useRef(false);
  const photoEntryTriggeredRef = useRef(false);
  const rejectedBarcodesRef = useRef<Set<string>>(new Set());

  const initialStep: Step = defaultMode === 'scan'
    ? 'scanning'
    : defaultMode === 'manual'
      ? 'manual'
      : defaultMode === 'photo'
        ? 'photo-capture'
        : 'entry';
  const [step, setStep] = useState<Step>(initialStep);
  const [confirmed, setConfirmed] = useState<ScannedProduct | null>(null);
  const [fromHistory, setFromHistory] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [scanHintVisible, setScanHintVisible] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [detectedBarcode, setDetectedBarcode] = useState('');
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [kbdBottom, setKbdBottom] = useState(0);

  const emitProductTelemetry = useCallback((eventType: string, payload: Record<string, unknown>) => {
    const enriched = {
      event_type: eventType,
      ...payload,
      pet_id: petId,
      at: new Date().toISOString(),
    };
    console.info('[ProductScanner][Telemetry]', enriched);
    void trackEvent('product_detection_pipeline', 'other', enriched, { petId }).catch(() => {
      // Telemetria não pode bloquear o fluxo principal.
    });
  }, [petId]);

  const resetPhotoAttempt = useCallback(() => {
    setConfirmed(null);
    setFromHistory(false);
    setDetectedBarcode('');
    setManualBarcode('');
    setScannerError(null);
    decisionSourceRef.current = 'manual';
    aiSuggestedNameRef.current = undefined;
    aiConfidenceRef.current = undefined;
    decisionScoreRef.current = undefined;
    decisionResultTypeRef.current = 'fallback';
    assistedConfirmationRef.current = false;
    probableNameRef.current = undefined;
    productNameRef.current = undefined;
    visibleTextRef.current = undefined;
    rawTextBlobsRef.current = [];
    speciesRef.current = undefined;
    lifeStageRef.current = undefined;
    detectedWeightRef.current = undefined;
    detectedBrandRef.current = undefined;
    strongTermsRef.current = [];
    mediumTermsRef.current = [];
    weakTermsRef.current = [];
    termConflictsRef.current = [];
  }, []);

  const identifyProductFromPhoto = useCallback(async (file: File, barcodeFromPhoto?: string): Promise<PhotoIdentifyOutcome> => {
    try {
      // Comprime imagens grandes internamente antes de enviar para a API de visão
      // Garante que fotos de alta resolução do celular funcionem sem erros de tamanho
      const fileForAnalysis = await compressImageForAnalysis(file);
      const image = await fileToBase64(fileForAnalysis);
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/vision/identify-product-photo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          image,
          pet_id: petId,
          hint: hint ?? null,
        }),
      });

      if (!res.ok) {
        if (res.status === 504) {
          return { product: null, errorCode: 'photo_ai_timeout' };
        }
        return { product: null, errorCode: 'photo_ai_error' };
      }

      const payload = (await res.json()) as PhotoProductIdentifyResponse;

      const resolved = await resolvePhotoProductCandidate(payload, {
        hint: hint ?? undefined,
        barcode: barcodeFromPhoto ?? '',
      });

      const assistedConfirmation = shouldOpenAssistedConfirmation(payload);
      const detectedWeight = getDetectedWeight(payload);
      const rawTextBlobs = (payload.raw_text_blobs ?? []).filter((value): value is string => Boolean(value?.trim()));
      const fallbackFields = extractFoodFields({
        brand: payload.brand,
        productName: payload.product_name,
        probableName: payload.probable_name,
        species: payload.species,
        lifeStage: payload.life_stage,
        weight: detectedWeight ?? payload.weight,
        weightValue: payload.weight_value,
        weightUnit: payload.weight_unit,
        line: payload.line,
        variant: payload.variant ?? payload.size,
        size: payload.size,
        flavor: payload.flavor,
        visibleText: payload.visible_text,
        reason: payload.reason,
        rawTextBlobs,
      });
      const fallbackTerms = fallbackFields.dominantTerms;
      // OCR-corrected brand: extractFoodFields already applies override when OCR conflicts with AI
      const resolvedBrand = fallbackFields.brand || payload.brand?.trim();

      if (!resolved) {
        if (!hasUsefulProductPartial(payload)) {
          return { product: null, errorCode: 'photo_ai_not_found' };
        }

        const partialName = buildPartialFoodName({
          brand: payload.brand,
          productName: payload.product_name,
          probableName: payload.probable_name,
          species: payload.species,
          lifeStage: payload.life_stage,
          weight: detectedWeight ?? payload.weight,
          weightValue: payload.weight_value,
          weightUnit: payload.weight_unit,
          line: payload.line,
          variant: payload.variant ?? payload.size,
          size: payload.size,
          flavor: payload.flavor,
          visibleText: payload.visible_text,
          reason: payload.reason,
          rawTextBlobs,
        }) || [
          resolvedBrand,
          payload.product_name?.trim(),
          payload.line?.trim(),
          payload.variant?.trim(),
          payload.species?.trim(),
          payload.life_stage?.trim(),
          detectedWeight,
        ].filter(Boolean).join(' ').trim();

        if (!partialName) {
          return { product: null, errorCode: 'photo_ai_not_found' };
        }

        const fallbackCategory = payload.category ?? hint ?? 'other';
        return {
          product: {
            barcode: barcodeFromPhoto ?? '',
            name: partialName,
            brand: resolvedBrand || undefined,
            weight: detectedWeight,
            manufacturer: payload.manufacturer?.trim() || resolvedBrand || undefined,
            presentation: payload.presentation?.trim() || detectedWeight || undefined,
            category: fallbackCategory,
            found: true,
          },
          errorCode: null,
          origin: 'partial_name',
          resultType: 'partial',
          confidence: { score: 0.58, level: 'medium' },
          probableName: payload.probable_name?.trim() || partialName,
          visibleText: payload.visible_text?.trim() || undefined,
          productName: payload.product_name?.trim() || undefined,
          rawTextBlobs,
          species: payload.species?.trim() || undefined,
          lifeStage: payload.life_stage?.trim() || undefined,
          detectedWeight,
          detectedBrand: resolvedBrand || undefined,
          assistedConfirmation: assistedConfirmation || fallbackTerms.strongTerms.length > 0,
          strongTerms: fallbackTerms.strongTerms,
          mediumTerms: fallbackTerms.mediumTerms,
          weakTerms: fallbackTerms.weakTerms,
          termConflicts: [],
        };
      }

      return {
        product: {
          barcode: resolved.product.barcode,
          name: resolved.product.name,
          brand: resolved.product.brand,
          weight: resolved.product.weight,
          manufacturer: resolved.product.manufacturer,
          presentation: resolved.product.presentation,
          category: resolved.product.category,
          found: true,
        },
        errorCode: null,
        origin: resolved.origin,
        resultType: resolved.resultType,
        confidence: resolved.confidence,
        probableName: payload.probable_name?.trim() || undefined,
        visibleText: payload.visible_text?.trim() || undefined,
        productName: payload.product_name?.trim() || undefined,
        rawTextBlobs,
        species: payload.species?.trim() || undefined,
        lifeStage: payload.life_stage?.trim() || undefined,
        detectedWeight: detectedWeight ?? resolved.product.weight,
        detectedBrand: resolved.product.brand || payload.brand?.trim(),
        assistedConfirmation: assistedConfirmation || resolved.assistedConfirmation,
        strongTerms: resolved.dominantTerms?.strongTerms,
        mediumTerms: resolved.dominantTerms?.mediumTerms,
        weakTerms: resolved.dominantTerms?.weakTerms,
        termConflicts: [...(resolved.strongTermConflicts ?? []), ...(resolved.mediumTermConflicts ?? [])],
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return { product: null, errorCode: 'photo_ai_timeout' };
      }
      return { product: null, errorCode: 'photo_ai_error' };
    }
  }, [hint, petId]);

  const identifyFoodByPackageImage = useCallback(async (file: File): Promise<FoodPhotoIdentifyOutcome> => {
    try {
      const token = getToken();
      let payload: PhotoProductIdentifyResponse | null = null;
      let lastErrorCode: PhotoIdentifyOutcome['errorCode'] = 'photo_ai_error';

      const normalizedFile = await normalizeFoodPackageImage(file);
      const candidates = normalizedFile === file ? [file] : [file, normalizedFile];
      for (const candidateFile of candidates) {
        const image = await fileToBase64(candidateFile);
        const res = await fetch(`${API_BASE_URL}/vision/identify-product-photo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({
            image,
            pet_id: petId,
            hint: 'food',
          }),
        });

        if (!res.ok) {
          lastErrorCode = res.status === 504 ? 'photo_ai_timeout' : 'photo_ai_error';
          continue;
        }

        const currentPayload = (await res.json()) as PhotoProductIdentifyResponse;
        payload = currentPayload;
        if (hasUsefulProductPartial(currentPayload)) break;
      }

      if (!payload) {
        return {
          product: null,
          errorCode: lastErrorCode,
          structuredFields: {},
          extractedRawText: '',
          decisionReason: lastErrorCode === 'photo_ai_timeout' ? 'timeout_vision_api' : 'vision_api_error',
        };
      }

      const parsedFood = extractFoodFields({
        brand: payload.brand,
        productName: payload.product_name,
        probableName: payload.probable_name,
        species: payload.species,
        lifeStage: payload.life_stage,
        weight: getDetectedWeight(payload) ?? payload.weight,
        weightValue: payload.weight_value,
        weightUnit: payload.weight_unit,
        line: payload.line,
        variant: payload.variant ?? payload.size,
        size: payload.size,
        flavor: payload.flavor,
        visibleText: payload.visible_text,
        reason: payload.reason,
        rawTextBlobs: payload.raw_text_blobs ?? [],
      });

      const structuredFields: StructuredFoodFields = {
        marca: parsedFood.brand || payload.brand?.trim(),
        linha: payload.line?.trim() || parsedFood.line || payload.product_name?.trim() || parsedFood.productName,
        especie: normalizeFoodSpecies(payload.species?.trim() || parsedFood.species),
        fase: normalizeFoodLifeStage(payload.life_stage?.trim() || parsedFood.lifeStage),
        proteina: detectFoodProtein(
          [
            payload.flavor?.trim(),
            payload.variant?.trim(),
            payload.product_name?.trim(),
            payload.visible_text?.trim(),
            ...(payload.raw_text_blobs ?? []),
          ].filter(Boolean).join(' '),
        ),
        peso: getDetectedWeight(payload) || parsedFood.weight,
      };

      const extractedRawText = [
        ...(payload.raw_text_blobs ?? []).map(item => item?.trim()).filter(Boolean),
        payload.visible_text?.trim(),
      ].filter(Boolean).join('\n').trim();

      const resolved = await resolvePhotoProductCandidate(payload, {
        hint: 'food',
        barcode: '',
      });

      const fallbackName = buildPartialFoodName({
        brand: payload.brand,
        productName: payload.product_name,
        probableName: payload.probable_name,
        species: payload.species,
        lifeStage: payload.life_stage,
        weight: getDetectedWeight(payload) ?? payload.weight,
        weightValue: payload.weight_value,
        weightUnit: payload.weight_unit,
        line: payload.line,
        variant: payload.variant ?? payload.size,
        size: payload.size,
        flavor: payload.flavor,
        visibleText: payload.visible_text,
        reason: payload.reason,
        rawTextBlobs: payload.raw_text_blobs ?? [],
      }) || payload.product_name?.trim() || payload.probable_name?.trim() || resolved?.product.name;

      const resolvedName = resolved?.product.name?.trim();
      const finalName = resolvedName || buildFoodDecisionName(structuredFields, fallbackName);
      if (!finalName) {
        return {
          product: null,
          errorCode: 'photo_ai_not_found',
          origin: 'parser',
          resultType: 'fallback',
          confidence: { score: 0.15, level: 'low' },
          probableName: payload.probable_name?.trim() || undefined,
          visibleText: payload.visible_text?.trim() || undefined,
          productName: payload.product_name?.trim() || undefined,
          rawTextBlobs: payload.raw_text_blobs ?? [],
          species: structuredFields.especie,
          lifeStage: structuredFields.fase,
          detectedWeight: structuredFields.peso,
          detectedBrand: structuredFields.marca,
          assistedConfirmation: false,
          strongTerms: parsedFood.dominantTerms.strongTerms,
          mediumTerms: parsedFood.dominantTerms.mediumTerms,
          weakTerms: parsedFood.dominantTerms.weakTerms,
          termConflicts: [],
          structuredFields,
          extractedRawText,
          decisionReason: 'missing_required_food_fields',
        };
      }

      const baseScore = 0.45;
      const composedScore = Math.min(
        0.93,
        baseScore
          + (structuredFields.marca ? 0.14 : 0)
          + (structuredFields.linha ? 0.11 : 0)
          + (structuredFields.especie ? 0.08 : 0)
          + (structuredFields.fase ? 0.06 : 0)
          + (structuredFields.proteina ? 0.04 : 0)
          + (structuredFields.peso ? 0.05 : 0),
      );
      const fallbackConfidence: ProductDetectionConfidence = {
        score: Number(composedScore.toFixed(2)),
        level: composedScore >= 0.8 ? 'high' : composedScore >= 0.55 ? 'medium' : 'low',
      };
      const confidence = resolved?.confidence ?? fallbackConfidence;

      const product: ScannedProduct = {
        barcode: '',
        name: finalName,
        brand: resolved?.product.brand || structuredFields.marca || undefined,
        weight: resolved?.product.weight || structuredFields.peso || undefined,
        manufacturer: resolved?.product.manufacturer || structuredFields.marca || undefined,
        presentation: resolved?.product.presentation || structuredFields.peso || undefined,
        category: 'food',
        found: true,
      };

      return {
        product,
        errorCode: null,
        origin: resolved?.origin ?? 'parser',
        resultType: resolved?.resultType ?? (confidence.level === 'high' ? 'complete' : 'partial'),
        confidence,
        probableName: payload.probable_name?.trim() || undefined,
        visibleText: payload.visible_text?.trim() || undefined,
        productName: payload.product_name?.trim() || undefined,
        rawTextBlobs: payload.raw_text_blobs ?? [],
        species: structuredFields.especie,
        lifeStage: structuredFields.fase,
        detectedWeight: structuredFields.peso,
        detectedBrand: structuredFields.marca,
        assistedConfirmation: Boolean(resolved?.assistedConfirmation),
        strongTerms: resolved?.dominantTerms?.strongTerms ?? parsedFood.dominantTerms.strongTerms,
        mediumTerms: resolved?.dominantTerms?.mediumTerms ?? parsedFood.dominantTerms.mediumTerms,
        weakTerms: resolved?.dominantTerms?.weakTerms ?? parsedFood.dominantTerms.weakTerms,
        termConflicts: [...(resolved?.strongTermConflicts ?? []), ...(resolved?.mediumTermConflicts ?? [])],
        structuredFields,
        extractedRawText,
        decisionReason: resolvedName
          ? 'food_image_only_priority_with_resolver: resolved_name + structured_fields'
          : 'food_image_only_priority: marca+linha > especie+fase > proteina > peso',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return {
          product: null,
          errorCode: 'photo_ai_timeout',
          structuredFields: {},
          extractedRawText: '',
          decisionReason: 'timeout_vision_api',
        };
      }
      return {
        product: null,
        errorCode: 'photo_ai_error',
        structuredFields: {},
        extractedRawText: '',
        decisionReason: 'food_image_pipeline_exception',
      };
    }
  }, [petId]);

  const openCameraPhotoPicker = useCallback(() => {
    setScannerError(null);
    cameraPhotoInputRef.current?.click();
  }, []);

  const openGalleryPhotoPicker = useCallback(() => {
    setScannerError(null);
    galleryPhotoInputRef.current?.click();
  }, []);

  useEffect(() => {
    if (step !== 'photo-capture') return;
    if (!photoEntry) return;
    if (photoEntryTriggeredRef.current) return;
    photoEntryTriggeredRef.current = true;
    const timer = setTimeout(() => {
      if (photoEntry === 'camera') openCameraPhotoPicker();
      else openGalleryPhotoPicker();
    }, 60);
    return () => clearTimeout(timer);
  }, [openCameraPhotoPicker, openGalleryPhotoPicker, photoEntry, step]);

  useEffect(() => {
    setHistory(loadScanHistory(petId, hint).slice(0, 5));
  }, [petId, hint]);

  useEffect(() => {
    if (step !== 'manual') { setKbdBottom(0); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setKbdBottom(Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)));
    vv.addEventListener('resize', update);
    update();
    return () => vv.removeEventListener('resize', update);
  }, [step]);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions(history.map(item => item.product.name).filter(Boolean));
      return;
    }
    setSuggestions(getSearchSuggestions(query, hint, petId));
  }, [query, hint, petId, history]);

  const clearScanHintTimer = useCallback(() => {
    if (scanHintTimerRef.current) {
      clearTimeout(scanHintTimerRef.current);
      scanHintTimerRef.current = null;
    }
  }, []);

  const clearPlayTimeout = useCallback(() => {
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
  }, []);

  const clearResolveTimeout = useCallback(() => {
    if (resolveTimeoutRef.current) {
      clearTimeout(resolveTimeoutRef.current);
      resolveTimeoutRef.current = null;
    }
  }, []);

  const waitForVideoElement = useCallback(async () => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (videoRef.current) return videoRef.current;
      await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
    }

    throw new Error('camera_element_missing');
  }, []);

  const waitForVideoMetadata = useCallback(async (video: HTMLVideoElement) => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      console.info('[ProductScanner] videoReady', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('video_dimensions_timeout'));
      }, 5000);

      const onLoadedMetadata = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          cleanup();
          console.info('[ProductScanner] videoReady', {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
          });
          resolve();
        }
      };

      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
      };

      video.addEventListener('loadedmetadata', onLoadedMetadata);
      onLoadedMetadata();
    });
  }, []);

  const openRearCameraStream = useCallback(async () => {
    const baseVideoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    };

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          ...baseVideoConstraints,
          facingMode: { exact: 'environment' },
        },
        audio: false,
      });
    } catch {
      return navigator.mediaDevices.getUserMedia({
        video: {
          ...baseVideoConstraints,
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });
    }
  }, []);

  const stopScanner = useCallback(async () => {
    scanningActiveRef.current = false;
    scannerBootingRef.current = false;
    clearScanHintTimer();
    clearPlayTimeout();
    setScanHintVisible(false);

    const controls = zxingControlsRef.current;
    zxingControlsRef.current = null;
    if (controls) {
      try {
        controls.stop();
      } catch {
        // Scanner may already be stopped.
      }
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }

    BrowserCodeReader.releaseAllStreams();
  }, [clearPlayTimeout, clearScanHintTimer]);

  useEffect(() => () => {
    clearResolveTimeout();
    clearPlayTimeout();
    void stopScanner();
  }, [clearPlayTimeout, clearResolveTimeout, stopScanner]);

  useEffect(() => {
    if (!photoUrl) return;

    return () => {
      URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const resolveDetectedBarcode = useCallback(async (barcode: string) => {
    const resolveId = ++activeResolveRef.current;

    clearResolveTimeout();
    setDetectedBarcode(barcode);
    setManualBarcode(barcode);
    setStep('resolving');

    resolveTimeoutRef.current = setTimeout(() => {
      if (activeResolveRef.current !== resolveId) return;
      activeResolveRef.current += 1;
      setConfirmed({ barcode, name: '', category: hint ?? 'other', found: false });
      setScannerError('lookup_timeout');
      setStep('manual');
    }, 6000);

    if (rejectedBarcodesRef.current.has(barcode)) {
      clearResolveTimeout();
      setConfirmed({ barcode, name: '', category: hint ?? 'other', found: false });
      setScannerError(null);
      setStep('manual');
      decisionScoreRef.current = 0.2;
      decisionResultTypeRef.current = 'fallback';
      return;
    }

    const product = await identifyProductByBarcode(barcode);
    if (activeResolveRef.current !== resolveId) return;

    clearResolveTimeout();
    const final: ScannedProduct = {
      ...product,
      category: product.category === 'other' && hint ? hint : product.category,
    };

    if (final.found) {
      decisionSourceRef.current = 'gtin';
      aiSuggestedNameRef.current = undefined;
      const gtinConfidence = scoreGtinResolution();
      aiConfidenceRef.current = gtinConfidence.score;
      decisionScoreRef.current = gtinConfidence.score;
      decisionResultTypeRef.current = 'complete';
      assistedConfirmationRef.current = false;
      probableNameRef.current = undefined;
      productNameRef.current = undefined;
      visibleTextRef.current = undefined;
      rawTextBlobsRef.current = [];
      speciesRef.current = undefined;
      lifeStageRef.current = undefined;
      detectedWeightRef.current = final.weight;
      detectedBrandRef.current = final.brand;
      strongTermsRef.current = [];
      mediumTermsRef.current = [];
      weakTermsRef.current = [];
      termConflictsRef.current = [];
      setFromHistory(false);
      setConfirmed(final);
      setScannerError(null);
      setStep('confirm');
      emitProductTelemetry('resolved', {
        origin: 'gtin',
        result: 'complete',
        score: gtinConfidence.score,
        category: final.category,
        brand: final.brand ?? null,
      });
      return;
    }

    if (final.queued) {
      setConfirmed({
        barcode,
        name: '',
        category: hint ?? 'other',
        found: false,
        queued: true,
        queueMessage: final.queueMessage,
      });
      setScannerError(null);
      setStep('not-found');
      decisionScoreRef.current = 0.2;
      decisionResultTypeRef.current = 'fallback';
      emitProductTelemetry('resolved', {
        origin: 'gtin',
        result: 'fallback',
        score: 0.2,
        category: hint ?? 'other',
        brand: null,
      });
      return;
    }

    setConfirmed({ barcode, name: '', category: hint ?? 'other', found: false });
    setScannerError('product_not_found');
    setStep('manual');
    decisionScoreRef.current = 0.2;
    decisionResultTypeRef.current = 'fallback';
    emitProductTelemetry('resolved', {
      origin: 'gtin',
      result: 'fallback',
      score: 0.2,
      category: hint ?? 'other',
      brand: null,
    });
  }, [clearResolveTimeout, emitProductTelemetry, hint]);

  const handleManualBarcodeLookup = useCallback(async () => {
    const barcode = manualBarcode.replace(/\D/g, '');
    if (!/^\d{8,14}$/.test(barcode)) {
      setScannerError('manual_invalid_barcode');
      return;
    }

    setScannerError(null);
    await resolveDetectedBarcode(barcode);
  }, [manualBarcode, resolveDetectedBarcode]);

  const handleDetectedBarcode = useCallback(async (rawBarcode: string) => {
    const barcode = rawBarcode.replace(/\D/g, '');
    if (!/^\d{8,14}$/.test(barcode)) return;
    if (cooldownRef.current) return;

    cooldownRef.current = true;
    setDetectedBarcode(barcode);
    setScanSuccess(true);
    console.info('[ProductScanner] barcodeDetected', { barcode });

    setTimeout(() => {
      cooldownRef.current = false;
    }, 1500);

    await new Promise(resolve => setTimeout(resolve, 220));
    await stopScanner();
    await resolveDetectedBarcode(barcode);
  }, [resolveDetectedBarcode, stopScanner]);

  const beginScanner = useCallback(async () => {
    if (scannerBootingRef.current) return;

    await stopScanner();
    scannerBootingRef.current = true;

    setScanHintVisible(false);
    setScanSuccess(false);
    setCameraFailed(false);
    setScannerError(null);
    setDetectedBarcode('');
    cooldownRef.current = false;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('camera_unavailable');
      }

      const video = await waitForVideoElement();
      const stream = await openRearCameraStream();
      console.info('[ProductScanner] streamOpened', {
        tracks: stream.getVideoTracks().map(track => ({
          label: track.label,
          readyState: track.readyState,
          settings: track.getSettings(),
        })),
      });
      const hints = new Map<DecodeHintType, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS],
        [DecodeHintType.TRY_HARDER, true],
      ]);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 80,
        delayBetweenScanSuccess: 500,
        tryPlayVideoTimeout: 3500,
      });

      scanningActiveRef.current = true;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      video.autoplay = true;
      video.srcObject = stream;
      mediaStreamRef.current = stream;

      playTimeoutRef.current = setTimeout(() => {
        if (!scanningActiveRef.current) return;
        setCameraFailed(true);
        setScannerError('video_play_timeout');
        void stopScanner().finally(() => setStep('photo-capture'));
      }, 2500);

      await video.play();
      clearPlayTimeout();
      console.info('[ProductScanner] playResolved');
      await waitForVideoMetadata(video);
      // Aguarda estabilização da câmera (foco automático + ajuste de exposição)
      await new Promise(resolve => setTimeout(resolve, 600));
      console.info('[ProductScanner] decodeStarted', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });

      const controls = await reader.decodeFromVideoElement(video, (result) => {
        if (!scanningActiveRef.current || !result) return;
        void handleDetectedBarcode(result.getText());
      });
      zxingControlsRef.current = controls;
      scannerBootingRef.current = false;

      scanHintTimerRef.current = setTimeout(() => setScanHintVisible(true), 8000);
    } catch (error) {
      await stopScanner();
      setCameraFailed(true);
      setScannerError(resolveScannerErrorCode(error));
      setStep('photo-capture');
      scannerBootingRef.current = false;
    }
  }, [handleDetectedBarcode, openRearCameraStream, stopScanner, waitForVideoElement, waitForVideoMetadata]);

  useEffect(() => {
    if (step !== 'scanning') return;
    void beginScanner();
  }, [beginScanner, step]);

  const startScanner = () => {
    setStep('scanning');
    setScanHintVisible(false);
    setScanSuccess(false);
    setCameraFailed(false);
    setScannerError(null);
    setDetectedBarcode('');
    setManualBarcode('');
    cooldownRef.current = false;
  };

  const handlePhotoFile = async (file: File) => {
    resetPhotoAttempt();
    const validationError = validateProductPhotoFile(file);
    if (validationError) {
      setScannerError(validationError);
      setStep('photo-capture');
      return;
    }

    setScannerError(null);
    setStep('photo-processing');

    // ZXing barcode scan on submitted photo — free, instant, 100% accurate when barcode readable
    const photoBarcode = await tryReadBarcodeFromPhoto(file);
    if (photoBarcode) {
      await resolveDetectedBarcode(photoBarcode);
      return;
    }

    const url = URL.createObjectURL(file);
    setPhotoUrl(url);

    // Pipeline único para todos os tipos (consistência com versão estável)
    const identifiedFromPhoto = await identifyProductFromPhoto(file, undefined);
    if (identifiedFromPhoto.product) {
      const photoProduct = identifiedFromPhoto.product;
      // Verificar se há correção prévia para o nome sugerido pela IA
      const corrected = identifiedFromPhoto.assistedConfirmation || (identifiedFromPhoto.termConflicts?.length ?? 0) > 0
        ? null
        : findLocalCorrection(photoProduct.name, photoProduct.category);
      const finalName = corrected ?? photoProduct.name;
      const score = identifiedFromPhoto.confidence?.score ?? 0.62;
      const origin = identifiedFromPhoto.origin ?? 'partial_name';
      const resultType = identifiedFromPhoto.resultType ?? 'partial';
      decisionSourceRef.current = origin === 'parser'
        ? 'parser'
        : origin === 'fuzzy_match'
          ? 'fuzzy_match'
          : origin === 'ia'
            ? 'ai'
            : 'partial_name';
      aiSuggestedNameRef.current = photoProduct.name; // nome original da IA (antes de correção)
      aiConfidenceRef.current = score;
      decisionScoreRef.current = score;
      decisionResultTypeRef.current = resultType;
      assistedConfirmationRef.current = Boolean(identifiedFromPhoto.assistedConfirmation);
      probableNameRef.current = identifiedFromPhoto.probableName;
      productNameRef.current = identifiedFromPhoto.productName;
      visibleTextRef.current = identifiedFromPhoto.visibleText;
      rawTextBlobsRef.current = identifiedFromPhoto.rawTextBlobs ?? [];
      speciesRef.current = identifiedFromPhoto.species;
      lifeStageRef.current = identifiedFromPhoto.lifeStage;
      detectedWeightRef.current = identifiedFromPhoto.detectedWeight ?? photoProduct.weight;
      detectedBrandRef.current = identifiedFromPhoto.detectedBrand ?? photoProduct.brand;
      strongTermsRef.current = identifiedFromPhoto.strongTerms ?? [];
      mediumTermsRef.current = identifiedFromPhoto.mediumTerms ?? [];
      weakTermsRef.current = identifiedFromPhoto.weakTerms ?? [];
      termConflictsRef.current = identifiedFromPhoto.termConflicts ?? [];
      setScannerError(null);
      setFromHistory(false);
      const nextProduct = corrected ? { ...photoProduct, name: finalName } : photoProduct;
      setConfirmed(nextProduct);
      emitProductTelemetry('resolved', {
        origin,
        result: resultType,
        score,
        category: nextProduct.category,
        brand: nextProduct.brand ?? null,
      });

      if ((identifiedFromPhoto.confidence?.level === 'low' || resultType === 'fallback') && !identifiedFromPhoto.assistedConfirmation) {
        setQuery(finalName);
        setStep('manual');
      } else {
        setStep('confirm');
      }
      return;
    }

    setScannerError(identifiedFromPhoto.errorCode ?? 'photo_barcode_not_found');
    setManualBarcode('');
    setConfirmed(null);
    setStep('not-found');
    decisionScoreRef.current = 0.15;
    decisionResultTypeRef.current = 'fallback';
    emitProductTelemetry('resolved', {
      origin: 'partial_name',
      result: 'fallback',
      score: 0.15,
      category: hint ?? 'other',
      brand: null,
    });
  };

  const selectManual = (name: string) => {
    const product: ScannedProduct = {
      barcode: confirmed?.barcode ?? '',
      name,
      category: hint ?? 'other',
      found: true,
    };
    setFromHistory(false);
    setConfirmed(product);
    setStep('confirm');
    decisionSourceRef.current = 'manual';
    decisionScoreRef.current = 0.4;
    decisionResultTypeRef.current = 'partial';
    assistedConfirmationRef.current = false;
    probableNameRef.current = probableNameRef.current ?? name;
    productNameRef.current = productNameRef.current ?? undefined;
    detectedBrandRef.current = detectedBrandRef.current ?? confirmed?.brand;
    detectedWeightRef.current = detectedWeightRef.current ?? confirmed?.weight;
    strongTermsRef.current = [];
    mediumTermsRef.current = [];
    weakTermsRef.current = [];
    termConflictsRef.current = [];
    emitProductTelemetry('resolved', {
      origin: 'manual',
      result: 'partial',
      score: 0.4,
      category: product.category,
      brand: null,
    });
  };

  const handleConfirm = () => {
    if (!confirmed) return;

    if (confirmed.barcode && confirmed.found) {
      saveLocalProduct(confirmed.barcode, {
        barcode: confirmed.barcode,
        name: confirmed.name,
        brand: confirmed.brand,
        weight: confirmed.weight,
        category: confirmed.category,
        source: 'cache',
      });
      // Aplicar memória de correção: se o tutor corrigiu este nome antes, sugerir o valor correto
      const previousCorrection = findLocalCorrection(confirmed.name, confirmed.category);
      if (previousCorrection && previousCorrection !== confirmed.name) {
        // Não forçar — apenas registrar que havia uma correção prévia; o tutor já confirmou este nome
      }
      void submitLearningConfirmation({
        barcode: confirmed.barcode,
        name: confirmed.name,
        brand: confirmed.brand,
        category: confirmed.category,
        manufacturer: confirmed.manufacturer,
        presentation: confirmed.presentation ?? confirmed.weight,
        weight: confirmed.weight,
        species: speciesRef.current,
        life_stage: lifeStageRef.current,
        decision_source: decisionSourceRef.current,
        decision_score: decisionScoreRef.current ?? aiConfidenceRef.current,
        decision_result: decisionResultTypeRef.current,
        ai_suggested_name: aiSuggestedNameRef.current,
        ai_confidence: aiConfidenceRef.current ?? decisionScoreRef.current,
        probable_name: probableNameRef.current,
        visible_text: visibleTextRef.current,
        ocr_raw_text: visibleTextRef.current,
        tutor_confirmed: true,
        pet_id: petId,
      });
    } else {
      // Produto sem barcode confirmado (AI/manual sem GTIN): usar confirmProductLookup legacy
      void confirmProductLookup({
        barcode: confirmed.barcode,
        name: confirmed.name,
        brand: confirmed.brand,
        category: confirmed.category,
        manufacturer: confirmed.manufacturer,
        presentation: confirmed.presentation ?? confirmed.weight,
        source: 'user_confirmed',
      });
    }

    saveToScanHistory({ barcode: confirmed.barcode, product: confirmed, petId, category: confirmed.category });
    emitProductTelemetry('confirmed', {
      origin: decisionSourceRef.current,
      result: decisionResultTypeRef.current,
      score: decisionScoreRef.current ?? aiConfidenceRef.current ?? null,
      category: confirmed.category,
      brand: confirmed.brand ?? null,
      confirmed_by_tutor: true,
    });
    onProductConfirmed(confirmed);
  };

  const canGoBack = step !== 'entry' && step !== 'resolving' && step !== 'photo-processing';
  const immersiveMode = step === 'scanning' || step === 'resolving';

  const goBack = async () => {
    if (step === 'scanning') {
      await stopScanner();
      setStep(allowScanning ? 'entry' : 'photo-capture');
      return;
    }

    if (step === 'not-found') {
      clearPendingScannedProduct();
      setConfirmed(null);
      setStep(allowScanning ? 'entry' : 'photo-capture');
      return;
    }

    if (step === 'confirm') {
      if (confirmed?.barcode) rejectedBarcodesRef.current.add(confirmed.barcode);
      clearPendingScannedProduct();
      setConfirmed(null);
      setFromHistory(false);
      setStep('manual');
      setQuery('');
      return;
    }

    if (defaultMode === 'photo' && !allowScanning && step === 'photo-capture') {
      clearPendingScannedProduct();
      onClose();
      return;
    }

    setStep(allowScanning ? 'entry' : 'photo-capture');
  };

  const renderEntry = () => (
    <div className="space-y-5 p-5 pb-8">
      <div className="pb-1 pt-2 text-center">
        <p className="mb-3 text-5xl">🔍</p>
        <h2 className="text-[19px] font-bold text-gray-900">Como quer identificar?</h2>
        <p className="mt-1 text-sm text-gray-500">Escolha o jeito mais fácil para você</p>
      </div>

      <div className="space-y-3">
        {allowScanning && (
          <button
            type="button"
            onClick={startScanner}
            className="w-full rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-2xl">📷</div>
              <div className="flex-1">
                <p className="text-[15px] font-bold text-blue-900">Escanear código de barras</p>
                <p className="mt-0.5 text-xs text-blue-600">Câmera traseira em tela cheia e leitura contínua</p>
              </div>
              <span className="flex-shrink-0 text-xl text-blue-300">›</span>
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={() => setStep('photo-capture')}
          className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-2xl">🖼️</div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-emerald-900">Fotografar a embalagem</p>
              <p className="mt-0.5 text-xs text-emerald-600">Tire uma foto e tentamos identificar o produto</p>
            </div>
            <span className="flex-shrink-0 text-xl text-emerald-300">›</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStep('manual')}
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-2xl">✏️</div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-gray-800">Digitar o nome do produto</p>
              <p className="mt-0.5 text-xs text-gray-500">Busque por nome ou marca com sugestões</p>
            </div>
            <span className="flex-shrink-0 text-xl text-gray-300">›</span>
          </div>
        </button>
      </div>

      {history.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Produtos que você já usa
          </p>
          <div className="space-y-1.5">
            {history.map((item, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  setFromHistory(true);
                  setConfirmed(item.product);
                  setStep('confirm');
                }}
                className="w-full rounded-xl border border-gray-100 bg-white px-4 py-3 text-left shadow-sm transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 text-xl">{CATEGORY_EMOJI[item.product.category]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-800">{item.product.name}</p>
                    {item.product.brand && item.product.brand !== item.product.name && (
                      <p className="truncate text-xs text-gray-400">{item.product.brand}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-lg text-gray-200">›</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderScanning = () => (
    <div className="relative min-h-dvh bg-black">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline autoPlay />

      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)]">
        <button
          type="button"
          onClick={goBack}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-2xl text-white backdrop-blur"
          aria-label="Voltar"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => {
            clearPendingScannedProduct();
            onClose();
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-xl text-white backdrop-blur"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
        <div className="absolute inset-0 bg-black/32" />
        <div className="relative h-[28dvh] max-h-[260px] w-[86vw] max-w-xl rounded-[36px] border-[3px] border-white/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]">
          <div className="absolute inset-x-8 top-0 h-[3px] rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.9)] animate-scanline" />
          <div className="absolute left-0 top-0 h-10 w-10 rounded-tl-[30px] border-l-[5px] border-t-[5px] border-cyan-300" />
          <div className="absolute right-0 top-0 h-10 w-10 rounded-tr-[30px] border-r-[5px] border-t-[5px] border-cyan-300" />
          <div className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-[30px] border-b-[5px] border-l-[5px] border-cyan-300" />
          <div className="absolute bottom-0 right-0 h-10 w-10 rounded-br-[30px] border-b-[5px] border-r-[5px] border-cyan-300" />
        </div>

        <div className="relative mt-8 rounded-full bg-black/55 px-5 py-3 text-center backdrop-blur">
          <p className="text-base font-bold text-white">Aponte para o código de barras</p>
          <p className="mt-1 text-sm text-white/75">Leitura contínua ativa na câmera traseira</p>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="rounded-[28px] bg-black/58 p-4 text-white backdrop-blur-xl">
          {scanHintVisible ? (
            <div className="mb-3 rounded-2xl border border-amber-300/40 bg-amber-400/12 px-4 py-3">
              <p className="text-sm font-semibold text-amber-100">Não consegui ler. Vamos por outro caminho</p>
              <p className="mt-1 text-xs text-amber-50/80">Aproxime mais o código ou use foto, digitação e lista abaixo.</p>
            </div>
          ) : (
            <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-sm font-semibold text-white">Scanner rápido ativado</p>
              <p className="mt-1 text-xs text-white/70">Procurando código... leitura contínua com ZXing e debounce curto.</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={async () => {
                await stopScanner();
                openCameraPhotoPicker();
              }}
              className="rounded-2xl border border-white/15 bg-white/10 px-2 py-3 text-xs font-semibold text-white"
            >
              📷 Tirar foto agora
            </button>
            <button
              type="button"
              onClick={async () => {
                await stopScanner();
                openGalleryPhotoPicker();
              }}
              className="rounded-2xl border border-white/15 bg-white/10 px-2 py-3 text-xs font-semibold text-white"
            >
              🖼️ Escolher do celular
            </button>
            <button
              type="button"
              onClick={async () => {
                await stopScanner();
                setStep('manual');
              }}
              className="rounded-2xl border border-white/15 bg-white/10 px-2 py-3 text-xs font-semibold text-white"
            >
              ✏️ Digitar produto
            </button>
          </div>
        </div>
      </div>

      {scanSuccess && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-emerald-400/35 backdrop-blur-[2px]">
          <div className="rounded-[28px] border border-emerald-200/60 bg-emerald-500/90 px-8 py-6 text-center text-white shadow-2xl">
            <p className="text-5xl">✔</p>
            <p className="mt-3 text-xl font-bold">Código encontrado</p>
            {detectedBarcode && <p className="mt-1 text-sm text-emerald-50/85">{detectedBarcode}</p>}
          </div>
        </div>
      )}
    </div>
  );

  const renderResolving = () => (
    <div className="relative min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.28),_transparent_30%),linear-gradient(180deg,_#031525_0%,_#07111c_100%)] px-6 py-16 text-white">
      <div className="absolute inset-x-0 top-0 z-10 flex justify-end px-4 pt-[max(env(safe-area-inset-top),16px)]">
        <button
          type="button"
          onClick={() => {
            clearPendingScannedProduct();
            onClose();
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl text-white backdrop-blur"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>

      <div className="relative z-10 flex min-h-[70dvh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 backdrop-blur">
          <div className="h-10 w-10 rounded-full border-4 border-cyan-300 border-t-transparent animate-spin" />
        </div>
        <div>
          <p className="text-xl font-bold text-emerald-300">✔ Código encontrado</p>
          {detectedBarcode && <p className="mt-2 text-sm text-white/70">EAN {detectedBarcode}</p>}
        </div>
        <div>
          <p className="text-2xl font-bold">Identificando produto...</p>
          <p className="mt-2 text-sm text-white/70">Consultando Cosmos, cache local e fontes globais.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-sm text-white/80">Se a consulta travar, em alguns segundos abrimos o fallback automaticamente.</p>
        </div>
      </div>
    </div>
  );

  const renderPhotoCapture = () => (
    <div className="space-y-4 p-5 pb-8">
      {cameraFailed && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="mt-0.5 flex-shrink-0 text-xl">💡</span>
          <div>
            <p className="text-sm leading-snug text-amber-800">
              A câmera não abriu. Tire uma foto da embalagem ou digite o produto.
            </p>
            {describeScannerError(scannerError) && <p className="mt-1 text-xs text-amber-700">{describeScannerError(scannerError)}</p>}
          </div>
        </div>
      )}

      {!cameraFailed && confirmed?.barcode && !confirmed.found && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="mt-0.5 flex-shrink-0 text-xl">📱</span>
          <p className="text-sm leading-snug text-blue-800">
            Lemos o código, mas ainda não temos esse produto cadastrado. Uma foto da embalagem pode ajudar.
          </p>
        </div>
      )}

      <div className="py-4 text-center">
        <p className="mb-3 text-5xl">📦</p>
        <h3 className="text-[19px] font-bold text-gray-900">Foto da embalagem</h3>
        <p className="mt-1 text-sm text-gray-500">Tire ou escolha uma foto da embalagem do produto</p>
      </div>

      {photoUrl && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Foto atual mantida no fluxo</p>
              <p className="mt-0.5 text-xs text-slate-500">Você pode tentar com esta imagem, tirar outra agora ou escolher da galeria.</p>
            </div>
          </div>
          <img
            src={photoUrl}
            alt="Prévia da embalagem"
            className="max-h-44 w-full rounded-xl border border-slate-200 bg-white object-contain"
          />
        </div>
      )}

      {describeScannerError(scannerError) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {describeScannerError(scannerError)}
        </div>
      )}

      {allowScanning && (
        <button
          type="button"
          onClick={startScanner}
          className="w-full rounded-2xl border border-blue-200 bg-blue-50 py-4 text-base font-bold text-blue-900 shadow-sm transition-all active:scale-95"
        >
          📷 Tentar escanear agora
        </button>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={openCameraPhotoPicker}
          className="w-full rounded-2xl bg-emerald-500 py-4 text-base font-bold text-white shadow-md transition-all active:scale-95"
        >
          📷 Tirar foto agora
        </button>

        <button
          type="button"
          onClick={openGalleryPhotoPicker}
          className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 py-4 text-base font-bold text-emerald-900 shadow-sm transition-all active:scale-95"
        >
          🖼️ Escolher do celular
        </button>
      </div>

      <button
        type="button"
        onClick={() => setStep('manual')}
        className="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 transition-all active:scale-95"
      >
        ✏️ Prefiro digitar o nome
      </button>
    </div>
  );

  const renderPhotoProcessing = () => (
    <div className="flex flex-col items-center justify-center gap-5 px-6 py-16">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="Embalagem"
          className="h-40 w-40 rounded-2xl border border-gray-200 object-cover shadow-sm"
        />
      )}
      <div className="h-12 w-12 rounded-full border-4 border-emerald-400 border-t-transparent animate-spin" />
      <div className="text-center">
        <p className="font-semibold text-gray-800">Analisando a foto...</p>
          <p className="mt-1 text-sm text-gray-400">Lendo código e embalagem para identificar o produto</p>
      </div>
    </div>
  );

  const renderManual = () => (
    <div className="space-y-4 p-5 pb-8">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="Embalagem"
          className="max-h-32 w-full rounded-xl border border-gray-100 bg-gray-50 object-contain"
        />
      )}

      <div>
        <h3 className="text-[17px] font-bold text-gray-900">
          {photoUrl ? 'Não identificamos automaticamente. Informe ou escolha o produto.' : 'Qual produto é esse?'}
        </h3>
        <p className="mt-1 text-xs text-gray-400">
          {photoUrl ? 'Use o nome comercial, marca ou escolha uma sugestão para concluir.' : (hint ? CATEGORY_HINT[hint] : CATEGORY_HINT.other)}
        </p>
      </div>

      {(cameraFailed || scannerError === 'lookup_timeout' || scannerError === 'product_not_found' || scannerError === 'manual_invalid_barcode' || scannerError === 'photo_barcode_not_found') && describeScannerError(scannerError) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {describeScannerError(scannerError)}
        </div>
      )}

      {photoUrl && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={openCameraPhotoPicker}
            className="w-full rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-bold text-emerald-900 transition-all active:scale-95"
          >
            📷 Tirar outra foto agora
          </button>
          <button
            type="button"
            onClick={openGalleryPhotoPicker}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-bold text-slate-800 transition-all active:scale-95"
          >
            🖼️ Escolher do celular
          </button>
        </div>
      )}

      <input
        type="text"
        value={query}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && query.trim()) selectManual(query.trim());
        }}
        className="w-full rounded-xl border-2 border-gray-200 px-4 py-3.5 text-base transition-colors focus:border-blue-400 focus:outline-none"
        placeholder="Digitar nome ou marca..."
      />

      {query.trim() && (
        <button
          type="button"
          onClick={() => selectManual(query.trim())}
          className="w-full rounded-2xl bg-gray-900 py-4 font-bold text-white transition-all active:scale-95"
        >
          Usar &ldquo;{query.trim()}&rdquo;
        </button>
      )}

      {(() => {
        if (!hint) return null;
        const catalog = CURATED_CATALOG[hint];
        if (!catalog) return null;
        const q = query.trim().toLowerCase();
        const filtered = q
          ? catalog.filter(item =>
              item.name.toLowerCase().includes(q) ||
              (item.brand?.toLowerCase().includes(q) ?? false),
            )
          : catalog;
        if (filtered.length === 0) return null;

        const catalogItems = (compact: boolean) => (
          <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
            {filtered.map((item, index) => (
              <button
                key={index}
                type="button"
                onMouseDown={() => selectManual(item.name)}
                className={`w-full rounded-xl border border-gray-100 bg-white px-4 text-left shadow-sm transition-all active:scale-[0.98] ${compact ? 'py-2.5' : 'py-3'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 text-xl">{CATEGORY_EMOJI[hint]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-800">{item.name}</p>
                    {item.brand && <p className="truncate text-xs text-gray-400">{item.brand}</p>}
                  </div>
                  <span className="flex-shrink-0 text-lg text-gray-200">›</span>
                </div>
              </button>
            ))}
          </div>
        );

        if (kbdBottom > 0) {
          const overlayMaxH = typeof window !== 'undefined'
            ? Math.max(160, window.innerHeight - kbdBottom - 72)
            : 300;
          return (
            <div
              style={{ position: 'fixed', left: 0, right: 0, bottom: kbdBottom, zIndex: 201,
                backgroundColor: 'white', boxShadow: '0 -4px 20px rgba(0,0,0,0.18)',
                borderTop: '1px solid #e5e7eb', maxHeight: overlayMaxH, overflowY: 'auto',
                WebkitOverflowScrolling: 'touch', padding: '10px 20px 12px' }}
            >
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                {q ? 'Produtos comuns' : 'Escolha o produto'}
              </p>
              {catalogItems(true)}
            </div>
          );
        }

        return (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {q ? 'Produtos comuns' : 'Escolha ou busque o produto'}
            </p>
            {catalogItems(false)}
          </div>
        );
      })()}

      {suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {query.trim() ? 'Sugestões' : 'Usados recentemente'}
          </p>
          <div className="space-y-1.5">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => selectManual(suggestion)}
                className="w-full rounded-xl border border-gray-100 bg-white px-4 py-3 text-left shadow-sm transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 text-xl">{hint ? CATEGORY_EMOJI[hint] : '📦'}</span>
                  <span className="flex-1 truncate text-sm font-medium text-gray-800">{suggestion}</span>
                  <span className="flex-shrink-0 text-lg text-gray-200">›</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Buscar por código de barras</p>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={manualBarcode}
            onChange={(event) => setManualBarcode(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleManualBarcodeLookup();
              }
            }}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-colors focus:border-blue-400 focus:outline-none"
            placeholder="Digite o EAN/GTIN"
          />
          <button
            type="button"
            onClick={() => void handleManualBarcodeLookup()}
            className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-all active:scale-95"
          >
            Buscar
          </button>
        </div>
      </div>

      {allowScanning && (
        <button
          type="button"
          onClick={startScanner}
          className="w-full rounded-2xl border border-blue-200 bg-blue-50 py-3.5 text-sm font-bold text-blue-900 transition-all active:scale-95"
        >
          📷 Voltar para escanear
        </button>
      )}
    </div>
  );

  const renderNotFound = () => (
    <div className="space-y-4 p-5 pb-8">
      {photoUrl && (
        <img
          src={photoUrl}
          alt="Foto analisada"
          className="max-h-40 w-full rounded-xl border border-gray-100 bg-gray-50 object-contain"
        />
      )}

      <div className="py-4 text-center">
        <p className="mb-3 text-5xl">{confirmed?.queued ? '📬' : '🤔'}</p>
        <h3 className="text-[18px] font-bold text-gray-900">
          {confirmed?.queued ? 'Produto enviado para fila de catalogação' : 'Não consegui ler. Vamos por outro caminho'}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          {confirmed?.queued
            ? (confirmed.queueMessage || 'Produto enviado para fila de catalogação')
            : 'A leitura automática da foto não fechou um produto confiável. Você ainda pode tentar outra foto, escanear de novo ou escolher o item sem perder o fluxo.'}
        </p>
        {confirmed?.barcode && <p className="mt-2 font-mono text-xs text-gray-300">EAN: {confirmed.barcode}</p>}
      </div>

      <div className="space-y-3">
        {allowScanning && (
          <button
            type="button"
            onClick={startScanner}
            className="w-full rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-2xl">📷</div>
              <div className="flex-1">
                <p className="text-[15px] font-bold text-blue-900">Tentar escanear novamente</p>
                <p className="mt-0.5 text-xs text-blue-600">Reabrir a câmera e ler o código de barras</p>
              </div>
              <span className="flex-shrink-0 text-xl text-blue-300">›</span>
            </div>
          </button>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={openCameraPhotoPicker}
            className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-2xl">📷</div>
              <div className="flex-1">
                <p className="text-[15px] font-bold text-emerald-900">Tirar foto agora</p>
                <p className="mt-0.5 text-xs text-emerald-600">Abrir a câmera e tentar de novo</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={openGalleryPhotoPicker}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">🖼️</div>
              <div className="flex-1">
                <p className="text-[15px] font-bold text-slate-900">Escolher do celular</p>
                <p className="mt-0.5 text-xs text-slate-600">Usar uma foto já salva no aparelho</p>
              </div>
            </div>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setStep('manual')}
          className="w-full rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-2xl">✏️</div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-blue-900">Digitar o produto</p>
              <p className="mt-0.5 text-xs text-blue-600">Digite o nome ou marca com sugestões</p>
            </div>
            <span className="flex-shrink-0 text-xl text-blue-300">›</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setQuery('');
            setStep('manual');
          }}
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-2xl">📋</div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-gray-800">Escolher da lista</p>
              <p className="mt-0.5 text-xs text-gray-500">Veja produtos comuns por categoria</p>
            </div>
            <span className="flex-shrink-0 text-xl text-gray-300">›</span>
          </div>
        </button>
      </div>
    </div>
  );

  const renderConfirm = () => {
    if (!confirmed) return null;

    const showAutoFound = !fromHistory && !assistedConfirmationRef.current && decisionResultTypeRef.current === 'complete' && termConflictsRef.current.length === 0;

    return (
      <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
        {fromHistory && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <span className="text-xl">⭐</span>
            <p className="text-sm font-semibold text-blue-800">Parece ser este produto que você já usa!</p>
          </div>
        )}

        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Embalagem"
            className="max-h-40 w-full rounded-xl border border-gray-100 bg-gray-50 object-contain"
          />
        )}

        <div className={`space-y-3 rounded-2xl border-2 p-5 ${showAutoFound ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
            {fromHistory ? 'Produto reconhecido' : showAutoFound ? '✓ Encontrei este produto' : 'Confirmação assistida'}
          </p>
          <div>
            <p className="text-xl font-bold leading-tight text-gray-900">{confirmed.name || 'Produto identificado'}</p>
            {confirmed.brand && confirmed.brand !== confirmed.name && (
              <p className="mt-0.5 text-sm text-gray-500">{confirmed.brand}</p>
            )}
            {confirmed.weight && <p className="mt-0.5 text-sm text-gray-400">{confirmed.weight}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{CATEGORY_EMOJI[confirmed.category]}</span>
            <span className="text-sm text-gray-600">{CATEGORY_LABELS[confirmed.category]}</span>
            {confirmed.barcode && (
              <span className="ml-auto font-mono text-[10px] text-gray-300">#{confirmed.barcode.slice(-6)}</span>
            )}
          </div>
        </div>

        {!fromHistory && (productNameRef.current || speciesRef.current || lifeStageRef.current || detectedWeightRef.current || rawTextBlobsRef.current.length > 0 || strongTermsRef.current.length > 0 || mediumTermsRef.current.length > 0 || weakTermsRef.current.length > 0 || termConflictsRef.current.length > 0) && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Confirmação assistida</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {productNameRef.current && <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">Nome: {productNameRef.current}</span>}
              {confirmed.brand && <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">Marca: {confirmed.brand}</span>}
              {speciesRef.current && <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">Espécie: {speciesRef.current}</span>}
              {lifeStageRef.current && <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">Fase: {lifeStageRef.current}</span>}
              {detectedWeightRef.current && <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">Peso: {detectedWeightRef.current}</span>}
            </div>
            {strongTermsRef.current.length > 0 && (
              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                Termos fortes: {strongTermsRef.current.join(' • ')}
              </p>
            )}
            {mediumTermsRef.current.length > 0 && (
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Termos médios: {mediumTermsRef.current.join(' • ')}
              </p>
            )}
            {weakTermsRef.current.length > 0 && (
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Termos fracos: {weakTermsRef.current.slice(0, 4).join(' • ')}
              </p>
            )}
            {termConflictsRef.current.length > 0 && (
              <p className="mt-3 text-xs font-semibold leading-relaxed text-rose-600">
                Conflito detectado: {termConflictsRef.current.join(' • ')}
              </p>
            )}
            {rawTextBlobsRef.current.length > 0 && (
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Texto lido: {rawTextBlobsRef.current.slice(0, 4).join(' • ')}
              </p>
            )}
          </div>
        )}

      </div>
      <div className="flex-shrink-0 border-t border-gray-100 bg-white px-5 py-4 space-y-3">
        <button
          type="button"
          onClick={handleConfirm}
          className="w-full rounded-2xl bg-emerald-500 py-4 text-base font-bold text-white shadow-md transition-all active:scale-95"
        >
          ✓ Está certo — usar este produto
        </button>

        <button
          type="button"
          onClick={() => {
            if (confirmed?.barcode) rejectedBarcodesRef.current.add(confirmed.barcode);
            clearPendingScannedProduct();
            setConfirmed(null);
            setFromHistory(false);
            setStep('manual');
            setQuery('');
          }}
          className="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 transition-all active:scale-95"
        >
          Não, escolher outro
        </button>
      </div>
      </div>
    );
  };

  return (
    <ModalPortal>
      <input
        ref={cameraPhotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handlePhotoFile(file);
          event.target.value = '';
        }}
      />

      <input
        ref={galleryPhotoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handlePhotoFile(file);
          event.target.value = '';
        }}
      />

      <div className="fixed inset-0 z-[200] flex flex-col items-end justify-end sm:items-center sm:justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => {
          clearPendingScannedProduct();
          onClose();
        }} />

        <div
          className={immersiveMode
            ? 'relative h-full w-full overflow-hidden bg-black'
            : 'relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl animate-slideUp sm:rounded-[28px] sm:animate-scaleIn'}
          style={immersiveMode ? undefined : { maxHeight: '92dvh' }}
          onClick={event => event.stopPropagation()}
        >
          {!immersiveMode && (
            <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-5 pb-3 pt-4">
              {canGoBack && (
                <button
                  type="button"
                  onClick={goBack}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl font-bold text-gray-700 transition-all active:scale-95"
                  aria-label="Voltar"
                >
                  ‹
                </button>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-[16px] font-bold leading-tight text-gray-900">{STEP_TITLE[step]}</h2>
                {petName && <p className="truncate text-xs text-gray-400">{petName}</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  clearPendingScannedProduct();
                  onClose();
                }}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 active:scale-95"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
          )}

          <div className={immersiveMode ? 'h-full' : step === 'confirm' ? 'flex-1 flex flex-col overflow-hidden min-h-0' : 'flex-1 overflow-y-auto overscroll-contain'}>
            {step === 'entry' && renderEntry()}
            {step === 'scanning' && renderScanning()}
            {step === 'resolving' && renderResolving()}
            {step === 'photo-capture' && renderPhotoCapture()}
            {step === 'photo-processing' && renderPhotoProcessing()}
            {step === 'manual' && renderManual()}
            {step === 'not-found' && renderNotFound()}
            {step === 'confirm' && renderConfirm()}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export const ProductDetectionSheet = ProductDetectionSheetGold;
