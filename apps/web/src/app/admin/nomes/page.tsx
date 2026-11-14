'use client';

/** Página temporária de normalização de nomes (tutor/tutora). Só administrador; sem link no menu — acesso por /admin/nomes. */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PremiumScreenShell } from '@/components/premium';
import { useAdmin } from '@/hooks/useAdmin';
import { NomesNormalizar } from '@/components/admin/NomesNormalizar';

export default function NomesPage() {
  const router = useRouter();
  const { isAdmin, adminData, isLoading } = useAdmin();
  useEffect(() => { if (!isLoading && !isAdmin) router.push('/home'); }, [isLoading, isAdmin, router]);
  if (isLoading || !isAdmin || !adminData) return <PremiumScreenShell title="Nomes" hideBack wide><p className="py-16 text-center text-slate-500">Verificando autenticação…</p></PremiumScreenShell>;
  return <PremiumScreenShell title="Nomes" wide><div className="w-full space-y-5 px-4 py-4 sm:px-6 lg:px-10"><NomesNormalizar /></div></PremiumScreenShell>;
}
