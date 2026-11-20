import type { Metadata } from 'next';

// Rastreável (fora do robots.txt) PORQUE o Google precisa ler o noindex: página bloqueada no robots mas linkada
// (a landing aponta para ela) acabava "indexada, mas bloqueada pelo robots.txt".
export const metadata: Metadata = {
  title: 'Entrar | PETMOL',
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
