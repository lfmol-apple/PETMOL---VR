import { redirect } from 'next/navigation';

// VR: emergency removida da navegação principal — link externo para Google Maps não gera hábito
export default function EmergencyPage() {
  redirect('/home');
}
