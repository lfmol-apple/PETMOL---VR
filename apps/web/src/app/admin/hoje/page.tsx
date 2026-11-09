import { redirect } from 'next/navigation';

/** O aviso de promoção já enviado abre /admin/hoje?promo=<id>: leva para a aba Push com o envio preenchido. */
export default async function Hoje({ searchParams }: { searchParams: Promise<{ promo?: string }> }) {
  const { promo } = await searchParams;
  redirect(promo ? `/admin?aba=push&promo=${encodeURIComponent(promo)}` : '/admin?aba=push');
}
