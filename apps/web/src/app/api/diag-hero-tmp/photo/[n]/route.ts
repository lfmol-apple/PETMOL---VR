import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// ROTA TEMPORÁRIA DE DIAGNÓSTICO — NÃO É PARA PRODUÇÃO.
// Serve, só em dev local, fotos reais de pets (amostra aleatória de 30,
// lida só-leitura da produção via SSH em 07/10/2026 para validar a
// composição de hero da Home contra fotos reais, não só mockup).
// As imagens ficam FORA do repositório (scratchpad da sessão), nunca
// em apps/web/public, justamente para não correr risco de virarem
// parte do git. Apagar esta rota + app/diag-hero-tmp quando a
// investigação terminar (ver app/diag-hero-tmp/page.tsx).
const SAMPLE_DIR =
  '/private/tmp/claude-501/-Users-leonardomol-REPOSIT-RIO-MOL-PETMOL---VR/2cd4a4a9-079c-416f-b444-0387f336420c/scratchpad/hero_proto/real_sample_prod/final';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ n: string }> }) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('not found', { status: 404 });
  }
  const { n } = await params;
  if (!/^\d{1,2}$/.test(n)) {
    return new NextResponse('bad request', { status: 400 });
  }
  const idx = parseInt(n, 10);
  if (idx < 1 || idx > 30) {
    return new NextResponse('not found', { status: 404 });
  }
  const file = path.join(SAMPLE_DIR, `${String(idx).padStart(2, '0')}.jpg`);
  try {
    const bytes = await readFile(file);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' },
    });
  } catch {
    return new NextResponse('not found', { status: 404 });
  }
}
