'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { FoodItemSheet } from '@/components/home/FoodItemSheet';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';
import type { PetHealthProfile } from '@/lib/petHealth';

type StepStatus = 'pending' | 'visiting' | 'none' | 'done' | 'skipped';

interface CheckupState {
  petName: string;
  vaccines: StepStatus;
  vermifugo: StepStatus;
  antipulgas: StepStatus;
  coleira: StepStatus;
  food: StepStatus;
}

const STORAGE_KEY = 'petmol_checkup_v1';

function markAllSkipped(state: CheckupState): CheckupState {
  const next = { ...state };
  (['vaccines', 'vermifugo', 'antipulgas', 'coleira', 'food'] as const).forEach(k => {
    if (next[k] === 'pending' || next[k] === 'none' || next[k] === 'visiting') next[k] = 'skipped';
  });
  return next;
}

export default function CheckupPage() {
  const router = useRouter();
  const [state, setState] = useState<CheckupState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pet, setPet] = useState<PetHealthProfile | null>(null);
  const [openFood, setOpenFood] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { router.replace('/home'); return; }
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      setState({
        petName: parsed.petName || '',
        vaccines: (parsed.vaccines as StepStatus) || 'pending',
        vermifugo: (parsed.vermifugo as StepStatus) || 'pending',
        antipulgas: (parsed.antipulgas as StepStatus) || 'pending',
        coleira: (parsed.coleira as StepStatus) || 'pending',
        food: (parsed.food as StepStatus) || 'pending',
      });
      setLoaded(true);
    } catch { router.replace('/home'); }
  }, [router]);

  useEffect(() => {
    if (!loaded) return;
    const token = getToken();
    if (!token) return;
    fetch(`${API_BASE_URL}/pets`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((pets: Array<{ id: string | number; name?: string; pet_name?: string; species?: string }>) => {
        if (!pets.length) return;
        const p = pets[0];
        const id = String(p.id);
        setPet({
          pet_id: id,
          pet_name: p.name || p.pet_name || '',
          species: (p.species as PetHealthProfile['species']) || 'dog',
          vaccines: [], exams: [], prescriptions: [], appointments: [],
          surgeries: [], allergies: [], chronic_conditions: [],
          weight_history: [], dental_records: [], parasite_history: [],
          documents: [], daily_walks: [],
          primary_vet: { name: '', clinic: '', phone: '' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      })
      .catch(() => showAppToast('Erro ao sincronizar', { tone: 'warning' }));
  }, [loaded]);

  const goHome = useCallback((foodDone?: boolean) => {
    setState(prev => {
      if (!prev) return prev;
      const next = markAllSkipped(prev);
      if (foodDone) next.food = 'done';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    router.push('/home');
  }, [router]);

  const handleFoodSaved = useCallback(() => {
    setOpenFood(false);
    setState(prev => {
      if (!prev) return prev;
      const next = { ...prev, food: 'done' as StepStatus };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleFoodClosed = useCallback(() => {
    setOpenFood(false);
    setState(prev => {
      if (!prev || prev.food !== 'pending') return prev;
      const next = { ...prev, food: 'none' as StepStatus };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  if (!loaded || !state) return null;

  const petName = state.petName || 'seu pet';
  const foodDone = state.food === 'done';

  return (
    <BrandBackground showLogo={false}>
      <div className="min-h-[calc(100dvh-40px)] w-full px-4 py-8 flex items-center justify-center">
        <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl border border-white/60 shadow-xl p-6 overflow-hidden">

          <div className="flex justify-center mb-5">
            <PetmolTextLogo className="text-5xl" color="#2563EB" />
          </div>

          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-500">Configuração inicial</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900 leading-tight">
              Vamos cuidar de {petName}
            </p>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              Cadastre a ração e o PETMOL calcula quando vai acabar e te avisa antes.
            </p>
          </div>

          {foodDone ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5 text-center">
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-slate-900">Alimentação configurada!</p>
                <p className="text-sm text-slate-500 mt-1.5 leading-snug">
                  O PETMOL já está monitorando.<br />Você vai receber alertas antes de acabar.
                </p>
              </div>

              <button
                onClick={() => goHome(false)}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white text-sm font-bold tracking-wide active:scale-[0.99] transition-transform"
              >
                Entrar no app
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() => goHome(false)}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white text-sm font-bold tracking-wide active:scale-[0.99] transition-transform"
              >
                Entrar no app
              </button>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-[0.08em] mb-1">Opcional</p>
                <p className="text-sm font-semibold text-slate-800">Cadastre a ração do {petName}</p>
                <p className="text-xs text-slate-500 mt-1 leading-snug">
                  Assim o PETMOL avisa antes de acabar. Leva menos de 1 minuto.
                </p>
                <button
                  onClick={() => { if (pet) setOpenFood(true); }}
                  disabled={!pet}
                  className="w-full mt-3 py-2.5 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  Adicionar ração
                </button>
              </div>

              <p className="text-center text-xs text-slate-400 pb-1">
                Você pode adicionar a ração a qualquer momento na Home.
              </p>
            </div>
          )}

        </div>
      </div>

      {openFood && pet && (
        <FoodItemSheet
          pet={pet}
          onClose={handleFoodClosed}
          onSaved={handleFoodSaved}
        />
      )}
    </BrandBackground>
  );
}
