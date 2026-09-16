'use client';

import { useState } from 'react';
import { Bell, MapPin } from 'lucide-react';
import { useNotificationPermissionController } from '@/features/interactions/useNotificationPermissionController';
import { requestLocationAndPersist } from '@/features/interactions/requestCorePermissions';

const SEEN_KEY = 'petmol_permissions_nudge_seen_v1';

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* best effort */
  }
}

/**
 * Segunda chance pra conta que JÁ existia antes do pedido proativo virar
 * parte da tela de conclusão do 1º cadastro (ver OnboardingChecklistCard) —
 * sem isso, quem já passou por ali nunca mais veria o pedido, e continuaria
 * dependendo de achar o botão em Perfil sozinho. Aparece uma vez por
 * navegador/dispositivo (localStorage), só enquanto a notificação nunca foi
 * pedida — some pra sempre depois de tocar em qualquer botão, concedendo ou
 * não (não insiste).
 */
export function PermissionsNudgeCard({ hasPet }: { hasPet: boolean }) {
  const { permission: pushPermission, requestPermission: requestPushPermission, subscribeToPush } = useNotificationPermissionController();
  const [dismissed, setDismissed] = useState(readSeen);
  const [busy, setBusy] = useState(false);

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
    } catch {
      /* melhor esforço */
    }
    await requestLocationAndPersist();
    finish();
  };

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-blue-100">
          <Bell className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold text-blue-900">Ativar avisos do Petmol</p>
          <p className="mt-0.5 text-[12px] leading-snug text-blue-700/80">
            Avisamos quando um cuidado vencer e se um pet sumir perto de você — precisa da sua permissão de
            notificação <MapPin className="mx-0.5 inline h-3 w-3 -translate-y-px" strokeWidth={2.4} /> e localização.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={finish}
          disabled={busy}
          className="flex-1 rounded-xl py-2 text-[12.5px] font-semibold text-blue-700/70 active:opacity-60 disabled:opacity-40"
        >
          Agora não
        </button>
        <button
          type="button"
          onClick={() => void activate()}
          disabled={busy}
          className="flex-1 rounded-xl bg-blue-600 py-2 text-[12.5px] font-bold text-white active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {busy ? 'Ativando...' : 'Ativar'}
        </button>
      </div>
    </div>
  );
}
