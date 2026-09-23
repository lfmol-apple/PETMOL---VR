import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable, Pagination, StatePill, fmtDate, fmtDateTime, fmtDateTimeFull, type Column } from './DataTable';

interface Row { id: string; name: string; n: number }

const cols: Column<Row>[] = [
  { key: 'name', header: 'Nome', render: (r) => r.name },
  { key: 'n', header: 'N', align: 'right', render: (r) => r.n },
];

describe('DataTable', () => {
  it('renders rows and the empty state', () => {
    const { rerender } = render(
      <DataTable columns={cols} rows={[{ id: 'a', name: 'Ana', n: 2 }]} rowKey={(r) => r.id} />,
    );
    expect(screen.getByText('Ana')).toBeTruthy();

    rerender(<DataTable columns={cols} rows={[]} rowKey={(r) => r.id} empty="vazio" />);
    expect(screen.getByText('vazio')).toBeTruthy();
  });
});

describe('Pagination', () => {
  it('computes the page window from total/pageSize', () => {
    render(<Pagination page={2} pageSize={50} total={120} onPage={() => {}} />);
    expect(screen.getByText('51–100 de 120')).toBeTruthy();
    expect(screen.getByText('2 / 3')).toBeTruthy();
  });
});

describe('StatePill', () => {
  it('maps the deterministic feature states to pt-BR labels', () => {
    render(<><StatePill state="active" /><StatePill state="never_configured" /></>);
    expect(screen.getByText('ativo')).toBeTruthy();
    expect(screen.getByText('nunca configurou')).toBeTruthy();
  });
});

describe('fmtDate', () => {
  it('handles null / invalid', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('not-a-date')).toBe('—');
  });
});

describe('horários do painel — São Paulo, mesmo quando a API manda texto sem fuso', () => {
  it('fmtDateTime / fmtDateTimeFull leem texto sem fuso como UTC e mostram hora de SP', () => {
    expect(fmtDateTime('2026-09-23T22:00:00')).toBe('23/09/26 19:00');
    expect(fmtDateTime('2026-09-23T22:00:00+00:00')).toBe('23/09/26 19:00');
    expect(fmtDateTimeFull('2026-09-23T22:00:15')).toBe('23/09/2026 19:00:15');
  });
  it('fmtDate de data pura não desloca o dia', () => {
    expect(fmtDate('2020-01-01')).toBe('01/01/20');
  });
});
