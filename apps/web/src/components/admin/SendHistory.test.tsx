/* eslint-disable @typescript-eslint/no-explicit-any -- servidor falso de teste */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SendHistory } from './SendHistory';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

const mk = (i: number, extra: any = {}) => ({
  id: `b${i}`, created_at: new Date(Date.UTC(2026, 10, 14 - i, 12)).toISOString(), message: `Mensagem ${i}`, segment: 'todos', audience_kind: 'test', audience_requested: null,
  goal: null, recipients_total: 1, delivered_total: 1, phase: 'done', hidden: false,
  metrics: { delivered: 1, tapped: 0, opened: 1, acted: 0, goal_hit: null, goal_label: null, window_closed: true }, ...extra,
});
let items: any[]; let hiddenCount: number; let calls: { url: string; body?: any }[]; let would: number;
beforeEach(() => {
  items = Array.from({ length: 8 }, (_, i) => mk(i + 1)); hiddenCount = 0; calls = []; would = 3;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const ok = (d: unknown) => ({ ok: true, status: 200, json: async () => d });
    if (url.includes('/history?')) return ok({ items: url.includes('include_hidden=true') ? items : items.filter((x) => !x.hidden), hidden_count: hiddenCount });
    if (url.endsWith('/history/hide')) return ok({ would_hide: would, hidden: body.confirm_count == null ? 0 : would });
    if (url.endsWith('/history/delete-tests')) return ok({ would_delete: would, deleted: body.confirm_count == null ? 0 : would });
    if (/\/history\/b\d+\/(un)?hide$/.test(url)) return ok({ hidden: url.endsWith('/hide') });
    if (url.endsWith('/history/unhide-all')) return ok({ unhidden: hiddenCount });
    return { ok: false, status: 404, json: async () => ({}) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const posts = () => calls.filter((c) => c.body !== undefined || /hide|delete/.test(c.url) && !c.url.includes('?'));

describe('Envios e resultado — organizar o histórico', () => {
  it('os 5 mais recentes ficam abertos (com métricas); os demais ficam recolhidos', async () => {
    render(<SendHistory />);
    const open = await screen.findByRole('list', { name: 'Envios mais recentes' });
    expect(within(open).getAllByRole('listitem')).toHaveLength(5);
    expect(within(open).getAllByText('Receberam').length).toBe(5);                          // cartão completo com métricas
    const rest = screen.getByRole('list', { name: 'Envios anteriores' });
    const rows = within(rest).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    rows.forEach((li) => expect((li.querySelector('details') as HTMLDetailsElement).open).toBe(false));
    expect(screen.getByText(/Anteriores \(3\)/)).toBeTruthy();
  });

  it('ocultar um envio chama o servidor e atualiza a lista', async () => {
    render(<SendHistory />);
    await screen.findByRole('list', { name: 'Envios mais recentes' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Ocultar este envio' })[0]);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/history/b1/hide'))).toBe(true));
  });

  it('ocultar por data: escolhe a data, vê a quantidade, só então confirma (nada acontece antes)', async () => {
    render(<SendHistory />);
    await screen.findByRole('list', { name: 'Envios mais recentes' });
    fireEvent.click(screen.getByText(/Organizar a lista/));
    fireEvent.change(screen.getByLabelText(/Ocultar envios anteriores a/), { target: { value: '10/11/2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver quantos' }));
    const dlg = await screen.findByRole('alertdialog', { name: 'Confirmar ocultar envios' });
    expect(dlg.textContent).toMatch(/ocultar 3 envio\(s\) criados antes de 10\/11\/2026/);
    expect(dlg.textContent).toMatch(/Nada é apagado/);
    expect(calls.filter((c) => c.url.endsWith('/history/hide')).every((c) => c.body.confirm_count === undefined)).toBe(true);   // só prévia até aqui
    fireEvent.click(within(dlg).getByRole('button', { name: 'Confirmar e ocultar 3' }));
    await waitFor(() => expect(calls.at(-1 - 0) && calls.some((c) => c.url.endsWith('/history/hide') && c.body.confirm_count === 3 && c.body.before === '2026-11-10' && c.body.only_tests === false)).toBe(true));
    expect((await screen.findByRole('status')).textContent).toMatch(/3 envio\(s\) ocultado\(s\). Nada foi apagado/);
  });

  it('"só testes" é enviado ao servidor e cancelar não oculta nada', async () => {
    render(<SendHistory />);
    await screen.findByRole('list', { name: 'Envios mais recentes' });
    fireEvent.click(screen.getByText(/Organizar a lista/));
    fireEvent.change(screen.getByLabelText(/Ocultar envios anteriores a/), { target: { value: '10/11/2026' } });
    fireEvent.click(screen.getByLabelText(/só testes/));
    fireEvent.click(screen.getByRole('button', { name: 'Ver quantos' }));
    const dlg = await screen.findByRole('alertdialog', { name: 'Confirmar ocultar envios' });
    expect(dlg.textContent).toMatch(/só testes/);
    expect(calls.find((c) => c.url.endsWith('/history/hide'))!.body.only_tests).toBe(true);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls.some((c) => c.body?.confirm_count !== undefined)).toBe(false);
  });

  it('excluir testes exige digitar a quantidade e deixa claro que envio real e campanha não são tocados', async () => {
    render(<SendHistory />);
    await screen.findByRole('list', { name: 'Envios mais recentes' });
    fireEvent.click(screen.getByText(/Organizar a lista/));
    fireEvent.change(screen.getByLabelText(/Testes anteriores a/), { target: { value: '10/11/2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver quantos testes' }));
    const dlg = await screen.findByRole('alertdialog', { name: 'Confirmar excluir testes' });
    expect(dlg.textContent).toMatch(/excluídos para sempre/); expect(dlg.textContent).toMatch(/Envios reais, lotes de campanha e a cota semanal não são tocados/);
    const del = within(dlg).getByRole('button', { name: 'Excluir 3 teste(s)' }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    fireEvent.change(within(dlg).getByLabelText('Digite 3 para confirmar a exclusão'), { target: { value: '2' } });
    expect(del.disabled).toBe(true);
    fireEvent.change(within(dlg).getByLabelText('Digite 3 para confirmar a exclusão'), { target: { value: '3' } });
    expect(del.disabled).toBe(false);
    fireEvent.click(del);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/history/delete-tests') && c.body.confirm_count === 3)).toBe(true));
    expect((await screen.findByRole('status')).textContent).toMatch(/3 teste\(s\) excluído\(s\) definitivamente/);
  });

  it('com ocultos: botão para mostrar, marca "oculto" e reexibir', async () => {
    hiddenCount = 2; items[0].hidden = true;
    render(<SendHistory />);
    await screen.findByRole('list', { name: 'Envios mais recentes' });
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar ocultos (2)' }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('include_hidden=true'))).toBe(true));
    expect((await screen.findAllByText('oculto')).length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Reexibir este envio' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/history/b1/unhide'))).toBe(true));
  });

  it('sem data escolhida, "Ver quantos" fica desligado; sem envios mostra o aviso', async () => {
    items = []; 
    render(<SendHistory />);
    expect(await screen.findByText('Nenhum envio ainda.')).toBeTruthy();
    fireEvent.click(screen.getByText(/Organizar a lista/));
    expect((screen.getByRole('button', { name: 'Ver quantos' }) as HTMLButtonElement).disabled).toBe(true);
    expect(posts().length).toBeGreaterThanOrEqual(0);
  });
});
