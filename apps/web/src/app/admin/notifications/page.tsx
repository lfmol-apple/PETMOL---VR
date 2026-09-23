"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PremiumScreenShell } from "@/components/premium";
import { getToken } from "@/lib/auth-token";

type NoticePreview = { users_affected: number; records_affected: number; already_notified: number; to_notify_now: number };

/** Aviso único (push + e-mail) a quem registrou vacina pelo registro rápido com a
 * data do registro em vez da data da aplicação (corrigido no #527). O envio é
 * irreversível: pede confirmação com a contagem à vista e nunca repete o aviso
 * pro mesmo tutor (o servidor guarda quem já recebeu). */
function VaccineDateNoticeCard() {
  const [preview, setPreview] = useState<NoticePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const headers = useCallback((): Record<string, string> => {
    const token = getToken();
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/notices/vaccine-date/preview", { headers: headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPreview(await res.json());
    } catch (e) {
      setMsg(`Erro ao consultar: ${String((e as Error).message)}`);
    }
  }, [headers]);

  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    if (!preview || preview.to_notify_now === 0) return;
    if (!window.confirm(`Enviar push e e-mail para ${preview.to_notify_now} tutor(es)? Não dá para desfazer.`)) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/v1/admin/notices/vaccine-date/send", { method: "POST", headers: headers(), body: JSON.stringify({}) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
      setMsg(`Enviado a ${body.users} tutor(es): ${body.emails} e-mail(s), ${body.push_devices} aparelho(s) com push${body.email_failed ? `, ${body.email_failed} e-mail(s) falharam` : ""}.`);
      await load();
    } catch (e) {
      setMsg(`Erro: ${String((e as Error).message)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">Aviso único</p>
      <h3 className="text-sm font-semibold text-slate-900">Data da vacina no registro rápido</h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        Avisa (push + e-mail) quem registrou vacina pelo registro rápido entre 22/09 e o deploy da correção, com a data do registro
        no lugar da data de aplicação. Cada tutor recebe uma única vez.
      </p>
      {preview && (
        <p className="text-sm text-slate-800">
          <strong>{preview.to_notify_now}</strong> tutor(es) a avisar · {preview.records_affected} vacina(s) no período · {preview.already_notified} já avisado(s)
        </p>
      )}
      <button
        type="button"
        onClick={send}
        disabled={busy || !preview || preview.to_notify_now === 0}
        className="w-full rounded-2xl bg-[#0056D2] py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Enviando…" : "Enviar aviso"}
      </button>
      {msg && <p className="text-xs text-slate-700">{msg}</p>}
    </div>
  );
}

export default function AdminNotificationsPage() {
  return (
    <PremiumScreenShell
      title="Notificações Push"
      subtitle="A ativação do push agora é feita diretamente pelo tutor no perfil"
      backHref="/admin/dashboard"
    >
      <div className="px-4 py-6 max-w-md mx-auto space-y-6 pb-20">
        <VaccineDateNoticeCard />

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">
            Fonte única de configuração
          </p>
          <h2 className="text-lg font-semibold text-slate-900">
            O push no celular foi movido para o perfil do usuário.
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Agora o tutor ativa, testa e desativa as notificações em sua própria página de perfil.
            Na primeira abertura do perfil, o campo já aparece marcado por padrão.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Como orientar o tutor</h3>
          <ol className="space-y-2 text-sm text-slate-600 list-decimal list-inside">
            <li>Abrir o menu Perfil.</li>
            <li>Expandir “Preferências e Notificações”.</li>
            <li>Confirmar a permissão do navegador ou do dispositivo.</li>
            <li>Usar “Enviar teste” para validar o dispositivo.</li>
          </ol>

          <Link
            href="/profile"
            className="block w-full rounded-2xl bg-[#0056D2] py-3.5 text-center text-sm font-semibold text-white transition-opacity active:opacity-80"
          >
            Abrir perfil
          </Link>
        </div>
      </div>
    </PremiumScreenShell>
  );
}
