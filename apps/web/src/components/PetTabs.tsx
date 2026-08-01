'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, PanInfo, useReducedMotion } from 'framer-motion';

interface Pet {
  id: number | string;
  name: string;
  photo?: string;
  species: string;
}

interface PetTabsProps {
  pets: Pet[];
  selectedPetId: number | string;
  onPetChange: (petId: number | string) => void;
  children: React.ReactNode;
}

export function PetTabs({ pets, selectedPetId, onPetChange, children }: PetTabsProps) {
  const [direction, setDirection] = useState(0);
  const currentIndex = pets.findIndex((p) => p.id === selectedPetId);
  const [prevIndex, setPrevIndex] = useState(currentIndex);
  const prefersReducedMotion = useReducedMotion();
  // Initialise synchronously to avoid a mode-flip on first paint (SSR → client).
  // Defaults to true (mobile) so the transition style is correct before hydration.
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(max-width: 768px), (pointer: coarse)');
    const update = () => setIsMobileViewport(media.matches);
    // No need to call update() here — useState initialiser already read the value.

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  // Detecta a direção da mudança de pet
  useEffect(() => {
    if (currentIndex !== prevIndex && currentIndex !== -1 && prevIndex !== -1) {
      setDirection(currentIndex > prevIndex ? 1 : -1);
      setPrevIndex(currentIndex);
    } else if (prevIndex === -1 && currentIndex !== -1) {
      setPrevIndex(currentIndex);
    }
  }, [currentIndex, prevIndex, pets]);

  // Usamos PanEnd em vez de DragEnd para evitar alteração física contínua no DOM durante o toque
  const handlePanEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const target = event?.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [role="button"], [data-no-swipe="true"]')) {
      return;
    }

    const absX = Math.abs(info.offset.x);
    const absY = Math.abs(info.offset.y);
    const absVelocityX = Math.abs(info.velocity.x);

    // Evita trocar pet durante scroll vertical no mobile.
    const isHorizontalIntent = absX > absY * 1.15;
    const hasDistanceOrVelocity = absX > 70 || absVelocityX > 650;
    if (!isHorizontalIntent || !hasDistanceOrVelocity) return;

    if (info.offset.x > 0 && currentIndex > 0) {
      onPetChange(pets[currentIndex - 1].id);
    } else if (info.offset.x < 0 && currentIndex < pets.length - 1) {
      onPetChange(pets[currentIndex + 1].id);
    }
  };

  const contentTransition = useMemo(() => {
    if (prefersReducedMotion || isMobileViewport) {
      return { duration: 0.16 };
    }
    return { type: 'spring' as const, stiffness: 420, damping: 42 };
  }, [isMobileViewport, prefersReducedMotion]);

  return (
    <div className="w-full relative overflow-x-hidden">
      <motion.div
        onPanEnd={handlePanEnd}
        className="w-full touch-pan-y"
        animate={{ opacity: 1, x: 0 }}
        transition={contentTransition}
        data-pet-direction={direction}
      >
        {children}
      </motion.div>
    </div>
  );
}
