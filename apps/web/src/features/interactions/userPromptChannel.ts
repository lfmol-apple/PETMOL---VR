type PromptKind = 'info' | 'confirm';
type PromptTone = 'neutral' | 'success' | 'warning' | 'danger';
type PromptNoticeVariant = 'toast' | 'notice';

export interface PromptRequest {
  kind: PromptKind;
  message: string;
}

export interface PromptNotice {
  id: number;
  kind: 'info';
  variant: PromptNoticeVariant;
  message: string;
  title?: string;
  tone: PromptTone;
  durationMs: number;
}

export interface PromptDecisionRequest {
  id: number;
  kind: 'confirm';
  message: string;
  title?: string;
  tone: PromptTone;
  confirmLabel: string;
  cancelLabel: string;
}

export interface PromptChannelState {
  notice: PromptNotice | null;
  confirm: PromptDecisionRequest | null;
}

interface PromptDecisionOptions {
  title?: string;
  tone?: PromptTone;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface BlockingNoticeOptions {
  title?: string;
  tone?: PromptTone;
}

interface ToastOptions {
  title?: string;
  tone?: Exclude<PromptTone, 'danger'>;
  durationMs?: number;
}

interface PendingDecisionRequest {
  request: PromptDecisionRequest;
  resolve: (value: boolean) => void;
}

let lastPrompt: PromptRequest | null = null;
let promptSequence = 0;
let activeNotice: PromptNotice | null = null;
let activeConfirm: PromptDecisionRequest | null = null;
const confirmQueue: PendingDecisionRequest[] = [];
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function nextPromptId(): number {
  promptSequence += 1;
  return promptSequence;
}

export function subscribePromptChannel(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPromptChannelState(): PromptChannelState {
  return {
    notice: activeNotice,
    confirm: activeConfirm,
  };
}

export function dismissPromptNotice(): void {
  if (!activeNotice) return;
  activeNotice = null;
  emitChange();
}

export function resolvePromptDecision(accepted: boolean): void {
  const currentRequest = confirmQueue.shift();
  currentRequest?.resolve(accepted);
  activeConfirm = confirmQueue[0]?.request ?? null;
  emitChange();
}

export function getLastPrompt(): PromptRequest | null {
  return lastPrompt;
}

export function clearLastPrompt(): void {
  lastPrompt = null;
}

export function showBlockingNotice(message: string, options: BlockingNoticeOptions = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  lastPrompt = { kind: 'info', message };
  activeNotice = {
    id: nextPromptId(),
    kind: 'info',
    variant: 'notice',
    message,
    title: options.title,
    tone: options.tone ?? 'warning',
    durationMs: 5200,
  };
  emitChange();
}

export function showAppToast(message: string, options: ToastOptions = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  lastPrompt = { kind: 'info', message };
  activeNotice = {
    id: nextPromptId(),
    kind: 'info',
    variant: 'toast',
    message,
    title: options.title,
    tone: options.tone ?? 'success',
    durationMs: options.durationMs ?? 2600,
  };
  emitChange();
}

export function requestUserDecision(
  message: string,
  options: PromptDecisionOptions = {},
): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  lastPrompt = { kind: 'confirm', message };
  const request: PromptDecisionRequest = {
    id: nextPromptId(),
    kind: 'confirm',
    message,
    title: options.title,
    tone: options.tone ?? 'warning',
    confirmLabel: options.confirmLabel ?? 'Confirmar',
    cancelLabel: options.cancelLabel ?? 'Cancelar',
  };

  activeNotice = null;

  return new Promise<boolean>((resolve) => {
    confirmQueue.push({ request, resolve });
    if (!activeConfirm) {
      activeConfirm = request;
    }
    emitChange();
  });
}

export function requestUserConfirmation(
  message: string,
  options: PromptDecisionOptions = {},
): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  return requestUserDecision(message, options);
}