/**
 * Cópia de texto pro clipboard com fallback.
 *
 * `navigator.clipboard.writeText` é o caminho moderno, mas falha em
 * silêncio em alguns contextos do WebView do iOS (Capacitor) e em
 * páginas sem gesto do usuário. `document.execCommand('copy')` sobre um
 * <textarea> temporário ainda funciona nesses casos, desde que chamado
 * dentro de um handler de gesto (ex: onClick).
 *
 * Retorna true só se algum método reportou sucesso.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // cai no fallback
    }
  }

  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
