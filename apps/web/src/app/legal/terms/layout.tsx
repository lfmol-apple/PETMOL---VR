import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Termos de Uso | PETMOL',
  description: 'Termos de Uso do aplicativo e do site PETMOL: regras, responsabilidades e contas gratuitas.',
  alternates: { canonical: '/legal/terms' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
