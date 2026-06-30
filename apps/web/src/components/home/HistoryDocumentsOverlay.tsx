'use client';

import type { Dispatch, SetStateAction } from 'react';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { HistoryDocumentFolderModal } from '@/components/home/HistoryDocumentFolderModal';
import { HistoryDocumentUploadModal } from '@/components/home/HistoryDocumentUploadModal';
import { useHomeHistoryDocumentBrowser } from '@/features/interactions/useHomeHistoryDocumentBrowser';
import { useHomeHistoryDocumentUpload } from '@/features/interactions/useHomeHistoryDocumentUpload';
import { useI18n } from '@/lib/I18nContext';
import type { DocFolderModalState, VetHistoryDocument } from '@/lib/types/homeForms';
import type { PetWithHealth } from '@/features/pets/types';

type HistoryTab = 'resumo' | 'detalhado' | 'documentos';

interface HistoryDocumentsOverlayProps {
  currentPet: PetWithHealth | null;
  setHistoricoTab: (tab: HistoryTab) => void;
  showDocUploadInHistorico: boolean;
  setShowDocUploadInHistorico: (value: boolean) => void;
  setVetHistoryDocs: Dispatch<SetStateAction<VetHistoryDocument[]>>;
  docFolderModal: DocFolderModalState;
  onCloseDocFolder: () => void;
  onRemoveDocFromFolder: (docId: string) => void;
}

export function HistoryDocumentsOverlay({
  currentPet,
  setHistoricoTab,
  showDocUploadInHistorico,
  setShowDocUploadInHistorico,
  setVetHistoryDocs,
  docFolderModal,
  onCloseDocFolder,
  onRemoveDocFromFolder,
}: HistoryDocumentsOverlayProps) {
  const { t } = useI18n();

  const {
    inlineDocUploading,
    inlineDocPendingFiles,
    inlineDocTitle,
    inlineDocDate,
    inlineDocLocation,
    inlineDocCategory,
    setInlineDocTitle,
    setInlineDocDate,
    setInlineDocLocation,
    setInlineDocCategory,
    closeUploadStep1,
    onFilePicked,
    closeUploadDetails,
    uploadDocuments,
  } = useHomeHistoryDocumentUpload({
    currentPet,
    showDocUploadInHistorico,
    setShowDocUploadInHistorico,
    setHistoricoTab,
    setVetHistoryDocs,
  });

  const {
    previewDocInHistory,
    previewDocSiblings,
    previewDocSiblingIdx,
    closePreview,
    goToSibling,
    openViewer,
    deleteDocument,
    deleteAllDocumentsInFolder,
  } = useHomeHistoryDocumentBrowser({
    currentPet,
    docFolderModal,
    setVetHistoryDocs,
    onCloseDocFolder,
    onRemoveDocFromFolder,
  });

  return (
    <>
      {docFolderModal && (
        <HistoryDocumentFolderModal
          petId={currentPet?.pet_id || null}
          docFolderModal={docFolderModal}
          onClose={onCloseDocFolder}
          onDeleteAll={deleteAllDocumentsInFolder}
          onOpenViewer={openViewer}
          onDeleteDocument={deleteDocument}
        />
      )}

      {previewDocInHistory && (
        <DocumentPreviewModal
          doc={previewDocInHistory}
          siblings={previewDocSiblings}
          siblingIdx={previewDocSiblingIdx}
          onClose={closePreview}
          onNavigate={goToSibling}
        />
      )}

      {currentPet && (
        <HistoryDocumentUploadModal
          showPicker={showDocUploadInHistorico}
          hasPendingFiles={Boolean(inlineDocPendingFiles)}
          inlineDocUploading={inlineDocUploading}
          inlineDocPendingFiles={inlineDocPendingFiles}
          inlineDocTitle={inlineDocTitle}
          inlineDocDate={inlineDocDate}
          inlineDocLocation={inlineDocLocation}
          inlineDocCategory={inlineDocCategory}
          onSetTitle={setInlineDocTitle}
          onSetDate={setInlineDocDate}
          onSetLocation={setInlineDocLocation}
          onSetCategory={setInlineDocCategory}
          onClosePicker={closeUploadStep1}
          onFilePicked={onFilePicked}
          onCloseDetails={closeUploadDetails}
          onUpload={uploadDocuments}
          sendNowLabel={t('common.send_now')}
          sendDocumentLabel={t('hist.send_document')}
          vaccineLabel={t('common.vaccine')}
          uploadTypeExamLabel={t('upload.type_exam')}
          uploadTypePrescriptionLabel={t('upload.type_prescription')}
          uploadTypeReportLabel={t('upload.type_report')}
          uploadTypePhotoLabel={t('upload.type_photo')}
          uploadTypeOtherLabel={t('upload.type_other')}
        />
      )}
    </>
  );
}