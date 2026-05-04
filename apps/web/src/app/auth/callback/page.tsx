'use client';

import { useEffect } from 'react';
import { useI18n } from '@/lib/I18nContext';

export default function AuthCallbackPage() {
  const { t } = useI18n();

  useEffect(() => {
    window.location.href = '/login';
  }, []);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-slate-700">{t('auth.redirecting')}</div>
    </div>
  );
}
