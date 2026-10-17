'use client';

import { invalidateMe } from '@/lib/fetchMe';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { forgetLocationRefresh } from '@/lib/silentLocationRefresh';
import { trackProductEvent } from '@/lib/analytics';

/** Mesmo padrão usado pelo botão manual "Usar minha localização atual" do
 *  Perfil e pelo pedido feito ao concluir o cadastro do primeiro pet
 *  (OnboardingChecklistCard) — pede geolocalização nativa e persiste em
 *  `PATCH /auth/me`. Melhor esforço: negou ou deu timeout, segue sem. */
export async function requestLocationAndPersist(): Promise<void> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
  const startedAt = Date.now();
  trackProductEvent('perm_location_asked', {});
  const done = (result: string, extra: Record<string, unknown> = {}) =>
    trackProductEvent('perm_location_result', { result, elapsed_ms: Date.now() - startedAt, ...extra });
  try {
    // 25 s (antes 8 s): no Android a janela de permissão do sistema aparece ANTES da posição e o tempo
    // que a pessoa leva para decidir contava no limite — estourava e a posição nunca era salva,
    // mesmo com a permissão concedida (aparecia como "não compartilha").
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 25000 }),
    );
    const token = getToken();
    if (!token) { done('no_token'); return; }
    let saved = false;
    await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    }).then((r) => { saved = r.ok; }).catch(() => {});
    done(saved ? 'saved' : 'save_failed');
    invalidateMe();
  } catch (e) {
    // GeolocationPositionError.code: 1 negou, 2 indisponível, 3 estourou o tempo
    const code = (e as { code?: number } | null)?.code;
    done(code === 1 ? 'denied' : code === 2 ? 'unavailable' : code === 3 ? 'timeout' : 'error');
  }
}

/** Mesmo fluxo de "Parar de compartilhar" do Perfil (apps/web/src/app/
 *  profile/page.tsx, handleStopSharing) — apaga a posição guardada no
 *  tutor. Não existe API de navegador pra revogar a permissão de
 *  geolocalização em si (nenhum app web consegue fazer isso); isso é
 *  o que o PETMOL de fato controla: parar de usar/guardar a localização,
 *  mesmo que o navegador continue reportando a permissão como concedida. */
export async function stopSharingLocation(): Promise<boolean> {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me/location`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return false;
    forgetLocationRefresh();
    invalidateMe();
    return true;
  } catch {
    return false;
  }
}
