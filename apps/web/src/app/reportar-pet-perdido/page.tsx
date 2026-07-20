'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';

type PublicStatus = {
  missing_pet: {
    pet_name: string;
    species: string | null;
    breed: string | null;
    region: string | null;
    photo_url: string | null;
    status: string;
    created_at: string | null;
  };
  public_url: string | null;
  reports: Array<{
    report_id: string;
    finder_location: string | null;
    notes: string | null;
    created_at: string | null;
    has_photos: boolean;
    photo_count: number;
    confidence_label?: string;
  }>;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ReportarPetPerdidoPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [statusToken, setStatusToken] = useState('');
  const [statusData, setStatusData] = useState<PublicStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [petName, setPetName] = useState('');
  const [species, setSpecies] = useState('dog');
  const [breed, setBreed] = useState('');
  const [characteristics, setCharacteristics] = useState('');
  const [reporterContact, setReporterContact] = useState('');
  const [lastSeenLocation, setLastSeenLocation] = useState('');
  const [missingDate, setMissingDate] = useState('');
  const [missingTime, setMissingTime] = useState('');
  const [photoBase64, setPhotoBase64] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [created, setCreated] = useState<{ token: string; publicUrl: string | null } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('status') || '';
    if (token) setStatusToken(token);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    if (!statusToken) return;
    let active = true;
    async function loadStatus() {
      setStatusLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/missing-pets/status/${encodeURIComponent(statusToken)}`);
        if (!res.ok) throw new Error('status_error');
        const data = await res.json();
        if (active) setStatusData(data);
      } catch {
        if (active) setMessage('Não foi possível carregar este acompanhamento.');
      } finally {
        if (active) setStatusLoading(false);
      }
    }
    loadStatus();
    return () => { active = false; };
  }, [statusToken]);

  const canSubmit = useMemo(() => {
    return petName.trim().length >= 2 && reporterContact.trim().length >= 5 && !submitting;
  }, [petName, reporterContact, submitting]);

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setPhotoBase64(dataUrl);
    setPhotoPreview(dataUrl);
  }

  async function submitReport() {
    if (!canSubmit) return;
    setSubmitting(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/missing-pets/public-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pet_name: petName.trim(),
          species,
          breed: breed.trim() || null,
          characteristics: characteristics.trim() || null,
          reporter_contact: reporterContact.trim(),
          last_seen_location: lastSeenLocation.trim() || null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          missing_date: missingDate || null,
          missing_time: missingTime || null,
          photo_base64: photoBase64 || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || 'Erro ao registrar');
      if (data.status === 'rejected_photo_quality') {
        setMessage(data.message || 'A foto precisa estar mais nítida.');
        return;
      }
      setCreated({ token: data.access_token, publicUrl: data.public_url || null });
      setStatusToken(data.access_token);
      setMessage('Registro criado. Guarde este link para acompanhar possíveis contatos.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao registrar');
    } finally {
      setSubmitting(false);
    }
  }

  const statusPhoto = resolvePetPhotoUrl(statusData?.missing_pet.photo_url);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-2xl font-black text-blue-700">Petmol</Link>
          <Link href="/achei-um-pet" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">Achei um pet</Link>
        </div>

        <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">Alerta público</p>
          <h1 className="mt-2 text-3xl font-black leading-tight">Reportar pet perdido</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use este formulário quando uma instituição, vizinho ou terceiro precisa divulgar um pet perdido sem criar conta.
          </p>
        </div>

        {created && (
          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
            <p className="font-black">Registro ativo</p>
            <p className="mt-1 text-sm">Acompanhe por esta página. O link público pode ser compartilhado sem mostrar seu contato.</p>
            {created.publicUrl && (
              <Link className="mt-3 inline-flex rounded-full bg-emerald-700 px-4 py-2 text-sm font-black text-white" href={created.publicUrl}>
                Abrir página pública
              </Link>
            )}
          </div>
        )}

        {statusToken && (
          <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">Acompanhamento</p>
                <h2 className="mt-1 text-xl font-black">Possíveis contatos</h2>
              </div>
              {statusData?.public_url && (
                <Link href={statusData.public_url} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white">Página pública</Link>
              )}
            </div>
            {statusLoading ? (
              <p className="mt-4 text-sm text-slate-500">Carregando...</p>
            ) : statusData ? (
              <div className="mt-4 flex flex-col gap-4">
                <div className="flex gap-3">
                  {statusPhoto && <img src={statusPhoto} alt="" className="h-20 w-20 rounded-2xl object-cover" />}
                  <div>
                    <p className="text-lg font-black">{statusData.missing_pet.pet_name}</p>
                    <p className="text-sm text-slate-600">{statusData.missing_pet.region || 'Região não informada'}</p>
                    <p className="mt-1 text-xs font-bold uppercase text-amber-700">{statusData.missing_pet.status === 'found' ? 'Encontrado' : 'Ativo'}</p>
                  </div>
                </div>
                {statusData.reports.length ? (
                  statusData.reports.map((report) => (
                    <div key={report.report_id} className="rounded-2xl border border-slate-200 p-4">
                      <p className="font-bold">{report.confidence_label || 'Novo contato recebido'}</p>
                      <p className="mt-1 text-sm text-slate-600">{report.finder_location || 'Local não informado'}</p>
                      {report.notes && <p className="mt-2 text-sm text-slate-700">{report.notes}</p>}
                      {report.has_photos && <p className="mt-2 text-xs font-bold text-blue-700">{report.photo_count} foto(s) enviada(s)</p>}
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Ainda não recebemos contatos para este alerta.</p>
                )}
              </div>
            ) : null}
          </div>
        )}

        <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4">
            <button type="button" onClick={() => fileRef.current?.click()} className="overflow-hidden rounded-[22px] border-2 border-dashed border-blue-200 bg-blue-50 p-4 text-left">
              {photoPreview ? (
                <img src={photoPreview} alt="" className="h-64 w-full rounded-2xl object-cover" />
              ) : (
                <div className="flex h-48 items-center justify-center rounded-2xl bg-white text-center text-sm font-bold text-blue-700">
                  Adicionar foto do pet
                </div>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e.target.files?.[0])} />

            <input value={petName} onChange={(e) => setPetName(e.target.value)} placeholder="Nome ou identificação do pet" className="rounded-2xl border border-slate-200 px-4 py-4 text-base outline-none focus:border-blue-500" />
            <select value={species} onChange={(e) => setSpecies(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-4 text-base outline-none focus:border-blue-500">
              <option value="dog">Cachorro</option>
              <option value="cat">Gato</option>
              <option value="other">Outro</option>
            </select>
            <input value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="Raça ou porte" className="rounded-2xl border border-slate-200 px-4 py-4 text-base outline-none focus:border-blue-500" />
            <textarea value={characteristics} onChange={(e) => setCharacteristics(e.target.value)} placeholder="Características visíveis: cor, manchas, coleira, comportamento" className="min-h-28 rounded-2xl border border-slate-200 px-4 py-4 text-base outline-none focus:border-blue-500" />
            <input value={lastSeenLocation} onChange={(e) => setLastSeenLocation(e.target.value)} placeholder="Última região vista, sem endereço sensível" className="rounded-2xl border border-slate-200 px-4 py-4 text-base outline-none focus:border-blue-500" />
            <div className="grid grid-cols-2 gap-3">
              <input value={missingDate} onChange={(e) => setMissingDate(e.target.value)} type="date" className="rounded-2xl border border-slate-200 px-4 py-4 text-base outline-none focus:border-blue-500" />
              <input value={missingTime} onChange={(e) => setMissingTime(e.target.value)} type="time" className="rounded-2xl border border-slate-200 px-4 py-4 text-base outline-none focus:border-blue-500" />
            </div>
            <input value={reporterContact} onChange={(e) => setReporterContact(e.target.value)} placeholder="Seu contato para acompanhar" className="rounded-2xl border border-slate-200 px-4 py-4 text-base outline-none focus:border-blue-500" />
            {message && <p className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</p>}
            <button type="button" disabled={!canSubmit} onClick={submitReport} className="rounded-2xl bg-blue-600 px-5 py-4 text-lg font-black text-white disabled:bg-slate-300">
              {submitting ? 'Registrando...' : 'Registrar alerta público'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
