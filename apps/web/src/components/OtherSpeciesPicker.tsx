'use client';

import { useState } from 'react';
import { PET_SPECIES } from '@/lib/petTaxonomy';

/**
 * Para quem não tem cão nem gato: atalhos de um toque (pássaro, coelho, hamster, peixe) e um campo
 * livre e OPCIONAL para qualquer outro bicho. Nada é obrigatório — "Outro" sozinho já cadastra.
 * O valor guardado em `species` é o id do atalho ('bird', 'rabbit'…), o texto livre (2–24 letras) ou 'other'.
 */
const CHIP_IDS = ['bird', 'rabbit', 'hamster', 'fish'] as const;
const MAX_LEN = 24;

const chipClass = (active: boolean) =>
  `rounded-full border-2 px-3.5 py-2 text-[13px] font-semibold transition-all ${
    active ? 'border-[#0056D2] bg-blue-50 text-[#0047ad]' : 'border-slate-300 bg-white text-slate-600'
  }`;

export function OtherSpeciesPicker({ value, onChange }: { value: string; onChange: (species: string) => void }) {
  const isChip = (CHIP_IDS as readonly string[]).includes(value);
  const [text, setText] = useState(!isChip && value !== 'other' ? value : '');

  const chips = CHIP_IDS.map((id) => PET_SPECIES.find((s) => s.id === id)!);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {chips.map((s) => (
          <button
            key={s.id}
            type="button"
            className={chipClass(value === s.id)}
            onClick={() => { setText(''); onChange(value === s.id ? 'other' : s.id); }}
          >
            {s.icon} {s['pt-BR']}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={text}
        maxLength={MAX_LEN}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const t = v.trim();
          onChange(t.length >= 2 ? t.slice(0, MAX_LEN) : 'other');
        }}
        placeholder="Outro animal? Ex.: furão, tartaruga (opcional)"
        className="w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-[14px] text-slate-900 outline-none focus:border-blue-500"
      />
    </div>
  );
}
