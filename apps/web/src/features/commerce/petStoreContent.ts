import type { PetCareReminder, CareReminderDomain } from '@/lib/petCareDomain';
import type { PetHealthProfile, PetSpecies } from '@/lib/petHealth';
import { HOME_SHOPPING_PARTNERS, type HomeShoppingPartnerId } from './homeShoppingPartners';

// ── "❤️ Comprar novamente" ──────────────────────────────────────────────────
// Deriva cards de recompra a partir dos MESMOS lembretes que já alimentam o
// sino de notificações (buildPetCareReminders) — sem tabela nova, sem dado
// inventado. Só os domínios que correspondem a algo que se compra de novo.
const BUYABLE_DOMAINS: CareReminderDomain[] = ['food', 'parasite', 'medication'];

// Lojas oferecidas no toque em "Comprar" — em vez de travar sempre na mesma
// loja (o que a busca real mostrou não ser confiável: uma loja específica
// pode simplesmente não ter o produto), o tutor escolhe entre 3 pet shops
// especializados. resolvePartnerUrl já cai para busca direta no site quando
// não há afiliado configurado, então a lista funciona mesmo sem afiliado.
export const QUICK_BUY_PARTNERS: HomeShoppingPartnerId[] = ['petz', 'cobasi', 'petlove'];

export interface ReorderCard {
  id: string;
  icon: string;
  label: string;
  sublabel?: string;
  urgencyText: string;
  urgencyTone: 'overdue' | 'today' | 'upcoming';
  searchQuery: string;
  domain: CareReminderDomain;
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
  if (r.domain === 'food') {
    return r.sublabel ? `${r.sublabel} ração` : 'ração pet';
  }
  return r.label?.trim() || r.sublabel || 'produto pet';
}

export function buildReorderCards(reminders: PetCareReminder[]): ReorderCard[] {
  return reminders
    .filter((r) => BUYABLE_DOMAINS.includes(r.domain))
    .map((r) => ({
      id: r.key,
      icon: r.icon,
      label: r.label,
      sublabel: r.sublabel,
      urgencyText: formatUrgencyText(r.domain, r.diff),
      urgencyTone: r.status,
      searchQuery: buildReminderSearchQuery(r),
      domain: r.domain,
    }));
}

// ── "⭐ Recomendado para o Baby" ────────────────────────────────────────────
// Sugestão de CATEGORIA (não produto/preço específico) priorizada por
// espécie/idade/porte/condições — nada aqui inventa um produto ou review.
export interface RecommendedCategory {
  id: string;
  icon: string;
  label: string;
  searchQuery: string;
}

interface CategoryRule {
  id: string;
  icon: string;
  label: string;
  species?: PetSpecies[]; // undefined = qualquer espécie
  basePriority: number;
  boost?: (ctx: PetRecommendationContext) => number;
}

interface PetRecommendationContext {
  species: PetSpecies;
  ageYears: number | null;
  hasChronicConditions: boolean;
}

const CATEGORY_RULES: CategoryRule[] = [
  { id: 'petiscos', icon: '🦴', label: 'Petiscos', basePriority: 10 },
  { id: 'brinquedos', icon: '🧸', label: 'Brinquedos', basePriority: 20 },
  {
    id: 'mordedores', icon: '🦷', label: 'Mordedores', species: ['dog'], basePriority: 60,
    boost: (ctx) => (ctx.ageYears !== null && ctx.ageYears < 1 ? -50 : 0),
  },
  {
    id: 'tapete-higienico', icon: '🧻', label: 'Tapete higiênico', species: ['cat', 'dog'], basePriority: 50,
    boost: (ctx) => (ctx.species === 'cat' ? -40 : 0),
  },
  { id: 'shampoo', icon: '🧴', label: 'Shampoo', basePriority: 30 },
  { id: 'escova', icon: '🪮', label: 'Escova', basePriority: 40 },
  {
    id: 'caminha', icon: '🛏️', label: 'Caminha', basePriority: 45,
    boost: (ctx) => (ctx.ageYears !== null && ctx.ageYears >= 7 ? -20 : 0) + (ctx.hasChronicConditions ? -10 : 0),
  },
];

function calculateAgeYears(birthDate?: string): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y) return null;
  const birth = new Date(y, (m || 1) - 1, d || 1);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function speciesQueryLabel(species: PetSpecies): string {
  if (species === 'dog') return 'cachorro';
  if (species === 'cat') return 'gato';
  return 'pet';
}

export function buildRecommendedCategories(pet: PetHealthProfile): RecommendedCategory[] {
  const species = pet.species;
  const ctx: PetRecommendationContext = {
    species,
    ageYears: calculateAgeYears(pet.birth_date),
    hasChronicConditions: (pet.chronic_conditions?.length ?? 0) > 0,
  };

  return CATEGORY_RULES
    .filter((rule) => !rule.species || rule.species.includes(species))
    .map((rule) => ({
      rule,
      priority: rule.basePriority + (rule.boost ? rule.boost(ctx) : 0),
    }))
    .sort((a, b) => a.priority - b.priority)
    .map(({ rule }) => ({
      id: rule.id,
      icon: rule.icon,
      label: rule.label,
      searchQuery: `${rule.label} ${speciesQueryLabel(species)}`,
    }));
}

// ── "🔥 Promoções" ──────────────────────────────────────────────────────────
// Sem pipeline real de preço/desconto conectado hoje (feeds/awin.py e
// cityads.py existem no backend mas nunca foram ligados a um endpoint) — v1
// linka por marca/categoria via afiliado, sem % inventado.
export interface PromoDestination {
  id: string;
  icon: string;
  label: string;
  description: string;
  searchQuery: string;
}

const PROMO_DESTINATIONS: PromoDestination[] = [
  { id: 'racao', icon: '🥣', label: 'Ração', description: 'Ver ofertas de ração', searchQuery: 'ração promoção' },
  { id: 'antiparasitario', icon: '💊', label: 'Antiparasitários', description: 'Ver ofertas de antipulgas e vermífugos', searchQuery: 'antipulgas vermífugo promoção' },
  { id: 'brinquedos', icon: '🧸', label: 'Brinquedos', description: 'Ver ofertas de brinquedos', searchQuery: 'brinquedo pet promoção' },
];

export function buildPromoDestinations(): PromoDestination[] {
  return PROMO_DESTINATIONS;
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

// ── "✂️ Serviços" ────────────────────────────────────────────────────────
// Sem monetização ainda (comissão/lead/assinatura/destaque ficam pra depois,
// conforme o usuário já confirmou) — v1 é só navegação.
export interface ServiceCategory {
  id: string;
  icon: string;
  label: string;
  mapsQuery: string;
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { id: 'banho-tosa', icon: '✂️', label: 'Banho e tosa', mapsQuery: 'banho e tosa pet perto de mim' },
  { id: 'veterinarios', icon: '🩺', label: 'Veterinários', mapsQuery: 'veterinário perto de mim' },
  { id: 'hospitais-24h', icon: '🏨', label: 'Hospitais 24h', mapsQuery: 'hospital veterinário 24 horas perto de mim' },
  { id: 'hotel', icon: '🏠', label: 'Hotel para pets', mapsQuery: 'hotel para pets perto de mim' },
  { id: 'creche', icon: '🐾', label: 'Creche', mapsQuery: 'creche para pets perto de mim' },
  { id: 'adestramento', icon: '🎓', label: 'Adestramento', mapsQuery: 'adestrador de cães perto de mim' },
];

export function buildServiceMapsUrl(service: ServiceCategory): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(service.mapsQuery)}`;
}

export { HOME_SHOPPING_PARTNERS };
