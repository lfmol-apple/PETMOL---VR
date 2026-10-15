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
  push: number; location: number; complete: number;
}

export interface GrowthSeriesPoint { date: string; acessos: number; downloads: number; cadastros: number }

export type ActivationKey = 'pet' | 'feeding' | 'push' | 'location';
export interface ActivationItem {
  key: ActivationKey; label: string; n: number; pct: number | null;
  missing: number; only_missing: number; where_to_act: string;
}
/** Meta do PETMOL: pet + ração + notificação + localização, entre quem se cadastrou. */
export interface GrowthActivation {
  total: number; complete: number; complete_pct: number | null;
  items: ActivationItem[]; weakest: ActivationKey | null;
  missing_distribution: Record<string, number>;
}

export interface CampaignActivationRow {
  name: string; cadastros: number; pet: number; feeding: number;
  push: number; location: number; complete: number;
}

export interface GrowthResponse {
  activation: GrowthActivation;
  campaigns_activation: CampaignActivationRow[];
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

export interface EntryStep { key: string; label: string; n: number; pct_of_opened: number | null }
export interface EntryResponse {
  steps: EntryStep[];
  biggest_leak: { from_label: string; to_label: string; pct: number; lost: number; where_to_act: string } | null;
  choices: { register: number; login: number };
  failures: { reason: string; count: number }[];
  scope: 'native' | 'platform';
  notes: string[];
}

/** Rótulo legível dos motivos de falha do cadastro. */
export const FAILURE_LABEL: Record<string, string> = {
  'validation:name': 'Nome inválido',
  'validation:email': 'E-mail inválido',
  'validation:password': 'Senha inválida (mínimo 6 caracteres)',
  'validation:terms': 'Não marcou os termos',
  email_exists: 'E-mail já cadastrado',
  server: 'Erro do servidor ou da rede',
};
