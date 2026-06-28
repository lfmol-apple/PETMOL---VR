import { redirect } from 'next/navigation';

interface FoodDeepLinkPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function pickFirst(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === 'string') return value;
  return null;
}

export default async function FoodDeepLinkPage({ searchParams }: FoodDeepLinkPageProps) {
  const resolvedSearchParams = await searchParams;
  const petId = pickFirst(resolvedSearchParams?.pet_id) ?? pickFirst(resolvedSearchParams?.petId) ?? '';
  const mode = pickFirst(resolvedSearchParams?.mode) ?? 'main';
  const pushAction = pickFirst(resolvedSearchParams?.push_action);
  const source = pickFirst(resolvedSearchParams?.source);

  const params = new URLSearchParams();
  params.set('modal', 'food');
  if (petId) params.set('petId', petId);
  if (mode === 'buy') params.set('action', 'buy');
  if (pushAction) params.set('push_food_action', pushAction);
  if (source) params.set('source', source);

  redirect(`/home?${params.toString()}`);
}
