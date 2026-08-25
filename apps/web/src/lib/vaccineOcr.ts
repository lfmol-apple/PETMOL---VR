import { API_BASE_URL } from '@/lib/api';
import type { VaccineType } from '@/lib/petHealth';

export type VaccineCardOcrRecord = {
  tipo_vacina?: string | null;
  nome_comercial: string | null;
  data_aplicacao: string | null;
  data_revacina: string | null;
  veterinario_responsavel: string | null;
  missing_fields?: string[];
  confianca_score?: number;
};

export type VaccineCardOcrResponse = {
  sucesso: boolean;
  leitura_confiavel: boolean;
  registros: VaccineCardOcrRecord[];
  motor_usado?: string | null;
  motores_usados?: string[];
  ia_usada?: boolean;
  ia_tentada?: boolean;
  motivo_fallback?: string | null;
};

export function isCardAnalysisLowQuality(analysis: VaccineCardOcrResponse | null | undefined) {
  if (!analysis) return true;
  const registros = analysis.registros || [];
  if (registros.length === 0) return true;
  const hasAnyDate = registros.some((registro) => Boolean(registro.data_aplicacao || registro.data_revacina));
  return !hasAnyDate;
}

export async function analyzeVaccineCardFiles({
  files,
  hint,
  maxAiImages,
  signal,
}: {
  files: File[];
  hint: string;
  maxAiImages: number;
  /** Lets the caller cancel (user tap) and/or bound the request (client-side
   * timeout) — the "Analisando com IA..." screen used to have no way out
   * short of the backend eventually responding, found in a pre-launch audit. */
  signal?: AbortSignal;
}): Promise<VaccineCardOcrResponse> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  form.append('hint', hint);
  form.append('force_ai', 'true');
  form.append('prefer_local', 'false');
  form.append('max_ai_images', String(Math.min(files.length, Math.max(1, maxAiImages))));

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/vision/extract-vaccine-card-files`, {
      method: 'POST',
      body: form,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new Error('Falha de conexão ao analisar cartão de vacina');
  }

  if (!response.ok) {
    let errorMsg = 'Falha ao analisar cartão de vacina';
    try {
      const errorData = await response.json();
      errorMsg = errorData.detail || errorData.message || errorMsg;
    } catch {
      const text = await response.text().catch(() => '');
      errorMsg = text || errorMsg;
    }
    console.error('Erro na análise do cartão:', { status: response.status, message: errorMsg });
    throw new Error(errorMsg);
  }

  return (await response.json()) as VaccineCardOcrResponse;
}

export function mapTipoVacinaToVaccineType(tipo: string): VaccineType {
  const value = (tipo || '').toLowerCase();
  if (value.includes('antirrábica') || value.includes('antirrabica')) return 'rabies';
  if (value.includes('polivalente')) {
    if (value.includes('v8') || value.includes('v10') || value.includes('v12')) return 'multiple';
    return 'multiple';
  }
  if (value.includes('coronavírus') || value.includes('coronavirus')) return 'coronavirus';
  if (value.includes('leptospirose') || value.includes('lepto')) return 'leptospirosis';
  if (value.includes('giardia')) return 'giardia';
  if (value.includes('leishmaniose') || value.includes('leish')) return 'leishmaniasis';
  if (value.includes('gripe canina') || value.includes('gripe')) return 'kennel_cough';
  if (value.includes('raiva') || value.includes('rabies') || value.includes('rabia') || value.includes('antirr') || value.includes('antirab') || value.includes('antirrab')) return 'rabies';
  if (value.includes('lepto') || value.includes('leptospir')) return 'leptospirosis';
  if (value.includes('bord') || value.includes('bronchi') || value.includes('kennel') || value.includes('tosse')) return 'kennel_cough';
  if (value.includes('corona') || value.includes('ccov')) return 'coronavirus';
  if (value.includes('influenza') || value.includes('flu') || value.includes('h3n2') || value.includes('h3n8')) return 'influenza';
  if (value.includes('lyme') || value.includes('borrel')) return 'lyme';
  if (value.includes('parainfl')) return 'parainfluenza';
  if (value.includes('adeno')) return 'adenovirus';
  if (value.includes('hepat') || value.includes('cav-1') || value.includes('cav1')) return 'hepatitis';
  if (value.includes('v10') || value.includes('v8') || value.includes('v12') || value.includes('multip')) return 'multiple';
  return 'other';
}

export function mapNomeComercialToTipo(nomeComercial: string): string {
  const value = (nomeComercial || '').toLowerCase();
  const marcas = ['vanguard', 'nobivac', 'canigen', 'duramune', 'rabisin', 'eurican', 'recombitek'];
  const temMarca = marcas.some((marca) => value.includes(marca));
  if (!temMarca) {
    return nomeComercial || 'Vacina';
  }
  if (value.includes('canigen')) {
    if (value.includes('b') || value.includes('r')) return 'Antirrábica';
    if (value.includes('dhppi') || value.includes('dp')) return 'Polivalente';
  }
  if (value.includes('nobivac')) {
    if (value.includes('rabies') || value.includes('raiva') || value.includes('r')) return 'Antirrábica';
    if (value.includes('dhppi')) return 'Polivalente (V8)';
    if (value.includes('canine') && value.includes('dx')) return 'Polivalente';
    if (value.includes('lepto')) return 'Leptospirose';
  }
  if (value.includes('vanguard')) {
    if (value.includes('raiva') || value.includes('rabies')) return 'Antirrábica';
    return 'Polivalente';
  }
  if (value.includes('duramune')) {
    if (value.includes('raiva') || value.includes('rabies')) return 'Antirrábica';
    return 'Polivalente';
  }
  if (value.includes('rabisin')) return 'Antirrábica';
  if (value.includes('eurican') || value.includes('recombitek')) return 'Polivalente';
  if (value.includes('raiva') || value.includes('rabies') || value.includes('antirrábica')) return 'Antirrábica';
  if (value.includes('v5') || value.includes('v8') || value.includes('v10') || value.includes('v12') || value.includes('dhppi')) return 'Polivalente';
  if (value.includes('lepto')) return 'Leptospirose';
  if (value.includes('giardia')) return 'Giárdia';
  if (value.includes('corona')) return 'Coronavírus';
  if (value.includes('leishmaniose') || value.includes('leish')) return 'Leishmaniose';
  return nomeComercial || 'Vacina';
}

export function deduplicateVaccineRecords(registros: VaccineCardOcrRecord[]): VaccineCardOcrRecord[] {
  const seen = new Map<string, VaccineCardOcrRecord>();
  registros.forEach((registro) => {
    const nome = (registro.nome_comercial || registro.tipo_vacina || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
    const chave = `${registro.data_aplicacao || ''}|${nome}`;
    if (!seen.has(chave)) {
      seen.set(chave, registro);
      return;
    }
    const existing = seen.get(chave)!;
    seen.set(chave, {
      ...existing,
      nome_comercial: registro.nome_comercial || existing.nome_comercial,
      tipo_vacina: registro.tipo_vacina || existing.tipo_vacina,
      data_revacina: registro.data_revacina || existing.data_revacina,
      veterinario_responsavel: registro.veterinario_responsavel || existing.veterinario_responsavel,
    });
    console.log(`🔄 Registro duplicado mesclado: ${chave}`);
  });
  const result = Array.from(seen.values());
  console.log(`📊 Deduplicação completa: ${registros.length} originais → ${result.length} únicos`);
  return result;
}

export function normalizeAnalyzedVaccineRecords(registros: VaccineCardOcrRecord[]): VaccineCardOcrRecord[] {
  const mapped = (registros || []).map((registro) => {
    const nomeOriginal = registro.nome_comercial || registro.tipo_vacina || '';
    return {
      ...registro,
      tipo_vacina: mapNomeComercialToTipo(nomeOriginal),
    };
  });
  const deduplicated = deduplicateVaccineRecords(mapped);
  deduplicated.sort((a, b) => {
    const dateA = a.data_aplicacao ? new Date(a.data_aplicacao).getTime() : 0;
    const dateB = b.data_aplicacao ? new Date(b.data_aplicacao).getTime() : 0;
    return dateB - dateA;
  });
  return deduplicated;
}