'use client';

import { useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

/**
 * Denunciar um alerta de pet perdido — exigência da App Store 1.2
 * (conteúdo gerado por usuário). Qualquer pessoa que vê o alerta pode
 * denunciar; no backend, 2 denúncias de fontes distintas derrubam o alerta.
 */

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'foto_impropria', label: 'Foto imprópria ou ofensiva' },
  { value: 'golpe_info_falsa', label: 'Golpe ou informação falsa' },
  { value: 'nao_e_pet_perdido', label: 'Não é um pet perdido de verdade' },
  { value: 'spam', label: 'Spam ou propaganda' },
  { value: 'outro', label: 'Outro motivo' },
];

interface ReportAlertSheetProps {
  alertId: string;
  petName?: string;
  open: boolean;
  onClose: () => void;
}

export function ReportAlertSheet({ alertId, petName, open, onClose }: ReportAlertSheetProps) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'form' | 'sending' | 'done'>('form');

  if (!open) return null;

  const submit = async () => {
    if (!reason) return;
    setState('sending');
    try {
      const token = getToken();
      await fetch(`${API_BASE_URL}/missing-pets/${alertId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ reason, note: note.trim() || null }),
      });
    } catch {
      /* silencioso — a denúncia não pode falhar de forma barulhenta */
    }
    setState('done');
  };

  const close = () => {
    setReason(null);
    setNote('');
    setState('form');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" onClick={close}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-t-[28px] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        {state === 'done' ? (
          <div className="py-4 text-center">
            <p className="text-[17px] font-black text-slate-900">Denúncia enviada</p>
            <p className="mt-1.5 text-[13px] text-slate-500">
              Obrigado. Vamos revisar este alerta. Se outras pessoas também denunciarem, ele sai do ar na hora.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-4 w-full rounded-2xl bg-[#0056D2] py-3 text-[15px] font-black text-white active:scale-[0.98]"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <p className="text-[17px] font-black text-slate-900">
              Denunciar o alerta{petName ? ` de ${petName}` : ''}
            </p>
            <p className="mt-1 text-[13px] text-slate-500">Por que este alerta é impróprio?</p>
            <div className="mt-3 space-y-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-[14px] font-semibold transition-colors ${
                    reason === r.value
                      ? 'border-[#0056D2] bg-blue-50 text-[#0056D2]'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <span
                    className={`h-4 w-4 flex-shrink-0 rounded-full border-2 ${
                      reason === r.value ? 'border-[#0056D2] bg-[#0056D2]' : 'border-slate-300'
                    }`}
                  />
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Detalhe se quiser (opcional)"
              className="mt-3 w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none focus:border-[#0056D2]"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-2xl bg-slate-100 py-3 text-[15px] font-bold text-slate-600 active:scale-[0.98]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!reason || state === 'sending'}
                onClick={submit}
                className="flex-1 rounded-2xl bg-red-600 py-3 text-[15px] font-black text-white active:scale-[0.98] disabled:opacity-40"
              >
                {state === 'sending' ? 'Enviando…' : 'Denunciar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
