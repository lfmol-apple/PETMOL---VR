"use client";

import Link from "next/link";
import { PremiumScreenShell } from "@/components/premium";

export default function AdminNotificationsPage() {
  return (
    <PremiumScreenShell
      title="Notificações Push"
      subtitle="A ativação do push agora é feita diretamente pelo tutor no perfil"
      backHref="/admin/dashboard"
    >
      <div className="px-4 py-6 max-w-md mx-auto space-y-6 pb-20">
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
