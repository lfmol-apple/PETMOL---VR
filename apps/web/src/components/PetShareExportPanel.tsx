'use client';

import { useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { PetEventRecord } from '@/lib/petEvents';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';
import type { VetHistoryDocument } from '@/lib/types/homeForms';
import type { ParasiteControl, GroomingRecord } from '@/lib/types/home';

type ShareMode = 'basic' | 'emergency' | 'complete';
type PdfType = 'quick' | 'wallet' | 'dossier';

const APP_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ? String(process.env.NEXT_PUBLIC_SITE_URL).replace(/\/$/, '') : undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : 'https://petmol.com.br');

function modeLabel(mode: ShareMode) {
  if (mode === 'emergency') return 'Emergência';
  if (mode === 'complete') return 'Completo';
  return 'Básico';
}

function pdfLabel(type: PdfType) {
  if (type === 'wallet') return 'Carteira';
  if (type === 'dossier') return 'Dossiê';
  return 'Ficha rápida';
}

export function PetShareExportPanel({
  pet,
  vaccines,
  petEvents,
  documents,
  parasiteControls,
  groomingRecords,
}: {
  pet: PetHealthProfile;
  vaccines: VaccineRecord[];
  petEvents: PetEventRecord[];
  documents: VetHistoryDocument[];
  parasiteControls?: ParasiteControl[];
  groomingRecords?: GroomingRecord[];
}) {
  const [mode, setMode] = useState<ShareMode>('basic');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [publicIdOverride, setPublicIdOverride] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const publicId = useMemo(() => {
    if (publicIdOverride) return publicIdOverride;
    if (typeof window === 'undefined') return pet.pet_id;
    const key = `petmol_public_id_${pet.pet_id}`;
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  }, [pet.pet_id, publicIdOverride]);

  async function generateQr(nextMode = mode) {
    setStatusMessage(null);
    let nextPublicId = publicId;
    try {
      const token = getToken();
      if (token) {
        const response = await fetch(`${API_BASE_URL}/rg/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          credentials: 'include',
          body: JSON.stringify({
            pet_id: pet.pet_id,
            template: nextMode,
            is_public: true,
            contact_mode: 'handoff_only',
          }),
        });
        if (response.ok) {
          const data = await response.json() as { pet_public_id: string; public_url: string };
          nextPublicId = data.pet_public_id;
          setPublicIdOverride(nextPublicId);
          localStorage.setItem(`petmol_public_id_${pet.pet_id}`, nextPublicId);
        }
      }
    } catch {
      setStatusMessage('QR preparado localmente. Sincronize quando a conexão voltar.');
    }
    const token = crypto.randomUUID();
    const url = `${APP_URL}/p/${encodeURIComponent(nextPublicId)}?share=${token}&mode=${nextMode}`;
    localStorage.setItem(`petmol_pet_share_${pet.pet_id}`, JSON.stringify({
      pet_public_id: nextPublicId,
      token,
      mode: nextMode,
      revoked: false,
      created_at: new Date().toISOString(),
    }));
    setShareUrl(url);
    setQrDataUrl(await QRCode.toDataURL(url, { width: 320, margin: 2 }));
  }

  async function revokeQr() {
    setStatusMessage(null);
    try {
      const token = getToken();
      if (token) {
        await fetch(`${API_BASE_URL}/rg/${encodeURIComponent(publicId)}/revoke`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });
      }
    } catch {
      setStatusMessage('Revogado localmente. Sincronize quando a conexão voltar.');
    }
    localStorage.setItem(`petmol_pet_share_${pet.pet_id}`, JSON.stringify({
      pet_public_id: publicId,
      mode,
      revoked: true,
      revoked_at: new Date().toISOString(),
    }));
    setQrDataUrl('');
    setShareUrl('');
  }

  async function regenerateQr() {
    setStatusMessage(null);
    let nextPublicId = publicId;
    try {
      const token = getToken();
      if (token) {
        const response = await fetch(`${API_BASE_URL}/rg/${encodeURIComponent(publicId)}/regenerate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json() as { pet_public_id: string; public_url: string };
          nextPublicId = data.pet_public_id;
        }
      }
    } catch {
      nextPublicId = crypto.randomUUID();
      setStatusMessage('QR regenerado localmente. Sincronize quando a conexão voltar.');
    }

    setPublicIdOverride(nextPublicId);
    localStorage.setItem(`petmol_public_id_${pet.pet_id}`, nextPublicId);
    const token = crypto.randomUUID();
    const url = `${APP_URL}/p/${encodeURIComponent(nextPublicId)}?share=${token}&mode=${mode}`;
    localStorage.setItem(`petmol_pet_share_${pet.pet_id}`, JSON.stringify({
      pet_public_id: nextPublicId,
      token,
      mode,
      revoked: false,
      regenerated_at: new Date().toISOString(),
    }));
    setShareUrl(url);
    setQrDataUrl(await QRCode.toDataURL(url, { width: 320, margin: 2 }));
  }

  async function shareQr() {
    if (!shareUrl) return;
    if (navigator.share) {
      await navigator.share({ title: `PETMOL - ${pet.pet_name}`, url: shareUrl }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(shareUrl);
  }

  function exportPdf(type: PdfType) {
    const meds = petEvents.filter(ev => ev.type === 'medicacao' || ev.type === 'medication');
    const dewormers = (parasiteControls ?? []).filter(p => p.type === 'dewormer');
    const fleaTicks = (parasiteControls ?? []).filter(p => p.type === 'flea_tick');
    const collars = (parasiteControls ?? []).filter(p => p.type === 'collar');

    const fmtDate = (s?: string | null) => {
      if (!s) return '—';
      const clean = s.split('T')[0];
      const [y, m, d] = clean.split('-').map(Number);
      const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
      return `${d} ${MONTHS[m - 1]} ${y}`;
    };

    const vaccineRows = vaccines.map(v => `
      <tr>
        <td>${v.vaccine_name}</td>
        <td>${fmtDate(v.date_administered)}</td>
        <td>${fmtDate(v.next_dose_date)}</td>
        <td>${v.record_type === 'estimated_control_start' ? '⚪ Estimado' : '✅ Confirmado'}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="color:#888">Sem vacinas registradas.</td></tr>';

    const parasiteSection = type === 'dossier' || type === 'wallet' ? `
      <h2>Preventivos</h2>
      ${dewormers.length ? `<h3>Vermífugo</h3><table><thead><tr><th>Produto</th><th>Data</th><th>Próxima</th></tr></thead><tbody>
        ${dewormers.map(p => `<tr><td>${p.product_name}</td><td>${fmtDate(p.date_applied)}</td><td>${fmtDate(p.next_due_date)}</td></tr>`).join('')}
      </tbody></table>` : '<p style="color:#888">Sem registros de vermífugo.</p>'}
      ${fleaTicks.length ? `<h3>Antipulgas / Carrapatos</h3><table><thead><tr><th>Produto</th><th>Data</th><th>Próxima</th></tr></thead><tbody>
        ${fleaTicks.map(p => `<tr><td>${p.product_name}</td><td>${fmtDate(p.date_applied)}</td><td>${fmtDate(p.next_due_date)}</td></tr>`).join('')}
      </tbody></table>` : ''}
      ${collars.length ? `<h3>Coleira Antiparasitária</h3><table><thead><tr><th>Produto</th><th>Data colocação</th><th>Validade</th></tr></thead><tbody>
        ${collars.map(p => `<tr><td>${p.product_name}</td><td>${fmtDate(p.date_applied)}</td><td>${fmtDate(p.collar_expiry_date ?? p.next_due_date)}</td></tr>`).join('')}
      </tbody></table>` : ''}
    ` : '';

    const groomingSection = type === 'dossier' && groomingRecords?.length ? `
      <h2>Histórico de banho e tosa</h2>
      <table><thead><tr><th>Tipo</th><th>Data</th><th>Local</th><th>Custo</th></tr></thead><tbody>
        ${(groomingRecords ?? []).sort((a, b) => b.date.localeCompare(a.date)).map(g => {
          const typeLabel = g.type === 'bath' ? 'Banho' : g.type === 'grooming' ? 'Tosa' : 'Banho + Tosa';
          return `<tr><td>${typeLabel}</td><td>${fmtDate(g.date)}</td><td>${g.location || '—'}</td><td>${g.cost ? `R$ ${Number(g.cost).toFixed(2)}` : '—'}</td></tr>`;
        }).join('')}
      </tbody></table>
    ` : '';

    const docsSection = type === 'dossier' && documents.length ? `
      <h2>Documentos</h2>
      <ul>${documents.map(d => `<li>${d.title || d.document_type || 'Documento'} — ${fmtDate(d.document_date || d.created_at)}</li>`).join('')}</ul>
    ` : '';

    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return;
    win.document.write(`<!doctype html>
      <html><head><title>${pdfLabel(type)} — ${pet.pet_name}</title>
      <meta charset="utf-8">
      <style>
        body{font-family:Arial,sans-serif;color:#111;margin:32px;line-height:1.4;font-size:13px}
        h1{font-size:20px;margin:0 0 8px} h2{font-size:15px;margin:24px 0 8px;color:#1a4a8a;border-bottom:1px solid #ddd;padding-bottom:4px}
        h3{font-size:13px;margin:12px 0 6px;color:#444}
        .page{page-break-after:always;margin-bottom:40px}
        table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}
        td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f4f4f4;font-weight:bold}
        footer{position:fixed;bottom:12px;left:32px;right:32px;font-size:10px;color:#888;border-top:1px solid #eee;padding-top:6px}
        .badge-confirmed{color:#166534;background:#dcfce7;padding:2px 6px;border-radius:4px;font-size:11px}
        .badge-estimated{color:#713f12;background:#fef9c3;padding:2px 6px;border-radius:4px;font-size:11px}
        img{max-width:120px;border-radius:8px;margin-bottom:8px}
        ul{padding-left:20px;margin:6px 0} li{margin-bottom:4px}
        @media print{footer{position:fixed}}
      </style></head><body>
      <footer>Documento gerado automaticamente pelo PETMOL com base nos dados cadastrados pelo tutor. Data: ${new Date().toLocaleDateString('pt-BR')}</footer>

      <section class="page">
        <h1>🐾 ${pdfLabel(type)} — ${pet.pet_name}</h1>
        ${pet.photo ? `<img src="${pet.photo}" alt="${pet.pet_name}">` : ''}
        <p><strong>Pet:</strong> ${pet.pet_name}</p>
        ${pet.species ? `<p><strong>Espécie:</strong> ${pet.species === 'dog' ? 'Cachorro' : pet.species === 'cat' ? 'Gato' : pet.species}</p>` : ''}
        ${pet.breed ? `<p><strong>Raça:</strong> ${pet.breed}</p>` : ''}
        ${pet.birth_date ? `<p><strong>Nascimento:</strong> ${fmtDate(pet.birth_date)}</p>` : ''}
        <p><strong>QR de compartilhamento:</strong> ${shareUrl || `${APP_URL}/p/${encodeURIComponent(publicId)}`}</p>
        <p><strong>Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
      </section>

      ${type !== 'quick' ? `
      <section class="page">
        <h2>⚠️ Informações essenciais</h2>
        <h3>Alergias</h3>
        <p>${pet.allergies?.length ? pet.allergies.map(a => `${a.allergen} (${a.severity})`).join(', ') : 'Sem alergias registradas.'}</p>
        <h3>Medicações em uso</h3>
        <p>${meds.length ? meds.map(m => `${m.title} — iniciado ${fmtDate((m.scheduled_at || '').slice(0, 10))}`).join('<br>') : 'Sem medicações registradas.'}</p>
      </section>
      ` : ''}

      <section${type === 'dossier' ? ' class="page"' : ''}>
        <h2>💉 Vacinas</h2>
        <table><thead><tr><th>Vacina</th><th>Data</th><th>Próxima</th><th>Status</th></tr></thead>
        <tbody>${vaccineRows}</tbody></table>
      </section>

      ${parasiteSection ? `<section${type === 'dossier' ? ' class="page"' : ''}>${parasiteSection}</section>` : ''}
      ${groomingSection ? `<section class="page">${groomingSection}</section>` : ''}
      ${docsSection ? `<section class="page">${docsSection}</section>` : ''}

      <script>window.print()</script>
      </body></html>`);
    win.document.close();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-900">QR e PDF</h3>
        <p className="text-xs text-slate-500">Compartilhe por URL segura. O QR não armazena dados do pet.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['basic', 'emergency', 'complete'] as ShareMode[]).map(item => (
          <button key={item} onClick={() => { setMode(item); void generateQr(item); }} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-700">
            {modeLabel(item)}
          </button>
        ))}
      </div>
      {qrDataUrl && <img src={qrDataUrl} alt="QR do pet" className="mx-auto h-40 w-40" />}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => void generateQr()} className="rounded-lg bg-slate-900 px-2 py-2 text-xs font-bold text-white">Gerar</button>
        <button onClick={shareQr} className="rounded-lg bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700">Compartilhar</button>
        <button onClick={revokeQr} className="rounded-lg bg-red-50 px-2 py-2 text-xs font-bold text-red-600">Revogar</button>
      </div>
      <button onClick={regenerateQr} className="w-full rounded-lg bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700">Regenerar</button>
      {statusMessage && <p className="text-xs text-amber-700">{statusMessage}</p>}
      <div className="grid grid-cols-3 gap-2">
        {(['quick', 'wallet', 'dossier'] as PdfType[]).map(type => (
          <button key={type} onClick={() => exportPdf(type)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-700">
            {pdfLabel(type)}
          </button>
        ))}
      </div>
    </div>
  );
}
