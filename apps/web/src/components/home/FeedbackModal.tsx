'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Wrench } from 'lucide-react';
import { useI18n } from '@/lib/I18nContext';
import { SheetHeader, SheetIcon, SheetShell } from '@/components/ui/sheet';
import type { VaccineRecord } from '@/lib/petHealth';

type FeedbackFormData = {
  field_corrected: 'name' | 'type' | 'date_administered' | 'next_dose_date' | 'veterinarian' | 'brand';
  original_value: string;
  corrected_value: string;
  user_comment: string;
};

interface FeedbackModalProps {
  feedbackVaccine: VaccineRecord;
  feedbackFormData: FeedbackFormData;
  setFeedbackFormData: Dispatch<SetStateAction<FeedbackFormData>>;
  setShowFeedbackModal: Dispatch<SetStateAction<boolean>>;
  setFeedbackVaccine: Dispatch<SetStateAction<VaccineRecord | null>>;
  handleSubmitFeedback: () => Promise<void>;
}

function createLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function FeedbackModal({
  feedbackVaccine,
  feedbackFormData,
  setFeedbackFormData,
  setShowFeedbackModal,
  setFeedbackVaccine,
  handleSubmitFeedback,
}: FeedbackModalProps) {
  const { t, locale } = useI18n();
  const close = () => {
    setShowFeedbackModal(false);
    setFeedbackVaccine(null);
  };

  return (
    <SheetShell open onClose={close} tone="grey" size="md" z={90}>
      <SheetHeader
        title="Reportar problema"
        media={<SheetIcon tone="amber"><Wrench className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
        onClose={close}
      />

      <SheetShell.Body className="space-y-4">
        <p className="text-sm text-gray-600">{t('feedback.help_improve')}</p>

        <div className="bg-white border border-slate-200 p-3 rounded-2xl">
          <p className="text-sm font-medium text-gray-700">
            {t('feedback.vaccine_label')} <span className="font-bold">{feedbackVaccine.vaccine_name}</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {t('health.applied_date')}: {createLocalDate(feedbackVaccine.date_administered).toLocaleDateString(locale)}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('feedback.what_incorrect')}
            </label>
            <select
              value={feedbackFormData.field_corrected}
              onChange={(e) => {
                const field = e.target.value as FeedbackFormData['field_corrected'];
                let originalValue = '';

                switch (field) {
                  case 'name':
                    originalValue = feedbackVaccine.vaccine_name;
                    break;
                  case 'type':
                    originalValue = feedbackVaccine.vaccine_type;
                    break;
                  case 'date_administered':
                    originalValue = feedbackVaccine.date_administered;
                    break;
                  case 'next_dose_date':
                    originalValue = feedbackVaccine.next_dose_date || '';
                    break;
                  case 'veterinarian':
                    originalValue = feedbackVaccine.veterinarian || '';
                    break;
                  case 'brand':
                    originalValue = feedbackVaccine.vaccine_name;
                    break;
                }

                setFeedbackFormData((prev) => ({
                  ...prev,
                  field_corrected: field,
                  original_value: originalValue,
                  corrected_value: '',
                }));
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="name">{t('feedback.field_vaccine_name')}</option>
              <option value="brand">{t('feedback.field_brand')}</option>
              <option value="type">{t('feedback.field_type')}</option>
              <option value="date_administered">{t('feedback.field_date_administered')}</option>
              <option value="next_dose_date">{t('feedback.field_next_dose')}</option>
              <option value="veterinarian">{t('feedback.field_veterinarian')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('feedback.detected_value')}
            </label>
            <input
              type="text"
              value={feedbackFormData.original_value}
              disabled
              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('feedback.correct_value')}
            </label>
            <input
              type={feedbackFormData.field_corrected.includes('date') ? 'date' : 'text'}
              value={feedbackFormData.corrected_value}
              onChange={(e) => setFeedbackFormData((prev) => ({ ...prev, corrected_value: e.target.value }))}
              className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t('feedback.placeholder_correct')}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('feedback.additional_comment')}
            </label>
            <textarea
              value={feedbackFormData.user_comment}
              onChange={(e) => setFeedbackFormData((prev) => ({ ...prev, user_comment: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              placeholder={t('feedback.placeholder_comment')}
            />
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center">{t('feedback.help_all_users')}</p>
      </SheetShell.Body>

      <SheetShell.Footer tone="grey">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-700 transition-all active:scale-[0.98]"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmitFeedback}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#0056D2] py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition-all active:scale-[0.98]"
          >
            {t('feedback.send_correction')}
          </button>
        </div>
      </SheetShell.Footer>
    </SheetShell>
  );
}
