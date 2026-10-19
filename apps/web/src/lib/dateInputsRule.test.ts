import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * REGRA DO PETMOL: todo campo de data usa <DateField> (digita no teclado; o ícone do calendário abre o seletor
 * do aparelho). Nada de <input type="date"> / datetime-local solto no app — só o DateField pode usá-los.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.next') walk(p, out); }
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe('regra de datas', () => {
  it('nenhum <input type="date"> ou datetime-local fora do DateField', () => {
    const offenders = walk(join(process.cwd(), 'src'))
      .filter((f) => !f.endsWith('components/ui/DateField.tsx'))
      .filter((f) => {
        // ignora comentários (ex.: "formato de <input type=\"date\">")
        const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        return /type=(\{?['"])(date|datetime-local)\1/.test(code);
      });
    expect(offenders).toEqual([]);
  });
});
