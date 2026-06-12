'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { CareInteractionPolicy, InteractionClickDestination } from '@/features/interactions/types';
import { DESTINATION_LABELS, PERSISTENCE_LABELS } from './NotificationControlCard';
import { IosSwitch } from '@/components/ui/IosSwitch';

// ---------------------------------------------------------------------------
// Data maps
// ---------------------------------------------------------------------------
const DESTINATION_OPTIONS: { value: InteractionClickDestination; label: string }[] = [
  { value: 'open-central', label: 'Central de interações' },
  { value: 'open-history', label: 'Ver histórico' },
  { value: 'open-register', label: 'Registrar' },
  { value: 'open-edit', label: 'Editar' },
  { value: 'open-shopping', label: 'Compra' },
  { value: 'health/vaccines', label: 'Carteira vacinal' },
  { value: 'health/medication', label: 'Tratamento em curso' },
  { value: 'health/parasites/dewormer', label: 'Vermífugo' },
  { value: 'health/parasites/flea_tick', label: 'Antipulgas' },
  { value: 'health/parasites/collar', label: 'Coleira' },
  { value: 'health/food', label: 'Alimentação' },
  { value: 'health/grooming', label: 'Banho e tosa' },
  { value: 'none', label: 'Nenhum' },
];

type ConversionType = 'nenhuma' | 'registro' | 'compra';
type VisualWeight = 'baixo' | 'medio' | 'alto' | 'critico';

function priorityToVisual(p: number | string | undefined): VisualWeight {
  const n = typeof p === 'number' ? p : { low: 20, medium: 60, high: 80, critical: 100 }[p as string] ?? 60;
  if (n >= 90) return 'critico';
  if (n >= 70) return 'alto';
  if (n >= 40) return 'medio';
  return 'baixo';
}

function visualToPriority(v: VisualWeight): number {
  return { baixo: 20, medio: 60, alto: 80, critico: 100 }[v];
}

function focusToConvType(focus: CareInteractionPolicy['commercialFocus']): ConversionType {
  if (!focus || focus === 'none') return 'nenhuma';
  if (focus === 'soft') return 'registro';
  return 'compra';
}

function convTypeToFocus(t: ConversionType): CareInteractionPolicy['commercialFocus'] {
  if (t === 'registro') return 'soft';
  if (t === 'compra') return 'strong';
  return 'none';
}

// ---------------------------------------------------------------------------
// Primitive UI helpers (local)
// ---------------------------------------------------------------------------
function SwitchRow({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm text-slate-800">{label}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <IosSwitch checked={checked} onChange={onToggle} size="sm" />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs text-slate-400 block mb-1.5">{children}</label>;
}

const SELECT_CLS =
  'w-full rounded-xl border border-slate-200 px-3 py-3 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300';

const INPUT_CLS =
  'w-full rounded-xl border border-slate-200 px-3 py-3 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300';

type ChipOption<T extends string> = { value: T; label: string };

function ChipGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ChipOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
            value === opt.value
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200 active:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accordion section wrapper
// ---------------------------------------------------------------------------
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-4 text-left"
      >
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <span className="text-slate-300 text-xs shrink-0 ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="pb-5 space-y-0">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SECTION 1 — DISPARO
// ---------------------------------------------------------------------------
function NotificationTimingSection({
  policy,
  onChange,
  isEmergency,
}: {
  policy: CareInteractionPolicy;
  onChange: (next: CareInteractionPolicy) => void;
  isEmergency: boolean;
}) {
  const repeating = policy.resurfacing !== 'never';

  return (
    <div className="space-y-0 divide-y divide-slate-50">
      <SwitchRow
        label="Ativo"
        hint="Liga ou desliga este aviso por completo."
        checked={policy.enabled}
        onToggle={() => onChange({ ...policy, enabled: !policy.enabled })}
      />

      {!isEmergency && (
        <div className="py-3 space-y-1.5">
          <FieldLabel>Avisar quantos dias antes</FieldLabel>
          <input
            type="number"
            min={0}
            max={60}
            value={policy.advance_days ?? 7}
            onChange={(e) =>
              onChange({ ...policy, advance_days: Math.max(0, Number(e.target.value) || 0) })
            }
            className={INPUT_CLS}
          />
        </div>
      )}

      <SwitchRow
        label="Repetir aviso"
        hint="Reaparece se o tutor não resolver."
        checked={repeating}
        onToggle={() =>
          onChange({
            ...policy,
            resurfacing: repeating ? 'never' : 'daily',
          })
        }
      />

      {repeating && (
        <div className="py-3 space-y-1.5">
          <FieldLabel>Intervalo de repetição</FieldLabel>
          <select
            value={policy.resurfacing}
            onChange={(e) =>
              onChange({
                ...policy,
                resurfacing: e.target.value as CareInteractionPolicy['resurfacing'],
              })
            }
            className={SELECT_CLS}
          >
            <option value="daily">Todo dia</option>
            <option value="weekly">Toda semana</option>
            <option value="until-resolved">Até resolver (sem intervalo)</option>
          </select>
        </div>
      )}

      <div className="py-3 space-y-1.5">
        <FieldLabel>Quando vencer sem resposta</FieldLabel>
        <select
          value={policy.expiredBehavior ?? 'persistent'}
          onChange={(e) =>
            onChange({
              ...policy,
              expiredBehavior: e.target.value as CareInteractionPolicy['expiredBehavior'],
            })
          }
          className={SELECT_CLS}
        >
          <option value="persistent">Continuar aparecendo</option>
          <option value="soft">Mover para central</option>
          <option value="dismiss-once">Arquivar automaticamente</option>
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SECTION 2 — DURAÇÃO
// ---------------------------------------------------------------------------
function NotificationDurationSection({
  policy,
  onChange,
}: {
  policy: CareInteractionPolicy;
  onChange: (next: CareInteractionPolicy) => void;
}) {
  return (
    <div className="space-y-0 divide-y divide-slate-50">
      <div className="py-3 space-y-1.5">
        <FieldLabel>Quanto tempo fica visível</FieldLabel>
        <select
          value={policy.persistence}
          onChange={(e) => onChange({ ...policy, persistence: e.target.value })}
          className={SELECT_CLS}
        >
          <option value="until-resolved">Até ser resolvido</option>
          <option value="session">Só nesta sessão</option>
          <option value="one-shot">Uma vez, depois some</option>
          <option value="critical">Sempre (não some)</option>
        </select>
      </div>

      <div className="py-3 space-y-1.5">
        <FieldLabel>Intervalo entre repetições (horas)</FieldLabel>
        <input
          type="number"
          min={0}
          value={policy.cooldown_hours}
          onChange={(e) =>
            onChange({ ...policy, cooldown_hours: Math.max(0, Number(e.target.value) || 0) })
          }
          className={INPUT_CLS}
        />
      </div>

      <SwitchRow
        label="Some ao resolver"
        hint="O aviso desaparece quando o cuidado é registrado."
        checked={policy.allowResolve === true}
        onToggle={() => onChange({ ...policy, allowResolve: !policy.allowResolve })}
      />

      <SwitchRow
        label="Some ao marcar como OK"
        hint="O tutor pode dispensar marcando como feito."
        checked={policy.allowMarkAsOk === true}
        onToggle={() => onChange({ ...policy, allowMarkAsOk: !policy.allowMarkAsOk })}
      />

      <SwitchRow
        label="Permite adiar"
        hint={policy.allowRemindLater ? 'Tutor pode pedir para lembrar depois.' : 'Aviso não pode ser adiado.'}
        checked={policy.allowRemindLater}
        onToggle={() => onChange({ ...policy, allowRemindLater: !policy.allowRemindLater })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SECTION 3 — APARÊNCIA
// ---------------------------------------------------------------------------
function NotificationAppearanceSection({
  policy,
  onChange,
}: {
  policy: CareInteractionPolicy;
  onChange: (next: CareInteractionPolicy) => void;
}) {
  const visual = priorityToVisual(policy.priority);

  return (
    <div className="space-y-0 divide-y divide-slate-50">
      <SwitchRow
        label="Mostrar na home"
        hint="Aparece nos cards da tela inicial."
        checked={policy.showOnHome}
        onToggle={() => onChange({ ...policy, showOnHome: !policy.showOnHome })}
      />

      <SwitchRow
        label="Mostrar na central"
        hint="Aparece na central de interações."
        checked={policy.showInCenter}
        onToggle={() => onChange({ ...policy, showInCenter: !policy.showInCenter })}
      />

      <SwitchRow
        label="Exibir ao abrir o app"
        hint="Destaque ao entrar no aplicativo."
        checked={policy.showOnAppOpen === true}
        onToggle={() =>
          onChange({ ...policy, showOnAppOpen: policy.showOnAppOpen !== true })
        }
      />

      {/* ── Push ─────────────────────────────── */}
      <SwitchRow
        label="Push — notificação no celular"
        hint="Avisa mesmo com o app fechado."
        checked={policy.pushEnabled === true}
        onToggle={() => onChange({ ...policy, pushEnabled: !policy.pushEnabled })}
      />

      {policy.pushEnabled && (
        <div className="py-3 space-y-3 rounded-xl bg-blue-50/60 px-3 -mx-0 my-1">
          <div className="space-y-1.5">
            <FieldLabel>Título do push</FieldLabel>
            <input
              type="text"
              value={policy.pushTitle ?? ''}
              onChange={(e) => onChange({ ...policy, pushTitle: e.target.value })}
              placeholder="Ex: Hora da ração! 🍖"
              className={INPUT_CLS}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Texto do push</FieldLabel>
            <input
              type="text"
              value={policy.pushBody ?? ''}
              onChange={(e) => onChange({ ...policy, pushBody: e.target.value })}
              placeholder="Ex: O estoque do [pet] está acabando."
              className={INPUT_CLS}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Horário preferencial</FieldLabel>
            <input
              type="time"
              value={policy.pushPreferredHour ?? '08:00'}
              onChange={(e) => onChange({ ...policy, pushPreferredHour: e.target.value })}
              className={INPUT_CLS}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Limite de repetições</FieldLabel>
            <input
              type="number"
              min={1}
              max={30}
              value={policy.pushRepeatLimit ?? 3}
              onChange={(e) =>
                onChange({ ...policy, pushRepeatLimit: Math.max(1, Number(e.target.value) || 1) })
              }
              className={INPUT_CLS}
            />
          </div>
        </div>
      )}

      <div className="py-3 space-y-2">
        <FieldLabel>Destaque visual</FieldLabel>
        <ChipGroup<VisualWeight>
          value={visual}
          options={[
            { value: 'baixo', label: 'Baixo' },
            { value: 'medio', label: 'Médio' },
            { value: 'alto', label: 'Alto' },
            { value: 'critico', label: 'Crítico' },
          ]}
          onChange={(v) => onChange({ ...policy, priority: visualToPriority(v) })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SECTION 4 — AÇÃO APÓS CLIQUE
// ---------------------------------------------------------------------------
function NotificationActionSection({
  policy,
  onChange,
}: {
  policy: CareInteractionPolicy;
  onChange: (next: CareInteractionPolicy) => void;
}) {
  return (
    <div className="py-3 space-y-1.5">
      <FieldLabel>Para onde vai o clique principal</FieldLabel>
      <select
        value={policy.primary.destination}
        onChange={(e) =>
          onChange({
            ...policy,
            primary: {
              ...policy.primary,
              destination: e.target.value as InteractionClickDestination,
            },
          })
        }
        className={SELECT_CLS}
      >
        {DESTINATION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-400 mt-1">
        Atual:{' '}
        <strong>{DESTINATION_LABELS[policy.primary.destination] ?? policy.primary.destination}</strong>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SECTION 5 — CONVERSÃO
// ---------------------------------------------------------------------------
function NotificationConversionSection({
  policy,
  onChange,
}: {
  policy: CareInteractionPolicy;
  onChange: (next: CareInteractionPolicy) => void;
}) {
  const convType = focusToConvType(policy.commercialFocus);
  const hasConversion = convType !== 'nenhuma';

  const setConvType = (t: ConversionType) => {
    const newFocus = convTypeToFocus(t);
    const allowPurchase = t === 'compra';
    let newDest = policy.primary.destination;
    if (t === 'compra' && newDest !== 'open-shopping' && !newDest.startsWith('health/')) {
      newDest = 'open-shopping';
    }
    if (t === 'registro' && newDest === 'open-shopping') {
      newDest = 'open-register';
    }
    onChange({
      ...policy,
      commercialFocus: newFocus,
      primary: { ...policy.primary, allowContextualPurchase: allowPurchase, destination: newDest },
    });
  };

  return (
    <div className="space-y-0 divide-y divide-slate-50">
      <div className="py-3 space-y-2">
        <FieldLabel>Tipo de conversão</FieldLabel>
        <ChipGroup<ConversionType>
          value={convType}
          options={[
            { value: 'nenhuma', label: 'Nenhuma' },
            { value: 'registro', label: 'Registro' },
            { value: 'compra', label: 'Compra' },
          ]}
          onChange={setConvType}
        />
      </div>

      {hasConversion && (
        <>
          <div className="py-3 space-y-1.5">
            <FieldLabel>CTA principal</FieldLabel>
            <input
              type="text"
              value={policy.primaryCtaLabel ?? policy.primary.label}
              onChange={(e) =>
                onChange({
                  ...policy,
                  primaryCtaLabel: e.target.value,
                  primary: { ...policy.primary, label: e.target.value },
                })
              }
              placeholder={policy.primary.label}
              className={INPUT_CLS}
            />
          </div>

          <div className="py-3 space-y-1.5">
            <FieldLabel>CTA secundário (opcional)</FieldLabel>
            <input
              type="text"
              value={policy.secondaryCtaLabel ?? policy.secondary?.label ?? ''}
              onChange={(e) =>
                onChange({
                  ...policy,
                  secondaryCtaLabel: e.target.value,
                  secondary: {
                    label: e.target.value,
                    destination: policy.secondary?.destination ?? 'none',
                  },
                })
              }
              placeholder="Ex: Ver histórico"
              className={INPUT_CLS}
            />
          </div>

          <div className="py-3 space-y-1.5">
            <FieldLabel>Destino da conversão</FieldLabel>
            <select
              value={policy.primary.destination}
              onChange={(e) =>
                onChange({
                  ...policy,
                  primary: {
                    ...policy.primary,
                    destination: e.target.value as InteractionClickDestination,
                  },
                })
              }
              className={SELECT_CLS}
            >
              {DESTINATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {policy.secondary && (
            <div className="py-3 space-y-1.5">
              <FieldLabel>Destino secundário</FieldLabel>
              <select
                value={policy.secondary.destination}
                onChange={(e) =>
                  onChange({
                    ...policy,
                    secondary: {
                      label: policy.secondary?.label ?? 'Ação secundária',
                      destination: e.target.value as InteractionClickDestination,
                    },
                  })
                }
                className={SELECT_CLS}
              >
                {DESTINATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export interface NotificationControlDrawerProps {
  icon: string;
  label: string;
  description: string;
  policy: CareInteractionPolicy;
  isEmergency?: boolean;
  onChange: (next: CareInteractionPolicy) => void;
  onClose: () => void;
}

export function NotificationControlDrawer({
  icon,
  label,
  description,
  policy,
  isEmergency = false,
  onChange,
  onClose,
}: NotificationControlDrawerProps) {
  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 pointer-events-none">
        <motion.div
          key="drawer"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="w-full max-w-lg flex flex-col max-h-[92dvh] overflow-hidden pointer-events-auto bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60"
        >

          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
            <span className="text-2xl leading-none shrink-0">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 truncate">{label}</p>
              <p className="text-xs text-slate-400 truncate">{description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-xs active:bg-slate-200 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5">
            <Section title="1 · Disparo — quando avisar" defaultOpen>
              <NotificationTimingSection
                policy={policy}
                onChange={onChange}
                isEmergency={isEmergency}
              />
            </Section>

            <Section title="2 · Duração — quanto tempo fica">
              <NotificationDurationSection policy={policy} onChange={onChange} />
            </Section>

            <Section title="3 · Aparência — como aparece">
              <NotificationAppearanceSection policy={policy} onChange={onChange} />
            </Section>

            <Section title="4 · Ação — para onde vai o clique">
              <NotificationActionSection policy={policy} onChange={onChange} />
            </Section>

            <Section title="5 · Conversão — o que acontece depois">
              <NotificationConversionSection policy={policy} onChange={onChange} />
            </Section>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-100 shrink-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-4 rounded-xl bg-slate-900 text-white text-sm font-semibold active:opacity-80 transition-opacity"
            >
              Concluir
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
