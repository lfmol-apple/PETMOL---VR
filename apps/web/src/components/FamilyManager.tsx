'use client';

import { useEffect, useState, useCallback } from 'react';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { requestUserConfirmation } from '@/features/interactions/userPromptChannel';

// ─── Types ──────────────────────────────────────────────────────────────

interface FamilyMember {
  user_id: string;
  name: string | null;
  email: string;
  role: 'owner' | 'member';
  joined_at: string;
}

interface FamilyStatus {
  is_owner: boolean;
  groups_as_owner: Array<{ group_id: string; name: string; member_count: number; owner_name: string | null }>;
  groups_as_member: Array<{ group_id: string; name: string; owner_name: string | null; owner_email: string | null }>;
}

interface InviteResult {
  token: string;
  invite_url: string;
  expires_at: string;
}

// ─── API helpers ─────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

// ─── Component ───────────────────────────────────────────────────────────

export function FamilyManager() {
  const [status, setStatus] = useState<FamilyStatus | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteName, setInviteName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m] = await Promise.all([
        apiFetch('/family/status'),
        apiFetch('/family/members'),
      ]);
      setStatus(s);
      setMembers(m);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generateInvite = async () => {
    setGenerating(true);
    try {
      const result: InviteResult = await apiFetch('/family/invite', {
        method: 'POST',
        body: JSON.stringify({ invite_name: inviteName || undefined }),
      });
      setInvite(result);
      setShowInviteForm(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.invite_url);
    } catch {
      const el = document.createElement('textarea');
      el.value = invite.invite_url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const shareWhatsApp = () => {
    if (!invite) return;
    const text = encodeURIComponent(
      `Olá! Vou te convidar para acompanhar os cuidados dos nossos pets no PETMOL.\n\nClique no link para se cadastrar:\n${invite.invite_url}\n\n(Link válido por 7 dias)`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareEmail = () => {
    if (!invite) return;
    const subject = encodeURIComponent('Convite PETMOL — Família Pet');
    const body = encodeURIComponent(
      `Oi!\n\nEstou te convidando para acompanhar os cuidados dos nossos pets no PETMOL.\n\nClique no link abaixo para se cadastrar:\n${invite.invite_url}\n\nO link expira em 7 dias.\n\nBem-vindo(a) à família!`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const removeMember = async (userId: string) => {
    const accepted = await requestUserConfirmation('Remover este familiar? Ele perderá o acesso aos pets.', {
      title: 'Remover familiar',
      tone: 'danger',
      confirmLabel: 'Remover',
    });
    if (!accepted) return;
    setRemoving(userId);
    try {
      await apiFetch(`/family/members/${userId}`, { method: 'DELETE' });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setRemoving(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-8 h-8 border-[3px] border-[#0047ad] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Carregando família…</p>
      </div>
    );
  }

  const memberGroups = status?.groups_as_member ?? [];
  const isOwner = members.some(m => m.role === 'owner');
  const familyMembers = members.filter(m => m.role !== 'owner');

  return (
    <div className="space-y-5">

      {/* ── Error ─────────────────────────────────── */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 font-bold">✕</button>
        </div>
      )}

      {/* ── Member view: belongs to someone else's family ─────── */}
      {memberGroups.length > 0 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-2">
          <p className="text-sm font-semibold text-blue-900">👨‍👩‍👧 Você faz parte de:</p>
          {memberGroups.map(g => (
            <div key={g.group_id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800">{g.name}</p>
                <p className="text-xs text-blue-600">Tutor: {g.owner_name ?? g.owner_email}</p>
              </div>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Membro</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Invite Section ──────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 bg-gradient-to-r from-[#0047ad] to-[#1a73e8]">
          <h3 className="text-white font-semibold text-base">🔗 Convidar Familiar</h3>
          <p className="text-blue-100 text-xs mt-1">
            O familiar verá todos os seus pets e você receberá notificação a cada cuidado registrado.
          </p>
        </div>

        <div className="p-4 space-y-3">
          {!invite ? (
            <>
              {showInviteForm ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Nome do familiar (opcional, ex: Leilane)"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#0047ad]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={generateInvite}
                      disabled={generating}
                      className="flex-1 py-3 bg-[#0047ad] text-white text-sm font-semibold rounded-xl disabled:opacity-60"
                    >
                      {generating ? 'Gerando…' : '✨ Gerar Link'}
                    </button>
                    <button
                      onClick={() => setShowInviteForm(false)}
                      className="px-4 py-3 border border-gray-200 text-gray-600 text-sm rounded-xl"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowInviteForm(true)}
                  className="w-full py-3.5 bg-[#0047ad] text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
                >
                  <span>📨</span> Gerar Link de Convite
                </button>
              )}
            </>
          ) : (
            <div className="space-y-3">
              {/* Link display */}
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Link do convite (válido 7 dias):</p>
                <p className="text-xs text-[#0047ad] font-mono break-all">{invite.invite_url}</p>
              </div>

              {/* Share buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={shareWhatsApp}
                  className="flex flex-col items-center gap-1.5 py-3 bg-green-500 text-white rounded-xl text-xs font-semibold"
                >
                  <span className="text-xl">💬</span>
                  WhatsApp
                </button>
                <button
                  onClick={copyLink}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-colors ${
                    copied ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <span className="text-xl">{copied ? '✅' : '📋'}</span>
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
                <button
                  onClick={shareEmail}
                  className="flex flex-col items-center gap-1.5 py-3 bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold"
                >
                  <span className="text-xl">📧</span>
                  E-mail
                </button>
              </div>

              <button
                onClick={() => { setInvite(null); setInviteName(''); }}
                className="w-full py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl"
              >
                Gerar outro link
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Members List ─────────────────────────────────────────── */}
      {members.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">
              👨‍👩‍👧 Membros da Família ({members.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {members.map(m => (
              <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0047ad] to-[#1a73e8] flex items-center justify-center shrink-0">
                    <span className="text-white text-sm font-bold">
                      {(m.name ?? m.email)[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{m.name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    m.role === 'owner'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {m.role === 'owner' ? 'Tutor' : 'Familiar'}
                  </span>
                  {isOwner && m.role !== 'owner' && (
                    <button
                      onClick={() => removeMember(m.user_id)}
                      disabled={removing === m.user_id}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                      title="Remover familiar"
                    >
                      {removing === m.user_id ? (
                        <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin block" />
                      ) : (
                        <span className="text-sm leading-none">✕</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {familyMembers.length === 0 && !invite && (
        <div className="text-center py-6 text-gray-500">
          <p className="text-4xl mb-2">👨‍👩‍👧</p>
          <p className="text-sm font-medium text-gray-700">Nenhum familiar adicionado ainda</p>
          <p className="text-xs text-gray-500 mt-1">
            Gere um link e compartilhe para todos cuidarem juntos dos pets
          </p>
        </div>
      )}

      {/* ── How it works ────────────────────────────────────────── */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
        <p className="text-sm font-semibold text-amber-800">💡 Como funciona</p>
        <ul className="text-xs text-amber-700 space-y-1.5">
          <li>✅ O familiar recebe o link, se cadastra e já vê todos os seus pets</li>
          <li>🔔 Qualquer registro (banho, vacina, remédio) notifica a família inteira</li>
          <li>💊 Evita duplicatas: todos sabem quando o remédio já foi dado</li>
          <li>🔒 Você pode remover o acesso a qualquer momento</li>
        </ul>
      </div>
    </div>
  );
}
