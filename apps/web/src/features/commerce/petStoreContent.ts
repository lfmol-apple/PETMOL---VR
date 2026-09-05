import type { PetCareReminder, CareReminderDomain } from '@/lib/petCareDomain';
import type { PetSpecies } from '@/lib/petHealth';
import { HOME_SHOPPING_PARTNERS, type HomeShoppingPartnerId } from './homeShoppingPartners';
import { petDo } from '@/lib/petGender';

// Título da Loja do Pet autenticada — "Loja do [nome]"/"Loja da [nome]"
// calculado pelo PET ATUALMENTE SELECIONADO (nunca um nome fixo tipo
// "Loja do Baby" — Baby é só o nome de UM pet de UM tutor entre vários
// usuários/pets do app). Sem pet_name (pet recém-criado, ainda sem nome)
// cai no fallback genérico "Loja do Pet" — nunca quebra nem mostra
// "Loja do undefined"/"Loja do null". Extraído como função pura (em vez
// de inline no componente) especificamente pra ser testável sem precisar
// montar toda a árvore de HomeShoppingSheet.tsx.
export function buildPetStoreTitle(pet: { sex?: 'male' | 'female' | null; pet_name?: string | null }): string {
  const name = pet.pet_name?.trim();
  if (!name) return 'Loja do Pet';
  return `Loja ${petDo(pet)} ${name}`;
}

// ── "❤️ Comprar novamente" ──────────────────────────────────────────────────
// Deriva cards de recompra a partir dos MESMOS lembretes que já alimentam o
// sino de notificações (buildPetCareReminders) — sem tabela nova, sem dado
// inventado. Só os domínios que correspondem a algo que se compra de novo.
const BUYABLE_DOMAINS: CareReminderDomain[] = ['food', 'parasite', 'medication'];

// Lojas no "Escolha a loja" / QuickBuyRow dos produtos do pet (fallback
// quando não há oferta monetizada exata). Só Cobasi: a Shopee saiu daqui
// em 05/09/2026 (decisão de produto, reversível — "Shopee só vitrine",
// ver docs/AFFILIATES.md e fetchCommerceOffers em productPricing.ts). A
// Shopee continua como card no rodapé da Loja do Pet, fora da busca e
// dos preços por produto. Petz é caminho separado; ML/Amazon entram
// depois. Ainda passa por isPartnerVisibleForSearch (defesa em profundidade).
export const QUICK_BUY_PARTNERS: HomeShoppingPartnerId[] = ['cobasi'];

export interface ReorderCard {
  id: string;
  icon: string;
  label: string;
  sublabel?: string;
  urgencyText: string;
  urgencyTone: 'overdue' | 'today' | 'upcoming';
  searchQuery: string;
  domain: CareReminderDomain;
  /** Peso real do pacote (kg), quando domain='food' — ver PetCareReminder.packageSizeKg. */
  packageSizeKg?: number;
  /** GTIN/EAN conhecido, quando domain='food' — ver PetCareReminder.gtin. */
  gtin?: string;
  /**
   * Dias a partir de hoje (ver PetCareReminder.diff) — a mesma sentinela
   * >=9000 marca "sem prazo" (petisco/item avulso). Só existe pra permitir
   * agrupar/ordenar a Loja do Pet por urgência no frontend, sem duplicar
   * nem reinterpretar o cálculo canônico feito em petCareDomain.ts.
   */
  diff: number;
}

function formatUrgencyText(domain: CareReminderDomain, diff: number): string {
  // Petisco / item avulso (diff sentinela 9999): compra recorrente sem
  // prazo — não faz sentido "Acaba em 9999 dias".
  if (diff >= 9000) return 'Comprar quando quiser';
  const verb = domain === 'food' ? 'Acaba' : 'Vence';
  if (diff < 0) return domain === 'food' ? 'Pode ter acabado' : `${verb} há ${Math.abs(diff)} dia${Math.abs(diff) === 1 ? '' : 's'}`;
  if (diff === 0) return `${verb} hoje`;
  return `${verb} em ${diff} dia${diff === 1 ? '' : 's'}`;
}

// petCareDomain.ts's `label` field is NOT always a real product name: for
// the food domain it's a fixed UI string ("Compra de ração"), never
// something a store search engine can match — only `sublabel` (the brand)
// is real there. For parasite/medication, `label` IS the real product name
// (product_name / event title) when the tutor filled it in, so keep the
// query short and specific instead of padding it with the generic category
// sublabel ("Antipulgas e carrapatos") — verbose queries were coming back
// with zero results on real store search (confirmed by the user).
function buildReminderSearchQuery(r: PetCareReminder): string {
  // "Compra de ração" é o label fixo do item PRIMÁRIO (processFood) — só
  // esse caso deve forçar "ração" na query. Itens secundários (petisco/
  // outro alimento) usam o próprio nome do produto como label (ver
  // processFood), e "petisco ração" ficaria errado — segue a mesma regra
  // genérica dos outros domínios.
  if (r.domain === 'food' && r.label === 'Compra de ração') {
    return r.sublabel ? `${r.sublabel} ração` : 'ração pet';
  }
  return r.label?.trim() || r.sublabel || 'produto pet';
}

export function buildReorderCards(reminders: PetCareReminder[]): ReorderCard[] {
  return reminders
    .filter((r) => BUYABLE_DOMAINS.includes(r.domain))
    // Medicação sem código de barras não tem identidade comercial segura:
    // pode ser manipulado, receita, dose fracionada ou produto humano com
    // múltiplas apresentações. Mantém no cuidado do pet, mas não transforma
    // em card de compra/preço sem GTIN.
    .filter((r) => r.domain !== 'medication' || Boolean((r.gtin || '').trim()))
    .map((r) => ({
      id: r.key,
      icon: r.icon,
      label: r.label,
      sublabel: r.sublabel,
      urgencyText: formatUrgencyText(r.domain, r.diff),
      urgencyTone: r.status,
      searchQuery: buildReminderSearchQuery(r),
      domain: r.domain,
      packageSizeKg: r.packageSizeKg,
      gtin: r.gtin,
      diff: r.diff,
    }));
}

// ── Agrupamento por urgência (Loja do Pet) ─────────────────────────────────
// Reorganiza a MESMA lista de reorderCards em 3 blocos de intenção, sem
// nenhum cálculo novo de data/prazo — só lê `diff`, que já vem pronto do
// cálculo canônico (petCareDomain.ts). Puro frontend, nada gravado.
export type ReorderUrgencyGroup = 'anytime' | 'soon' | 'later';

/**
 * Corte entre "vai precisar em breve" e "mais para frente", em dias.
 *
 * Não existe hoje uma janela de "quando comprar" já definida em nenhum
 * outro lugar do app pra reaproveitar (o que existe é a janela de ALERTA/
 * notificação — ex. reminder_days=7 de coleira/vermífugo em
 * parasite_models.py — que é sobre quando AVISAR, não sobre até quando um
 * prazo ainda conta como "breve" pra fins de compra). Então este número é
 * uma decisão de apresentação, só aqui:
 *
 *   60 dias ≈ 2 meses. Cobre o ciclo de recompra mais comum do app hoje —
 *   ração (semanas) e antipulgas/coleira mensal a bimestral — deixando de
 *   fora produtos de ciclo mais longo (vermífugo trimestral, coleira
 *   semestral tipo Scalibor ~90-120 dias), que ganham mais com "não
 *   competir visualmente agora" do que com alerta antecipado.
 *
 * Só isso muda quem a interface. Nenhuma regra de negócio, notificação ou
 * dado gravado depende deste número.
 */
export const REORDER_SOON_THRESHOLD_DAYS = 60;

export function reorderUrgencyGroupFor(diff: number): ReorderUrgencyGroup {
  if (diff >= 9000) return 'anytime'; // mesma sentinela de "Comprar quando quiser"
  if (diff <= REORDER_SOON_THRESHOLD_DAYS) return 'soon'; // inclui vencido/hoje — o mais urgente de todos
  return 'later';
}

export interface GroupedReorderCards {
  anytime: ReorderCard[];
  soon: ReorderCard[];
  later: ReorderCard[];
}

/** Agrupa e ordena por proximidade dentro de cada grupo temporal (mais perto primeiro). */
export function groupReorderCardsByUrgency(cards: ReorderCard[]): GroupedReorderCards {
  const anytime: ReorderCard[] = [];
  const soon: ReorderCard[] = [];
  const later: ReorderCard[] = [];
  for (const card of cards) {
    const group = reorderUrgencyGroupFor(card.diff);
    if (group === 'anytime') anytime.push(card);
    else if (group === 'soon') soon.push(card);
    else later.push(card);
  }
  soon.sort((a, b) => a.diff - b.diff);
  later.sort((a, b) => a.diff - b.diff);
  return { anytime, soon, later };
}

function speciesQueryLabel(species: PetSpecies): string {
  if (species === 'dog') return 'cachorro';
  if (species === 'cat') return 'gato';
  return 'pet';
}

// ── "🏪 Lojas" → drill-down de categoria por loja ──────────────────────────
export interface StoreCategoryOption {
  id: string;
  icon: string;
  label: string;
}

export const STORE_CATEGORIES: StoreCategoryOption[] = [
  { id: 'racao', icon: '🥣', label: 'Rações' },
  { id: 'petiscos', icon: '🦴', label: 'Petiscos' },
  { id: 'antipulgas', icon: '💊', label: 'Antipulgas' },
  { id: 'coleiras', icon: '📿', label: 'Coleiras' },
  { id: 'brinquedos', icon: '🧸', label: 'Brinquedos' },
  { id: 'shampoos', icon: '🧴', label: 'Shampoos' },
];

export function buildStoreCategoryQuery(category: StoreCategoryOption, species: PetSpecies): string {
  return `${category.label} ${speciesQueryLabel(species)}`;
}

export { HOME_SHOPPING_PARTNERS };
