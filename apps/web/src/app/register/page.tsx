'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';
import { trackV1Metric } from '@/lib/v1Metrics';
import { subscribeToPush } from '@/features/notifications/pushService';

type FieldKey = 'name' | 'email' | 'password' | 'terms';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_CHECKIN_DAYS = '3';
const DEFAULT_CHECKIN_TIME = '09:00';

function validateField(field: FieldKey, values: { name: string; email: string; password: string; termsAccepted: boolean }): string {
  if (field === 'name' && values.name.trim().length < 2) return 'Informe seu nome.';
  if (field === 'email' && !EMAIL_RE.test(values.email.trim())) return 'Informe um e-mail válido.';
  if (field === 'password' && values.password.length < 6) return 'Senha mínima de 6 caracteres.';
  if (field === 'terms' && !values.termsAccepted) return 'Aceite os termos para continuar.';
  return '';
}

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [checkinDays, setCheckinDays] = useState(DEFAULT_CHECKIN_DAYS);
  const [checkinTime, setCheckinTime] = useState(DEFAULT_CHECKIN_TIME);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<FieldKey, string>>({ name: '', email: '', password: '', terms: '' });
  const [currentField, setCurrentField] = useState<FieldKey>('name');
  const [subscribing, setSubscribing] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [postNotifRoute, setPostNotifRoute] = useState('/welcome');

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInviteToken(params.get('invite'));
    nameRef.current?.focus();
    setPushSupported(
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      Notification.permission !== 'granted',
    );
  }, []);

  const canContinueName = name.trim().length >= 2;
  const canSubmit = EMAIL_RE.test(email.trim()) && password.length >= 6 && termsAccepted;

  const focusField = (field: FieldKey) => {
    const map: Record<FieldKey, { current: HTMLInputElement | null }> = {
      name: nameRef,
      email: emailRef,
      password: passwordRef,
      terms: termsRef,
    };
    map[field].current?.focus();
    map[field].current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setCurrentField(field);
  };

  const setFieldValidation = (field: FieldKey, value: string) => {
    setErrors((prev) => ({ ...prev, [field]: value }));
  };

  const handleContinue = () => {
    if (step === 1) {
      if (canContinueName) {
        trackV1Metric('register_step1_completed', {});
        setStep(2);
        setTimeout(() => emailRef.current?.focus(), 120);
        return;
      }

      setFieldValidation('name', 'Informe seu nome.');
      focusField('name');
    }
  };

  const handleBack = () => {
    if (step === 2 && !loading) {
      setStep(1);
      setTimeout(() => nameRef.current?.focus(), 120);
      return;
    }
    router.push('/login');
  };

  const handleActivateNotifications = async () => {
    setSubscribing(true);
    try {
      const token = getToken();
      if (token) await subscribeToPush(token);
    } catch {
      // best-effort — falhas não bloqueiam o cadastro
    }
    setSubscribing(false);
    router.push(postNotifRoute);
  };

  const handleSubmit = async () => {
    const values = { name, email, password, termsAccepted };
    const ordered: FieldKey[] = ['name', 'email', 'password', 'terms'];
    const nextErrors: Record<FieldKey, string> = { name: '', email: '', password: '', terms: '' };
    let firstInvalid: FieldKey | null = null;

    for (const field of ordered) {
      const message = validateField(field, values);
      nextErrors[field] = message;
      if (!firstInvalid && message) firstInvalid = field;
    }

    setErrors(nextErrors);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    setLoading(true);
    try {
      await register(
        name.trim(),
        email.trim(),
        password,
        phone.trim() || undefined,
        termsAccepted,
        city.trim() ? { city: city.trim() } : undefined,
        {
          monthly_checkin_day: Number(checkinDays) || 3,
          monthly_checkin_hour: Number(checkinTime.split(':')[0] ?? 9),
          monthly_checkin_minute: Number(checkinTime.split(':')[1] ?? 0),
        },
      );

      if (inviteToken) {
        try {
          const authToken = getToken();
          if (authToken) {
            await fetch(`${API_BASE_URL}/family/join/${inviteToken}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            });
          }
        } catch {
          // non-blocking
        }
        setPostNotifRoute('/home');
      } else {
        trackV1Metric('register_completed', {});
        setPostNotifRoute('/welcome');
      }

      if (pushSupported) {
        setStep(3);
      } else {
        router.push(inviteToken ? '/home' : '/welcome');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao criar conta.';
      setFieldValidation('email', message);
      focusField('email');
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = (field: FieldKey) =>
    `w-full px-4 py-3 rounded-2xl border text-[15px] outline-none transition-all bg-white ${
      errors[field]
        ? 'border-rose-400 ring-4 ring-rose-500/10'
        : currentField === field
          ? 'border-blue-400 ring-4 ring-blue-500/10'
          : 'border-slate-200'
    }`;

  return (
    <BrandBackground showLogo={false}>
      <div className="min-h-[calc(100dvh-40px)] w-full px-4 py-8 flex items-center justify-center">
        <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-[32px] border border-white/60 shadow-premium p-6 overflow-hidden">
          <div className="flex justify-center mb-5">
            <PetmolTextLogo className="text-5xl drop-shadow-3xl" color="#2563EB" />
          </div>

          <div className="mb-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-500">Cadastro rápido</p>
            <p className="mt-2 text-sm font-bold text-slate-900">Passo {Math.min(step, pushSupported ? 3 : 2)} de {pushSupported ? 3 : 2}</p>
          </div>

          {step === 3 ? (
            <div className="space-y-6">
              {/* Ícone */}
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center shadow-inner">
                  <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10 text-blue-600" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
              </div>

              {/* Texto */}
              <div className="text-center">
                <p className="text-2xl font-black text-slate-900 leading-tight">Ative os lembretes</p>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  Receba avisos no celular antes que vacinas vençam, medicamentos acabem ou a ração esgote.
                </p>
              </div>

              {/* Benefícios */}
              <ul className="space-y-2.5">
                {[
                  { icon: '💉', text: 'Vacinas prestes a vencer' },
                  { icon: '💊', text: 'Hora do remédio e antiparasitários' },
                  { icon: '🍽️', text: 'Estoque de ração acabando' },
                ].map(({ icon, text }) => (
                  <li key={text} className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                    <span className="text-lg leading-none">{icon}</span>
                    <span className="text-sm font-semibold text-slate-700">{text}</span>
                  </li>
                ))}
              </ul>

              {/* Botões */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleActivateNotifications}
                  disabled={subscribing}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white text-[15px] font-black shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {subscribing ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                      Ativando...
                    </>
                  ) : (
                    '🔔  Ativar notificações'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(postNotifRoute)}
                  className="w-full py-3 text-sm font-semibold text-slate-400 active:text-slate-600 transition-colors"
                >
                  Agora não
                </button>
              </div>
            </div>
          ) : step === 1 ? (
            <div className="space-y-5">
              <div>
                <p className="text-2xl font-black text-slate-900">Qual o seu nome?</p>
                <p className="text-sm text-slate-500 mt-2">Isso é tudo para iniciar.</p>
              </div>
              <div>
                <label className="sr-only" htmlFor="user-name">Nome</label>
                <input
                  id="user-name"
                  ref={nameRef}
                  type="text"
                  value={name}
                  onFocus={(e) => { setCurrentField('name'); const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350); }}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setFieldValidation('name', '');
                  }}
                  placeholder="Digite seu nome"
                  className={`w-full rounded-[28px] border px-5 py-4 text-base font-semibold text-slate-900 outline-none transition-all ${errors.name ? 'border-rose-400 ring-4 ring-rose-500/10' : 'border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10'}`}
                />
                {errors.name && <p className="mt-2 text-sm text-rose-600 font-semibold">{errors.name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-600 text-[13px] font-black uppercase tracking-widest"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinueName}
                  className="py-3.5 rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white text-[13px] font-black uppercase tracking-widest disabled:opacity-50"
                >
                  Continuar
                </button>
              </div>
              <p className="text-center text-sm text-slate-500">
                Já tem conta? <Link href="/login" className="text-blue-600 font-bold hover:underline">Entrar</Link>
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-2xl font-black text-slate-900">Seu acesso ao PETMOL</p>
                <p className="text-sm text-slate-500 mt-2">E-mail e senha prontos para continuar.</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">E-mail *</label>
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onFocus={(e) => { setCurrentField('email'); const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350); }}
                  onChange={(e) => {
                    setEmail(e.target.value.trim());
                    if (errors.email) setFieldValidation('email', '');
                  }}
                  placeholder="voce@email.com"
                  className={fieldClass('email')}
                />
                {errors.email && <p className="mt-1 text-xs text-rose-600 font-semibold">{errors.email}</p>}
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Senha *</label>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={password}
                    onFocus={(e) => { setCurrentField('password'); const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350); }}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setFieldValidation('password', '');
                    }}
                    placeholder="Mínimo 6 caracteres"
                    className={fieldClass('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500"
                  >
                    {showPassword ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-rose-600 font-semibold">{errors.password}</p>}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setShowMoreInfo((v) => !v)}
                  className="text-sm font-semibold text-slate-600 hover:text-blue-600"
                >
                  {showMoreInfo ? 'Ocultar informações extras' : 'Adicionar mais informações'}
                </button>
                {showMoreInfo && (
                  <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Telefone (opcional)</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(11) 99999-9999"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-[15px] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Cidade (opcional)</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Sua cidade"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-[15px] outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
              <label className={`flex items-start gap-3 rounded-xl border p-4 ${errors.terms ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'}`}>
                <input
                  ref={termsRef}
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => {
                    setTermsAccepted(e.target.checked);
                    if (errors.terms) setFieldValidation('terms', '');
                  }}
                  className="mt-1 h-5 w-5 rounded-md border-slate-300 text-blue-600"
                />
                <div className="text-sm leading-tight text-slate-700">
                  Aceito os <Link href="/legal/terms" className="text-blue-600 font-bold hover:underline">Termos</Link> e a <Link href="/legal/privacy" className="text-blue-600 font-bold hover:underline">Política de Privacidade</Link>.
                </div>
              </label>
              {errors.terms && <p className="text-sm text-rose-600 font-semibold">{errors.terms}</p>}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleBack}
                  className="py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-600 text-[13px] font-black uppercase tracking-widest"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || !canSubmit}
                  className="py-3.5 rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white text-[13px] font-black uppercase tracking-widest disabled:opacity-40"
                >
                  {loading ? 'Criando...' : 'Continuar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </BrandBackground>
  );
}
