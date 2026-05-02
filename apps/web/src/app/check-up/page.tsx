'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { FoodItemSheet } from '@/components/home/FoodItemSheet';
import { showAppToast } from '@/features/interactions/userPromptChannel';
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
    <div className="min-h-dvh bg-white flex flex-col">
      {/* Header */}
      <div className="w-full max-w-sm mx-auto px-6 pt-14 pb-4 text-center">
        <p className="text-5xl mb-5">🐾</p>
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">
          Vamos cuidar de {petName}
        </h1>
        <p className="text-sm text-gray-500 mt-2.5 leading-relaxed">
          Cadastre a ração e o PETMOL calcula<br />quando vai acabar e te avisa antes.
        </p>
      </div>

      {/* Main content */}
      <div className="w-full max-w-sm mx-auto px-6 flex-1 flex flex-col gap-3 pt-4">
        {foodDone ? (
          <>
            <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-6 text-center">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-base font-bold text-green-800">Alimentação configurada!</p>
              <p className="text-sm text-green-600 mt-1.5 leading-snug">
                O PETMOL já está monitorando.<br />Você vai receber alertas antes de acabar.
              </p>
            </div>

            <button
              onClick={() => goHome(false)}
              className="w-full py-4 bg-gray-900 text-white text-sm font-semibold rounded-2xl active:scale-[0.98] transition-transform"
            >
              Entrar no app →
            </button>
          </>
        ) : (
          <>
            {/* Light suggestion - not blocking */}
            <div className="rounded-2xl bg-blue-50 border-2 border-blue-200 px-5 py-4 text-left">
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">💡 Próximo passo (opcional)</p>
              <p className="text-base font-bold text-blue-950 mt-1">Cadastre a ração do {petName}</p>
              <p className="text-sm text-blue-700 mt-1 leading-snug">
                Assim o PETMOL avisa antes de acabar. Leva menos de 1 minuto.
              </p>
              <button
                onClick={() => { if (pet) setOpenFood(true); }}
                disabled={!pet}
                className="w-full mt-3 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-50"
              >
                Adicionar ração
              </button>
            </div>

            {/* Primary action - enter home */}
            <button
              onClick={() => goHome(false)}
              className="w-full py-4 bg-gray-900 text-white text-sm font-semibold rounded-2xl active:scale-[0.98] transition-transform"
            >
              Entrar no app →
            </button>

            <p className="text-center text-xs text-gray-400 pb-2">
              Você pode adicionar a ração a qualquer momento na Home.
            </p>
          </>
        )}
      </div>

      <div className="pb-10" />

      {openFood && pet && (
        <FoodItemSheet
          pet={pet}
          onClose={handleFoodClosed}
          onSaved={handleFoodSaved}
        />
      )}
    </div>
  );
}
