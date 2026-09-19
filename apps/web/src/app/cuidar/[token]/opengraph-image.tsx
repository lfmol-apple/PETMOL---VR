import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Cartão de convite 1200×630. Toda a composição fica na faixa central
// (x 285–915): o WhatsApp/iMessage às vezes mostram a miniatura QUADRADA
// recortando o centro do 1.91:1 — o wordmark largo do og-image.png genérico
// saía cortado ("logo desfigurada"). Aqui nada importante encosta nas bordas.
export const runtime = 'nodejs';
export const alt = 'Convite PETMOL para cuidar do pet';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const SITE = 'https://www.petmol.com.br';

async function fetchPetInfo(token: string) {
  try {
    const base = process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:8000';
    const res = await fetch(`${base}/pets/join/${token}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as { pet_name: string; owner_name: string; photo_url: string | null };
  } catch {
    return null;
  }
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const abs = url.startsWith('http') ? url : `${SITE}${url.startsWith('/') ? '' : '/'}${url}`;
    const res = await fetch(abs, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? 'image/jpeg';
    if (!type.startsWith('image/') || type.includes('svg')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// Fonte bold (Inter 700) do jsDelivr/fontsource, em cache no processo. Sem
// ela o Satori só tem a fonte padrão sem negrito; se a rede falhar, o cartão
// sai igual mesmo assim (só sem o negrito).
let fontPromise: Promise<ArrayBuffer | null> | null = null;
function loadBoldFont(): Promise<ArrayBuffer | null> {
  fontPromise ??= (async () => {
    try {
      const res = await fetch(
        'https://cdn.jsdelivr.net/fontsource/fonts/inter@5.0.8/latin-700-normal.woff',
        { signal: AbortSignal.timeout(3000) },
      );
      return res.ok ? await res.arrayBuffer() : null;
    } catch {
      return null;
    }
  })();
  return fontPromise.then((f) => { if (!f) fontPromise = null; return f; });
}

async function loadMark(): Promise<string | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', 'brand', 'petmol-mark-transparent.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await fetchPetInfo(token);
  const [photo, mark, font] = await Promise.all([
    info?.photo_url ? toDataUrl(info.photo_url) : Promise.resolve(null),
    loadMark(),
    loadBoldFont(),
  ]);

  const petName = info?.pet_name ?? 'seu pet';
  const owner = (info?.owner_name ?? 'Alguém').split(' ')[0];
  const nameSize = petName.length > 14 ? 60 : petName.length > 9 ? 72 : 84;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 30%, #2F80FF 0%, #0056D2 45%, #06369A 100%)',
          color: '#fff',
          fontFamily: font ? 'Inter' : 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 236,
            height: 236,
            borderRadius: 236,
            border: '8px solid rgba(255,255,255,0.95)',
            boxShadow: '0 24px 60px rgba(2,20,80,0.45)',
            background: 'rgba(255,255,255,0.14)',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {photo ? (
            <img src={photo} width={236} height={236} style={{ width: 236, height: 236, objectFit: 'cover' }} alt="" />
          ) : mark ? (
            <img src={mark} width={112} height={129} style={{ width: 112, height: 129, objectFit: 'contain' }} alt="" />
          ) : (
            <div style={{ fontSize: 96, display: 'flex' }}>🐾</div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 30,
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: 0,
            opacity: 0.92,
          }}
        >
          {`${owner} te convidou para cuidar de`}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 4,
            fontSize: nameSize,
            fontWeight: 800,
            letterSpacing: -1,
            maxWidth: 580,
            textAlign: 'center',
            justifyContent: 'center',
          }}
        >
          {petName}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', marginTop: 26, gap: 12, opacity: 0.95 }}>
          {mark ? (
            <img src={mark} width={26} height={30} style={{ width: 26, height: 30, objectFit: 'contain' }} alt="" />
          ) : null}
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 4 }}>PETMOL</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: 'Inter', data: font, weight: 700, style: 'normal' as const }] : undefined,
    },
  );
}
