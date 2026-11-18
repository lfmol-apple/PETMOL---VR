'use client';

/**
 * Atalho "Continue com o PETMOL gratuito" — aberto pelo toque na notificação da campanha (deep link `modal=atalho`).
 *
 * Visual no estilo do e-mail da campanha. Regras (revisão jurídica, 17/11/2026):
 * - A contagem de 20 minutos começa no primeiro toque e não reinicia (ver lib/freeShortcut). O que expira é SÓ este atalho:
 *   o texto diz isso e que a mesma ação continua no menu do app. Nunca fala em perder conta ou dados.
 * - A pessoa NUNCA se perde: cada passo concluído fica marcado e a tela continua aberta com os botões que faltam (o sheet de
 *   ração, por exemplo, abre por cima e ao fechar a pessoa volta aqui). Só fecha quando tudo está feito, por "Agora não" ou ao fim
 *   do tempo. Nunca bloqueia o app e sempre há uma saída visível.
 * - Só pede o que falta (progresso vem de dados reais da conta); a localização é opcional e o texto avisa que dá para desativar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { SheetShell, SHEET_Z } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { fetchMe } from '@/lib/fetchMe';
import { petDo } from '@/lib/petGender';
import {
  endFreeShortcut,
  formatCountdown,
  remainingFrom,
  type FreeShortcutEnd,
} from '@/lib/freeShortcut';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import { useNotificationPermissionController } from '@/features/interactions/useNotificationPermissionController';
import { requestLocationAndPersist } from '@/features/interactions/requestCorePermissions';

interface FreeShortcutSheetProps {
  /** instante (ms) do primeiro toque, vindo de `openFreeShortcut`; null = atalho já encerrado: abre SEM contagem (sem urgência falsa) */
  startedAt: number | null;
  /** false = conta sem pet: o primeiro passo é cadastrar o pet */
  hasPet?: boolean;
  onAddPet?: () => void;
  petName: string;
  petSex?: 'male' | 'female' | null;
  hasFood: boolean;
  onOpenFood: () => void;
  onClose: () => void;
  /** enquanto o sheet de ração está aberto por cima, este se recolhe (a contagem segue) */
  suppressed?: boolean;
}

function Step({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <span className={`flex h-[26px] w-[26px] items-center justify-center rounded-full text-white ${ok ? 'bg-emerald-600' : 'bg-slate-300'}`}>
        {ok && <Check className="h-4 w-4" strokeWidth={3} />}
      </span>
      <span className={`text-[12px] ${ok ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-500'}`}>{label}</span>
    </div>
  );
}

export function FreeShortcutSheet({ startedAt, hasPet = true, onAddPet, petName, petSex, hasFood, onOpenFood, onClose, suppressed = false }: FreeShortcutSheetProps) {
  const { tutor } = useAuth();
  const { permission, requestPermission, subscribeToPush } = useNotificationPermissionController();
  const hasPush = permission === 'granted';
  const [gpsDone, setGpsDone] = useState(false);
  const hasLocation = gpsDone || tutor?.location_source === 'gps';

  const [now, setNow] = useState(() => Date.now());
  const hasClock = startedAt !== null;
  const remaining = startedAt !== null ? remainingFrom(startedAt, now) : Number.POSITIVE_INFINITY;
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const finishedRef = useRef(false);
  const finish = useCallback((end: FreeShortcutEnd) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    endFreeShortcut(end, Date.now());
    onClose();
  }, [onClose]);

  // fim do tempo
  useEffect(() => { if (hasClock && remaining <= 0) finish('expired'); }, [remaining, hasClock, finish]);

  // cada passo concluído é celebrado e FICA marcado (a tela continua para os outros); tudo feito → agradece e fecha
  const initialRef = useRef({ hasFood, hasPush, hasLocation });
  const prevRef = useRef({ hasFood, hasPush, hasLocation });
  useEffect(() => {
    const prev = prevRef.current;
    const justDone = (!prev.hasFood && hasFood) || (!prev.hasPush && hasPush) || (!prev.hasLocation && hasLocation);
    prevRef.current = { hasFood, hasPush, hasLocation };
    const i = initialRef.current;
    const wasIncomplete = !(i.hasFood && i.hasPush && i.hasLocation);
    if (justDone && wasIncomplete && hasFood && hasPush && hasLocation) {
      showAppToast('Tudo pronto! Obrigado por manter o seu PETMOL em dia.');
      const id = window.setTimeout(() => finish('done'), 1800);
      return () => window.clearTimeout(id);
    }
    if (justDone) showAppToast('Pronto! Esse passo está feito. Veja os outros abaixo.');
  }, [hasFood, hasPush, hasLocation, finish]);

  const [busy, setBusy] = useState<'push' | 'gps' | null>(null);
  const enablePush = async () => {
    setBusy('push');
    try {
      const granted = await requestPermission();
      if (granted) void subscribeToPush();
    } catch { /* melhor esforço */ } finally { setBusy(null); }
  };
  const enableLocation = async () => {
    setBusy('gps');
    try {
      await requestLocationAndPersist();
      const res = await fetchMe(API_BASE_URL, getToken()).catch(() => null);
      const me = res && res.ok ? ((await res.json().catch(() => null)) as { location_source?: string } | null) : null;
      if (me?.location_source === 'gps') setGpsDone(true);
    } finally { setBusy(null); }
  };

  const name = petName || 'seu pet';
  const artigo = petName ? petDo({ sex: petSex }) : 'de';
  const nothingLeft = hasPet && hasFood && hasPush && hasLocation;
  const missing = [!hasPet, !hasFood, !hasPush, !hasLocation].filter(Boolean).length;

  return (
    <SheetShell open={!suppressed} onClose={() => finish('dismissed')} tone="grey" size="sm" z={SHEET_Z.raised} hideHandle>
      <SheetShell.Body pad={false}>
        {/* herói no estilo do e-mail */}
        <div className="bg-gradient-to-b from-[#0261F9] to-[#0B2A6F] px-5 pb-6 pt-7 text-center text-white">
          <span className="inline-block rounded-full border border-white/35 bg-white/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em]">
            ✓ Versão gratuita mantida
          </span>
          <h2 className="mt-3 text-[24px] font-extrabold leading-tight">Continue com o PETMOL gratuito</h2>
          {!hasPet && (
            <p className="mt-2 text-[14px] leading-snug text-[#CFE0FF]">Falta cadastrar o seu pet.</p>
          )}
          {hasPet && !hasFood && (
            <p className="mt-2 text-[14px] leading-snug text-[#CFE0FF]">
              Falta só a ração {artigo} {name}.
            </p>
          )}
          {hasClock && <div className="mx-auto mt-4 inline-block rounded-2xl bg-[#F5B73B] px-5 py-2 text-[#3B2A00]" aria-live="off">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em]">Este atalho some em</div>
            <div className="text-[30px] font-extrabold leading-none tabular-nums" data-testid="free-shortcut-countdown">{formatCountdown(remaining)}</div>
          </div>}
        </div>

        <div className="space-y-3 px-5 pb-2 pt-4">
          {!nothingLeft && (
            <p className="text-center text-[13px] font-extrabold text-[#0056D2]" data-testid="free-shortcut-missing">
              {missing === 1 ? 'Falta 1 passo' : `Faltam ${missing} passos`}
            </p>
          )}
          <div className="flex rounded-2xl border border-slate-200 bg-white py-3">
            <Step ok={hasPet} label="Pet" />
            <Step ok={hasFood} label="Ração" />
            <Step ok={hasPush} label="Notificações" />
            <Step ok={hasLocation} label="Localização" />
          </div>

          {!hasPet && (
            <button type="button" onClick={onAddPet}
              className="w-full rounded-xl bg-[#0056D2] px-3 py-4 text-[15.5px] font-extrabold text-white active:scale-[0.99]">
              Cadastrar o meu pet
            </button>
          )}
          {hasPet && !hasFood && (
            <button type="button" onClick={onOpenFood}
              className="w-full rounded-xl bg-[#0056D2] px-3 py-4 text-[15.5px] font-extrabold text-white active:scale-[0.99]">
              Cadastrar a ração {artigo} {name}
            </button>
          )}
          {!hasPush && (
            <button type="button" onClick={enablePush} disabled={busy !== null}
              className="w-full rounded-xl border-2 border-[#0056D2] bg-white px-3 py-3.5 text-[15px] font-extrabold text-[#0056D2] disabled:opacity-50">
              Ativar as notificações
            </button>
          )}
          {!hasLocation && (
            <button type="button" onClick={enableLocation} disabled={busy !== null}
              className="w-full rounded-xl border-2 border-[#0056D2] bg-white px-3 py-3.5 text-[15px] font-extrabold text-[#0056D2] disabled:opacity-50">
              Ativar a localização
            </button>
          )}
          {nothingLeft && <p className="text-center text-[14px] font-semibold text-slate-700">Tudo certo por aqui. Obrigado!</p>}

          <p className="text-center text-[12px] leading-relaxed text-slate-500">
            {hasClock
              ? 'Este atalho fica aberto por 20 minutos a partir do seu toque. Cada passo concluído fica marcado, e você pode seguir para os outros. Ele fecha quando tudo estiver feito ou ao fim do tempo. Depois, você faz o mesmo no menu do app.'
              : 'Cada passo concluído fica marcado, e você pode seguir para os outros. Você também encontra tudo isso no menu do app.'} Nenhuma conta ou cadastro é removido sem o seu consentimento.{' '}
            {!hasLocation && 'A localização é opcional e você desativa quando quiser.'}
          </p>
          <button type="button" onClick={() => finish('dismissed')} className="mx-auto block px-4 py-2 text-[13px] font-bold text-slate-500">
            Agora não
          </button>
        </div>
      </SheetShell.Body>
    </SheetShell>
  );
}
