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

// Lojas permitidas no app por enquanto. A recompra prioriza ofertas
// monetizadas do CommerceEngine; este fallback só mostra lojas desta lista.
export const QUICK_BUY_PARTNERS: HomeShoppingPartnerId[] = ['cobasi', 'shopee', 'zeenow', 'zeedog'];

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
}

function formatUrgencyText(domain: CareReminderDomain, diff: number): string {
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
    }));
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
