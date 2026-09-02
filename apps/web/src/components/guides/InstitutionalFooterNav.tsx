'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isNativeAppClient } from '@/lib/nativeApp';

/** Nav do rodapé das páginas institucionais. O link "Recommendations"
 *  (área Amazon US pública) some no app nativo — é só para a web. */
export function InstitutionalFooterNav() {
  const [hideAmazonPicks, setHideAmazonPicks] = useState(false);
  useEffect(() => { setHideAmazonPicks(isNativeAppClient()); }, []);

  return (
    <nav
      aria-label="Páginas institucionais"
      className="mt-12 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-6 text-[13px]"
    >
      {!hideAmazonPicks && (
        <Link href="/recommendations" className="font-semibold text-blue-600 hover:underline">
          Recommendations
        </Link>
      )}
      <Link href="/sobre" className="font-semibold text-blue-600 hover:underline">
        Sobre
      </Link>
      <Link href="/politica-editorial" className="font-semibold text-blue-600 hover:underline">
        Política editorial
      </Link>
      <Link href="/transparencia" className="font-semibold text-blue-600 hover:underline">
        Transparência
      </Link>
    </nav>
  );
}
