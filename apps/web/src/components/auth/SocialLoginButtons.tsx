'use client';

/**
 * "Continuar com Google" / "Continuar com Apple".
 *
 * NO SITE (12/10/2026): os dois SDKs web devolvem um id_token já assinado pelo
 * provedor direto no navegador; o backend (`POST /auth/google|apple`) só valida
 * e acha/cria a conta. Nenhum segredo nosso entra nisso — os client_id abaixo
 * não são secretos (ficam expostos no bundle).
 *
 * NO APP (nativo): o popup/redirect do navegador não roda no WebView do
 * Capacitor — o Google chega a bloquear de propósito ("disallowed_useragent").
 * Por isso, dentro do app o login é NATIVO (plugin @capgo/capacitor-social-login:
 * janela do próprio iOS/Android) e devolve o mesmo id_token ao mesmo backend.
 * Os botões só aparecem se o plugin existir no binário instalado — apps antigos
 * (sem o plugin) continuam sem eles, sem quebrar. Apple só no iPhone (a Apple só
 * exige oferecê-la no iOS). Kill switch: NEXT_PUBLIC_NATIVE_SOCIAL_LOGIN=off.
 *
 * Cada botão só aparece se o client_id correspondente estiver configurado
 * (`NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_APPLE_SERVICES_ID`).
 */
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useAuth } from '@/contexts/AuthContext';
import { isNativeAppClient } from '@/lib/nativeApp';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const APPLE_SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID;
// ID do cliente OAuth "PETMOL iOS" (Google Cloud, projeto PETMOL). Não é segredo.
const GOOGLE_IOS_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '605810387105-ael6mimgsjhfoighqk7vuuh343vc4lrs.apps.googleusercontent.com';
const NATIVE_LOGIN_DISABLED = process.env.NEXT_PUBLIC_NATIVE_SOCIAL_LOGIN === 'off';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (config: Record<string, unknown>) => void;
        signIn: () => Promise<{
          authorization: { id_token: string };
          user?: { name?: { firstName?: string; lastName?: string } };
        }>;
      };
    };
  }
}

interface SocialLoginButtonsProps {
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function SocialLoginButtons({ onSuccess, onError }: SocialLoginButtonsProps) {
  const { loginWithSocial } = useAuth();
  const googleContainerRef = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [nativeApp, setNativeApp] = useState(true); // seguro por padrão até confirmar no cliente

  useEffect(() => {
    setNativeApp(isNativeAppClient());
  }, []);

  // Login nativo: só existe se o binário instalado trouxe o plugin.
  const [nativeLogin, setNativeLogin] = useState<{ google: boolean; apple: boolean } | null>(null);
  const [nativeBusy, setNativeBusy] = useState<'google' | 'apple' | null>(null);
  useEffect(() => {
    if (!nativeApp || NATIVE_LOGIN_DISABLED) return;
    let alive = true;
    void import('@capacitor/core').then(({ Capacitor }) => {
      if (!alive || !Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('SocialLogin')) return;
      setNativeLogin({ google: !!GOOGLE_CLIENT_ID, apple: Capacitor.getPlatform() === 'ios' });
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [nativeApp]);

  const handleNativeClick = async (provider: 'google' | 'apple') => {
    if (nativeBusy) return;
    setNativeBusy(provider);
    try {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.initialize({
        google: GOOGLE_CLIENT_ID
          ? { webClientId: GOOGLE_CLIENT_ID, iOSClientId: GOOGLE_IOS_CLIENT_ID, iOSServerClientId: GOOGLE_CLIENT_ID, mode: 'online' }
          : undefined,
        apple: {},
      });
      const res = await SocialLogin.login(
        provider === 'google'
          ? { provider: 'google', options: { scopes: ['email', 'profile'] } }
          : { provider: 'apple', options: { scopes: ['email', 'name'] } },
      );
      const result = res.result as {
        idToken?: string | null;
        profile?: { givenName?: string | null; familyName?: string | null; name?: string | null };
      };
      if (!result.idToken) throw new Error('O provedor não devolveu a identificação. Tente de novo.');
      const name = [result.profile?.givenName, result.profile?.familyName].filter(Boolean).join(' ') || result.profile?.name || undefined;
      await loginWithSocial(provider, result.idToken, name || undefined);
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? '');
      // Cancelar a janela do sistema não é erro — sem mensagem assustando o tutor.
      if (!/cancel|dismiss|1001|12501/i.test(msg)) {
        onError(msg || (provider === 'google' ? 'Não foi possível entrar com o Google.' : 'Não foi possível entrar com a Apple.'));
      }
    } finally {
      setNativeBusy(null);
    }
  };

  // O <Script src="..."> do Next dedup por src — se a página anterior
  // (ex: login) já tiver carregado o mesmo script, o onLoad NÃO dispara
  // de novo aqui numa navegação client-side pro cadastro, e o botão nunca
  // aparece (achado real, 12/10/2026: "só tem a opção com a Apple" — o
  // script do Google já estava carregado de outra tela). Checa o objeto
  // global direto no mount e faz um polling curto como rede de segurança,
  // em vez de confiar só no onLoad.
  useEffect(() => {
    if (nativeApp) return;
    if (window.google) { setGoogleReady(true); }
    if (window.AppleID) { setAppleReady(true); }
    if (window.google && window.AppleID) return;
    const interval = setInterval(() => {
      if (window.google) setGoogleReady(true);
      if (window.AppleID) setAppleReady(true);
      if (window.google && window.AppleID) clearInterval(interval);
    }, 150);
    const timeout = setTimeout(() => clearInterval(interval), 5000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [nativeApp]);

  useEffect(() => {
    if (!googleReady || !GOOGLE_CLIENT_ID || nativeApp) return;
    const container = googleContainerRef.current;
    if (!container || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: { credential: string }) => {
        try {
          await loginWithSocial('google', response.credential);
          onSuccess();
        } catch (err) {
          onError(err instanceof Error ? err.message : 'Não foi possível entrar com o Google.');
        }
      },
    });
    // O botão do Google é um <iframe> — CSS do nosso lado não alcança o
    // conteúdo dele, então "w-full" não funciona aqui. A única forma de
    // fazer caber a largura certa é medir o container e passar em px pro
    // próprio renderButton (pedido do dono, 12/10/2026: os dois botões
    // precisam ficar do mesmo tamanho).
    window.google.accounts.id.renderButton(container, {
      theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with',
      logo_alignment: 'center', width: String(Math.round(container.offsetWidth)),
    });
  }, [googleReady, nativeApp, loginWithSocial, onSuccess, onError]);

  useEffect(() => {
    if (!appleReady || !APPLE_SERVICES_ID || nativeApp || typeof window === 'undefined') return;
    window.AppleID?.auth.init({
      clientId: APPLE_SERVICES_ID,
      scope: 'name email',
      redirectURI: `${window.location.origin}/login`,
      usePopup: true,
    });
  }, [appleReady, nativeApp]);

  const handleAppleClick = async () => {
    if (!window.AppleID) return;
    setAppleBusy(true);
    try {
      const result = await window.AppleID.auth.signIn();
      const name = result.user?.name
        ? [result.user.name.firstName, result.user.name.lastName].filter(Boolean).join(' ')
        : undefined;
      await loginWithSocial('apple', result.authorization.id_token, name || undefined);
      onSuccess();
    } catch (err) {
      // Fechar o popup sem concluir conta como "cancelou" — não é um erro
      // real, não precisa de mensagem assustando o tutor.
      const msg = err instanceof Error ? err.message : String((err as { error?: string })?.error ?? '');
      const cancelled = /popup_closed|user_cancelled/i.test(msg);
      if (!cancelled) onError(msg || 'Não foi possível entrar com a Apple.');
    } finally {
      setAppleBusy(false);
    }
  };

  if (nativeApp) {
    if (!nativeLogin || (!nativeLogin.google && !nativeLogin.apple)) return null;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-100" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">ou</span>
          <div className="h-px flex-1 bg-slate-100" />
        </div>

        {nativeLogin.google && (
          <button
            type="button"
            onClick={() => { void handleNativeClick('google'); }}
            disabled={nativeBusy !== null}
            className="h-11 w-full flex items-center justify-center gap-2.5 rounded-full border border-slate-300 bg-white text-slate-800 font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
              <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.8z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.27a12 12 0 0 0 0 10.76l4-3.1z" />
              <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
            </svg>
            {nativeBusy === 'google' ? 'Entrando...' : 'Continuar com o Google'}
          </button>
        )}

        {nativeLogin.apple && (
          <button
            type="button"
            onClick={() => { void handleNativeClick('apple'); }}
            disabled={nativeBusy !== null}
            className="h-11 w-full flex items-center justify-center gap-2.5 rounded-full bg-black text-white font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="currentColor" aria-hidden="true">
              <path d="M16.365 1.43c0 1.14-.46 2.1-1.14 2.82-.75.82-1.98 1.45-3.02 1.37-.12-1.11.46-2.26 1.1-2.98.75-.84 2.03-1.46 3.06-1.21zM20.6 17.16c-.55 1.28-.81 1.85-1.52 2.98-.98 1.56-2.37 3.5-4.1 3.52-1.53.02-1.93-1-4.01-.99-2.08.01-2.52 1.01-4.05.99-1.73-.02-3.05-1.77-4.03-3.33C.3 16.8-.6 12.56 1.38 9.6c.99-1.48 2.75-2.41 4.44-2.44 1.56-.03 3.04 1.05 4.01 1.05.97 0 2.76-1.3 4.66-1.11.79.03 3.03.32 4.47 2.42-.12.07-2.67 1.56-2.64 4.65.03 3.69 3.24 4.92 3.28 4.94-.03.09-.52 1.78-1.72 3.05-.01.01-.01.01 0 0-.02 0 .22-.32 0 0z" />
            </svg>
            {nativeBusy === 'apple' ? 'Entrando...' : 'Continuar com a Apple'}
          </button>
        )}

        <p className="text-center text-[11px] text-slate-400 leading-relaxed">
          Ao continuar, você concorda com os{' '}
          <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="underline">Termos</a>
          {' '}e a{' '}
          <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline">Política de Privacidade</a>.
        </p>
      </div>
    );
  }

  if (!GOOGLE_CLIENT_ID && !APPLE_SERVICES_ID) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-100" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">ou</span>
        <div className="h-px flex-1 bg-slate-100" />
      </div>

      {GOOGLE_CLIENT_ID && (
        <>
          <Script
            src="https://accounts.google.com/gsi/client"
            strategy="afterInteractive"
            onLoad={() => setGoogleReady(true)}
          />
          {/* h-11 (44px) pra bater com a altura mínima de toque que todo
              botão do app já usa (min-h-[44px]) — o próprio botão do
              Google só tem 3 tamanhos fixos (o maior, "large", é 40px),
              então aqui só centralizamos ele dentro de uma linha de 44px
              pra bater com o da Apple, que já nasce nessa altura. */}
          <div ref={googleContainerRef} className="flex h-11 w-full items-center justify-center" />
        </>
      )}

      {APPLE_SERVICES_ID && (
        <>
          <Script
            src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
            strategy="afterInteractive"
            onLoad={() => setAppleReady(true)}
          />
          <button
            type="button"
            onClick={handleAppleClick}
            disabled={appleBusy || !appleReady}
            className="h-11 w-full flex items-center justify-center gap-2.5 rounded-full bg-black text-white font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="currentColor" aria-hidden="true">
              <path d="M16.365 1.43c0 1.14-.46 2.1-1.14 2.82-.75.82-1.98 1.45-3.02 1.37-.12-1.11.46-2.26 1.1-2.98.75-.84 2.03-1.46 3.06-1.21zM20.6 17.16c-.55 1.28-.81 1.85-1.52 2.98-.98 1.56-2.37 3.5-4.1 3.52-1.53.02-1.93-1-4.01-.99-2.08.01-2.52 1.01-4.05.99-1.73-.02-3.05-1.77-4.03-3.33C.3 16.8-.6 12.56 1.38 9.6c.99-1.48 2.75-2.41 4.44-2.44 1.56-.03 3.04 1.05 4.01 1.05.97 0 2.76-1.3 4.66-1.11.79.03 3.03.32 4.47 2.42-.12.07-2.67 1.56-2.64 4.65.03 3.69 3.24 4.92 3.28 4.94-.03.09-.52 1.78-1.72 3.05-.01.01-.01.01 0 0-.02 0 .22-.32 0 0z" />
            </svg>
            {appleBusy ? 'Entrando...' : 'Continuar com a Apple'}
          </button>
        </>
      )}

      <p className="text-center text-[11px] text-slate-400 leading-relaxed">
        Ao continuar, você concorda com os{' '}
        <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="underline">Termos</a>
        {' '}e a{' '}
        <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline">Política de Privacidade</a>.
      </p>
    </div>
  );
}
