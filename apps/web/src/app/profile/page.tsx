'use client';
import { getToken, clearToken } from '@/lib/auth-token';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';
import { showBlockingNotice } from '@/features/interactions/userPromptChannel';
import { useNotificationPermissionController } from '@/features/interactions/useNotificationPermissionController';
import { IosSwitch } from '@/components/ui/IosSwitch';

// ── Design tokens ─────────────────────────────────────────────
import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';

const G   = 'divide-y divide-slate-100 overflow-hidden rounded-[32px] border border-slate-100 bg-white/50 backdrop-blur-sm shadow-sm';
const ROW = 'px-4 py-4';
const CTA = 'w-full py-4 bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white text-base font-black rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xl shadow-blue-500/20 uppercase tracking-widest';
const DEFAULT_CHECKIN_DAY = 1;
const DEFAULT_CHECKIN_HOUR = 20;
const DEFAULT_CHECKIN_MINUTE = 0;
const PROFILE_PUSH_SEEN_KEY = 'petmol-profile-push-seen-v1';
const NOTIFICATION_CONSENTS_KEY = 'petmol_notification_consents_v1';

interface TutorData {
  id: string;
  name: string;
  phone: string;
  email: string;
  monthly_checkin_day?: number;
  monthly_checkin_hour?: number;
  monthly_checkin_minute?: number;
  postal_code?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
}

function PreferenceSwitch({ checked, onToggle, disabled = false }: { checked: boolean; onToggle: () => void; disabled?: boolean }) {
  return <IosSwitch checked={checked} onChange={onToggle} disabled={disabled} size="md" />;
}

export default function ProfilePage() {
  const router = useRouter();
  const apiBase = API_BASE_URL;
  const {
    isSupported,
    isSubscribed,
    permission,
    requestPermission,
    subscribeToPush,
    unsubscribe,
    sendTestNotification,
  } = useNotificationPermissionController();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tutorData, setTutorData] = useState<TutorData | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  // Accordion states
  const [addrOpen, setAddrOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pushLoading, setPushLoading] = useState<"activate" | "deactivate" | "test" | null>(null);
  const [pushFeedback, setPushFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [notificationConsents, setNotificationConsents] = useState({ health: true, operational: true, offers: false });
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinSaved, setCheckinSaved] = useState(false);

  useEffect(() => {
    loadTutorData();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasSeenPushPref = window.localStorage.getItem(PROFILE_PUSH_SEEN_KEY) === '1';

    if (!hasSeenPushPref) {
      setNotifsOpen(true);
      window.localStorage.setItem(PROFILE_PUSH_SEEN_KEY, '1');
    }

    try {
      const saved = JSON.parse(window.localStorage.getItem(NOTIFICATION_CONSENTS_KEY) || '{}');
      setNotificationConsents((prev) => ({ ...prev, ...saved }));
    } catch {
      // Local preference fallback only.
    }
  }, []);

  const updateNotificationConsent = (key: keyof typeof notificationConsents, value: boolean) => {
    setNotificationConsents((prev) => {
      const next = { ...prev, [key]: value };
      window.localStorage.setItem(NOTIFICATION_CONSENTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#checkin') {
      setNotifsOpen(true);
      setTimeout(() => {
        document.getElementById('checkin-config')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, []);

  useEffect(() => {
    if (tutorData?.postal_code && editMode) {
      const normalized = tutorData.postal_code.replace(/\D/g, '');
      if (normalized.length === 8) handleCepLookup();
    }
  }, [tutorData?.postal_code, editMode]);

  const loadTutorData = async () => {
    try {
      const token = getToken();
      if (!token) { router.push('/login'); return; }
      const res = await fetch(`${apiBase}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.phone) {
          let d = data.phone.replace(/\D/g, '');
          if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
          if (d.length === 10) data.phone = `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6,10)}`;
          else if (d.length === 11) data.phone = `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
        }
        setTutorData(data);
      } else if (res.status === 404) {
        setError('Perfil não encontrado. Complete seu cadastro.');
      } else {
        setError('Erro ao carregar dados.');
      }
    } catch {
      setError('Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tutorData) return;
    setSaving(true);
    setError(null);
    try {
      const token = getToken();
      const saveData = { ...tutorData };
      if (saveData.phone) {
        let d = saveData.phone.replace(/\D/g, '');
        if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
        saveData.phone = d;
      }
      const res = await fetch(`${apiBase}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
        body: JSON.stringify(saveData),
      });
      if (res.ok) {
        const updated = await res.json();
        if (updated.phone) {
          let d = updated.phone.replace(/\D/g, '');
          if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
          if (d.length === 10) updated.phone = `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6,10)}`;
          else if (d.length === 11) updated.phone = `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
        }
        setTutorData(updated);
        setEditMode(false);
      } else {
        setError('Erro ao salvar dados.');
      }
    } catch {
      setError('Erro de conexão.');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckinSave = async () => {
    if (!tutorData) return;
    setCheckinSaving(true);
    setCheckinSaved(false);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/notifications/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({
          monthly_checkin_day: tutorData.monthly_checkin_day ?? DEFAULT_CHECKIN_DAY,
          monthly_checkin_hour: tutorData.monthly_checkin_hour ?? DEFAULT_CHECKIN_HOUR,
          monthly_checkin_minute: tutorData.monthly_checkin_minute ?? DEFAULT_CHECKIN_MINUTE,
        }),
      });
      if (res.ok) {
        setCheckinSaved(true);
        setTimeout(() => setCheckinSaved(false), 3000);
      }
    } catch { /* noop */ } finally {
      setCheckinSaving(false);
    }
  };

  const handleCepLookup = async () => {
    if (!tutorData?.postal_code) return;
    const normalized = tutorData.postal_code.replace(/\D/g, '');
    if (normalized.length !== 8) { if (normalized.length > 0) setCepError('CEP inválido. Digite 8 dígitos.'); return; }
    setCepError(null);
    setCepLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${normalized}/json/`);
      const data = await response.json();
      if (data?.erro) { setCepError('CEP não encontrado.'); return; }
      setTutorData(prev => prev ? {
        ...prev,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
        country: 'Brasil',
      } : null);
      setCepError('Endereço preenchido');
      setTimeout(() => setCepError(null), 3000);
    } catch {
      setCepError('Erro ao buscar CEP.');
    } finally {
      setCepLoading(false);
    }
  };

  const normalizeBRPhone = (raw: string): string => {
    let d = raw.replace(/\D/g, '');
    if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
    return d;
  };

  const formatPhone = (value: string) => {
    const numbers = normalizeBRPhone(value);
    if (numbers.length === 0) return '';
    if (numbers.length <= 2) return `(${numbers}`;
    if (numbers.length <= 6) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 10) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6, 10)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhone(value);
    setTutorData(prev => prev ? { ...prev, phone: formatted } : null);
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) { showBlockingNotice('Digite sua senha para confirmar.'); return; }
    try {
      const token = getToken();
      const base = apiBase.replace(/\/$/, '');
      const res = await fetch(`${base}/auth/me`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ password: deletePassword }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); showBlockingNotice(err.detail || 'Erro ao excluir conta.'); return; }
      clearToken();
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login?msg=conta-excluida';
    } catch {
      showBlockingNotice('Erro ao excluir conta. Tente novamente.');
    }
  };

  const tutorInitial = (tutorData?.name || 'T').trim().charAt(0).toUpperCase();
  const inpCls = `w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm outline-none text-slate-800 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all disabled:opacity-50 disabled:bg-transparent disabled:border-transparent disabled:px-0 placeholder:text-slate-300 font-medium`;
  const pushPermissionLabel: Record<NotificationPermission, string> = {
    granted: 'Permitido',
    denied: 'Bloqueado',
    default: 'Não solicitado',
  };
  const pushToggleChecked = isSubscribed || pushLoading === 'activate';

  const activatePush = async () => {
    setPushLoading('activate');
    setPushFeedback(null);
    try {
      if (!isSupported) {
        setNotifsOpen(true);
        setPushFeedback({ ok: false, msg: 'Push não está disponível neste contexto. Abra o PETMOL pela Tela de Início e tente novamente.' });
        return;
      }

      const granted = permission === 'granted' ? true : await requestPermission();
      if (!granted) {
        setPushFeedback({ ok: false, msg: 'Permissão negada pelo navegador.' });
        return;
      }

      const sub = await subscribeToPush();
      if (!sub) {
        setPushFeedback({ ok: false, msg: 'Não foi possível ativar as notificações neste dispositivo.' });
        return;
      }

      setPushFeedback({ ok: true, msg: 'Notificações no celular ativadas com sucesso.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao ativar notificações.';
      setPushFeedback({ ok: false, msg });
    } finally {
      setPushLoading(null);
    }
  };

  const deactivatePush = async () => {
    setPushLoading('deactivate');
    setPushFeedback(null);
    try {
      await unsubscribe();
      setPushFeedback({ ok: true, msg: 'Notificações no celular desativadas.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao desativar notificações.';
      setPushFeedback({ ok: false, msg });
    } finally {
      setPushLoading(null);
    }
  };

  const handlePushToggle = async () => {
    setNotifsOpen(true);
    if (isSubscribed) {
      await deactivatePush();
      return;
    }

    await activatePush();
  };

  const handlePushTest = async () => {
    setPushLoading('test');
    setPushFeedback(null);
    try {
      await sendTestNotification();
      setPushFeedback({ ok: true, msg: 'Notificação de teste enviada. Verifique seu dispositivo.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar push de teste.';
      setPushFeedback({ ok: false, msg });
    } finally {
      setPushLoading(null);
    }
  };

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-dvh bg-[#0056D2] flex flex-col items-center justify-center p-8">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-white/80 text-sm font-bold uppercase tracking-widest animate-pulse">Carregando Perfil...</p>
      </div>
    );
  }

  if (error && !tutorData) {
    return (
      <BrandBackground showLogo={false}>
        <div className="flex flex-col items-center justify-center min-h-[80dvh] p-6 text-center animate-scaleIn">
          <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-500 text-3xl mb-4">⚠️</div>
          <p className="text-white text-lg font-bold mb-6">{error}</p>
          <Link href="/home" className="px-8 py-4 bg-white text-[#0056D2] font-black rounded-2xl shadow-xl active:scale-95 transition-all">Voltar ao início</Link>
        </div>
      </BrandBackground>
    );
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <BrandBackground showLogo={false}>
      <div className="flex flex-col items-center w-full px-4 py-6 animate-fadeIn pb-24">
        
        {/* Header Navigation: Idêntico ao estilo de Auth */}
        <div className="w-full max-w-sm flex flex-col items-center mb-10 animate-scaleIn">
          <div className="w-full flex items-center justify-between mb-8">
            <Link href="/home"
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 text-white hover:bg-white hover:text-[#0056D2] transition-all group">
              <span className="text-2xl group-active:scale-90 transition-transform">←</span>
            </Link>
            <div className="w-12 h-12" /> {/* alignment spacer */}
          </div>
          <PetmolTextLogo className="text-6xl drop-shadow-3xl" />
        </div>

        <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-[40px] shadow-premium border border-white/60 p-8 md:p-10 flex flex-col gap-8 animate-scaleIn">
          
          {/* Tutor Mini Card: Estilo Premium */}
          <div className="flex items-center gap-5 p-2">
            <div className="flex h-20 w-20 items-center justify-center rounded-[30px] bg-gradient-to-br from-[#0066ff] to-[#0056D2] text-white text-3xl font-black shadow-xl shadow-blue-500/20 flex-shrink-0 animate-scaleIn">
              {tutorInitial}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-black text-slate-800 tracking-tight">{tutorData?.name || 'Tutor'}</h1>
              <p className="text-sm text-slate-500 font-medium truncate italic">{tutorData?.email}</p>
              {editMode && (
                <span className="inline-block mt-2 rounded-full bg-blue-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700 animate-pulse">
                  Modo Edição
                </span>
              )}
            </div>
            {!editMode && (
              <button 
                onClick={() => setEditMode(true)}
                className="h-12 w-12 flex items-center justify-center rounded-[20px] bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all active:scale-90 border border-slate-100 shadow-sm"
                title="Editar Perfil"
              >
                ✎
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 font-bold flex items-center gap-3 animate-shake">
              <span>⚠️</span>
              {error}
            </div>
          )}

          <div className="space-y-4 animate-scaleIn" style={{ animationDelay: '100ms' }}>
            {/* Dados pessoais */}
            <div className={G}>
              <div className={ROW}>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">Nome completo</label>
                <input
                  type="text"
                  value={tutorData?.name || ''}
                  onChange={(e) => setTutorData((prev) => prev ? { ...prev, name: e.target.value } : null)}
                  disabled={!editMode}
                  autoComplete="name"
                  placeholder="Nome completo"
                  className={inpCls}
                />
              </div>
              <div className={ROW}>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">E-mail</label>
                <input
                  type="email"
                  value={tutorData?.email || ''}
                  onChange={(e) => setTutorData((prev) => prev ? { ...prev, email: e.target.value } : null)}
                  disabled={!editMode}
                  autoCapitalize="none"
                  inputMode="email"
                  placeholder="seu@email.com"
                  className={inpCls}
                />
              </div>
              <div className={ROW}>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">Telefone</label>
                <input
                  type="tel"
                  value={tutorData?.phone || ''}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  disabled={!editMode}
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  className={inpCls}
                />
              </div>
            </div>

            {/* Endereço */}
            <div className={G}>
              <button
                type="button"
                onClick={() => setAddrOpen((v) => !v)}
                className={`${ROW} flex w-full items-center justify-between group`}
              >
                <span className="text-xs font-bold text-slate-600 uppercase tracking-widest transition-colors group-hover:text-blue-600">Endereço Residencial</span>
                <span className={`text-slate-400 text-xs transition-transform ${addrOpen ? 'rotate-180 text-blue-600' : ''}`}>▾</span>
              </button>

              {addrOpen && (
                <div className="bg-slate-50/50 p-1 space-y-1">
                  <div className={ROW}>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-1.5">CEP</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={tutorData?.postal_code || ''}
                        onChange={(e) => {
                          const nums = e.target.value.replace(/\D/g, '');
                          const fmt = nums.length > 5 ? `${nums.slice(0, 5)}-${nums.slice(5, 8)}` : nums;
                          setTutorData((prev) => prev ? { ...prev, postal_code: fmt } : null);
                          setCepError(null);
                        }}
                        onBlur={handleCepLookup}
                        disabled={!editMode}
                        maxLength={9}
                        placeholder="00000-000"
                        className={inpCls + ' flex-1'}
                      />
                      {cepLoading && <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />}
                    </div>
                    {cepError && (
                      <p className={`text-[10px] font-bold mt-2 pl-1 uppercase tracking-tighter ${cepError === 'Endereço preenchido' ? 'text-emerald-600' : 'text-rose-600'}`}>{cepError}</p>
                    )}
                  </div>
                  <div className={ROW}>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-1.5">Rua / Avenida</label>
                    <input type="text" value={tutorData?.street || ''} onChange={(e) => setTutorData((p) => p ? { ...p, street: e.target.value } : null)} disabled={!editMode} placeholder="Logradouro" className={inpCls} />
                  </div>
                  <div className={`${ROW} grid grid-cols-2 gap-4`}>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-1.5">Número</label>
                      <input type="text" value={tutorData?.number || ''} onChange={(e) => setTutorData((p) => p ? { ...p, number: e.target.value } : null)} disabled={!editMode} placeholder="Nº" className={inpCls} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-1.5">Complemento</label>
                      <input type="text" value={tutorData?.complement || ''} onChange={(e) => setTutorData((p) => p ? { ...p, complement: e.target.value } : null)} disabled={!editMode} placeholder="Apto, casa..." className={inpCls} />
                    </div>
                  </div>
                  <div className={ROW}>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-1.5">Bairro</label>
                    <input type="text" value={tutorData?.neighborhood || ''} onChange={(e) => setTutorData((p) => p ? { ...p, neighborhood: e.target.value } : null)} disabled={!editMode} placeholder="Bairro" className={inpCls} />
                  </div>
                  <div className={`${ROW} grid grid-cols-3 gap-4`}>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-1.5">Cidade</label>
                      <input type="text" value={tutorData?.city || ''} onChange={(e) => setTutorData((p) => p ? { ...p, city: e.target.value } : null)} disabled={!editMode} placeholder="Cidade" className={inpCls} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-1.5">UF</label>
                      <input type="text" value={tutorData?.state || ''} onChange={(e) => setTutorData((p) => p ? { ...p, state: e.target.value.toUpperCase() } : null)} disabled={!editMode} maxLength={2} placeholder="UF" className={inpCls} />
                    </div>
                  </div>
                  {!editMode && tutorData?.street && (
                    <div className={ROW}>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tutorData.street}, ${tutorData.number || ''}, ${tutorData.neighborhood || ''}, ${tutorData.city || ''}, ${tutorData.state || ''}`)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 font-black uppercase tracking-widest flex items-center gap-2 hover:translate-x-1 transition-transform"
                      >
                        📍 Ver no Google Maps →
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Preferências */}
            <div className={G}>
              <button
                type="button"
                onClick={() => setNotifsOpen((v) => !v)}
                className={`${ROW} flex w-full items-center justify-between group`}
              >
                <span className="text-xs font-bold text-slate-600 uppercase tracking-widest transition-colors group-hover:text-blue-600">Preferências e Notificações</span>
                <span className={`text-slate-400 text-xs transition-transform ${notifsOpen ? 'rotate-180 text-blue-600' : ''}`}>▾</span>
              </button>

              {notifsOpen && (
                <div className="bg-slate-50/50 p-1 space-y-1">
                  <div className={ROW}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold text-slate-800 tracking-tight">Notificações no celular</p>
                        <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                          Receba lembretes discretos para vacinas, medicação e cuidados do pet.
                        </p>
                      </div>
                      <PreferenceSwitch
                        checked={pushToggleChecked}
                        onToggle={() => {
                          void handlePushToggle();
                        }}
                        disabled={pushLoading === 'activate' || pushLoading === 'deactivate'}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${pushToggleChecked ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        {pushToggleChecked ? 'Chave ligada' : 'Chave desligada'}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${isSubscribed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {isSubscribed ? 'Push ativo' : 'Push inativo'}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${permission === 'granted' ? 'bg-blue-50 text-blue-700' : permission === 'denied' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                        {pushPermissionLabel[permission]}
                      </span>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="text-sm font-black text-slate-900">Quais notificações deseja receber?</p>
                      <div className="mt-3 grid gap-2">
                        {[
                          { key: 'health', label: 'Saúde' },
                          { key: 'operational', label: 'Operacional (ração)' },
                          { key: 'offers', label: 'Ofertas' },
                        ].map((item) => (
                          <label key={item.key} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                            <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                            <input
                              type="checkbox"
                              checked={notificationConsents[item.key as keyof typeof notificationConsents]}
                              onChange={(e) => updateNotificationConsent(item.key as keyof typeof notificationConsents, e.target.checked)}
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    {pushFeedback && (
                      <div className={`mt-4 rounded-2xl px-4 py-3 text-xs font-bold ${pushFeedback.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {pushFeedback.msg}
                      </div>
                    )}

                    <div className="mt-4 space-y-3">
                      {!isSubscribed ? (
                        <button
                          type="button"
                          onClick={() => {
                            void activatePush();
                          }}
                          disabled={pushLoading === 'activate' || permission === 'denied'}
                          className="w-full rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] py-3.5 text-xs font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-40"
                        >
                          {pushLoading === 'activate' ? 'Ativando...' : 'Ativar notificações no celular'}
                        </button>
                      ) : (
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              void handlePushTest();
                            }}
                            disabled={pushLoading === 'test'}
                            className="flex-1 rounded-2xl bg-slate-900 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-all active:scale-[0.98] disabled:opacity-40"
                          >
                            {pushLoading === 'test' ? 'Enviando...' : 'Enviar teste'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void deactivatePush();
                            }}
                            disabled={pushLoading === 'deactivate'}
                            className="flex-1 rounded-2xl bg-slate-100 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 transition-all active:scale-[0.98] disabled:opacity-40"
                          >
                            {pushLoading === 'deactivate' ? 'Desativando...' : 'Desativar'}
                          </button>
                        </div>
                      )}

                      {!isSupported && (
                        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700 leading-relaxed">
                          Para concluir a ativação, abra o PETMOL pela Tela de Início do celular e volte aqui.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Monthly reminder */}
                  <div className={ROW} id="checkin-config">
                    <p className="text-sm font-bold text-slate-800 tracking-tight mb-1">Agenda Mentoral de Saúde</p>
                    <p className="text-xs text-slate-500 font-medium mb-4 leading-relaxed">Dia e horário em que você recebe o lembrete mensal de saúde dos seus pets.</p>
                    <div className="flex gap-3 mb-4">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-1.5">Dia</label>
                        <select
                          value={tutorData?.monthly_checkin_day ?? DEFAULT_CHECKIN_DAY}
                          onChange={(e) => setTutorData((prev) => prev ? { ...prev, monthly_checkin_day: Number(e.target.value) } : null)}
                          className="w-full bg-slate-100/50 rounded-xl px-3 py-3 text-xs font-bold text-slate-700 outline-none"
                        >
                          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={d}>Dia {d}</option>
                          ))}
                          <option value={0}>Último</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-1.5">Hora</label>
                        <select
                          value={tutorData?.monthly_checkin_hour ?? DEFAULT_CHECKIN_HOUR}
                          onChange={(e) => setTutorData((prev) => prev ? { ...prev, monthly_checkin_hour: Number(e.target.value) } : null)}
                          className="w-full bg-slate-100/50 rounded-xl px-3 py-3 text-xs font-bold text-slate-700 outline-none"
                        >
                          {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                            <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-1.5">Min</label>
                        <select
                          value={tutorData?.monthly_checkin_minute ?? DEFAULT_CHECKIN_MINUTE}
                          onChange={(e) => setTutorData((prev) => prev ? { ...prev, monthly_checkin_minute: Number(e.target.value) } : null)}
                          className="w-full bg-slate-100/50 rounded-xl px-3 py-3 text-xs font-bold text-slate-700 outline-none"
                        >
                          {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                            <option key={m} value={m}>{String(m).padStart(2, '0')}m</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { void handleCheckinSave(); }}
                      disabled={checkinSaving}
                      className="w-full rounded-2xl bg-slate-900 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-all active:scale-[0.98] disabled:opacity-40"
                    >
                      {checkinSaving ? 'Salvando...' : checkinSaved ? '✓ Salvo' : 'Salvar horário'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mais opções */}
            <div className={G}>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className={`${ROW} flex w-full items-center justify-between group`}
              >
                <span className="text-xs font-bold text-slate-600 uppercase tracking-widest transition-colors group-hover:text-blue-600">Gerenciamento de Conta</span>
                <span className={`text-slate-400 text-xs transition-transform ${moreOpen ? 'rotate-180 text-blue-600' : ''}`}>▾</span>
              </button>

              {moreOpen && (
                <div className="bg-slate-50/50 p-1 space-y-1">
                  <div className={ROW}>
                    <div className="rounded-2xl bg-rose-50 p-5 border border-rose-100">
                      <p className="text-[10px] font-black text-rose-700 uppercase tracking-[0.2em] mb-2">Zona de Perigo</p>
                      <p className="text-xs text-rose-600 font-medium mb-4 leading-relaxed">A exclusão da conta é irreversível e removerá todos os seus pets e histórico.</p>
                      
                      {!showDeleteConfirm ? (
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="w-full bg-white border border-rose-200 py-3 rounded-xl text-xs font-black text-rose-700 uppercase tracking-widest shadow-sm active:scale-95 transition-all"
                        >
                          Excluir Conta Permanentemente
                        </button>
                      ) : (
                        <div className="space-y-4 animate-scaleIn">
                          <div className="space-y-2">
                            <label className="block text-[10px] font-black text-rose-800 uppercase tracking-widest pl-1 select-none">Confirmar com sua Senha:</label>
                            <input
                              type="password"
                              value={deletePassword}
                              onChange={(e) => setDeletePassword(e.target.value)}
                              placeholder="Digite sua senha..."
                              className="w-full px-4 py-3 bg-white border border-rose-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rose-500 text-rose-900"
                            />
                          </div>
                          <div className="flex gap-3">
                            <button type="button" onClick={handleDeleteAccount}
                              className="flex-[2] rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 py-3 text-xs font-black text-white uppercase tracking-widest shadow-lg shadow-rose-600/20 active:scale-95 transition-all">
                              EXCLUIR AGORA
                            </button>
                            <button type="button" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}
                              className="flex-1 rounded-xl bg-slate-100 py-3 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="animate-fadeInUp pt-4 border-t border-slate-100" style={{ animationDelay: '200ms' }}>
            {editMode ? (
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => { setEditMode(false); loadTutorData(); }}
                  disabled={saving}
                  className="flex-1 py-4 rounded-2xl text-sm font-black text-slate-400 hover:bg-slate-50 transition-colors uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="flex-[1.5] py-4 rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white text-sm font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                  {saving ? (
                    <div className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : 'Salvar Dados'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent('Olá, preciso de ajuda com o PETMOL.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0056D2] text-[10px] font-black uppercase tracking-[0.3em] hover:text-[#0047ad] transition-colors py-1"
                >
                  Ajuda via WhatsApp
                </a>
                <button
                  onClick={() => {
                    clearToken();
                    localStorage.clear();
                    router.push('/login');
                  }}
                  className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] hover:text-rose-500 transition-colors py-2"
                >
                  Desconectar da Conta
                </button>
              </div>
            )}
          </div>
        </div>
        
        <p className="mt-8 text-white/40 text-[10px] font-black uppercase tracking-[0.3em] font-mono">PETMOL CORE SYNC</p>
      </div>
    </BrandBackground>
  );
}
