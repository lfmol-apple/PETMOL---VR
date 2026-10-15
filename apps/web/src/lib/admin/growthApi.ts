export interface GrowthStep {
  key: 'acessos' | 'downloads' | 'cadastros' | 'pet' | 'feeding' | 'profile' | 'returned';
  label: string;
  n: number;
  /** volume = contagem da janela (não são as mesmas pessoas); cohort = parte de quem se cadastrou. */
  kind: 'volume' | 'cohort';
  pct_from_previous: number | null;
  pct_of_top: number | null;
}

export interface GrowthLeak {
  from: string; to: string; from_label: string; to_label: string;
  pct: number; lost: number; where_to_act: string; kind: 'volume' | 'cohort';
}

export interface GrowthPlatformRow {
  platform: 'ios' | 'android' | 'pwa' | 'web';
  acessos: number; downloads: number; cadastros: number; pet: number; feeding: number;
}

export interface GrowthSeriesPoint { date: string; acessos: number; downloads: number; cadastros: number }

export interface GrowthResponse {
  generated_at: string;
  steps: GrowthStep[];
  extra_steps: GrowthStep[];
  visitantes_unicos: number;
  biggest_leak: GrowthLeak | null;
  platforms: GrowthPlatformRow[];
  series: GrowthSeriesPoint[];
  stuck: { cadastro_sem_pet: number; pet_sem_alimentacao: number };
  filters_applied: {
    period: boolean; platform: boolean;
    state: { cadastros: boolean; downloads: boolean; acessos: boolean };
    city: { cadastros: boolean; downloads: boolean; acessos: boolean };
  };
  notes: string[];
}

export const PLATFORM_LABEL: Record<GrowthPlatformRow['platform'], string> = {
  ios: 'iPhone (app)', android: 'Android (app)', pwa: 'App instalado (PWA)', web: 'Navegador',
};

export const pct = (v: number | null | undefined): string =>
  v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
