'use client'

import { ChevronRight, Navigation } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { SheetHeader, SheetIcon, SheetShell } from '@/components/ui/sheet'

interface ProviderSheetProps {
  isOpen: boolean
  onClose: () => void
  placeId: string
  placeName: string
  lat?: number
  lng?: number
  category?: string
}

type Provider = 'waze' | 'gmaps' | 'apple'

const OPTIONS: { key: Provider; name: string; desc: string; accent: string }[] = [
  { key: 'waze', name: 'Waze', desc: 'Rotas com trânsito em tempo real', accent: 'text-cyan-600' },
  { key: 'gmaps', name: 'Google Maps', desc: 'Navegação completa com Street View', accent: 'text-emerald-600' },
  { key: 'apple', name: 'Apple Maps', desc: 'Integrado com dispositivos Apple', accent: 'text-slate-600' },
]

export default function ProviderSheet({
  isOpen,
  onClose,
  placeId,
  placeName,
  lat,
  lng,
  category = 'other',
}: ProviderSheetProps) {
  const handleProviderClick = (provider: Provider) => {
    const params = new URLSearchParams({
      place_id: placeId,
      service_category: category,
      place_name: placeName,
      provider,
    })
    if (lat) params.set('lat', lat.toString())
    if (lng) params.set('lng', lng.toString())
    window.open(`${API_BASE_URL}/handoff/directions?${params.toString()}`, '_blank')
    onClose()
  }

  if (!isOpen) return null

  return (
    <SheetShell open={isOpen} onClose={onClose} size="md" z={50}>
      <SheetHeader
        title="Abrir rota"
        subtitle={placeName}
        media={<SheetIcon tone="blue"><Navigation className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
        onClose={onClose}
      />
      <SheetShell.Body className="space-y-2.5">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => handleProviderClick(o.key)}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-150 hover:border-emerald-200 hover:shadow-[0_8px_20px_-8px_rgba(15,23,42,0.12)] active:scale-[0.98]"
          >
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-black/5">
              <Navigation className={`h-5 w-5 ${o.accent}`} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-slate-900">{o.name}</div>
              <div className="mt-0.5 text-[12px] text-slate-400">{o.desc}</div>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" strokeWidth={2.5} />
          </button>
        ))}
      </SheetShell.Body>
    </SheetShell>
  )
}
