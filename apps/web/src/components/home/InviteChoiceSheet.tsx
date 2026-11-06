'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { SheetHeader, SheetShell, SHEET_Z } from '@/components/ui/sheet';

/**
 * "Convidar": as duas opções que antes eram dois botões soltos na Home. Cada uma chama
 * exatamente o mesmo handler de antes (nada muda no que é enviado):
 *  - família: link PESSOAL do pet (quem aceita vira cuidador e vê os dados dele);
 *  - amigos: link geral do app, com a marcação de campanha de convite.
 */
export function InviteChoiceSheet({
  open, petName, onClose, onInviteFamily, onShareApp,
}: {
  open: boolean;
  petName: string;
  onClose: () => void;
  onInviteFamily: () => Promise<void>;
  onShareApp: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<'family' | 'app' | null>(null);
  if (!open) return null;

  const run = async (which: 'family' | 'app') => {
    if (busy) return;
    setBusy(which);
    try {
      await (which === 'family' ? onInviteFamily() : onShareApp());
    } finally {
      setBusy(null);
      onClose();
    }
  };

  return (
    <SheetShell open={open} onClose={onClose} hideHandle z={SHEET_Z.base}>
      <SheetHeader tone="petmol" withHandle title="Convidar" subtitle="Escolha como quer convidar" onClose={onClose} />
      <SheetShell.Body pad={false} className="space-y-2 px-4 pt-4">
        <Option
          title="Convidar família"
          text={`Para cuidar de ${petName || 'seu pet'} com você. Quem aceitar passa a ver os dados dele.`}
          loading={busy === 'family'}
          disabled={busy !== null}
          onClick={() => void run('family')}
        />
        <Option
          title="Indicar o PETMOL"
          text="Para amigos conhecerem e baixarem o app."
          loading={busy === 'app'}
          disabled={busy !== null}
          onClick={() => void run('app')}
        />
      </SheetShell.Body>
    </SheetShell>
  );
}

function Option({ title, text, loading, disabled, onClick }: {
  title: string; text: string; loading: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-xl border border-[#BFD4F0] bg-gradient-to-br from-white to-[#E6EEF9] px-3.5 py-3 text-left transition-all active:scale-[0.98] disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-[#0B1E36]">{loading ? 'Gerando link...' : title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-[#5B6B82]">{text}</span>
      </span>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-[#8EA9C9]" strokeWidth={2.5} />
    </button>
  );
}
