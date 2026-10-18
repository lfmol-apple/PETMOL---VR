/** Link do WhatsApp: com número abre a conversa (sem texto pronto); sem número só abre o WhatsApp. */
export function whatsAppHref(phone?: string | null): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return 'whatsapp://';
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${normalized}`;
}
