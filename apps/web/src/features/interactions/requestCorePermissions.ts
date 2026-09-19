'use client';

import { invalidateMe } from '@/lib/fetchMe';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

/** Mesmo padrão usado pelo botão manual "Usar minha localização atual" do
 *  Perfil e pelo pedido feito ao concluir o cadastro do primeiro pet
 *  (OnboardingChecklistCard) — pede geolocalização nativa e persiste em
 *  `PATCH /auth/me`. Melhor esforço: negou ou deu timeout, segue sem. */
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
    invalidateMe();
  } catch { /* usuário negou ou timeout */ }
}
