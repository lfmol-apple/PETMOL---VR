'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlarmClock } from 'lucide-react';

import { useNotificationPermissionController } from '@/features/interactions/useNotificationPermissionController';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import { deviceTimeZone, fetchWalkStatus, saveWalk, type WalkConfig } from '@/lib/routineApi';
import { readRoutineCache, writeRoutineCache } from '@/lib/routineCache';

const DAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const INTRO_KEY = 'petmol_routine_walk_intro_v1';
const INTRO_MAX_DAYS = 3;
const COUNT_OPTIONS = [1, 2, 3, 4];
const SUGGESTED_TIMES = ['07:30', '18:00', '12:00', '21:00', '09:00', '15:00'];

type Intro = { shown: number; day: string; opened: boolean };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function readIntro(): Intro {
  try {
    const raw = window.localStorage.getItem(INTRO_KEY);
    if (raw) return JSON.parse(raw) as Intro;
  } catch { /* sem armazenamento: trata como primeira vez */ }
  return { shown: 0, day: '', opened: false };
}
function writeIntro(v: Intro): void {
  try { window.localStorage.setItem(INTRO_KEY, JSON.stringify(v)); } catch { /* melhor esforço */ }
}

const DAY_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/** "Vamos avisar às 07:30 e 18:00, de seg a sex." */
function summary(cfg: WalkConfig): string {
  const hours = cfg.times.length > 1
    ? `${cfg.times.slice(0, -1).join(', ')} e ${cfg.times[cfg.times.length - 1]}`
    : cfg.times[0];
  const names = cfg.days.map((d) => DAY_SHORT[d - 1]);
  const days = cfg.days.length === 7 ? 'todos os dias'
    : cfg.days.length === 5 && cfg.days.join() === '1,2,3,4,5' ? 'de seg a sex'
    : names.join(', ');
  return `Vamos avisar às ${hours}, ${days}.`;
}

/**
 * Horário com qualquer minuto (o seletor de hora do próprio aparelho, o mesmo da
 * ração). Guarda o valor localmente e só grava depois de uma pausa, ao sair do
 * campo ou ao fechar a janela — a roda do iPhone dispara uma alteração a cada
 * passo e não queremos um salvamento por passo.
 */
function TimeField({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => { setDraft(value); }, [value]);

  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const v = pending.current;
    pending.current = null;
    if (v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) && v !== value) commitRef.current(v);
  };
  // Ao fechar a janela (desmontar) o que estava pendente ainda é gravado.
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      type="time"
      step={60}
      aria-label={label}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        pending.current = e.target.value;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, 600);
      }}
      onBlur={flush}
      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[14px] font-bold text-slate-900"
    />
  );
}

/**
 * Relógio no canto inferior esquerdo da foto do pet: abre a janela da Rotina
 * (hoje só o passeio). Só aparece quando o servidor liga o recurso
 * (routine_walk_enabled) — desligado, o GET responde 404 e nada é desenhado.
 */
export function RoutineWalkButton({ petId, petName }: { petId: string; petName: string }) {
  // Cache-first: o relógio aparece na hora com o último estado conhecido; o servidor confirma em seguida.
  const [cfg, setCfg] = useState<WalkConfig | null>(() => readRoutineCache<WalkConfig>(`walk_${petId}`));
  const [open, setOpen] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const { permission, requestPermission, subscribeToPush, isSubscribed } = useNotificationPermissionController();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let alive = true;
    setCfg(readRoutineCache<WalkConfig>(`walk_${petId}`));
    void fetchWalkStatus(petId).then((r) => {
      if (!alive) return;
      if (r.status === 'off') { writeRoutineCache(`walk_${petId}`, null); setCfg(null); return; }   // recurso desligado: some
      if (r.status === 'error') return;                                                            // sem rede: mantém o que já se sabe
      const c = r.cfg;
      writeRoutineCache(`walk_${petId}`, c);
      setCfg(c);
      const intro = readIntro();
      if (!intro.opened && !c.enabled && intro.shown <= INTRO_MAX_DAYS) {
        const next = intro.day === today() ? intro : { ...intro, shown: intro.shown + 1, day: today() };
        if (next.shown <= INTRO_MAX_DAYS) { writeIntro(next); setShowIntro(true); }
      }
    });
    return () => { alive = false; };
  }, [petId]);

  if (!cfg) return null;

  const openPanel = () => {
    setOpen(true);
    setShowIntro(false);
    writeIntro({ ...readIntro(), opened: true });
  };

  const update = async (patch: Partial<WalkConfig>) => {
    const next: WalkConfig = { ...cfg, ...patch, tz: deviceTimeZone() };
    setCfg(next);                         // responde na hora; o servidor confirma abaixo
    setBusy(true);
    const saved = await saveWalk(petId, next);
    setBusy(false);
    if (saved) { setCfg(saved); writeRoutineCache(`walk_${petId}`, saved); }
    else setCfg(cfg);                     // não salvou: volta ao que estava
  };

  const toggle = async () => {
    const turningOn = !cfg.enabled;
    setPushNote(null);
    if (turningOn && !isSubscribed) {
      let granted = permission === 'granted';
      if (!granted) granted = await requestPermission();
      if (granted) await subscribeToPush();
      else setPushNote('Para avisar no horário, permita as notificações do PETMOL nas configurações do aparelho.');
    }
    await update({ enabled: turningOn });
  };

  // Troca o horário de um passeio mantendo a lista ordenada. Dois passeios no
  // mesmo horário viram um só no servidor; aqui a contagem é preservada
  // escolhendo o próximo horário livre.
  const changeTime = (index: number, value: string) => {
    const others = cfg.times.filter((_, i) => i !== index);
    if (others.includes(value)) return;
    void update({ times: [...others, value].sort() });
  };
  // "1x / 2x / 3x": ao diminuir, ficam os primeiros horários; ao aumentar,
  // entram horários sugeridos que ainda não estão na lista.
  const setCount = (n: number) => {
    if (n === cfg.times.length) return;
    let times = cfg.times.slice(0, n);
    for (const t of SUGGESTED_TIMES) {
      if (times.length >= n) break;
      if (!times.includes(t)) times = [...times, t];
    }
    void update({ times: times.sort() });
  };

  const confirmAndClose = () => {
    setOpen(false);
    showAppToast(cfg.enabled ? `Lembrete de passeio de ${petName} confirmado.` : 'Lembrete de passeio desligado.', { tone: 'success' });
  };

  const toggleDay = (d: number) => {
    const days = cfg.days.includes(d) ? cfg.days.filter((x) => x !== d) : [...cfg.days, d].sort();
    if (days.length === 0) return;        // pelo menos um dia
    void update({ days });
  };

  const popup = open && mounted ? createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/40" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-label={`Rotina de ${petName}`}
        className="fixed left-1/2 top-1/2 z-[201] w-[calc(100vw-48px)] max-w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border border-white/60 bg-white/95 p-4 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl"
      >
        <p className="text-[15px] font-black text-slate-900">Rotina de {petName}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-slate-900">Passeio</p>
            <p className="text-[12px] text-slate-500">Lembrar na hora que você escolher</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={cfg.enabled}
            aria-label="Lembrete de passeio"
            onClick={() => void toggle()}
            disabled={busy}
            className={`relative !h-[29px] !min-h-[29px] !w-[48px] !min-w-[48px] shrink-0 rounded-full p-0 transition-colors disabled:opacity-60 ${cfg.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
          >
            <span className={`absolute left-[3px] top-[3px] h-[23px] w-[23px] rounded-full bg-white shadow transition-transform ${cfg.enabled ? 'translate-x-[19px]' : ''}`} />
          </button>
        </div>
        {cfg.enabled && (
          <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
            <div className="grid grid-cols-7 gap-1" role="group" aria-label="Dias da semana">
              {DAY_LABELS.map((label, i) => {
                const d = i + 1;
                const on = cfg.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d)}
                    className={`!min-h-0 !min-w-0 h-9 rounded-full border px-0 text-[11.5px] font-bold ${on ? 'border-[#0056D2] bg-[#0056D2] text-white' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
                  >{label}</button>
                );
              })}
            </div>
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-slate-500">Quantas vezes por dia?</p>
              <div className="flex gap-1.5" role="group" aria-label="Quantas vezes por dia">
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={cfg.times.length === n}
                    onClick={() => setCount(n)}
                    className={`h-8 min-w-[44px] rounded-full border px-3 text-[13px] font-bold ${cfg.times.length === n ? 'border-[#0056D2] bg-[#0056D2] text-white' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
                  >{n}x</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {cfg.times.map((t, i) => (
                <label key={i} className="flex items-center gap-2 text-[13px] text-slate-500">
                  {cfg.times.length > 1 ? `Passeio ${i + 1}` : 'Horário'}
                  <TimeField
                    label={`Horário do passeio ${i + 1}`}
                    value={t}
                    onCommit={(v) => changeTime(i, v)}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
        {pushNote && <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-[12px] leading-snug text-amber-800">{pushNote}</p>}
        {cfg.enabled && (
          <p className="mt-3 text-[12.5px] leading-snug text-slate-600" data-testid="rotina-resumo">{summary(cfg)}</p>
        )}
        <button
          type="button"
          onClick={confirmAndClose}
          className="mt-3 w-full rounded-full bg-[#0056D2] px-4 py-2.5 text-[14px] font-extrabold text-white active:scale-[0.98]"
        >{cfg.enabled ? 'Confirmar' : 'Concluir'}</button>
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <>
      <div className="relative">
        {showIntro && !cfg.enabled && (
          <div className="absolute left-full top-1/2 ml-2.5 w-[210px] -translate-y-1/2 rounded-2xl bg-white p-2.5 text-[12.5px] font-bold leading-snug text-slate-900 shadow-xl">
            Novo: lembrete de passeio
            <span className="mt-0.5 block text-[11.5px] font-semibold text-slate-500">Toque no relógio e escolha o horário.</span>
            <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 bg-white" aria-hidden="true" />
          </div>
        )}
        <div className="relative">
          {showIntro && !cfg.enabled && (
            <span className="absolute inset-0 animate-ping rounded-full bg-white/70 motion-reduce:animate-none" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={openPanel}
            aria-label={cfg.enabled ? 'Rotina ligada' : 'Rotina de passeio'}
            title="Rotina"
            className={`relative flex h-8 w-8 items-center justify-center rounded-full border text-white shadow-lg backdrop-blur-md transition-all active:scale-90 sm:h-9 sm:w-9 ${
              cfg.enabled
                ? 'border-white bg-emerald-500 hover:bg-emerald-600'
                : showIntro
                  ? 'border-white bg-[#0056D2]'
                  : 'border-white/40 bg-black/30 hover:bg-black/50'
            }`}
          >
            <AlarmClock className="h-4 w-4" strokeWidth={2.3} />
            {/* Risquinho diagonal = rotina inativa (o verde já diz "ativa"). Fino e com
                contorno escuro sutil pra ler sobre qualquer foto. */}
            {!cfg.enabled && !showIntro && (
              <span
                data-testid="rotina-inativa"
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 h-[1.5px] w-[22px] -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
              />
            )}
          </button>
        </div>
      </div>
      {popup}
    </>
  );
}
