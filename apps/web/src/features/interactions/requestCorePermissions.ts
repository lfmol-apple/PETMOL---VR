'use client';

import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

// Mesma persistência que o botão manual "Usar minha localização atual" do
// Perfil já usa (PATCH /auth/me) — extraído pra cá porque agora DOIS lugares
// pedem localização proativamente (conclusão do 1º cadastro e o card de
// segunda chance pra conta já existente) e precisam do mesmo resultado.
// Nunca lança — permissão negada ou timeout só significa "segue sem
// localização", igual ao fluxo manual do Perfil.
export async function requestLocationAndPersist(): Promise<void> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 }),
    );
    const token = getToken();
    if (!token) return;
    await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    }).catch(() => {});
  } catch {
    /* usuário negou ou timeout — segue sem localização */
  }
}
