import Link from 'next/link';

// Alerta inexistente/removido: o servidor responde 404 de verdade (importante para o Google), mas a pessoa — inclusive quem
// chega pelo app — continua vendo exatamente a mesma mensagem amigável de antes.
export default function PetPerdidoNotFound() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-2xl rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-black">Alerta não encontrado</h1>
        <p className="mt-2 text-slate-600">Este link pode ter expirado ou sido removido.</p>
        <Link href="/achei-um-pet" className="mt-5 inline-flex rounded-full bg-blue-600 px-5 py-3 font-black text-white">Achei um pet</Link>
      </div>
    </main>
  );
}
