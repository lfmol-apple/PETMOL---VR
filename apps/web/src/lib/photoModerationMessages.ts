/**
 * Texto mostrado ao tutor quando a foto enviada é recusada pela moderação
 * (422). Tom acolhedor, sem acusar ninguém: o espaço é reservado pra foto do
 * pet, e o pedido é fotografar o pet pelo nome — o mesmo tom do aviso que o
 * PETMOL manda quando remove uma foto que não é de pet.
 */
export function notAPetPhotoMessage(petName?: string | null): string {
  const name = (petName || '').trim() || 'seu pet';
  return `Não conseguimos identificar ${name} nessa foto 🐾 Esse espaço é reservado para a foto do seu pet. Que tal fotografar ${name} agora e tentar de novo?`;
}

export type PhotoUploadOutcome = 'approved' | 'pending' | 'rejected' | 'error';

/** Resultado do upload de foto (`/pets/{id}/photo`, `/missing-pets/upload-photo`) → o que a tela deve fazer. */
export function classifyPhotoUpload(status: number, data: { status?: string } | null | undefined): PhotoUploadOutcome {
  if (status === 422) return 'rejected';
  if (status >= 200 && status < 300) return data?.status === 'pending' ? 'pending' : 'approved';
  return 'error';
}

/** Upload que nem chegou à moderação: foto pesada demais (413) ou ilegível (400). Outros erros → null (o fluxo segue como antes). */
export function unusablePhotoMessage(status: number, petName?: string | null): string | null {
  const name = (petName || '').trim() || 'seu pet';
  if (status === 413) return `Essa foto é pesada demais para enviar (máximo 8 MB). Tente outra ou fotografe ${name} de novo.`;
  if (status === 400) return `Não conseguimos ler essa foto. Tente outra ou fotografe ${name} de novo.`;
  return null;
}
