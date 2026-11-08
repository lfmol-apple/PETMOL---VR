import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * REGRA DO PETMOL (ver docs/ESPECIES.md): o app não pode cair em descrédito mostrando para um coelho, um cavalo
 * ou um peixe algo que só vale para cão e gato. Por isso NENHUM controle, card, aviso ou texto decide por conta
 * própria com `species === 'dog'` / `'cat'`: tudo passa por `lib/speciesCare.ts`.
 *
 * Este teste congela o que já existe (a lista abaixo). Código novo que compare espécie direto FALHA aqui, e a
 * mensagem diz o que fazer. Os usos listados são os legítimos (listas de raças, domínio do cio, taxonomia) ou
 * restringem A cão/gato (nunca fazem o bicho "cair" no padrão de cão).
 */
const PATTERN = /species\s*(?:===|!==|==|!=)\s*['"](?:dog|cat)['"]|['"](?:dog|cat)['"]\s*(?:===|!==|==|!=)\s*[\w.?]*species/g;

const BASELINE: Record<string, number> = {
  'app/diag-hero-tmp/page.tsx': 2,
  'components/AddPetModal.tsx': 4,
  'components/EditPetModal.tsx': 4,
  'components/home/HealthModal.tsx': 4,
  'components/home/HealthParasiteControlPanel.tsx': 2,
  'components/home/HeatCycle.tsx': 1,
  'components/home/VaccineWorkflowModals.tsx': 1,
  'features/product-detection/foodParser.ts': 2,
  'lib/heatCycles.ts': 3,
  'lib/leishmaniaseAwareness.ts': 1,
  'lib/petTaxonomy.ts': 2,
  'lib/smartSuggestions.ts': 1,
  'lib/speciesCare.ts': 5,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.next') walk(p, out); }
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe('regra de espécies', () => {
  it('nenhuma comparação nova de species com "dog"/"cat" fora do baseline — use lib/speciesCare.ts', () => {
    const root = join(process.cwd(), 'src');
    const found: Record<string, number> = {};
    for (const f of walk(root)) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const n = (code.match(PATTERN) ?? []).length;
      if (n) found[relative(root, f)] = n;
    }
    const grew = Object.entries(found)
      .filter(([f, n]) => n > (BASELINE[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} comparação(ões) (permitido ${BASELINE[f] ?? 0})`);
    expect(
      grew,
      'Comparar species com "dog"/"cat" direto na tela faz coelho, cavalo e peixe caírem no padrão de cão. ' +
        'Declare a capacidade em lib/speciesCare.ts (ex.: care.walk) e use-a aqui. Veja docs/ESPECIES.md.',
    ).toEqual([]);
  });
});
