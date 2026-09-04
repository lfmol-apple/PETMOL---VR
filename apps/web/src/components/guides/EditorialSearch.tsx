'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { searchInIndex, type GuideSearchRecord } from '@/features/guides/search';

/**
 * Busca editorial dos Guias PETMOL. Client Component pequeno e isolado:
 * recebe o índice leve (sem o corpo dos guias) do servidor e filtra no
 * navegador. Não chama rede, não busca em marketplace — só reforça o
 * conteúdo próprio do PETMOL.
 */
export function EditorialSearch({ index }: { index: GuideSearchRecord[] }) {
  const [query, setQuery] = useState('');
  const listId = useId();
  const hits = useMemo(() => searchInIndex(index, query, 8), [index, query]);
  const q = query.trim();

  return (
    <section aria-labelledby="busca-guias" className="mt-8">
      <h2 id="busca-guias" className="sr-only">
        Buscar nos Guias PETMOL
      </h2>
      <div className="relative">
        <label htmlFor={`${listId}-input`} className="mb-1.5 block text-[13px] font-bold text-slate-600">
          Buscar nos Guias PETMOL
        </label>
        <input
          id={`${listId}-input`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ex.: ração, tapete higiênico, transporte..."
          autoComplete="off"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[14px] text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {q.length >= 2 && (
        <div id={listId} className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {hits.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-slate-500">
              Nenhum guia encontrado para “{q}”. Veja todos os temas mais abaixo na página.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {hits.map((hit) => (
                <li key={hit.slug}>
                  <Link
                    href={`/guias/${hit.slug}`}
                    className="flex flex-col gap-0.5 px-4 py-2.5 hover:bg-blue-50/50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[13.5px] font-bold leading-snug text-slate-900">{hit.title}</span>
                      {hit.hasTool && (
                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                          calculadora
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-2 text-[12px] leading-snug text-slate-500">{hit.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
