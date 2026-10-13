'use client';

import { useState } from 'react';

// PÁGINA TEMPORÁRIA DE DIAGNÓSTICO — NÃO É PARA PRODUÇÃO, NÃO TEM LINK
// EM NENHUM MENU. Criada em 07/10/2026 pra validar a composição de hero
// (foto grande + nome/dados sobre a fotografia) contra uma amostra real
// de 30 fotos de pets, lida só-leitura da produção via SSH (não é mock,
// não é a foto do Baby usada no teste anterior). As fotos em si NUNCA
// entram no repositório — vêm de uma API route (/api/diag-hero-tmp/photo)
// que lê de um caminho fora do git (scratchpad da sessão). Apagar esta
// pasta inteira (e a rota /api/diag-hero-tmp) quando a investigação terminar.
//
// Amostra: 30 pets, aleatórios, via SELECT ... ORDER BY random() contra
// o Postgres de produção (só leitura, nenhum registro alterado). De 32
// sorteados originalmente, 2 foram descartados nesta etapa por mostrarem
// rosto humano identificável na foto (selfie tutor+pet) — não cabem num
// teste que não deve expor ninguém, mesmo sendo dado de produção real.
//
// A e B aplicam a MESMA regra de CSS em todas as 30 fotos (object-fit:
// cover, mesmo gradiente, mesma posição de texto) — nenhum ajuste
// manual por foto, de propósito, pra não contaminar a leitura de quais
// enquadramentos reais funcionam ou não.

type Meta = { species: 'dog' | 'cat'; breed: string };

// Só espécie/raça — sem nome do pet, sem qualquer dado do tutor.
const SAMPLE: Meta[] = [
  { species: 'cat', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'Golden Retriever' },
  { species: 'dog', breed: 'Pinscher Miniatura' },
  { species: 'dog', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'Golden Retriever' },
  { species: 'dog', breed: 'Shih Tzu' },
  { species: 'dog', breed: 'Pomerânia (Spitz Anão)' },
  { species: 'dog', breed: 'Pinscher Miniatura' },
  { species: 'dog', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'Pinscher Miniatura' },
  { species: 'dog', breed: 'Poodle Médio' },
  { species: 'dog', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'Golden Retriever' },
  { species: 'dog', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'Golden Retriever' },
  { species: 'dog', breed: 'Dachshund (Salsicha)' },
  { species: 'dog', breed: 'Shih Tzu' },
  { species: 'dog', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'Husky Siberiano' },
  { species: 'cat', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'Bulldog Francês' },
  { species: 'dog', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'Pomerânia (Spitz Anão)' },
  { species: 'dog', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'Yorkshire Terrier' },
  { species: 'dog', breed: 'SRD (Sem Raça Definida)' },
  { species: 'dog', breed: 'SRD (Sem Raça Definida)' },
];

const WIDTHS = { mobile: 390, desktop: 688 } as const;

function Frame({ n, variant, width }: { n: number; width: number; variant: 'orig' | 'a' | 'b' | 'c' | 'd' }) {
  const src = `/api/diag-hero-tmp/photo/${n}`;
  const style: React.CSSProperties = {
    width,
    aspectRatio: '1.25/1',
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    border: '1px solid #e2e5ea',
    flex: '0 0 auto',
    background: '#eee',
  };

  if (variant === 'orig') {
    return (
      <div style={style}>
        <img src={src} alt={`Foto ${n}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  if (variant === 'c') {
    return (
      <div style={{ width, display: 'flex', flexDirection: 'column', gap: 8, flex: '0 0 auto' }}>
        <div style={{ ...style, width: '100%' }}>
          <img src={src} alt={`Foto ${n}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e5ea', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Pet</div>
          <div style={{ fontSize: 12, color: '#5b6472' }}>{SAMPLE[n - 1]?.breed}</div>
        </div>
      </div>
    );
  }
  if (variant === 'd') {
    // Faixa de identidade — mesma composição de apps/web/src/components/
    // home/HomePetHeader.tsx (heroVariant="strip", padrão atual): foto
    // livre de texto, uma moldura só (borda/raio/sombra compartilhados),
    // faixa azul-gelo colada embaixo, sem linha divisória.
    const meta = SAMPLE[n - 1];
    const metaLine = meta ? `${meta.species === 'cat' ? 'Gato' : 'Cão'} • macho` : '';
    return (
      <div style={{ width, flex: '0 0 auto' }}>
        <div style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid #e2e5ea', boxShadow: '0 4px 14px -4px rgba(15,23,42,.12)' }}>
          <div style={{ width: '100%', aspectRatio: '1.25/1', position: 'relative' }}>
            <img src={src} alt={`Foto ${n}`} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
            <div style={{ position: 'absolute', left: 10, top: 10, width: 30, height: 30, borderRadius: 999, background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.4)' }} />
            <div style={{ position: 'absolute', right: 10, bottom: 10, width: 28, height: 28, borderRadius: 999, background: 'rgba(255,255,255,.22)', border: '1px solid rgba(255,255,255,.4)' }} />
          </div>
          <div style={{ background: '#F2F6FC', padding: '10px 14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: '#15181E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Pet</div>
              <div style={{ fontSize: 11.5, color: '#5b6472', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{metaLine}</div>
              <div style={{ fontSize: 11.5, color: '#96a0ad', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta?.breed}</div>
            </div>
            <div style={{ flexShrink: 0, border: '1px solid #BFD4F0', background: '#fff', color: '#0056D2', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '5px 10px', whiteSpace: 'nowrap' }}>
              ⇄ Trocar pet
            </div>
          </div>
        </div>
      </div>
    );
  }
  const isA = variant === 'a';
  return (
    <div style={style}>
      <img src={src} alt={`Foto ${n}`} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: isA ? 'center' : 'flex-end',
          background: isA
            ? 'linear-gradient(90deg, rgba(10,12,16,.72) 0%, rgba(10,12,16,.4) 42%, rgba(10,12,16,0) 68%)'
            : 'linear-gradient(0deg, rgba(8,10,14,.78) 0%, rgba(8,10,14,.3) 48%, rgba(8,10,14,0) 72%)',
        }}
      >
        <div
          style={{
            color: '#fff',
            padding: isA ? '0 0 0 5%' : '0 5% 6%',
            width: isA ? undefined : '100%',
            maxWidth: isA ? '62%' : undefined,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1 }}>Pet</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>{SAMPLE[n - 1]?.breed}</div>
          <div
            style={{
              display: 'inline-flex',
              width: 'fit-content',
              border: '1px solid rgba(255,255,255,.55)',
              borderRadius: 999,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 700,
              marginTop: 2,
            }}
          >
            ⇄ Trocar pet
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HeroDiagPage() {
  const [bp, setBp] = useState<'mobile' | 'desktop'>('desktop');
  const [verdicts, setVerdicts] = useState<Record<string, 'bom' | 'aceitavel' | 'ruim' | ''>>({});

  const setV = (key: string, v: 'bom' | 'aceitavel' | 'ruim') =>
    setVerdicts((prev) => ({ ...prev, [key]: prev[key] === v ? '' : v }));

  const width = WIDTHS[bp];

  const totals = (variant: 'a' | 'b' | 'c' | 'd') => {
    const vals = SAMPLE.map((_, i) => verdicts[`${i + 1}-${variant}`] || '');
    const bom = vals.filter((v) => v === 'bom').length;
    const ok = vals.filter((v) => v === 'aceitavel').length;
    const ruim = vals.filter((v) => v === 'ruim').length;
    const classified = bom + ok + ruim;
    return { bom, ok, ruim, classified };
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#f6f7f9', minHeight: '100vh', padding: '24px 20px 80px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ marginBottom: 8, fontSize: 11, fontFamily: 'monospace', color: '#0056D2', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Diagnóstico local · não é produção
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>Hero da Home — amostra real (n=30)</h1>
        <p style={{ color: '#5b6472', maxWidth: 760, lineHeight: 1.5, margin: '0 0 16px' }}>
          30 fotos reais de pets, amostra aleatória lida só-leitura da produção em 07/10/2026 (de um universo de 584
          pets com foto, 479 tutores distintos). 2 fotos sorteadas foram descartadas por mostrar rosto humano
          identificável. Mesma regra de CSS aplicada a todas — nenhum ajuste manual por foto.
        </p>
        <p style={{ color: '#5b6472', maxWidth: 760, lineHeight: 1.5, margin: '0 0 16px' }}>
          <b style={{ color: '#15181E' }}>D</b> é a variante adicionada em 07/10/2026 (2ª rodada): foto totalmente
          livre de texto + faixa de identidade colada embaixo, mesma composição implementada em
          HomePetHeader.tsx (heroVariant=&quot;strip&quot;, padrão atual). A/B/C continuam aqui só de referência —
          não é mais necessário classificá-las de novo.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 28, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#5b6472' }}>Largura:</span>
          {(['mobile', 'desktop'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setBp(k)}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid #0056D2',
                background: bp === k ? '#0056D2' : '#fff',
                color: bp === k ? '#fff' : '#0056D2',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {k === 'mobile' ? 'Mobile · 390px' : 'Desktop · 688px'}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 28, background: '#fff', border: '1px solid #e2e5ea', borderRadius: 14, padding: '14px 18px' }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Totais (classificado até agora)</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
            {(['a', 'b', 'c', 'd'] as const).map((v) => {
              const t = totals(v);
              return (
                <div key={v}>
                  <b>{v.toUpperCase()}</b>: bom {t.bom}/30 · aceitável {t.ok}/30 · ruim {t.ruim}/30{' '}
                  <span style={{ color: '#96a0ad' }}>({t.classified}/30 classificadas)</span>
                </div>
              );
            })}
          </div>
        </div>

        {SAMPLE.map((meta, i) => {
          const n = i + 1;
          return (
            <div key={n} style={{ marginBottom: 36, paddingBottom: 24, borderBottom: '1px solid #e2e5ea' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                Foto {String(n).padStart(2, '0')} <span style={{ color: '#96a0ad', fontWeight: 400 }}>— {meta.species === 'cat' ? 'gato' : 'cão'}, {meta.breed}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
                {(['orig', 'a', 'b', 'c', 'd'] as const).map((variant) => (
                  <div key={variant}>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#5b6472', marginBottom: 6, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span>{variant === 'orig' ? 'ORIGINAL' : variant.toUpperCase()}</span>
                      {variant !== 'orig' && (
                        <span style={{ display: 'flex', gap: 4 }}>
                          {(['bom', 'aceitavel', 'ruim'] as const).map((v) => {
                            const key = `${n}-${variant}`;
                            const active = verdicts[key] === v;
                            const color = v === 'bom' ? '#0F8A5F' : v === 'aceitavel' ? '#B5790A' : '#C2293B';
                            return (
                              <button
                                key={v}
                                onClick={() => setV(key, v)}
                                style={{
                                  fontSize: 10,
                                  padding: '2px 6px',
                                  borderRadius: 999,
                                  border: `1px solid ${color}`,
                                  background: active ? color : 'transparent',
                                  color: active ? '#fff' : color,
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                }}
                              >
                                {v}
                              </button>
                            );
                          })}
                        </span>
                      )}
                    </div>
                    <Frame n={n} variant={variant} width={width} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
