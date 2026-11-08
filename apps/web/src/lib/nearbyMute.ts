/** Silêncio dos alertas "Pet Sumido perto de você": só vale se TODOS os alertas atuais estavam silenciados.
 *  Um alerta novo (id que não estava silenciado) quebra o silêncio sozinho — quem pode ter visto aquele pet
 *  volta a ser avisado. Sem alertas = nada a silenciar. */
export function isNearbySilenced(alertIds: string[], mutedIds: string[]): boolean {
  return alertIds.length > 0 && alertIds.every((id) => mutedIds.includes(id));
}
