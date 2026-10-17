import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Cartão de pré-visualização do link /go/instalar (WhatsApp, Instagram, Facebook, iMessage, Telegram):
 * foto + título + descrição quando alguém cola o link num grupo. A página em si só encaminha para a loja
 * certa (iPhone → App Store, Android → Google Play) — ver page.tsx. Os robôs de pré-visualização não rodam
 * JavaScript, então leem estes metadados e não são redirecionados.
 * A imagem é 1200×630 (proporção 1,91:1) e pesa menos de 100 KB, como o WhatsApp recomenda.
 */
const TITLE = 'Baixe o Petmol — grátis e sem anúncios';
const DESCRIPTION = 'Vacinas, ração, lembretes e alerta de pet perdido no mesmo app. Toque para baixar: iPhone e Android.';
const IMAGE = '/og/petmol-instalar.jpg';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // página de passagem: não precisa aparecer no Google
  robots: { index: false, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'PETMOL',
    locale: 'pt_BR',
    type: 'website',
    images: [{ url: IMAGE, width: 1200, height: 630, alt: 'Petmol — o cuidado do seu pet num só app' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [IMAGE] },
};

export default function InstalarLayout({ children }: { children: ReactNode }) {
  return children;
}
