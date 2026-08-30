'use client';

// A "configuração inicial" agora vive na Home, como um card de orientação
// (OnboardingChecklistCard) com progresso derivado dos dados reais do pet.
// Esta rota só redireciona — mantida por um ciclo para não quebrar links
// antigos / atalhos salvos.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CheckupRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/home');
  }, [router]);
  return null;
}
