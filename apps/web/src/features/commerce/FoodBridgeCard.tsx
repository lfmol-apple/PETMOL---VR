'use client';

/**
 * Ponte Loja → ração. Quem abre a Loja sem ter cadastrado a ração já mostrou intenção de compra
 * (15/10/2026: 142 tutores com pet e sem ração abriram a Loja; quem tem ração a abre 2× mais). Aqui,
 * no momento de maior interesse, oferece o cadastro de 1 toque — o PETMOL passa a avisar antes da ração
 * acabar e o "Comprar novamente" aparece sozinho.
 *
 * Discreto: some por 7 dias se a pessoa disser "agora não" (por pet). Nada de modal que bloqueia.
 */
import { Bell } from 'lucide-react';

const DISMISS_DAYS = 7;
const key = (petId: string) => `petmol_food_bridge_dismissed_${petId}`;

export function isFoodBridgeDismissed(petId: string, now: number = Date.now()): boolean {
  try {
    const raw = window.localStorage.getItem(key(petId));
    if (!raw) return false;
    return now - Number(raw) < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

export function dismissFoodBridge(petId: string, now: number = Date.now()): void {
  try { window.localStorage.setItem(key(petId), String(now)); } catch { /* sem storage: só não lembra */ }
}

export function FoodBridgeCard({
  petName, onRegister, onDismiss,
}: { petName: string; onRegister: () => void; onDismiss: () => void }) {
  const name = petName || 'seu pet';
  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.08)]" data-testid="food-bridge">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Bell className="h-[18px] w-[18px]" strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold leading-snug text-slate-900">
            Quer ser avisado antes da ração de {name} acabar?
          </p>
          <p className="mt-1 text-[13px] leading-snug text-slate-600">
            Cadastre a ração em 1 minuto. O PETMOL avisa na hora certa e já deixa a compra pronta aqui.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onRegister}
          className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-[14px] font-extrabold text-white active:scale-[0.98]">
          Cadastrar a ração
        </button>
        <button type="button" onClick={onDismiss}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] font-bold text-slate-500 active:bg-slate-50">
          Agora não
        </button>
      </div>
    </div>
  );
}
