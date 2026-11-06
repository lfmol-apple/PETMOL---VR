'use client';

import { ChevronRight } from 'lucide-react';
import { SheetHeader, SheetShell, SHEET_Z } from '@/components/ui/sheet';
import { trackProductEvent } from '@/lib/analytics';
import { HOWTO_CHANNEL_URL, HOWTO_VIDEOS, howToVideoUrl, openHowToUrl } from '@/features/howto/howToVideos';

/** "Como usar o PETMOL": um botão por tema, cada um abre o vídeo certo do canal. */
export function HowToSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <SheetShell open={open} onClose={onClose} hideHandle z={SHEET_Z.base}>
      <SheetHeader tone="petmol" withHandle title="Como usar o PETMOL" subtitle="Toque no assunto para assistir" onClose={onClose} />
      <SheetShell.Body pad={false} className="space-y-2 px-4 pt-4">
        {HOWTO_VIDEOS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => {
              trackProductEvent('howto_video_opened', { video: v.key });
              void openHowToUrl(howToVideoUrl(v.videoId));
            }}
            className="group flex w-full items-center gap-3 rounded-xl border border-[#BFD4F0] bg-gradient-to-br from-white to-[#E6EEF9] px-3.5 py-3 text-left transition-all active:scale-[0.98]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-[#0B1E36]">{v.title}</span>
              <span className="mt-0.5 block text-[12px] text-[#5B6B82]">{v.subtitle}</span>
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-[#8EA9C9]" strokeWidth={2.5} />
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            trackProductEvent('howto_video_opened', { video: 'canal' });
            void openHowToUrl(HOWTO_CHANNEL_URL);
          }}
          className="mt-1 block w-full rounded-xl bg-[#0056D2] px-3 py-3.5 text-center text-[14px] font-extrabold text-white transition-transform active:scale-[0.98]"
        >
          Ver todos no canal do YouTube
        </button>
      </SheetShell.Body>
    </SheetShell>
  );
}
