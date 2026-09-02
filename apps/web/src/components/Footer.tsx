'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/I18nContext';
import { isNativeAppClient } from '@/lib/nativeApp';

export function Footer() {
  const { t } = useI18n();
  const [hideAmazonPicks, setHideAmazonPicks] = useState(false);
  useEffect(() => { setHideAmazonPicks(isNativeAppClient()); }, []);

  return (
    <footer className="flex-shrink-0 border-t border-slate-200/60 bg-white/80 py-3 backdrop-blur-md relative z-10">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 text-[11.5px] text-slate-400">
        <span>© 2026 PETMOL</span>
        <span className="text-slate-300">•</span>
        {!hideAmazonPicks && (
          <>
            <Link href="/recommendations" className="hover:text-slate-600 transition-colors">
              Recommendations
            </Link>
            <span className="text-slate-300">•</span>
          </>
        )}
        <Link href="/sobre" className="hover:text-slate-600 transition-colors">
          Sobre
        </Link>
        <span className="text-slate-300">•</span>
        <Link href="/politica-editorial" className="hover:text-slate-600 transition-colors">
          Política editorial
        </Link>
        <span className="text-slate-300">•</span>
        <Link href="/transparencia" className="hover:text-slate-600 transition-colors">
          Transparência
        </Link>
        <span className="text-slate-300">•</span>
        <Link href="/legal/privacy" className="hover:text-slate-600 transition-colors">
          {t('footer.privacy')}
        </Link>
        <span className="text-slate-300">•</span>
        <Link href="/legal/terms" className="hover:text-slate-600 transition-colors">
          {t('footer.terms')}
        </Link>
      </div>
    </footer>
  );
}
