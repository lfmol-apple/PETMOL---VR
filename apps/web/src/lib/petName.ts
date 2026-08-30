/**
 * Nome do pet — sem emoji.
 *
 * O campo "nome" é usado em texto corrido, push, e-mail e no compartilhamento;
 * emoji ali quebra concordância, layout e às vezes o envio. Removemos
 * pictogramas, bandeiras (regional indicators), seletores de variação,
 * ZWJ e keycaps.
 */

const EMOJI_RE =
  /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{20E3}\u{200D}]/gu;

export function stripEmoji(value: string): string {
  return value.replace(EMOJI_RE, '');
}

export function hasEmoji(value: string): boolean {
  EMOJI_RE.lastIndex = 0;
  return EMOJI_RE.test(value);
}

/** Sanitiza o que o tutor digita no campo nome: sem emoji, sem espaços duplicados nas pontas. */
export function sanitizePetName(value: string): string {
  return stripEmoji(value).replace(/\s{2,}/g, ' ');
}
