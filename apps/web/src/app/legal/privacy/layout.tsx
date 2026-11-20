import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidade | PETMOL',
  description: 'Como o PETMOL coleta, usa e protege os dados de tutores e pets, com base na LGPD.',
  alternates: { canonical: '/legal/privacy' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
