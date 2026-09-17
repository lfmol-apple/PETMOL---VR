'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationPermissionController } from '@/features/interactions/useNotificationPermissionController';
import { requestLocationAndPersist } from '@/features/interactions/requestCorePermissions';

// "Segunda chance" pra contas que já existiam antes do pedido de permissão
// virar parte do onboarding (OnboardingChecklistCard, tela "Tudo pronto")
// — sem isso, quem já tinha conta nunca via o pedido nativo de notificação/
// localização, a menos que achasse o toggle escondido em Perfil >
// Preferências. O sistema NUNCA mostra o diálogo nativo sozinho; só aparece
// quando o app chama a API de permissão explicitamente (por isso este card
// existe: é o "chamar" que faltava pra essas contas).
const SEEN_KEY = 'petmol_permissions_nudge_seen_v1';

function readSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}
function writeSeen(): void {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* best effort */ }
}

export function PermissionsNudgeCard({ hasPet }: { hasPet: boolean }) {
  const { permission: pushPermission, requestPermission: requestPushPermission, subscribeToPush } = useNotificationPermissionController();
  const [dismissed, setDismissed] = useState(readSeen);
  const [busy, setBusy] = useState(false);

  // Só faz sentido pra quem já tem pelo menos um pet cadastrado (senão o
  // fluxo normal de primeiro cadastro/onboarding já cobre isso) e cujo
  // navegador/app ainda não decidiu nada sobre notificação ('default' —
  // nunca perguntado; 'granted'/'denied' já são decisões finais do
  // usuário, não voltamos a incomodar).
  if (!hasPet || dismissed || pushPermission !== 'default') return null;

  const finish = () => {
    writeSeen();
    setDismissed(true);
  };

  const activate = async () => {
    setBusy(true);
    try {
      const granted = await requestPushPermission();
      if (granted) void subscribeToPush();
    } catch { /* melhor esforço */ }
    await requestLocationAndPersist();
    finish();
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#0056D2] ring-1 ring-blue-100">
        <Bell className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-slate-900">Ativar avisos do Petmol</p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500">
          Lembretes de cuidado e alertas de pet sumido perto de você.
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={finish}
          disabled={busy}
          className="rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-slate-400 active:opacity-70 disabled:opacity-40"
        >
          Agora não
        </button>
        <button
          type="button"
          onClick={() => void activate()}
          disabled={busy}
          className="rounded-full bg-[#0056D2] px-3.5 py-1.5 text-[12px] font-bold text-white active:scale-95 transition-transform disabled:opacity-60"
        >
          Ativar
        </button>
      </div>
    </div>
  );
}
