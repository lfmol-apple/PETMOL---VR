import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-50 px-6 text-center">
      <span className="text-5xl" aria-hidden>🐾</span>
      <div>
        <h1 className="text-lg font-black text-slate-900">Página não encontrada</h1>
        <p className="mt-1.5 max-w-xs text-sm text-slate-500">
          Esse link não existe ou não está mais disponível.
        </p>
      </div>
      <Link
        href="/home"
        className="w-full max-w-xs rounded-2xl bg-blue-600 py-3.5 text-center text-sm font-bold text-white active:scale-[0.98] transition-all"
      >
        Voltar para o início
      </Link>
    </div>
  );
}
