// @deprecated — experiência de documentos consolidada em /home (PetDocumentVault)
// Links externos para /documents/[petId] são redirecionados com segurança para /home
import { redirect } from 'next/navigation';

export default function DocumentPage() {
  redirect('/home');
}
