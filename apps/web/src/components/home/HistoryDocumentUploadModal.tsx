'use client';
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
  const categories: { key: string; icon: string; label: string; color: string }[] = [
    { key: 'exam', icon: '🔬', label: uploadTypeExamLabel, color: 'blue' },
    { key: 'prescription', icon: '📋', label: uploadTypePrescriptionLabel, color: 'purple' },
    { key: 'report', icon: '📄', label: uploadTypeReportLabel, color: 'indigo' },
    { key: 'vaccine', icon: '💉', label: vaccineLabel, color: 'green' },
    { key: 'photo', icon: '📸', label: uploadTypePhotoLabel, color: 'pink' },
    { key: 'other', icon: '📎', label: uploadTypeOtherLabel, color: 'gray' },
  ];

  if (showPicker && !hasPendingFiles) {
    return (
      <ModalPortal>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[249]" onClick={(event) => { if (event.target === event.currentTarget) onClosePicker(); }}>
        <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 w-full max-w-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="font-bold text-gray-800 text-base">📎 {sendDocumentLabel}</h3>
            <button onClick={onClosePicker} className="text-gray-400 hover:text-gray-600 text-xl leading-none w-8 h-8 flex items-center justify-center" style={{ touchAction: 'manipulation' }}>✕</button>
          </div>
          <div className="grid grid-cols-2 gap-3 px-5 py-4">
            <label className="flex flex-col items-center justify-center gap-2 bg-indigo-50 active:bg-indigo-100 border-2 border-dashed border-indigo-300 rounded-xl py-5 cursor-pointer" style={{ touchAction: 'manipulation' }}>
              <span className="text-3xl">🖼️</span>
              <span className="text-sm font-semibold text-indigo-700">Galeria</span>
              <span className="text-xs text-indigo-400">Foto, PDF ou ZIP</span>
              <input type="file" accept="image/*,application/pdf,.zip,application/zip,application/x-zip-compressed" multiple className="sr-only" onChange={(event) => onFilePicked(event.target.files)} />
            </label>
            <label className="flex flex-col items-center justify-center gap-2 bg-violet-50 active:bg-violet-100 border-2 border-dashed border-violet-300 rounded-xl py-5 cursor-pointer" style={{ touchAction: 'manipulation' }}>
              <span className="text-3xl">📷</span>
              <span className="text-sm font-semibold text-violet-700">Câmera</span>
              <span className="text-xs text-violet-400">Tirar foto</span>
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[250]" onClick={(event) => { if (event.target === event.currentTarget) onCloseDetails(); }}>
      <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 w-full max-w-sm flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-bold text-gray-800 text-base">📎 Detalhes do documento</h3>
          <button onClick={onCloseDetails} className="text-gray-400 hover:text-gray-600 text-xl leading-none w-8 h-8 flex items-center justify-center" style={{ touchAction: 'manipulation' }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-4">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            <span className="text-base">✅</span>
            <p className="text-sm text-green-800 font-medium truncate flex-1">
              {inlineDocPendingFiles.length === 1 ? inlineDocPendingFiles[0].name : `${inlineDocPendingFiles.length} arquivos selecionados`}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Tipo de documento</label>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {categories.map((category) => {
                const active = inlineDocCategory === category.key;
                const colorMap: Record<string, { bg: string; border: string; text: string }> = {
                  blue: { bg: active ? 'bg-blue-500' : 'bg-blue-50', border: 'border-blue-300', text: active ? 'text-white' : 'text-[#0047ad]' },
                  purple: { bg: active ? 'bg-purple-500' : 'bg-purple-50', border: 'border-purple-300', text: active ? 'text-white' : 'text-purple-700' },
                  indigo: { bg: active ? 'bg-indigo-500' : 'bg-indigo-50', border: 'border-indigo-300', text: active ? 'text-white' : 'text-indigo-700' },
                  green: { bg: active ? 'bg-green-500' : 'bg-green-50', border: 'border-green-300', text: active ? 'text-white' : 'text-green-700' },
                  pink: { bg: active ? 'bg-pink-500' : 'bg-pink-50', border: 'border-pink-300', text: active ? 'text-white' : 'text-pink-700' },
                  gray: { bg: active ? 'bg-gray-500' : 'bg-gray-100', border: 'border-gray-300', text: active ? 'text-white' : 'text-gray-700' },
                };
                const color = colorMap[category.color] || colorMap.gray;
                return (
                  <button
                    key={category.key}
                    onClick={() => onSetCategory(category.key)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full border text-sm font-semibold transition-all ${color.bg} ${color.border} ${color.text}`}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <span>{category.icon}</span>
                    <span>{category.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Título</label>
            <input
              type="text"
              value={inlineDocTitle}
              onChange={(event) => onSetTitle(event.target.value)}
              placeholder="Ex: Consulta de vacina, Receita de medicação, Exame de sangue…"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Data do documento</label>
            <input
              type="date"
              value={inlineDocDate}
              onChange={(event) => onSetDate(event.target.value)}
              onBlur={(event) => onSetDate(event.target.value)}
              onInput={(event) => onSetDate((event.target as HTMLInputElement).value)}
              max={new Date().toLocaleDateString('sv')}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ colorScheme: 'light' }}
            />
            {inlineDocDate && (
              <p className="text-xs text-indigo-600 mt-1 pl-1">
                📅 {new Date(inlineDocDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Local / Estabelecimento</label>
            <input
              type="text"
              value={inlineDocLocation}
              onChange={(event) => onSetLocation(event.target.value.toUpperCase())}
              placeholder="Ex: Clínica VetCenter, Hospital Pet…"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onUpload}
            disabled={inlineDocUploading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
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