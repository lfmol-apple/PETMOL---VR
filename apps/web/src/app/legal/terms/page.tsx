import Link from 'next/link';
import { PremiumScreenShell, PremiumCard } from '@/components/premium';

export default function TermsPage() {
  return (
    <PremiumScreenShell
      title="Termos de Uso"
      backHref="/"
    >
      <PremiumCard>
        <p className="text-slate-500 text-xs mb-6">Última atualização: 03 de fevereiro de 2026</p>
        <div className="prose prose-sm prose-slate max-w-none">
          <h2>1. Aceitação dos Termos</h2>
          <p>
            Ao acessar e usar o PETMOL, você concorda em cumprir e estar vinculado aos seguintes termos e condições de uso. Se você não concordar com qualquer parte destes termos, não deve usar nossos serviços.
          </p>

          <h2>2. Descrição do Serviço</h2>
          <p>
            O PETMOL é uma plataforma digital que oferece:
          </p>
          <ul>
            <li>Gerenciamento de informações de saúde de pets (vacinas, vermífugos, consultas)</li>
            <li>Agendamento e controle de eventos (banho, tosa, consultas veterinárias)</li>
            <li>Busca de estabelecimentos pet-friendly (petshops, clínicas, emergências)</li>
            <li>Sistema de lembretes para cuidados com pets</li>
            <li>Carteirinha digital de vacinação</li>
          </ul>

          <h2>3. Cadastro e Conta de Usuário</h2>
          <p>
            Para usar determinadas funcionalidades do PETMOL, você precisa criar uma conta fornecendo:
          </p>
          <ul>
            <li>Nome completo</li>
            <li>Endereço de e-mail válido</li>
            <li>Senha segura</li>
            <li>Telefone (opcional)</li>
          </ul>
          <p>
            Você é responsável por manter a confidencialidade de suas credenciais de login e por todas as atividades que ocorram em sua conta.
          </p>

          <h2>4. Privacidade e Proteção de Dados</h2>
          <p>
            Respeitamos sua privacidade e protegemos seus dados pessoais de acordo com a Lei Geral de Proteção de Dados (LGPD). Para mais informações, consulte nossa{' '}
            <Link href="/legal/privacy" className="text-[#0056D2] hover:underline">
              Política de Privacidade
            </Link>.
          </p>

          <h2>5. Uso Aceitável</h2>
          <p>
            Você concorda em usar o PETMOL apenas para fins legais e de acordo com estes Termos. É proibido:
          </p>
          <ul>
            <li>Usar o serviço de forma fraudulenta ou enganosa</li>
            <li>Violar direitos de propriedade intelectual</li>
            <li>Transmitir vírus, malware ou qualquer código malicioso</li>
            <li>Tentar acessar áreas não autorizadas do sistema</li>
            <li>Usar o serviço para spam ou comunicações não solicitadas</li>
            <li>Compartilhar sua conta com terceiros</li>
          </ul>

          <h2>6. Dados de Pets</h2>
          <p>
            Você é o único responsável pela precisão e veracidade das informações inseridas sobre seus pets. O PETMOL não se responsabiliza por:
          </p>
          <ul>
            <li>Informações incorretas ou desatualizadas</li>
            <li>Decisões tomadas com base nas informações armazenadas</li>
            <li>Perda de dados devido a falhas técnicas (recomendamos manter backup)</li>
          </ul>
          <p>
            <strong>Importante:</strong> O PETMOL é uma ferramenta de organização e lembretes. Sempre consulte um médico veterinário qualificado para decisões relacionadas à saúde do seu pet.
          </p>

          <h2>7. Estabelecimentos Parceiros</h2>
          <p>
            O PETMOL pode listar estabelecimentos parceiros (petshops, clínicas, etc.). Nós não somos responsáveis por:
          </p>
          <ul>
            <li>Qualidade dos serviços prestados por terceiros</li>
            <li>Preços, disponibilidade ou políticas dos estabelecimentos</li>
            <li>Disputas entre usuários e estabelecimentos</li>
          </ul>

          <h2>8. Propriedade Intelectual</h2>
          <p>
            Todo o conteúdo do PETMOL (textos, gráficos, logos, ícones, imagens, software) é propriedade da PETMOL ou de seus licenciadores e está protegido por leis de direitos autorais.
          </p>

          <h2>9. Modificações do Serviço</h2>
          <p>
            Reservamo-nos o direito de modificar, suspender ou descontinuar qualquer parte do serviço a qualquer momento, com ou sem aviso prévio.
          </p>

          <h2>10. Limitação de Responsabilidade</h2>
          <p>
            O PETMOL é fornecido &quot;como está&quot; e &quot;conforme disponível&quot;. Não garantimos que o serviço será ininterrupto, seguro ou livre de erros. Em nenhuma circunstância seremos responsáveis por:
          </p>
          <ul>
            <li>Danos diretos, indiretos, incidentais ou consequenciais</li>
            <li>Perda de lucros ou dados</li>
            <li>Interrupção de negócios</li>
          </ul>

          <h2>11. Rescisão</h2>
          <p>
            Você pode encerrar sua conta a qualquer momento através das configurações da plataforma. Reservamo-nos o direito de suspender ou encerrar sua conta se violarmos estes Termos.
          </p>

          <h2>12. Lei Aplicável</h2>
          <p>
            Estes Termos são regidos pelas leis da República Federativa do Brasil. Quaisquer disputas serão resolvidas nos tribunais brasileiros.
          </p>

          <h2>13. Alterações nos Termos</h2>
          <p>
            Podemos atualizar estes Termos periodicamente. Notificaremos você sobre mudanças significativas através de e-mail ou aviso na plataforma. O uso continuado do serviço após as alterações constitui aceitação dos novos termos.
          </p>

          <h2>14. Contato</h2>
          <p>
            Se você tiver dúvidas sobre estes Termos de Uso, entre em contato conosco:
          </p>
          <ul>
            <li>Email: contato@petmol.com.br</li>
            <li>Através do formulário de contato na plataforma</li>
          </ul>

          <div className="mt-12 p-6 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>Versão:</strong> 2026-02-03<br />
              <strong>Data de vigência:</strong> 03 de fevereiro de 2026
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-4 flex-wrap">
          <Link href="/legal/privacy" className="text-[#0056D2] hover:text-[#003889] text-sm font-medium hover:underline transition-colors">
            Política de Privacidade
          </Link>
          <Link href="/" className="text-slate-500 hover:text-slate-800 text-sm hover:underline transition-colors">
            Voltar ao Início
          </Link>
        </div>
      </PremiumCard>
    </PremiumScreenShell>
  );
}

