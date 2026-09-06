/**
 * Identidade cromática por ÁREA de cuidado — "onde eu estou".
 *
 * Sistema cromático PETMOL, Modelo C (auditoria 06/09/2026):
 *  - a BASE de todo sheet continua PETMOL (branco + header azul institucional).
 *  - o accent da área aparece SÓ em: ícone, fundo do ícone, eyebrow e um
 *    detalhe do header — nunca grandes superfícies saturadas.
 *  - o CTA primário é SEMPRE azul PETMOL (`PETMOL_ACCENT`), nunca a cor da
 *    área (isso é o que tirava "verde" de ter 5 significados ao mesmo tempo).
 *  - o accent de cada área foi escolhido para combinar com a ARTE .webp que
 *    o dono criou (alimentacao-tigela, cuidados-antipulgas, etc.), não o
 *    contrário.
 *  - Pet Sumido / Emergência são exceção: vermelho tem função (emergência).
 *
 * Valores = classes Tailwind FIXAS. Nada de hex montado em runtime.
 */
export type CareAreaKey =
  | 'food'
  | 'health'
  | 'vaccine'
  | 'dewormer'
  | 'flea_tick'
  | 'collar'
  | 'medication'
  | 'grooming'
  | 'store'
  | 'lost_pet';

export interface CareAreaTheme {
  label: string;
  /** emoji para contextos pequenos (a arte .webp é usada nos cards da Home) */
  emoji: string;
  /** cor do texto/ícone do accent */
  accentText: string;
  /** fundo suave do "tile" do ícone */
  accentBg: string;
  /** borda suave do accent */
  accentBorder: string;
  /** anel de foco para inputs DESTA área (a base continua o azul global) */
  focusRing: string;
}

/** Azul institucional PETMOL — CTA primário e foco padrão. */
export const PETMOL_ACCENT = {
  text: 'text-[#0056D2]',
  bg: 'bg-[#0056D2]',
  ring: 'focus:ring-[#0056D2]',
} as const;

export const CARE_AREA_THEME: Record<CareAreaKey, CareAreaTheme> = {
  food: {
    label: 'Alimentação', emoji: '🍽️',
    accentText: 'text-amber-600', accentBg: 'bg-amber-50', accentBorder: 'border-amber-200',
    focusRing: 'focus:ring-amber-400',
  },
  health: {
    label: 'Cuidados', emoji: '🩺',
    accentText: 'text-indigo-600', accentBg: 'bg-indigo-50', accentBorder: 'border-indigo-200',
    focusRing: 'focus:ring-indigo-400',
  },
  vaccine: {
    label: 'Vacina', emoji: '💉',
    accentText: 'text-sky-700', accentBg: 'bg-sky-50', accentBorder: 'border-sky-200',
    focusRing: 'focus:ring-sky-400',
  },
  dewormer: {
    label: 'Vermífugo', emoji: '🪱',
    accentText: 'text-amber-600', accentBg: 'bg-amber-50', accentBorder: 'border-amber-200',
    focusRing: 'focus:ring-amber-400',
  },
  flea_tick: {
    label: 'Antipulgas', emoji: '🛡️',
    accentText: 'text-emerald-700', accentBg: 'bg-emerald-50', accentBorder: 'border-emerald-200',
    focusRing: 'focus:ring-emerald-400',
  },
  collar: {
    label: 'Coleira', emoji: '📿',
    accentText: 'text-violet-700', accentBg: 'bg-violet-50', accentBorder: 'border-violet-200',
    focusRing: 'focus:ring-violet-400',
  },
  medication: {
    label: 'Medicação', emoji: '💊',
    accentText: 'text-purple-700', accentBg: 'bg-purple-50', accentBorder: 'border-purple-200',
    focusRing: 'focus:ring-purple-400',
  },
  grooming: {
    label: 'Banho e tosa', emoji: '🛁',
    accentText: 'text-cyan-700', accentBg: 'bg-cyan-50', accentBorder: 'border-cyan-200',
    focusRing: 'focus:ring-cyan-400',
  },
  store: {
    label: 'Loja do Pet', emoji: '🛒',
    accentText: 'text-[#0056D2]', accentBg: 'bg-blue-50', accentBorder: 'border-blue-200',
    focusRing: 'focus:ring-[#0056D2]',
  },
  lost_pet: {
    label: 'Pet Sumido', emoji: '🚨',
    accentText: 'text-red-600', accentBg: 'bg-red-50', accentBorder: 'border-red-200',
    focusRing: 'focus:ring-red-400',
  },
};
