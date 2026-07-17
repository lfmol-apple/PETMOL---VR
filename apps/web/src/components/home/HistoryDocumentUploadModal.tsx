'use client';
import { useEffect, useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';

interface HistoryDocumentUploadModalProps {
  showPicker: boolean;
  hasPendingFiles: boolean;
  inlineDocUploading: boolean;
  inlineDocPendingFiles: File[] | null;
  inlineDocTitle: string;
  inlineDocDate: string;
  inlineDocLocation: string;
  inlineDocCategory: string;
  onSetTitle: (value: string) => void;
  onSetDate: (value: string) => void;
  onSetLocation: (value: string) => void;
  onSetCategory: (value: string) => void;
  onClosePicker: () => void;
  onFilePicked: (files: FileList | null) => void;
  onCloseDetails: () => void;
  onUpload: () => void;
  sendNowLabel: string;
  sendDocumentLabel: string;
  vaccineLabel: string;
  uploadTypeExamLabel: string;
  uploadTypePrescriptionLabel: string;
  uploadTypeReportLabel: string;
  uploadTypePhotoLabel: string;
  uploadTypeOtherLabel: string;
}

export function HistoryDocumentUploadModal({
  showPicker,
  hasPendingFiles,
  inlineDocUploading,
  inlineDocPendingFiles,
  inlineDocTitle,
  inlineDocDate,
  inlineDocLocation,
  inlineDocCategory,
  onSetTitle,
  onSetDate,
  onSetLocation,
  onSetCategory,
  onClosePicker,
  onFilePicked,
  onCloseDetails,
  onUpload,
  sendNowLabel,
  sendDocumentLabel,
  vaccineLabel,
  uploadTypeExamLabel,
  uploadTypePrescriptionLabel,
  uploadTypeReportLabel,
  uploadTypePhotoLabel,
  uploadTypeOtherLabel,
}: HistoryDocumentUploadModalProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const categories: { key: string; icon: string; label: string }[] = [
    { key: 'exam',         icon: '🔬', label: uploadTypeExamLabel         },
    { key: 'vaccine',      icon: '💉', label: vaccineLabel                },
    { key: 'prescription', icon: '📋', label: uploadTypePrescriptionLabel },
    { key: 'report',       icon: '📄', label: uploadTypeReportLabel       },
    { key: 'photo',        icon: '📸', label: uploadTypePhotoLabel        },
    { key: 'other',        icon: '📎', label: uploadTypeOtherLabel        },
  ];

  useEffect(() => {
    const file = inlineDocPendingFiles?.[0];
    if (!file || !file.type.startsWith('image/')) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [inlineDocPendingFiles]);

  useEffect(() => {
    if (!hasPendingFiles) setShowDetails(false);
  }, [hasPendingFiles]);

  if (showPicker && !hasPendingFiles) {
    return (
      <ModalPortal>
      <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-[249]" onClick={(event) => { if (event.target === event.currentTarget) onClosePicker(); }}>
        <div className="bg-white rounded-t-[32px] w-full max-w-sm shadow-2xl pb-safe">
          <div className="flex items-center justify-between px-5 py-4">
            <h3 className="font-bold text-gray-800 text-base">📎 {sendDocumentLabel}</h3>
            <button onClick={onClosePicker} className="text-gray-400 text-xl w-8 h-8 flex items-center justify-center" style={{ touchAction: 'manipulation' }}>✕</button>
          </div>
          <div className="grid grid-cols-2 gap-3 px-5 pb-6">
            <label className="flex flex-col items-center justify-center gap-2 bg-violet-50 active:bg-violet-100 border-2 border-dashed border-violet-300 rounded-2xl py-6 cursor-pointer" style={{ touchAction: 'manipulation' }}>
              <span className="text-4xl">🖼️</span>
              <span className="text-sm font-bold text-violet-700">Galeria</span>
              <span className="text-xs text-violet-400">Foto ou PDF</span>
              <input type="file" accept="image/*,application/pdf,.zip,application/zip,application/x-zip-compressed" multiple className="sr-only" onChange={(event) => onFilePicked(event.target.files)} />
            </label>
            <label className="flex flex-col items-center justify-center gap-2 bg-indigo-50 active:bg-indigo-100 border-2 border-dashed border-indigo-300 rounded-2xl py-6 cursor-pointer" style={{ touchAction: 'manipulation' }}>
              <span className="text-4xl">📷</span>
              <span className="text-sm font-bold text-indigo-700">Câmera</span>
              <span className="text-xs text-indigo-400">Tirar foto agora</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => onFilePicked(event.target.files)} />
            </label>
          </div>
        </div>
      </div>
      </ModalPortal>
    );
  }

  if (!hasPendingFiles || !inlineDocPendingFiles) {
    return null;
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-[250]" onClick={(event) => { if (event.target === event.currentTarget) onCloseDetails(); }}>
      <div className="bg-white rounded-t-[32px] w-full max-w-sm shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
          <h3 className="font-bold text-gray-800 text-base">Pronto para enviar</h3>
          <button onClick={onCloseDetails} className="text-gray-400 text-xl w-8 h-8 flex items-center justify-center" style={{ touchAction: 'manipulation' }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 flex flex-col gap-3 pb-3">

          {/* Preview */}
          {previewUrl ? (
            <div className="relative rounded-2xl overflow-hidden bg-gray-100 h-36 flex-shrink-0">
              <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2">
                <p className="text-white text-xs font-medium truncate">
                  {inlineDocPendingFiles.length === 1 ? inlineDocPendingFiles[0].name : `${inlineDocPendingFiles.length} arquivos`}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 flex-shrink-0">
              <span className="text-lg">✅</span>
              <p className="text-sm text-green-800 font-semibold truncate flex-1">
                {inlineDocPendingFiles.length === 1 ? inlineDocPendingFiles[0].name : `${inlineDocPendingFiles.length} arquivos selecionados`}
              </p>
            </div>
          )}

          {/* Categoria — grade 3x2 */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-2 uppercase tracking-wide">Tipo</label>
            <div className="grid grid-cols-3 gap-2">
              {categories.map((cat) => {
                const active = inlineDocCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => onSetCategory(cat.key)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-center transition-all active:scale-[0.96] ${
                      active
                        ? 'bg-violet-600 border-violet-600 text-white shadow-md'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <span className="text-xl">{cat.icon}</span>
                    <span className="text-[11px] font-semibold leading-tight">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Nome <span className="normal-case font-normal text-gray-300">(opcional)</span></label>
            <input
              type="text"
              value={inlineDocTitle}
              onChange={(event) => onSetTitle(event.target.value)}
              placeholder="Ex: Exame de sangue, Receita de vermífugo…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-gray-50"
            />
          </div>

          {/* Detalhes colapsáveis */}
          <button
            type="button"
            onClick={() => setShowDetails((p) => !p)}
            className="flex items-center gap-2 text-sm text-gray-400 font-medium py-1"
            style={{ touchAction: 'manipulation' }}
          >
            <span className={`transition-transform ${showDetails ? 'rotate-90' : ''}`}>›</span>
            {showDetails ? 'Ocultar detalhes' : 'Adicionar data e local'}
          </button>

          {showDetails && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1 uppercase tracking-wide">Data</label>
                <input
                  type="date"
                  value={inlineDocDate}
                  onChange={(event) => onSetDate(event.target.value)}
                  onBlur={(event) => onSetDate(event.target.value)}
                  onInput={(event) => onSetDate((event.target as HTMLInputElement).value)}
                  max={new Date().toLocaleDateString('sv')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-gray-50"
                  style={{ colorScheme: 'light' }}
                />
                {inlineDocDate && (
                  <p className="text-xs text-violet-600 mt-1 pl-1">
                    📅 {new Date(inlineDocDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1 uppercase tracking-wide">Local / Estabelecimento</label>
                <input
                  type="text"
                  value={inlineDocLocation}
                  onChange={(event) => onSetLocation(event.target.value.toUpperCase())}
                  placeholder="Ex: Clínica VetCenter…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-gray-50"
                />
              </div>
            </div>
          )}
        </div>

        {/* Enviar */}
        <div className="px-5 py-4 flex-shrink-0">
          <button
            onClick={onUpload}
            disabled={inlineDocUploading}
            className="w-full bg-violet-600 hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-[16px] shadow-lg shadow-violet-500/25"
            style={{ touchAction: 'manipulation' }}
          >
            {inlineDocUploading ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Enviando…</span>
              </>
            ) : (
              <>
                <span>📤</span>
                <span>{sendNowLabel}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}