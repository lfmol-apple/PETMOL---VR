'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X, ChevronRight } from 'lucide-react';
import { PetCareReminder, resolveCareCTA } from '@/lib/petCareDomain';

interface OverdueAlertBannerProps {
  overdueReminders: PetCareReminder[];
  onOpenVaccines: () => void;
  onOpenVermifugo: () => void;
  onOpenAntipulgas: () => void;
  onOpenColeira: () => void;
  onOpenGrooming: () => void;
  onOpenMedication: () => void;
  onOpenFood: () => void;
  onOpenEvents: () => void;
}

export function OverdueAlertBanner({
  overdueReminders,
  onOpenVaccines,
  onOpenVermifugo,
  onOpenAntipulgas,
  onOpenColeira,
  onOpenGrooming,
  onOpenMedication,
  onOpenFood,
  onOpenEvents,
}: OverdueAlertBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // If dismissed or no overdue items, don't show
  if (isDismissed || overdueReminders.length === 0) return null;

  const current = overdueReminders[currentIndex];
  
  const handlers = {
    onOpenVaccines,
    onOpenVermifugo,
    onOpenAntipulgas,
    onOpenColeira,
    onOpenGrooming,
    onOpenMedication,
    onOpenEvents,
    onOpenFood,
  };

  const handleResolve = () => {
    const action = resolveCareCTA(current.action_target, handlers);
    action();
  };

  const nextReminder = () => {
    setCurrentIndex((prev) => (prev + 1) % overdueReminders.length);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="overflow-hidden"
      >
        <div className="mx-4 mt-4 mb-2">
          <div className="relative overflow-hidden rounded-[28px] bg-white/[0.03] backdrop-blur-3xl border border-white/10 p-5 shadow-2xl ring-1 ring-white/5">
            {/* Subtle Gradient Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-start gap-0 relative z-10">
              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-black text-white tracking-tight leading-tight">
                  <span className="text-white">{current.pet_name}</span> precisa revisar <span className="text-blue-400">{current.label}</span>{current.status === 'today' ? ' hoje' : ''}
                </p>
                
                {overdueReminders.length > 1 && (
                  <p className="text-[11px] font-black text-slate-500 mt-1.5 uppercase tracking-[0.15em]">
                    +{overdueReminders.length - 1} outros em atraso
                  </p>
                )}

                <div className="flex items-center gap-4 mt-5">
                  <button
                    onClick={handleResolve}
                    className="text-red-500 text-[13px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5 active:scale-95 transition-all group"
                  >
                    Ver cuidados
                    <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </button>
                  
                  <button 
                    onClick={() => setIsDismissed(true)}
                    className="text-slate-600 text-[11px] font-black uppercase tracking-widest hover:text-slate-400 transition-colors ml-auto"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
