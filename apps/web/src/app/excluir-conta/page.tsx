'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PremiumScreenShell, PremiumCard } from '@/components/premium';
import { API_BASE_URL } from '@/lib/api';

/**
 * Página pública de exclusão de conta — exigência da Google Play (Data
 * Safety: o app precisa oferecer um jeito de solicitar exclusão de dados
 * SEM precisar ter o app instalado, ver docs/MOBILE_RELEASE_CHECKLIST.md).
 *
 * Fluxo real, não só uma página informativa: login (e-mail+senha) seguido
 * de DELETE /auth/me com a mesma senha — reaproveita exatamente a mesma
 * verificação de identidade que o app já usa (ver app/profile/page.tsx),
 * nunca apaga conta sem confirmar a senha. Quem não consegue fazer login
 * (esqueceu a senha, perdeu acesso ao e-mail) tem uma segunda via: pedir
 * por e-mail, com verificação humana antes de qualquer exclusão manual.
 */
export default function DeleteAccountPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !confirmChecked) return;

    setStatus('loading');
    setErrorMessage(null);

    try {
      const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!loginRes.ok) {
        setStatus('error');
        setErrorMessage('E-mail ou senha incorretos.');
        return;
      }

      const { access_token: accessToken } = await loginRes.json();

      const deleteRes = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ password }),
      });

      if (!deleteRes.ok) {
        const err = await deleteRes.json().catch(() => ({}));
        setStatus('error');
        setErrorMessage(err.detail || 'Não foi possível excluir a conta. Tente novamente.');
        return;
      }

      setStatus('done');
      setPassword('');
    } catch {
      setStatus('error');
      setErrorMessage('Erro de conexão. Tente novamente em instantes.');
    }
  };

  return (
    <PremiumScreenShell title="Excluir conta PETMOL" backHref="/">
      <PremiumCard>
        <div className="prose prose-sm prose-slate max-w-none">
          <h2>Solicitar exclusão da sua conta</h2>
          <p>
            O <strong>PETMOL</strong> é um aplicativo de organização de cuidados para pets
            (vacinas, medicações, antiparasitários, alimentação e lembretes). Esta página permite
            solicitar a exclusão da sua conta e dos dados associados a ela{' '}
            <strong>sem precisar ter o aplicativo instalado</strong> — atende à exigência da
            Google Play de oferecer um caminho de exclusão acessível pela web.
          </p>

          <h3>O que acontece quando você exclui sua conta</h3>
          <ul>
            <li>Seu cadastro, os pets vinculados, fotos, vacinas, medicações e histórico são removidos do banco de dados ativo imediatamente.</li>
            <li>Documentos enviados (carteirinhas, receitas, laudos) são apagados dos nossos servidores de arquivo.</li>
            <li>
              Cópias de segurança automáticas (backups diários) podem manter uma versão dos dados
              por até 14 dias após a exclusão, até expirarem pela rotina normal de retenção — não
              são acessadas nem restauradas individualmente, apenas existem como parte do processo
              de backup do banco de dados até serem descartadas.
            </li>
            <li>Não é necessário reinstalar ou abrir o app para concluir o processo.</li>
          </ul>

          <h3>Verificação de identidade</h3>
          <p>
            Por segurança, a exclusão exige confirmar seu e-mail e senha de acesso — nunca
            excluímos uma conta sem essa verificação, mesmo por este formulário.
          </p>
        </div>

        {status === 'done' ? (
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5">
            <p className="text-sm font-semibold text-green-900">✓ Conta excluída com sucesso.</p>
            <p className="mt-1 text-sm text-green-800">
              Seus dados foram removidos dos nossos sistemas ativos. Se você tinha o aplicativo
              instalado, pode desinstalá-lo quando quiser.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="delete-email" className="block text-xs font-semibold text-slate-600 mb-1">
                E-mail da conta
              </label>
              <input
                id="delete-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300"
                placeholder="seuemail@exemplo.com"
              />
            </div>
            <div>
              <label htmlFor="delete-password" className="block text-xs font-semibold text-slate-600 mb-1">
                Senha
              </label>
              <input
                id="delete-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300"
                placeholder="Sua senha"
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-0.5"
              />
              Entendo que esta ação é permanente e não pode ser desfeita.
            </label>

            {status === 'error' && errorMessage && (
              <p className="text-sm text-red-600" role="alert">{errorMessage}</p>
            )}

            <button
              type="submit"
              disabled={status === 'loading' || !confirmChecked}
              className="w-full rounded-xl bg-red-600 text-white font-semibold py-3 text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {status === 'loading' ? 'Excluindo...' : 'Excluir minha conta'}
            </button>
          </form>
        )}

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-800">Não consegue fazer login?</p>
          <p className="mt-1 text-sm text-slate-600">
            Se você esqueceu sua senha ou perdeu acesso ao e-mail cadastrado, escreva para{' '}
            <a href="mailto:privacidade@petmol.com.br" className="text-[#0056D2] hover:underline">
              privacidade@petmol.com.br
            </a>{' '}
            explicando sua solicitação de exclusão. Vamos verificar sua identidade antes de
            processar o pedido manualmente.
          </p>
        </div>

        <div className="mt-6 flex gap-4 flex-wrap">
          <Link href="/legal/privacy" className="text-[#0056D2] hover:text-[#003889] text-sm font-medium hover:underline transition-colors">
            Política de Privacidade
          </Link>
          <Link href="/" className="text-slate-500 hover:text-slate-800 text-sm hover:underline transition-colors">
            Voltar ao Início
          </Link>
        </div>
      </PremiumCard>
    </PremiumScreenShell>
  );
}
