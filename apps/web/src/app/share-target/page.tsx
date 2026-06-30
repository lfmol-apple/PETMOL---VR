// Esta rota é interceptada pelo Service Worker antes de renderizar.
// Existe apenas para que o Next.js não retorne 404 caso o SW ainda não esteja ativo.
import { redirect } from 'next/navigation';

export default function ShareTargetPage() {
  redirect('/home');
}
