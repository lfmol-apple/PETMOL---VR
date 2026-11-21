import type { Metadata } from 'next';
import { ReportarPetPerdidoInfo } from '@/components/public-info/ReportarPetPerdidoInfo';

export const metadata: Metadata = {
  title: 'Reportar pet perdido | PETMOL',
  description: 'Seu cão ou gato sumiu? Crie um alerta de pet perdido e avise quem está perto, pelo PETMOL.',
  alternates: { canonical: '/reportar-pet-perdido' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ReportarPetPerdidoInfo />
    </>
  );
}
