'use client';

import { Folder } from 'lucide-react';
import { AuthenticatedDocumentImage } from '@/components/AuthenticatedDocumentImage';
import type { DocFolderModalState, VetHistoryDocument } from '@/lib/types/homeForms';
import { SheetHeader, SheetIcon, SheetShell } from '@/components/ui/sheet';

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
  const docs = docFolderModal.docs;

  return (
    <SheetShell open onClose={onClose} tone="grey" size="lg" z={90}>
      <SheetHeader
        title={docFolderModal.title}
        subtitle={`${docs.length} ${docs.length === 1 ? 'arquivo' : 'arquivos'}`}
        media={<SheetIcon tone="blue"><Folder className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
        onClose={onClose}
        action={
          docs.length > 0 ? (
            <button
              type="button"
              onClick={onDeleteAll}
              className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 active:scale-95"
              style={{ touchAction: 'manipulation' }}
            >
              Excluir todos
            </button>
          ) : undefined
        }
      />

      <SheetShell.Body className="space-y-2">
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
      </SheetShell.Body>
    </SheetShell>
  );
}
