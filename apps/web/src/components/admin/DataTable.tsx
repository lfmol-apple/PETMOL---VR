'use client';

import { type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns, rows, sort, direction, onSort, rowKey, onRowClick, empty = 'Nenhum registro.',
}: {
  columns: Column<T>[];
  rows: T[];
  sort?: string;
  direction?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {columns.map((c) => (
              <th key={c.key} className={`px-3 py-2.5 ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.sortable && onSort ? (
                  <button type="button" onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 hover:text-slate-800">
                    {c.header}
                    {sort === c.key && <span>{direction === 'asc' ? '▲' : '▼'}</span>}
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-slate-100 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-blue-50/40' : ''}`}>
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2.5 align-middle ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page, pageSize, total, onPage,
}: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-3 flex items-center justify-between text-[12px] text-slate-500">
      <span>
        {total === 0 ? '0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`} de {total.toLocaleString('pt-BR')}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="rounded-md border border-slate-200 px-2.5 py-1 disabled:opacity-40 hover:bg-slate-50">Anterior</button>
        <span className="px-2 tabular-nums">{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}
          className="rounded-md border border-slate-200 px-2.5 py-1 disabled:opacity-40 hover:bg-slate-50">Próxima</button>
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = 'max-w-2xl' }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40" />
      <div className={`relative flex h-full w-full ${width} flex-col overflow-hidden bg-white shadow-2xl`}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="min-w-0 text-[15px] font-bold text-slate-900">{title}</div>
          <button type="button" onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 text-[13px] font-semibold text-slate-500 hover:bg-slate-200">Fechar</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function StatePill({ state }: { state: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    stale: 'bg-amber-100 text-amber-700',
    inactive: 'bg-rose-100 text-rose-700',
    never_configured: 'bg-slate-100 text-slate-500',
    // activity
    recent: 'bg-blue-100 text-blue-700',
    cooling: 'bg-amber-100 text-amber-700',
    dormant: 'bg-slate-200 text-slate-600',
    no_analytics: 'bg-slate-100 text-slate-400',
  };
  const label: Record<string, string> = {
    active: 'ativo', stale: 'defasado', inactive: 'inativo', never_configured: 'nunca configurou',
    recent: 'recente', cooling: 'esfriando', dormant: 'dormente', no_analytics: 'sem analytics',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[state] || 'bg-slate-100 text-slate-500'}`}>
      {label[state] || state}
    </span>
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
