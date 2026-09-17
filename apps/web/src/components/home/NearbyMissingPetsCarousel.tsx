'use client';

import { useEffect, useRef, useState } from 'react';
import { SheetHeader, SheetShell, SHEET_Z } from '@/components/ui/sheet';
import { MissingPetAlertCard, type NearbyAlert } from './MissingPetAlertCard';

interface NearbyMissingPetsCarouselProps {
  alerts: NearbyAlert[];
  /** Índice do alerta pra abrir já visível — toque num círculo específico
   *  da NearbyMissingPetsStoryRow deve abrir naquele pet, não sempre no 1º. */
  initialIndex?: number;
  onClose: () => void;
  getPhotoUrl: (photoPath: string | undefined | null) => string | null;
  onViewCard: (alert: NearbyAlert) => void;
  onSeeThis: (alert: NearbyAlert) => void;
  onDismiss: (alert: NearbyAlert) => void;
  onReport: (alert: NearbyAlert) => void;
}

// Aberto ao tocar num círculo da NearbyMissingPetsStoryRow (ou no botão "Pet
// Sumido" já existente) — um card por alerta, deslizando na horizontal via
// scroll-snap nativo (sem lib: o mesmo container com overflow-x-auto já é
// liberado pelo HorizontalSwipeGuard, que libera qualquer scroller
// horizontal legítimo).
export function NearbyMissingPetsCarousel({
  alerts, initialIndex = 0, onClose, getPhotoUrl, onViewCard, onSeeThis, onDismiss, onReport,
}: NearbyMissingPetsCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || initialIndex === 0) return;
    el.scrollLeft = initialIndex * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.clientWidth === 0) return;
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setActiveIndex(Math.max(0, Math.min(alerts.length - 1, idx)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [alerts.length]);

  if (alerts.length === 0) return null;

  return (
    <SheetShell open onClose={onClose} tone="cream" z={SHEET_Z.top} size="md">
      <SheetHeader
        title="Tem pet sumido perto de você"
        subtitle={alerts.length > 1 ? `${alerts.length} alertas na sua região` : 'Alerta na sua região'}
        onClose={onClose}
      />
      <SheetShell.Body pad={false}>
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth px-5 pt-4 pb-1"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {alerts.map((alert, i) => (
            <div
              key={alert.id}
              className={`w-full flex-shrink-0 snap-start ${i > 0 ? 'pl-3' : ''}`}
            >
              <MissingPetAlertCard
                alert={alert}
                photoUrl={getPhotoUrl(alert.photo_url)}
                collapsed={false}
                showCollapse={false}
                onToggleCollapsed={() => {}}
                onViewCard={() => onViewCard(alert)}
                onSeeThis={() => onSeeThis(alert)}
                onDismiss={() => onDismiss(alert)}
                onReport={() => onReport(alert)}
              />
            </div>
          ))}
        </div>
        {alerts.length > 1 && (
          <div className="flex justify-center gap-1.5 pb-2 pt-3">
            {alerts.map((alert, i) => (
              <span
                key={alert.id}
                className={`h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-4 bg-rose-500' : 'w-1.5 bg-rose-200'}`}
              />
            ))}
          </div>
        )}
      </SheetShell.Body>
    </SheetShell>
  );
}
