'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Tela desativada a pedido do dono (13/09/2026) — não deve mais abrir para
// usuários. Mantém a rota (em vez de apagar o arquivo) só pra qualquer link
// salvo/antigo/favoritado cair de volta na Home em vez de dar 404. O único
// ponto de entrada (botão "Ver todos os pets desaparecidos na região") foi
// removido de apps/web/src/app/home/page.tsx.
export default function PetsDesaparecidosPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/home');
  }, [router]);
  return null;
}
