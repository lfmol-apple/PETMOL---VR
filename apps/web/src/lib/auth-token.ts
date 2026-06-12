/**
 * auth-token.ts
 * Módulo centralizado para gerenciamento do token JWT do PETMOL.
 *
 * Mantém o token em memória (módulo JS) como fonte primária.
 * localStorage é usado apenas para persistência entre abas e recarregamentos.
 * sessionStorage é usado como fallback extra para a aba atual.
 *
 * Assim o app NUNCA depende exclusivamente de dados do navegador:
 * - Limpeza de cache não derruba a sessão ativa
 * - Modo privado/incógnito funciona normalmente (sessionStorage disponível)
 * - Código em qualquer arquivo pode chamar getToken() sem precisar do contexto React
 */

const TOKEN_KEY = 'petmol_token';

// Fonte primária: memória do módulo JS (persiste enquanto o tab estiver aberto)
let _memoryToken: string | null = null;

function _safeGet(storage: Storage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}

function _safeSet(storage: Storage, key: string, value: string): void {
  try { storage.setItem(key, value); } catch { /* storage bloqueado ou cheio */ }
}

function _safeRemove(storage: Storage, key: string): void {
  try { storage.removeItem(key); } catch { /* ignore */ }
}

function _readCookieToken(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(/(?:^|;\s*)petmol_auth=([^;]+)/);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Retorna o token JWT. Prioridade: memória → sessionStorage → localStorage. */
export function getToken(): string | null {
  if (_memoryToken) return _memoryToken;

  if (typeof window === 'undefined') return null;

  // Tenta sessionStorage primeiro (escopo da aba)
  const session = _safeGet(sessionStorage, TOKEN_KEY);
  if (session) {
    _memoryToken = session;
    _ensureCookie(session);
    return _memoryToken;
  }

  // Fallback para localStorage (persiste entre abas)
  const local = _safeGet(localStorage, TOKEN_KEY);
  if (local) {
    _memoryToken = local;
    // Sincroniza para sessionStorage para a aba atual
    _safeSet(sessionStorage, TOKEN_KEY, local);
    _ensureCookie(local);
    return _memoryToken;
  }

  // Fallback para cookie (sessão válida mesmo com storage limpo/bloqueado)
  const cookieToken = _readCookieToken();
  if (cookieToken) {
    _memoryToken = cookieToken;
    _safeSet(sessionStorage, TOKEN_KEY, cookieToken);
    _safeSet(localStorage, TOKEN_KEY, cookieToken);
    return _memoryToken;
  }

  return null;
}

/** Garante que o cookie petmol_auth existe (para o middleware Next.js ler). */
function _ensureCookie(token: string): void {
  try {
    if (document.cookie.includes('petmol_auth=')) return;
    const maxAge = 60 * 60 * 24 * 30;
    document.cookie = `petmol_auth=${token}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch { /* ignore */ }
}

/** Salva o token JWT em memória + sessionStorage + localStorage + cookie. */
export function setToken(token: string): void {
  _memoryToken = token;
  if (typeof window === 'undefined') return;
  _safeSet(sessionStorage, TOKEN_KEY, token);
  _safeSet(localStorage, TOKEN_KEY, token);
  // Cookie legível pelo middleware Next.js (não HttpOnly para poder ser setado via JS)
  try {
    const maxAge = 60 * 60 * 24 * 30; // 30 dias
    document.cookie = `petmol_auth=${token}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch { /* ignore */ }
}

/** Remove o token de todos os storages. */
export function clearToken(): void {
  _memoryToken = null;
  if (typeof window === 'undefined') return;
  _safeRemove(sessionStorage, TOKEN_KEY);
  _safeRemove(localStorage, TOKEN_KEY);
  // Remove cookie de sessão
  try {
    document.cookie = 'petmol_auth=; path=/; max-age=0; SameSite=Lax';
  } catch { /* ignore */ }
}
