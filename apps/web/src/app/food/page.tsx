import { redirect } from 'next/navigation';

interface FoodDeepLinkPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

function pickFirst(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === 'string') return value;
  return null;
}

export default function FoodDeepLinkPage({ searchParams }: FoodDeepLinkPageProps) {
  const petId = pickFirst(searchParams?.pet_id) ?? pickFirst(searchParams?.petId) ?? '';
  const mode = pickFirst(searchParams?.mode) ?? 'main';
  const pushAction = pickFirst(searchParams?.push_action);
  const source = pickFirst(searchParams?.source);

  const params = new URLSearchParams();
  params.set('modal', 'food');
  if (petId) params.set('petId', petId);
  if (mode === 'buy') params.set('action', 'buy');
  if (pushAction) params.set('push_food_action', pushAction);
  if (source) params.set('source', source);

  redirect(`/home?${params.toString()}`);
}
