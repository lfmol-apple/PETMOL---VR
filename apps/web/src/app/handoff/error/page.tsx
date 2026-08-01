'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/I18nContext';
import { isPetQuery } from '@/lib/petLexicon';
import { PremiumScreenShell, PremiumCard } from '@/components/premium';

function ErrorContent() {
  const { t, geo } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams?.get('reason') || 'unknown';
  const query = searchParams?.get('query') || '';
  
  // Check if query is non-pet and get suggestions
  const intent = query ? isPetQuery(query, geo.locale) : null;
  const showPetSuggestions = intent && !intent.is_pet && intent.suggestions && intent.suggestions.length > 0;
  
  const getErrorMessage = () => {
    switch (reason) {
      case 'invalid_query':
        return t('handoff.error.message.invalid_query');
      case 'non_pet':
        return t('handoff.error.message.non_pet');
      case 'invalid_phone':
        return t('handoff.error.message.invalid_phone');
      case 'unsafe_redirect':
        return t('handoff.error.message.unsafe_redirect');
      default:
        return t('handoff.error.message.default');
    }
  };
  
  const handleSuggestionClick = (suggestion: string) => {
    router.push(`/?q=${encodeURIComponent(suggestion)}`);
  };
  
  return (
    <PremiumScreenShell title={t('handoff.error.title')} backHref="/home">
      <div className="px-4 py-4">
        <PremiumCard variant="warning">
          <div className="text-center mb-4">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-slate-600 mb-4 max-w-md mx-auto">
              {getErrorMessage()}
            </p>
        
        {query && (
          <p className="text-sm text-slate-500">
            {t('handoff.error.search_label')} <span className="font-mono bg-slate-100 px-2 py-1 rounded">{query}</span>
          </p>
        )}
      </div>

      {/* Pet Suggestions */}
      {showPetSuggestions && intent?.suggestions && (
        <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-xl">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 text-center">
            {t('handoff.error.suggestions.title')}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {intent.suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-4 py-3 bg-white border border-blue-200 rounded-lg text-sm text-slate-700 hover:bg-blue-100 hover:border-blue-400 transition-colors text-left font-medium"
              >
                🐾 {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-gradient-to-r from-[#0056D2] to-violet-600 text-white rounded-xl font-medium hover:scale-105 transition-all text-center"
        >
          {t('handoff.error.actions.back')}
        </Link>
        <button
          onClick={() => window.history.back()}
          className="inline-block px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          {t('handoff.error.actions.retry')}
        </button>
      </div>

      {/* Disclaimer */}
      <div className="mt-8 p-4 bg-slate-50 rounded-xl text-sm text-slate-600 text-center">
        {t('handoff.error.disclaimer')}
      </div>
      </PremiumCard>
      </div>
    </PremiumScreenShell>
  );
}

export default function HandoffErrorPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={
      <PremiumScreenShell title="Erro" backHref="/home">
        <p className="text-center text-slate-500 py-16">{t('common.loading')}</p>
      </PremiumScreenShell>
    }>
      <ErrorContent />
    </Suspense>
  );
}
