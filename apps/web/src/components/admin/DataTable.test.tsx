import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable, Pagination, StatePill, fmtDate, type Column } from './DataTable';

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
