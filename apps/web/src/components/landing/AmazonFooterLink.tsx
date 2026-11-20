'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isNativeAppClient } from '@/lib/nativeApp';

/** Link "Recommendations" (Amazon US): só na web, nunca dentro do app nativo. */
export function AmazonFooterLink() {
  const [hide, setHide] = useState(false);
  useEffect(() => { setHide(isNativeAppClient()); }, []);
  if (hide) return null;
  return <Link href="/recommendations" className="hover:text-slate-600">Recommendations</Link>;
}
