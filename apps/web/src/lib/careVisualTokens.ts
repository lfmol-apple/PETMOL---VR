/**
 * Fundação visual PETMOL — Home / Cuidados (redesign premium, branch
 * design/petmol-premium-visual). Fonte única pros tokens que antes estavam
 * espalhados/duplicados em componentes individuais.
 *
 * Escopo DELIBERADAMENTE restrito: isto NÃO substitui `careAreaTheme.ts`
 * (accent por área — continua existindo, cor com função) nem `premiumTokens.ts`
 * (admin/legal/onboarding — não tocar). É a camada que falta pra Home e
 * Cuidados pararem de ter cor/raio/sombra hardcoded em cada componente.
 *
 * `#0056D2` confirmado em auditoria como o azul institucional REALMENTE em
 * uso hoje (SheetHeader.PETMOL_HEADER_BG, careAreaTheme.PETMOL_ACCENT) — não
 * o `#003DA8` do brandTokens.ts, que está morto (ver diagnóstico 07/10/2026).
 */

/** Azul PETMOL — ação primária, foco, identidade institucional. */
export const CARE_BLUE = '#0056D2';
export const CARE_BLUE_DARK = '#00427e';
export const CARE_BLUE_LIGHT = '#2f6fe0';

/** Superfície predominante proposta: azul-gelo extremamente claro / branco
 * azulado — NÃO queimado em asset, é propriedade do card/página. */
export const CARE_SURFACE_ICE = '#F2F6FC';
export const CARE_SURFACE_WHITE = '#FFFFFF';

/** Texto. */
export const CARE_TEXT_PRIMARY = '#0B1E36'; // azul-marinho/grafite, alto contraste
export const CARE_TEXT_SECONDARY = '#5B6B82'; // slate azulado

/** Estados semânticos — função, nunca decoração. Nunca convertidos em azul. */
export const CARE_SEMANTIC = {
  positive: '#16A34A',
  attention: '#D97706',
  critical: '#DC2626',
} as const;

/**
 * Raio por FUNÇÃO (a auditoria encontrou 16/20/24/26px coexistindo sem
 * regra). Não força o mesmo raio em tudo — a regra é consistência por papel.
 */
export const CARE_RADIUS = {
  /** card de conteúdo (grid Home, grid Cuidados, mini-cards internos) */
  card: 'rounded-[20px]',
  /** sheet/modal externo — já é o valor real usado por SheetShell hoje */
  sheet: 'rounded-[26px]',
  /** botão/controle */
  control: 'rounded-xl', // 12px
} as const;

/**
 * Sombra por FUNÇÃO — família pequena, suave, premium (nunca pesada; nunca
 * plana). A auditoria encontrou >=5 sombras de card diferentes sem relação
 * entre si; esta é a fonte única pra Home/Cuidados daqui pra frente.
 */
export const CARE_SHADOW = {
  /** card em repouso, sobre a superfície azul-gelo/branca */
  surface: 'shadow-[0_2px_10px_-2px_rgba(15,23,42,0.08)]',
  /** card em destaque/hover/foco */
  elevated: 'shadow-[0_8px_24px_-6px_rgba(15,23,42,0.14)]',
  /** sheet/modal externo */
  sheet: 'shadow-[0_-8px_50px_-8px_rgba(15,23,42,0.35)]', // mesmo valor já usado pelo SheetShell hoje
} as const;

/**
 * Gradiente institucional canônico — MESMO valor já usado por
 * `SheetHeader.PETMOL_HEADER_BG` (não duplicado aqui à toa: é a referência
 * pra quem for criar um novo componente de header/shell em Home/Cuidados
 * sem importar o SheetHeader inteiro).
 */
export const CARE_HEADER_GRADIENT =
  `radial-gradient(120% 140% at 12% -10%, ${CARE_BLUE_LIGHT} 0%, ${CARE_BLUE} 46%, ${CARE_BLUE_DARK} 100%)`;
