/**
 * Utilitários de gênero para concordância de artigos com o nome do pet em português.
 * Usa pet.sex para determinar o artigo correto.
 * Fallback: masculino (do/o/um) quando sex não está preenchido.
 */

type WithSex = { sex?: 'male' | 'female' | null | undefined };

/** "do" (masc) ou "da" (fem) — preposição "de" + artigo definido */
export function petDo(pet: WithSex): 'do' | 'da' {
  return pet.sex === 'female' ? 'da' : 'do';
}

/** "o" (masc) ou "a" (fem) — artigo definido */
export function petO(pet: WithSex): 'o' | 'a' {
  return pet.sex === 'female' ? 'a' : 'o';
}

/** "um" (masc) ou "uma" (fem) — artigo indefinido */
export function petUm(pet: WithSex): 'um' | 'uma' {
  return pet.sex === 'female' ? 'uma' : 'um';
}

/** "no" (masc) ou "na" (fem) — preposição "em" + artigo definido */
export function petNo(pet: WithSex): 'no' | 'na' {
  return pet.sex === 'female' ? 'na' : 'no';
}
