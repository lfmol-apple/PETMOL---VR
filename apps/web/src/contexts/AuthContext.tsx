'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, setToken, clearToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { isPublic } from '@/middleware';

interface Tutor {
  id: number;
  email: string;
  name: string;
  phone?: string;
  email_verified?: boolean;
  created_at: string;
}

interface AuthContextType {
  tutor: Tutor | null;
  token: string | null; // Mantido para compatibilidade, mas não usado
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string, termsAccepted?: boolean, address?: { postal_code?: string; street?: string; number?: string; complement?: string; neighborhood?: string; city?: string; state?: string; country?: string }, prefs?: { whatsapp?: boolean; monthly_checkin_day?: number; monthly_checkin_hour?: number; monthly_checkin_minute?: number }) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isOfflineMode: boolean;
  currentUser: string | null;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = API_BASE_URL;

function clearSensitiveBrowserCaches() {
  if (typeof window === 'undefined') return;
  const keys = [
    'pet_health_profiles',
    'petmol_pending_changes',
    'petmol_sync_metadata',
    'petmol_pets',
    'petmol_cached_pets',
    'petmol_favorites',
  ];

  for (const key of keys) {
    try { localStorage.removeItem(key); } catch {}
    try { sessionStorage.removeItem(key); } catch {}
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [token, _setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Decisão de 18/09/2026 (pedido do dono): o app liberava acesso total logo
  // após o cadastro, sem exigir confirmação de e-mail em lugar nenhum.
  // Ajustada em 19/09/2026 depois da auditoria final mostrar o custo real:
  // bloquear IMEDIATAMENTE depois do cadastro tirava o tutor novo antes de
  // ele ver qualquer valor do app (nem Home, nem 1º pet). Agora a 1ª sessão
  // depois do cadastro fica livre — o tutor cadastra o pet e usa a Home
  // normalmente. Só na PRÓXIMA vez que abrir o app (novo boot/reload), se o
  // e-mail continuar sem confirmar, é que a gente pede: "Para continuar
  // utilizando o PETMOL, confirme seu e-mail." Contas convidadas (guest_*)
  // já nascem com email_verified=true, então nunca são afetadas.
  //
  // `emailGateDecisionRef` guarda a decisão só pra esta sessão do app (reseta
  // sozinho a cada boot/reload, sem precisar de lógica extra): a 1ª checagem
  // decide "allow" (1ª sessão, ainda não gastou a cortesia) ou "block" (já
  // gastou numa sessão anterior); as checagens seguintes dentro do mesmo
  // boot só repetem a mesma decisão, sem interromper a navegação no meio da
  // sessão livre.
  const emailGateDecisionRef = useRef<'unchecked' | 'allow' | 'block'>('unchecked');

  useEffect(() => {
    if (isLoading || !tutor) return;
    if (tutor.email_verified === false && !isPublic(pathname || '')) {
      if (emailGateDecisionRef.current === 'unchecked') {
        const graceKey = `petmol_email_grace_used_${tutor.id}`;
        let graceUsed = false;
        try { graceUsed = localStorage.getItem(graceKey) === '1'; } catch {}
        if (graceUsed) {
          emailGateDecisionRef.current = 'block';
        } else {
          try { localStorage.setItem(graceKey, '1'); } catch {}
          emailGateDecisionRef.current = 'allow';
        }
      }
      if (emailGateDecisionRef.current === 'block') {
        router.replace('/auth/check-email');
      }
    }
  }, [tutor, isLoading, pathname, router]);

  // Helper: sets both React state and module-level token store
  const setAuthToken = (t: string | null) => {
    _setTokenState(t);
  };

  useEffect(() => {
    const savedToken = getToken();
    if (savedToken) {
      setAuthToken(savedToken);
      // Garante que o cookie petmol_auth está setado para o middleware Next.js
      setToken(savedToken);
    }
    fetchTutorData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTutorData = async () => {
    const savedToken = getToken();
    // Sem token, não faz request desnecessário (evita 401)
    if (!savedToken) {
      setTutor(null);
      setAuthToken(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        credentials: 'include',
        headers: { 'Authorization': `Bearer ${savedToken}` },
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const data = await response.json();
        setTutor(data);
        setAuthToken(savedToken);
        setIsOfflineMode(false);
      } else if (response.status === 401 || response.status === 403) {
        setTutor(null);
        setAuthToken(null);
        clearToken();
      } else {
        // 5xx/502 during deploy must not log the user out. Keep the token so
        // /home can retry loading pets and push deep links can still resolve.
        setAuthToken(savedToken);
        setToken(savedToken);
        setIsOfflineMode(true);
      }
    } catch (error) {
      console.error('Erro ao buscar dados do tutor:', error);
      setAuthToken(savedToken);
      setToken(savedToken);
      setIsOfflineMode(true);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<void> => {
    let response: Response;
    try {
      response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg || msg === 'Load failed' || msg === 'Failed to fetch' || msg.toLowerCase().includes('network')) {
        throw new Error('Sem conexão. Verifique sua internet e tente novamente.');
      }
      throw new Error(msg || 'Erro ao fazer login');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { detail?: string };
      throw new Error(error.detail || 'Credenciais inválidas. Verifique e-mail e senha.');
    }

    const data = await response.json();

    if (data.access_token) {
      setAuthToken(data.access_token);
      setToken(data.access_token);
    }
    await fetchTutorData();
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    phone?: string,
    termsAccepted: boolean = false,
    address?: {
      postal_code?: string; street?: string; number?: string;
      complement?: string; neighborhood?: string; city?: string;
      state?: string; country?: string;
    },
    prefs?: {
      whatsapp?: boolean;
      monthly_checkin_day?: number;
      monthly_checkin_hour?: number;
      monthly_checkin_minute?: number;
    }
  ) => {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, phone, terms_accepted: termsAccepted, ...address, ...prefs })
    });

    if (!response.ok) {
      const error = await response.json();
      let msg = 'Erro ao registrar';
      if (typeof error.detail === 'string') {
        msg = error.detail;
      } else if (Array.isArray(error.detail) && error.detail.length > 0) {
        msg = error.detail.map((e: { msg?: string }) => e.msg || JSON.stringify(e)).join('\n');
      }
      throw new Error(msg);
    }

    // Fazer login automaticamente após registro
    await login(email, password);

    // Persistir preferências (monthly_checkin_*, whatsapp) via PATCH /me
    // O endpoint de registro ignora esses campos pois não estão no UserCreate schema
    if (prefs && Object.keys(prefs).length > 0) {
      try {
        const { getToken } = await import('@/lib/auth-token');
        const token = getToken();
        if (token) {
          await fetch(`${API_URL}/auth/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(prefs),
          });
        }
      } catch { /* não bloqueia o registro */ }
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
    clearToken();
    clearSensitiveBrowserCaches();
    setAuthToken(null);
    setTutor(null);
    setIsOfflineMode(false);
  };

  const currentUser = tutor?.email || null;
  const isAuthenticated = !!tutor || !!token;

  return (
    <AuthContext.Provider
      value={{
        tutor,
        token,
        login,
        register,
        logout,
        isLoading,
        isOfflineMode,
        currentUser,
        isAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
