'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/I18nContext';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

interface AuthGateProps {
  children: React.ReactNode;
  allowAnonymousPaths?: string[];
}

export function AuthGate({ children, allowAnonymousPaths = [] }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const [checking, setChecking] = useState(true);
  const apiBase = API_BASE_URL;

  useEffect(() => {
    if (pathname && allowAnonymousPaths.some((path) => pathname.startsWith(path))) {
      setChecking(false);
      return;
    }

    let active = true;

    const token = getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    fetch(`${apiBase}/auth/me`, { credentials: 'include', headers })
      .then((res) => {
        if (!active) return;
        if (!res.ok) {
          const next = encodeURIComponent(pathname || '/');
          router.replace(`/login?next=${next}`);
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        if (!active) return;
        const next = encodeURIComponent(pathname || '/');
        router.replace(`/login?next=${next}`);
      });

    return () => {
      active = false;
    };
  }, [router, pathname, allowAnonymousPaths, apiBase]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        {t('common.loading')}
      </div>
    );
  }

  return <>{children}</>;
}
