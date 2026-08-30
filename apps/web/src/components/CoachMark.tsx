'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { isOnboardingActiveFlag } from '@/lib/onboardingProgress';

/**
 * Dica contextual de uso único — uma frase curta na primeira vez que o
 * novato entra numa área importante. Não é um tour: no máximo uma por
 * contexto, some ao ser dispensada e não volta.
 *
 * Só aparece enquanto há um onboarding em andamento (flag global escrita
 * pelo OnboardingChecklistCard) — usuário veterano nunca vê.
 */

const seenKey = (id: string) => `petmol_coach_seen:${id}`;

function wasSeen(id: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(seenKey(id)) === '1';
  } catch {
    return true;
  }
}

function markSeen(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(seenKey(id), '1');
  } catch {
    /* noop */
  }
}

interface CoachMarkProps {
  /** identificador estável — decide o "já vi" */
  id: string;
  children: React.ReactNode;
  className?: string;
}

export function CoachMark({ id, children, className = '' }: CoachMarkProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!wasSeen(id) && isOnboardingActiveFlag()) setVisible(true);
  }, [id]);

  if (!visible) return null;

  const dismiss = () => {
    markSeen(id);
    setVisible(false);
  };

  return (
    <div
      className={`flex items-start gap-2.5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 ${className}`}
      role="note"
    >
      <span aria-hidden className="text-base leading-none mt-0.5">💡</span>
      <p className="flex-1 text-[13px] leading-snug text-slate-700">{children}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Entendi"
        className="-mr-1 -mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-blue-100 active:text-slate-600 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
