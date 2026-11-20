'use client';

import { useEffect, useState } from 'react';
import { BRAND_INSTAGRAM_URL, BRAND_YOUTUBE_URL } from '@/lib/brandProfiles';
import { isNativeAppClient } from '@/lib/nativeApp';
import { trackLandingEvent } from '@/lib/landingEvents';

/** Links discretos para os perfis oficiais (rodapé). Só na web; o clique é medido (`social_link_click`). */
export function SocialLinks({ placement, className = '' }: { placement: string; className?: string }) {
  const [hide, setHide] = useState(false);
  useEffect(() => { setHide(isNativeAppClient()); }, []);
  if (hide) return null;
  const item = (network: 'instagram' | 'youtube', href: string, label: string) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer me"
      onClick={() => trackLandingEvent('social_link_click', { network, placement })}
      className={className}
    >
      {label}
    </a>
  );
  return (
    <>
      {item('instagram', BRAND_INSTAGRAM_URL, 'Instagram')}
      {item('youtube', BRAND_YOUTUBE_URL, 'YouTube')}
    </>
  );
}
