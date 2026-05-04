'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/I18nContext';

export function Footer() {
  const { t } = useI18n();
  
  return (
    <footer className="py-2.5 bg-white/80 backdrop-blur-md border-t border-slate-200/50 flex-shrink-0 relative z-10">
      <div className="flex items-center justify-center gap-2 text-xs text-slate-400 whitespace-nowrap overflow-hidden px-4">
        <span>© 2026 PETMOL</span>
        <span className="text-slate-300">•</span>
        <Link href="/legal/privacy" className="hover:text-slate-600 transition-colors truncate">
          {t('footer.privacy')}
        </Link>
        <span className="text-slate-300">•</span>
        <Link href="/legal/terms" className="hover:text-slate-600 transition-colors truncate">
          {t('footer.terms')}
        </Link>

      </div>
    </footer>
  );
}
