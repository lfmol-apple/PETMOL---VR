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
