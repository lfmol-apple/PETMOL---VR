/**
 * Código de produto lido pela câmera: código de barras (EAN/UPC) ou QR code.
 * QR de produto costuma ser um link GS1 ("https://…/01/<GTIN>") ou trazer o GTIN num parâmetro; QR de qualquer outra
 * coisa (site, WhatsApp, cupom) NÃO é produto e é ignorado — o leitor continua procurando.
 */

/** Dígito verificador GS1 (módulo 10) para GTIN-8/12/13/14. */
export function isValidGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

/** GTIN-14 com zeros à esquerda (padrão do link GS1) → o EAN-13/12/8 que o catálogo usa. */
function trimGtin14(code: string): string {
  if (code.length !== 14) return code;
  const t13 = code.replace(/^0/, '');
  return isValidGtin(t13) ? t13 : code;
}

export function gtinFromQr(text: string): string | null {
  const t = (text || '').trim();
  if (!t) return null;
  if (/^\d{8,14}$/.test(t)) return isValidGtin(t) ? trimGtin14(t) : null;
  const ai = t.match(/^\(01\)(\d{14})/);
  if (ai) return isValidGtin(ai[1]) ? trimGtin14(ai[1]) : null;
  let url: URL;
  try { url = new URL(t); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const seg = url.pathname.split('/').filter(Boolean);
  const i = seg.indexOf('01');
  if (i >= 0 && /^\d{14}$/.test(seg[i + 1] ?? '') && isValidGtin(seg[i + 1])) return trimGtin14(seg[i + 1]);
  for (const key of ['gtin', 'ean', 'barcode', 'gtin14', 'upc']) {
    const v = url.searchParams.get(key)?.trim();
    if (v && /^\d{8,14}$/.test(v) && isValidGtin(v)) return trimGtin14(v);
  }
  return null;
}
