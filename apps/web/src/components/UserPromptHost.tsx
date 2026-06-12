'use client';

import { useEffect, useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import {
  dismissPromptNotice,
  getPromptChannelState,
  resolvePromptDecision,
  subscribePromptChannel,
  type PromptChannelState,
} from '@/features/interactions/userPromptChannel';

const NOTICE_TONE_STYLES = {
  neutral: 'border-slate-200 bg-white text-slate-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  danger: 'border-rose-200 bg-rose-50 text-rose-950',
};

const NOTICE_ACCENT_STYLES = {
  neutral: 'text-slate-500',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  danger: 'text-rose-600',
};

export function UserPromptHost() {
  const [state, setState] = useState<PromptChannelState>(getPromptChannelState);

  useEffect(() => subscribePromptChannel(() => setState(getPromptChannelState())), []);

  useEffect(() => {
    if (!state.notice || state.confirm) return;

    const timeout = window.setTimeout(() => {
      dismissPromptNotice();
    }, state.notice.durationMs);

    return () => window.clearTimeout(timeout);
  }, [state.confirm, state.notice]);

  if (!state.notice && !state.confirm) {
    return null;
  }

  return (
    <ModalPortal>
      {state.notice && !state.confirm && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[360] flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:bottom-4">
          <div
            className={`pointer-events-auto flex w-full ${state.notice.variant === 'toast' ? 'max-w-md rounded-2xl px-4 py-3' : 'max-w-xl rounded-3xl px-4 py-4'} items-start gap-3 border shadow-2xl ${NOTICE_TONE_STYLES[state.notice.tone]}`}
            role="status"
            aria-live="polite"
          >
            <span className={`mt-0.5 text-lg ${NOTICE_ACCENT_STYLES[state.notice.tone]}`}>
              {state.notice.tone === 'success' ? '✓' : state.notice.tone === 'danger' ? '!' : '•'}
            </span>
            <div className="min-w-0 flex-1">
              {state.notice.title && <p className="text-sm font-bold">{state.notice.title}</p>}
              <p className="whitespace-pre-line text-sm leading-relaxed">{state.notice.message}</p>
            </div>
            {state.notice.variant === 'notice' && (
              <button
                type="button"
                onClick={dismissPromptNotice}
                className="rounded-full px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-black/5"
              >
                Fechar
              </button>
            )}
          </div>
        </div>
      )}

      {state.confirm && (
        <div className="fixed inset-0 z-[370] flex items-end justify-center bg-slate-950/60 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-10 backdrop-blur-sm sm:items-center sm:pb-4">
          <div
            className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-prompt-title"
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 text-lg ${NOTICE_ACCENT_STYLES[state.confirm.tone]}`}>
                {state.confirm.tone === 'danger' ? '!' : '?'}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="user-prompt-title" className="text-base font-bold text-slate-900">
                  {state.confirm.title ?? 'Confirmar ação'}
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {state.confirm.message}
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => resolvePromptDecision(false)}
                className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {state.confirm.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => resolvePromptDecision(true)}
                className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition ${state.confirm.tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800'}`}
              >
                {state.confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalPortal>
  );
}
