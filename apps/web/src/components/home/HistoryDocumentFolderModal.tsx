'use client';

import { AuthenticatedDocumentImage } from '@/components/AuthenticatedDocumentImage';
import type { DocFolderModalState, VetHistoryDocument } from '@/lib/types/homeForms';
import { ModalPortal } from '@/components/ModalPortal';

// Pasta de documentos — SOMENTE LEITURA do acervo legado. O PETMOL não
// recebe documentos novos; aqui o tutor apenas visualiza ou remove o que já
// estava guardado. (ver pets/document_router.py no backend)
interface HistoryDocumentFolderModalProps {
  petId: string | null;
  docFolderModal: Exclude<DocFolderModalState, null>;
  onClose: () => void;
  onDeleteAll: () => void;
  onOpenViewer: (doc: VetHistoryDocument) => void;
  onDeleteDocument: (docId: string, docTitle: string) => void;
}

const folderColors: Record<string, { bg: string; header: string }> = {
  blue: { bg: 'bg-blue-100', header: 'from-[#0056D2] to-[#0047ad]' },
  green: { bg: 'bg-green-100', header: 'from-green-600 to-green-700' },
  purple: { bg: 'bg-purple-100', header: 'from-purple-600 to-purple-700' },
  indigo: { bg: 'bg-indigo-100', header: 'from-indigo-600 to-indigo-700' },
  pink: { bg: 'bg-pink-100', header: 'from-pink-600 to-pink-700' },
  gray: { bg: 'bg-gray-100', header: 'from-gray-600 to-gray-700' },
  amber: { bg: 'bg-amber-100', header: 'from-amber-600 to-amber-700' },
};

function _fmtDate(value?: string): string {
  if (!value) return '';
  const iso = value.split('T')[0];
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function HistoryDocumentFolderModal({
  petId,
  docFolderModal,
  onClose,
  onDeleteAll,
  onOpenViewer,
  onDeleteDocument,
}: HistoryDocumentFolderModalProps) {
  const palette = folderColors[docFolderModal.color] || folderColors.blue;
  const docs = docFolderModal.docs;

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center p-4 z-[190]">
        <div className="w-full max-w-lg max-h-[92dvh] flex flex-col overflow-hidden bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60">
          <div className={`flex items-center justify-between px-4 py-3 bg-gradient-to-r ${palette.header} text-white rounded-t-2xl flex-shrink-0`}>
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <span className="text-2xl flex-shrink-0">{docFolderModal.icon}</span>
              <div className="min-w-0">
                <p className="font-bold text-sm sm:text-lg leading-tight truncate">{docFolderModal.title}</p>
                <p className="text-white/70 text-xs">{docs.length} {docs.length === 1 ? 'arquivo' : 'arquivos'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {docs.length > 0 && (
                <button
                  onClick={onDeleteAll}
                  className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-red-500/80 hover:bg-red-500 active:bg-red-600 text-white rounded-lg text-xs font-semibold transition-colors"
                  style={{ touchAction: 'manipulation' }}
                >
                  🗑️ <span className="hidden sm:inline">Excluir todos</span><span className="sm:hidden">Excluir</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-lg text-lg transition-colors"
                style={{ touchAction: 'manipulation' }}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {docs.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">Nenhum arquivo nesta pasta.</div>
            ) : (
              docs.map((doc) => {
                const isImage = Boolean(doc.mime_type?.startsWith('image/'));
                return (
                  <div key={doc.id || doc.storage_key} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenViewer(doc)}
                      className="flex flex-1 items-center gap-3 min-w-0 text-left active:scale-[0.99] transition-transform"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <div className="w-11 h-11 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
                        {isImage && petId && doc.id ? (
                          <AuthenticatedDocumentImage petId={petId} docId={doc.id} alt={doc.title || 'Documento'} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <span className="text-xl">{docFolderModal.icon}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{doc.title || doc.file_name || 'Documento'}</p>
                        <p className="text-xs text-gray-400">
                          {_fmtDate(doc.document_date || doc.created_at)}
                          {doc.establishment_name ? ` · ${doc.establishment_name}` : ''}
                        </p>
                      </div>
                    </button>
                    {doc.id && (
                      <button
                        type="button"
                        onClick={() => onDeleteDocument(doc.id as string, doc.title || '')}
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0"
                        aria-label="Excluir documento"
                        style={{ touchAction: 'manipulation' }}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
