'use client';

// Antes esta rota tinha um formulário de cadastro de pet PRÓPRIO — uma
// segunda implementação que divergia do AddPetModal (lista de raças, foto,
// validações duplicadas). Agora é só um redirecionamento: o cadastro
// acontece no AddPetModal real, aberto pela Home via ?addPet=1.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth-token';
import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';

export default function RegisterPetRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    router.replace('/home?addPet=1');
  }, [router]);

  return (
    <BrandBackground showLogo={false}>
      <div className="min-h-[calc(100dvh-40px)] w-full flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <PetmolTextLogo className="text-5xl" color="#2563EB" />
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
        </div>
      </div>
    </BrandBackground>
  );
}
