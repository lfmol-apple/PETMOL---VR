import { redirect } from 'next/navigation';

/** Painéis antigos foram unificados em /admin (5 abas). */
export default function Old() {
  redirect('/admin');
}
