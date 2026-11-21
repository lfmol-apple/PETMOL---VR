import type { Metadata } from 'next';
import { AcheiUmPetInfo } from '@/components/public-info/AcheiUmPetInfo';

export const metadata: Metadata = {
  title: 'Achei um pet: avise o tutor | PETMOL',
  description: 'Encontrou um cão ou gato? Veja alertas de pets perdidos na sua região e avise o tutor pelo PETMOL.',
  alternates: { canonical: '/achei-um-pet' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AcheiUmPetInfo />
    </>
  );
}
