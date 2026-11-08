/**
 * Radar de promoções das lojas parceiras.
 *
 * REGRA DE CREDIBILIDADE (pedido do dono, 08/11/2026): só entra aqui promoção VERIFICADA em fonte pública, com data.
 * Nada de inventar desconto de loja. Quando não há campanha verificada para uma loja, o card dela simplesmente não
 * mostra chip. As campanhas nacionais (Black Friday etc.) valem para todas as lojas e dizem "confira na loja".
 *
 * Para atualizar: acrescente/ajuste uma entrada em STORE_PROMOS (com `source`). O chip é calculado pela data de hoje,
 * sem mais nada a fazer. (Próximo passo possível: painel de admin para editar sem deploy.)
 */
import type { HomeShoppingPartnerId } from './homeShoppingPartners';

export interface StorePromo {
  id: string;
  /** Lojas em que a campanha foi verificada. */
  merchants: HomeShoppingPartnerId[];
  /** Nome curto da campanha (aparece no chip). */
  name: string;
  /** Texto de apoio (tela de detalhe / acessibilidade). */
  detail: string;
  startsOn: string; // YYYY-MM-DD (inclusive)
  endsOn: string;   // YYYY-MM-DD (inclusive)
  source: string;
}

const ALL: HomeShoppingPartnerId[] = ['petz', 'mercadolivre', 'cobasi', 'amazon', 'shopee'];

export const STORE_PROMOS: StorePromo[] = [
  {
    id: '11-11-2026',
    merchants: ['shopee', 'mercadolivre'],
    name: '11.11',
    detail: 'Mega liquidação do 11.11 com cupons e frete grátis em itens selecionados.',
    startsOn: '2026-11-11',
    endsOn: '2026-11-11',
    source: 'https://www.gazetasp.com.br/economia/shopee-mercado-livre-e-magalu-adiantam-black-friday-de-27-de-novembro-para-o-dia-11-com-r-125-milhoes-em-cupons/',
  },
  {
    id: 'black-week-2026',
    merchants: ALL,
    name: 'Black Week',
    detail: 'Semana da Black Friday: confira as ofertas na loja.',
    startsOn: '2026-11-23',
    endsOn: '2026-11-26',
    source: 'https://centraldovarejo.com.br/black-friday-2026-data-faturamento-e-preparacao-do-varejo/',
  },
  {
    id: 'black-friday-2026',
    merchants: ALL,
    name: 'Black Friday',
    detail: 'Black Friday 2026: confira as ofertas na loja.',
    startsOn: '2026-11-27',
    endsOn: '2026-11-29',
    source: 'https://www.gazetadopovo.com.br/economia/quando-e-a-black-friday-2026-veja-data/',
  },
  {
    id: 'cyber-monday-2026',
    merchants: ALL,
    name: 'Cyber Monday',
    detail: 'Cyber Monday 2026: confira as ofertas na loja.',
    startsOn: '2026-11-30',
    endsOn: '2026-11-30',
    source: 'https://centraldovarejo.com.br/black-friday-2026-data-faturamento-e-preparacao-do-varejo/',
  },
];

/** Quantos dias antes de começar a campanha já aparece no radar. */
export const PROMO_LEAD_DAYS = 7;

const DAY_MS = 86_400_000;
const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1) / DAY_MS;
};

export type PromoPhase = 'live' | 'soon';

export interface ActivePromo {
  promo: StorePromo;
  phase: PromoPhase;
  /** Dias até começar (0 quando já está no ar). */
  daysToStart: number;
  /** Dias até acabar, contando hoje (só quando está no ar). */
  daysLeft: number;
}

/** Campanhas da loja que estão no ar ou começam em até PROMO_LEAD_DAYS, da mais próxima para a mais distante. */
export function activePromos(todayIso: string, merchant: HomeShoppingPartnerId, promos: StorePromo[] = STORE_PROMOS): ActivePromo[] {
  const today = dayNumber(todayIso);
  const out: ActivePromo[] = [];
  for (const promo of promos) {
    if (!promo.merchants.includes(merchant)) continue;
    const start = dayNumber(promo.startsOn);
    const end = dayNumber(promo.endsOn);
    if (today > end) continue;
    if (today >= start) out.push({ promo, phase: 'live', daysToStart: 0, daysLeft: end - today + 1 });
    else if (start - today <= PROMO_LEAD_DAYS) out.push({ promo, phase: 'soon', daysToStart: start - today, daysLeft: end - start + 1 });
  }
  return out.sort((a, b) => a.daysToStart - b.daysToStart);
}

export interface PromoChip {
  label: string;
  phase: PromoPhase;
  promoId: string;
  detail: string;
}

/** O chip do card: o que está no ar vence o que está por vir. null = nada verificado para esta loja agora. */
export function promoChip(todayIso: string, merchant: HomeShoppingPartnerId, promos: StorePromo[] = STORE_PROMOS): PromoChip | null {
  const list = activePromos(todayIso, merchant, promos);
  const pick = list.find((p) => p.phase === 'live') ?? list[0];
  if (!pick) return null;
  const { promo, phase, daysToStart } = pick;
  const label =
    phase === 'live'
      ? (promo.startsOn === promo.endsOn ? `${promo.name} hoje` : `${promo.name} no ar`)
      : daysToStart === 1 ? `${promo.name} amanhã` : `${promo.name} em ${daysToStart} dias`;
  return { label, phase, promoId: promo.id, detail: promo.detail };
}
