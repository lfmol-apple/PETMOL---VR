'use client';

import { useState, useEffect } from 'react';
import {
  ASSISTANT_FLOWS,
  getVisibleQuestions,
  validateAnswers,
  saveAssistantResponse,
  convertToMedicalData,
  type AssistantFlow,
  type AssistantQuestion,
  type AssistantResponse,
} from '@/lib/medicalAssistant';

interface MedicalAssistantProps {
  flowId: string;
  petId: string;
  petName: string;
  clinicName?: string;
  veterinarian?: string;
  onComplete: (data: Record<string, unknown> | null) => void;
  onCancel?: () => void;
}

export function MedicalAssistant({
  flowId,
  petId,
  petName,
  clinicName,
  veterinarian,
  onComplete,
  onCancel,
}: MedicalAssistantProps) {
  const [flow, setFlow] = useState<AssistantFlow | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [documents, setDocuments] = useState<Record<string, string[]>>({});
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const assistantFlow = ASSISTANT_FLOWS[flowId];
    if (assistantFlow) {
      setFlow(assistantFlow);
    }
  }, [flowId]);

  if (!flow) return null;

  const visibleQuestions = getVisibleQuestions(flow, answers);
  const currentQuestion = visibleQuestions[currentStep];
  const isLastStep = currentStep === visibleQuestions.length - 1;
  const progress = Math.round(((currentStep + 1) / visibleQuestions.length) * 100);

  const handleAnswer = (questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setErrors([]);
  };

  const handleFileUpload = async (questionId: string, files: FileList) => {
    const filePromises = Array.from(files).map((file) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });

    const base64Files = await Promise.all(filePromises);
    setDocuments((prev) => ({
      ...prev,
      [questionId]: [...(prev[questionId] || []), ...base64Files],
    }));
  };

  const handleNext = () => {
    // Validate current question if required
    if (currentQuestion.required && !answers[currentQuestion.id]) {
      setErrors([`Por favor, responda esta pergunta`]);
      return;
    }

    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      setErrors([]);
    }
  };

  const handleComplete = () => {
    const validation = validateAnswers(flow, answers);

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    const response: AssistantResponse = {
      flowId: flow.id,
      clinicName,
      veterinarian,
      answers,
      documents,
      completed_at: Date.now(),
    };

    saveAssistantResponse(response);
    const medicalData = convertToMedicalData(response);
    onComplete(medicalData);
  };

  const renderQuestionInput = (question: AssistantQuestion) => {
    switch (question.type) {
      case 'text':
        return (
          <textarea
            value={answers[question.id] || ''}
            onChange={(e) => handleAnswer(question.id, e.target.value)}
            placeholder={question.placeholder}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0056D2] focus:border-transparent min-h-[100px]"
          />
        );

      case 'select':
        return (
          <select
            value={answers[question.id] || ''}
            onChange={(e) => handleAnswer(question.id, e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
          >
            <option value="">Selecione...</option>
            {question.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case 'multiselect':
        return (
          <div className="space-y-2">
            {question.options?.map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(answers[question.id] || []).includes(opt)}
                  onChange={(e) => {
                    const current = answers[question.id] || [];
                    if (e.target.checked) {
                      handleAnswer(question.id, [...current, opt]);
                    } else {
                      handleAnswer(
                        question.id,
                        current.filter((v: string) => v !== opt)
                      );
                    }
                  }}
                  className="w-5 h-5 rounded border-slate-300 text-[#0056D2] focus:ring-[#0056D2]"
                />
                <span className="text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
        );

      case 'yesno':
        return (
          <div className="flex gap-3">
            <button
              onClick={() => handleAnswer(question.id, true)}
              className={`flex-1 py-4 rounded-xl font-semibold border-2 transition ${
                answers[question.id] === true
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-300'
              }`}
            >
              ✅ Sim
            </button>
            <button
              onClick={() => handleAnswer(question.id, false)}
              className={`flex-1 py-4 rounded-xl font-semibold border-2 transition ${
                answers[question.id] === false
                  ? 'bg-slate-500 text-white border-slate-500'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-slate-300'
              }`}
            >
              ❌ Não
            </button>
          </div>
        );

      case 'number':
        return (
          <input
            type="number"
            value={answers[question.id] || ''}
            onChange={(e) => handleAnswer(question.id, parseFloat(e.target.value))}
            placeholder={question.placeholder}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={answers[question.id] || ''}
            onChange={(e) => handleAnswer(question.id, e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
          />
        );

      case 'file':
        return (
          <div>
            <input
              type="file"
              accept="image/*,.pdf"
              multiple
              onChange={(e) => e.target.files && handleFileUpload(question.id, e.target.files)}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
            />
            {documents[question.id] && documents[question.id].length > 0 && (
              <div className="mt-2 text-sm text-emerald-600">
                ✓ {documents[question.id].length} arquivo(s) anexado(s)
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-3xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {flow.icon} {flow.name}
              </h2>
              <p className="text-sm text-slate-600">
                {flow.description} • {petName}
              </p>
              {clinicName && (
                <p className="text-xs text-slate-500 mt-1">📍 {clinicName}</p>
              )}
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Os intervalos são recomendações gerais. Consulte um veterinário.
              </p>
            </div>
            {onCancel && (
              <button
                onClick={onCancel}
                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-[#0056D2] h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Pergunta {currentStep + 1} de {visibleQuestions.length}
          </div>
        </div>

        {/* Question */}
        <div className="p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {currentQuestion.question}
              {currentQuestion.required && <span className="text-red-500 ml-1">*</span>}
            </h3>
            {currentQuestion.hint && (
              <p className="text-sm text-slate-500 italic">{currentQuestion.hint}</p>
            )}
          </div>

          {renderQuestionInput(currentQuestion)}

          {errors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              {errors.map((error, i) => (
                <div key={i} className="text-sm text-red-700">
                  ⚠️ {error}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-6 rounded-b-3xl flex gap-3">
          {currentStep > 0 && (
            <button
              onClick={handleBack}
              className="px-6 py-3 rounded-xl font-semibold border-2 border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              ← Voltar
            </button>
          )}
          <button
            onClick={handleNext}
            className="flex-1 px-6 py-3 rounded-xl font-semibold bg-[#0056D2] text-white hover:bg-[#0047ad]"
          >
            {isLastStep ? '✓ Concluir' : 'Próxima →'}
          </button>
        </div>
      </div>
    </div>
  );
}
