'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { TimeField } from '@/components/home/RoutineWalk';
import { useNotificationPermissionController } from '@/features/interactions/useNotificationPermissionController';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import { bathDone, bathSnooze, deviceTimeZone, fetchBath, saveBath, type BathConfig } from '@/lib/routineApi';
import { whatsAppHref } from '@/lib/whatsapp';

const INTRO_KEY = 'petmol_routine_bath_intro_v1';
const INTRO_MAX_DAYS = 3;
const PRESETS = [7, 15, 30];

type Intro = { shown: number; day: string; opened: boolean };
const today = () => new Date().toISOString().slice(0, 10);
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

/** Banheirinha com chuveiro: o cano sobe da borda da banheira, faz a curva e termina na ducha. Traço fino. */
export function BathShowerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M19.6 14V6.6A2.6 2.6 0 0 0 17 4h-2.6A1.6 1.6 0 0 0 12.8 5.6V6" />
      <path d="M11.4 6h2.8l1.1 2.3H10.3z" />
      <path d="M11 10.4v1M12.8 10.4v1.6M14.6 10.4v1" />
      <path d="M3.2 14h17.6" />
      <path d="M4.6 14v.8c0 2.6 1.9 4.2 4.5 4.2h5.8c2.6 0 4.5-1.6 4.5-4.2V14" />
      <path d="M7.6 19l-.9 2M16.4 19l.9 2" />
    </svg>
  );
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.89-9.89 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 7c0 5.45-4.44 9.88-9.88 9.88M20.46 3.49A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45c6.56 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.42" />
    </svg>
  );
}

function fmtLong(iso: string): string {
  const d = new Date(iso);
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dias[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} às ${hh}:${mm}`;
}

function daysAgo(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const then = new Date(y, m - 1, d).getTime();
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000));
  return days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
}

/**
 * Banheirinha no canto inferior esquerdo da foto do pet (acima do passeio): abre a janela da rotina de
 * banho e tosa. Só aparece quando o servidor liga o recurso (routine_bath_enabled) — desligado, o GET
 * responde 404 e nada é desenhado. Também abre sozinha quando o push do banho é tocado (?modal=bath).
 */
export function RoutineBathButton({ petId, petName }: { petId: string; petName: string }) {
  const [cfg, setCfg] = useState<BathConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [petshopOpen, setPetshopOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { permission, requestPermission, subscribeToPush, isSubscribed } = useNotificationPermissionController();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let alive = true;
    setCfg(null);
    void fetchBath(petId).then((c) => {
      if (!alive || !c) return;
      setCfg(c);
      setCustom(!PRESETS.includes(c.interval_days));
      const intro = readIntro();
      if (!intro.opened && !c.enabled && intro.shown <= INTRO_MAX_DAYS) {
        const next = intro.day === today() ? intro : { ...intro, shown: intro.shown + 1, day: today() };
        if (next.shown <= INTRO_MAX_DAYS) { writeIntro(next); setShowIntro(true); }
      }
      // Toque no push do banho: abre a janela deste pet.
      try {
        const p = new URLSearchParams(window.location.search);
        if (p.get('modal') === 'bath' && (!p.get('petId') || p.get('petId') === petId)) setOpen(true);
      } catch { /* sem URL: ignora */ }
    });
    return () => { alive = false; };
  }, [petId]);

  if (!cfg) return null;

  const openPanel = () => {
    setOpen(true);
    setShowIntro(false);
    writeIntro({ ...readIntro(), opened: true });
  };

  const update = async (patch: Partial<BathConfig>) => {
    const next: BathConfig = { ...cfg, ...patch, tz: deviceTimeZone() };
    setCfg(next);
    setBusy(true);
    const saved = await saveBath(petId, next);
    setBusy(false);
    if (saved) setCfg(saved);
    else setCfg(cfg);
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

  const setInterval_ = (n: number) => {
    if (!Number.isFinite(n) || n < 1 || n > 365) return;
    void update({ interval_days: Math.round(n) });
  };

  const markDone = async () => {
    setBusy(true);
    const saved = await bathDone(petId);
    setBusy(false);
    if (saved) {
      setCfg(saved);
      showAppToast(`Banho de ${petName} registrado. Próximo aviso: ${saved.next_at ? fmtLong(saved.next_at) : 'em breve'}.`, { tone: 'success' });
    } else {
      showAppToast('Não deu pra registrar agora. Tente de novo.', { tone: 'warning' });
    }
  };

  const snooze = async () => {
    setBusy(true);
    const saved = await bathSnooze(petId);
    setBusy(false);
    if (saved) {
      setCfg(saved);
      showAppToast('Combinado! Avisamos de novo amanhã.', { tone: 'success' });
      setOpen(false);
    }
  };

  const confirmAndClose = () => {
    setOpen(false);
    showAppToast(cfg.enabled ? `Lembrete de banho de ${petName} confirmado.` : 'Lembrete de banho desligado.', { tone: 'success' });
  };

  const dueSoon = Boolean(cfg.next_at) && new Date(cfg.next_at as string).getTime() - Date.now() < 24 * 3_600_000;
  const waHref = whatsAppHref(cfg.petshop_phone);

  const popup = open && mounted ? createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/40" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-label={`Rotina de banho de ${petName}`}
        className="fixed left-1/2 top-1/2 z-[201] max-h-[88dvh] w-[calc(100vw-48px)] max-w-[340px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border border-white/60 bg-white/95 p-4 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl"
      >
        <p className="text-[15px] font-black text-slate-900">Rotina de {petName}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-slate-900">Banho</p>
            <p className="text-[12px] text-slate-500">Lembrar do banho e tosa</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={cfg.enabled}
            aria-label="Lembrete de banho"
            onClick={() => void toggle()}
            disabled={busy}
            className={`relative !h-[29px] !min-h-[29px] !w-[48px] !min-w-[48px] shrink-0 rounded-full p-0 transition-colors disabled:opacity-60 ${cfg.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
          >
            <span className={`absolute left-[3px] top-[3px] h-[23px] w-[23px] rounded-full bg-white shadow transition-transform ${cfg.enabled ? 'translate-x-[19px]' : ''}`} />
          </button>
        </div>

        {!cfg.enabled && <p className="mt-3 text-[12.5px] text-slate-500">Escolha de quanto em quanto tempo e a gente avisa.</p>}

        {cfg.enabled && (
          <div className="mt-3 space-y-3 rounded-2xl bg-slate-50 p-3">
            <div>
              <p className="mb-1.5 text-[12px] font-bold text-slate-500">Repetir a cada</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Repetir a cada">
                {PRESETS.map((n) => {
                  const on = !custom && cfg.interval_days === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={on}
                      onClick={() => { setCustom(false); setInterval_(n); }}
                      className={`h-8 rounded-full border px-3 text-[13px] font-bold ${on ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}
                    >{n} dias</button>
                  );
                })}
                <button
                  type="button"
                  aria-pressed={custom}
                  onClick={() => setCustom(true)}
                  className={`h-8 rounded-full border px-3 text-[13px] font-bold ${custom ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}
                >Outro</button>
              </div>
              {custom && (
                <label className="mt-2 flex items-center gap-2 text-[13px] text-slate-500">
                  A cada
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={365}
                    aria-label="Dias entre os banhos"
                    defaultValue={cfg.interval_days}
                    onBlur={(e) => setInterval_(Number(e.target.value))}
                    className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-[14px] font-bold text-slate-900"
                  />
                  dias
                </label>
              )}
            </div>
            <label className="flex items-center gap-2 text-[13px] text-slate-500">
              Horário
              <TimeField label="Horário do lembrete de banho" value={cfg.time} onCommit={(v) => void update({ time: v })} />
            </label>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-slate-700">Incluir tosa</span>
              <button
                type="button"
                role="switch"
                aria-checked={cfg.with_grooming}
                aria-label="Incluir tosa"
                onClick={() => void update({ with_grooming: !cfg.with_grooming })}
                className={`relative !h-[24px] !min-h-[24px] !w-[40px] !min-w-[40px] shrink-0 rounded-full p-0 transition-colors ${cfg.with_grooming ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute left-[2px] top-[2px] h-[20px] w-[20px] rounded-full bg-white shadow transition-transform ${cfg.with_grooming ? 'translate-x-[16px]' : ''}`} />
              </button>
            </div>
          </div>
        )}

        {pushNote && <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-[12px] leading-snug text-amber-800">{pushNote}</p>}

        {cfg.enabled && (
          <>
            <p className="mt-3 text-[12.5px] leading-snug text-slate-600" data-testid="banho-resumo">
              {cfg.last_bath_on ? `Último banho: ${daysAgo(cfg.last_bath_on)}. ` : ''}
              {cfg.next_at ? `Próximo aviso: ${fmtLong(cfg.next_at)}.` : 'Aviso já enviado — registre o banho ou adie.'}
            </p>
            <button
              type="button"
              onClick={() => void markDone()}
              disabled={busy}
              className="mt-3 w-full rounded-full bg-emerald-500 px-4 py-3 text-[14px] font-extrabold text-white active:scale-[0.98] disabled:opacity-60"
            >Dei banho hoje 🛁</button>
            {dueSoon && (
              <button
                type="button"
                onClick={() => void snooze()}
                disabled={busy}
                className="mt-2 w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-[13.5px] font-bold text-slate-600 active:scale-[0.98] disabled:opacity-60"
              >Adiar para amanhã</button>
            )}
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[14px] font-bold text-emerald-800 active:scale-[0.98]"
            >
              <WhatsAppGlyph className="h-4 w-4" />
              {cfg.petshop_name ? `Abrir WhatsApp · ${cfg.petshop_name}` : 'Abrir WhatsApp do petshop'}
            </a>
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setPetshopOpen((v) => !v)}
                aria-expanded={petshopOpen}
                className="!min-h-0 text-[12.5px] font-semibold text-[#0056D2]"
              >Petshop (opcional) {petshopOpen ? '▴' : '▾'}</button>
            </div>
            {petshopOpen && (
              <div className="mt-2 space-y-2 rounded-2xl bg-slate-50 p-3">
                <input
                  type="text"
                  aria-label="Nome do petshop"
                  placeholder="Nome do petshop"
                  defaultValue={cfg.petshop_name ?? ''}
                  maxLength={200}
                  onBlur={(e) => { if ((e.target.value || '') !== (cfg.petshop_name ?? '')) void update({ petshop_name: e.target.value }); }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-900"
                />
                <input
                  type="tel"
                  inputMode="tel"
                  aria-label="WhatsApp do petshop"
                  placeholder="WhatsApp com DDD"
                  defaultValue={cfg.petshop_phone ?? ''}
                  maxLength={40}
                  onBlur={(e) => { if ((e.target.value || '') !== (cfg.petshop_phone ?? '')) void update({ petshop_phone: e.target.value }); }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-900"
                />
              </div>
            )}
          </>
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
            Novo: lembrete de banho
            <span className="mt-0.5 block text-[11.5px] font-semibold text-slate-500">Toque na banheirinha e escolha de quanto em quanto tempo.</span>
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
            aria-label={cfg.enabled ? 'Rotina de banho ligada' : 'Rotina de banho'}
            title="Banho e tosa"
            className={`relative flex h-8 w-8 items-center justify-center rounded-full border text-white shadow-lg backdrop-blur-md transition-all active:scale-90 sm:h-9 sm:w-9 ${
              cfg.enabled
                ? 'border-white bg-emerald-500 hover:bg-emerald-600'
                : showIntro
                  ? 'border-white bg-[#0056D2]'
                  : 'border-white/40 bg-black/30 hover:bg-black/50'
            }`}
          >
            <BathShowerIcon className="h-[18px] w-[18px]" />
            {!cfg.enabled && !showIntro && (
              <span
                data-testid="banho-inativo"
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
