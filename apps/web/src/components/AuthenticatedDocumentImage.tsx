'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchDocumentBlob } from '@/lib/documentFile';

interface AuthenticatedDocumentImageProps {
  petId: string;
  docId: string;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  onError?: () => void;
}

export function AuthenticatedDocumentImage({
  petId,
  docId,
  alt,
  className,
  loading,
  onError,
}: AuthenticatedDocumentImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    function load() {
      fetchDocumentBlob(petId, docId)
        .then((blob) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
        })
        .catch(() => { if (!cancelled) onError?.(); });
    }

    // Eager mode (loading="eager") or no IntersectionObserver support: fetch immediately
    if (loading === 'eager' || typeof IntersectionObserver === 'undefined') {
      load();
      return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }

    // Default: only fetch when near the viewport
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { obs.disconnect(); load(); } },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => { cancelled = true; obs.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [petId, docId, loading, onError]);

  return (
    <div ref={ref} className={className}>
      {blobUrl && (
        <img
          src={blobUrl}
          alt={alt}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
    </div>
  );
}
