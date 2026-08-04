'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface AdminData {
  admin_id: string;
  user_id: string;
  email: string;
  role: string; // 'master', 'admin', 'moderator', etc.
  created_at: string;
}

interface UseAdminReturn {
  isAdmin: boolean;
  adminData: AdminData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export function useAdmin(): UseAdminReturn {
  const { isAuthenticated, token, isLoading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAdminStatus = async () => {
    if (!isAuthenticated) {
      setIsAdmin(false);
      setAdminData(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/v1/admin/me`, {
        method: 'GET',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
        credentials: 'include',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setIsAdmin(true);
          setAdminData(result.data);
        } else {
          setIsAdmin(false);
          setAdminData(null);
        }
      } else {
        // Usuário não é admin (403 ou 404)
        setIsAdmin(false);
        setAdminData(null);
      }
    } catch (err) {
      console.error('Erro ao verificar status admin:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setIsAdmin(false);
      setAdminData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // AuthContext resolves `token` (sync, from storage) before `tutor`
    // (async, fetched from /auth/me) — isAuthenticated is derived from
    // tutor, so it's briefly false on every mount even for a logged-in
    // user. Waiting for authLoading to clear avoids concluding "not admin"
    // during that window and redirecting a real admin away.
    if (authLoading) return;
    fetchAdminStatus();
  }, [authLoading, isAuthenticated, token]);

  return {
    isAdmin,
    adminData,
    isLoading,
    error,
    refetch: fetchAdminStatus,
  };
}
