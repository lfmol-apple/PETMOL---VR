import Link from 'next/link';
import { PremiumScreenShell, PremiumCard } from '@/components/premium';

export default function TermsPage() {
  return (
    <PremiumScreenShell
      title="Termos de Uso"
      backHref="/"
    >
      <PremiumCard>
        <p className="text-slate-500 text-xs mb-6">Última atualização: 17 de novembro de 2026</p>
        <div className="prose prose-sm prose-slate max-w-none">
          <h2>1. Aceitação dos Termos</h2>
          <p>
            Ao acessar e usar o PETMOL, você concorda em cumprir e estar vinculado aos seguintes termos e condições de uso. Se você não concordar com qualquer parte destes termos, não deve usar nossos serviços.
          </p>

          <h2>2. Descrição do Serviço</h2>
          <p>
            O PETMOL é uma plataforma digital de organização de cuidados com pets, que oferece:
          </p>
          <ul>
            <li>Gerenciamento de informações de saúde de pets (vacinas, vermífugos, antipulgas, consultas)</li>
            <li>Controle de alimentação e ração, com estimativa de consumo e avisos</li>
            <li>Controle de medicamentos e lembretes de dose</li>
            <li>Agendamento e controle de eventos (banho, tosa, consultas veterinárias)</li>
            <li>Busca de estabelecimentos pet-friendly (petshops, clínicas, emergências)</li>
            <li>Sistema de lembretes para cuidados com pets</li>
            <li>Carteirinha digital de vacinação</li>
            <li>Comparação de preços e ofertas de produtos entre lojas parceiras (ver Seção 7)</li>
          </ul>
          <p>
            O PETMOL pode oferecer diferentes funcionalidades, planos ou condições comerciais ao longo do tempo (ver Seção 9).
          </p>

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
            A contratação de planos pagos é destinada a pessoas maiores de 18 anos ou legalmente capazes; menores de idade só podem contratar por meio de seus representantes legais.
          </p>
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

          <h2>7. Estabelecimentos Parceiros, Comparação de Ofertas e Links de Afiliados</h2>
          <p>
            O PETMOL pode listar estabelecimentos parceiros (petshops, clínicas, etc.) e exibir ofertas de produtos de lojas parceiras (como Cobasi e Petz, entre outras que podem ser adicionadas ou removidas ao longo do tempo), com o objetivo de ajudar você a comparar preços disponíveis. Nesse contexto:
          </p>
          <ul>
            <li>Preços, estoque, condições de pagamento e prazos de entrega são definidos por cada loja parceira e podem mudar a qualquer momento, sem aviso prévio do PETMOL.</li>
            <li>A compra é sempre realizada diretamente no site ou aplicativo da loja parceira — o PETMOL não processa pagamentos, não emite nota fiscal da compra e não tem acesso aos seus dados financeiros.</li>
            <li>Alguns links de compra exibidos no PETMOL são links de afiliados: ao clicar e comprar, o PETMOL pode receber uma comissão da loja parceira, sem qualquer custo adicional para você.</li>
            <li>O PETMOL busca apresentar ofertas relevantes entre as lojas parceiras disponíveis, mas não garante que qualquer oferta exibida é a de menor preço no mercado em geral.</li>
            <li>Qualidade dos produtos e serviços prestados por terceiros, disputas entre usuários e estabelecimentos, e políticas específicas de cada loja são de responsabilidade exclusiva da loja parceira.</li>
          </ul>

          <h2>8. Propriedade Intelectual</h2>
          <p>
            Todo o conteúdo do PETMOL (textos, gráficos, logos, ícones, imagens, software) é propriedade da PETMOL ou de seus licenciadores e está protegido por leis de direitos autorais.
          </p>

          <h2>9. Modificações do Serviço, Planos e Condições Comerciais</h2>
          <p>
            Podemos modificar, suspender ou descontinuar partes do serviço, inclusive recursos, limites de uso e planos, por motivos técnicos, de segurança, legais ou comerciais legítimos. Mudanças que reduzam recursos de um plano que você já contratou e pagou serão informadas com antecedência razoável e não afetarão o período já pago; se a mudança for relevante, você poderá cancelar e, na ausência de fruição do que foi pago, solicitar a devolução proporcional, conforme a lei.
          </p>
          <h3>9.1. Planos gratuitos e pagos</h3>
          <p>
            O PETMOL pode ser oferecido, no todo ou em parte, de forma gratuita ou mediante assinatura paga, e essa condição pode mudar ao longo do tempo. A disponibilidade de um recurso sem cobrança em determinado momento não constitui promessa de gratuidade permanente. Funcionalidades que você já usava não passam a ser cobradas sem o seu aceite explícito.
          </p>
          <h3>9.2. Assinaturas (quando houver)</h3>
          <p>
            Se houver plano pago, o que ele inclui, o preço, a periodicidade e a renovação serão exibidos na tela de contratação, antes da confirmação. A assinatura é contratada e cobrada pela App Store ou pelo Google Play, conforme o seu aparelho, e se renova automaticamente ao fim de cada período, pelo mesmo valor, até ser cancelada. O cancelamento é feito nas configurações de assinaturas da própria loja, com antecedência mínima de 24 horas antes da renovação; ele interrompe renovações futuras e o acesso pago continua até o fim do período já pago. O PETMOL não recebe nem armazena os dados do seu cartão. A contratação é feita por você, de forma voluntária e após a exibição das informações acima.
          </p>
          <h3>9.3. Período de teste e promoções</h3>
          <p>
            Quando oferecermos período de teste ou condição promocional, as regras serão informadas na tela de contratação. Ao fim do teste, a cobrança do plano escolhido começa automaticamente, salvo cancelamento antes do término do período de teste.
          </p>
          <h3>9.4. Alteração de preços</h3>
          <p>
            Podemos alterar os preços dos planos para períodos futuros. A alteração nunca afetará o período já pago, será comunicada com antecedência, pela loja e/ou por aviso no aplicativo ou e-mail, e permitirá que você cancele antes da renovação. Quando a loja ou a lei exigirem, a renovação pelo novo valor dependerá do seu consentimento; sem ele, a assinatura não será renovada.
          </p>
          <h3>9.5. Reembolsos</h3>
          <p>
            Você pode exercer o direito de arrependimento em até 7 (sete) dias a contar da contratação, nos termos do art. 49 do Código de Defesa do Consumidor, com a devolução integral dos valores pagos. Como o pagamento é processado pela loja, o pedido de reembolso é feito diretamente à Apple ou ao Google, conforme as regras e os canais dela; se tiver dificuldade, você também pode nos contatar em gerenciamento@petmol.com.br para orientação. Isso não limita outros direitos que a lei lhe assegure.
          </p>
          <h3>9.6. Fim ou falta de pagamento</h3>
          <p>
            Se a assinatura terminar ou o pagamento não for confirmado, os recursos exclusivos do plano pago poderão ser limitados. Você mantém acesso aos seus dados e aos recursos disponíveis sem cobrança, e não apagamos seus dados por esse motivo. Alertas de segurança da comunidade, como o Pet Sumido, não dependem de plano pago; qualquer mudança nesse ponto será informada com antecedência e não afetará os alertas já em andamento.
          </p>
          <p>
            Se encerrarmos um plano pago por nossa iniciativa, sem culpa sua, devolveremos o valor proporcional ao período já pago e não utilizado.
          </p>

          <h3>9.7. Versão atual do aplicativo</h3>
          <p>
            Se o PETMOL passar a oferecer planos pagos em uma nova versão do aplicativo, quem já utiliza a versão disponível antes dessa mudança (a &quot;versão-corte&quot;, que será identificada, por número de versão, no comunicado da mudança e nas lojas) poderá continuar usando essa versão, com as funcionalidades que ela já oferece, sem cobrança. A cobrança só se aplica a quem decidir, por escolha própria, atualizar para a versão com planos e contratar um plano pago; a informação sobre o que muda será apresentada antes da atualização.
          </p>
          <p>
            Essa continuidade vale enquanto o serviço estiver disponível. Podemos encerrar o suporte a uma versão por motivos de segurança, obrigação legal, exigência da Apple, do Google ou do sistema operacional, ou encerramento do serviço, sempre com aviso prévio e sem cobrança para manter o que você já utilizava. Podemos aplicar limites técnicos de uso razoável para proteger o serviço contra abuso, sem que isso configure cobrança. Atualizar para a versão com planos é uma escolha sua; a versão com planos pode oferecer recursos, limites e condições diferentes dos da versão-corte, e isso será informado antes da atualização.
          </p>

          <h2>10. Limitação de Responsabilidade</h2>
          <p>
            O PETMOL é fornecido de acordo com a disponibilidade técnica do serviço. Empregamos esforços razoáveis para mantê-lo seguro e em funcionamento, mas não garantimos que será ininterrupto ou livre de erros. Na máxima extensão permitida pela lei, e salvo nos casos de dolo, culpa ou responsabilidade que a lei não permita excluir, não nos responsabilizamos por:
          </p>
          <ul>
            <li>Danos diretos, indiretos, incidentais ou consequenciais</li>
            <li>Perda de lucros ou dados</li>
            <li>Interrupção de negócios</li>
          </ul>
          <p>
            Nada nestes Termos exclui ou limita direitos que a legislação de defesa do consumidor assegura a você, inclusive em relação a serviços pagos (por exemplo, o direito à reexecução do serviço, à restituição proporcional ou ao abatimento do preço em caso de falha relevante que impeça o uso dos recursos contratados).
          </p>

          <h2>11. Rescisão</h2>
          <p>
            Você pode encerrar sua conta a qualquer momento através das configurações da plataforma. Reservamo-nos o direito de suspender ou encerrar sua conta se você violar estes Termos.
          </p>

          <h2>12. Lei Aplicável</h2>
          <p>
            Estes Termos são regidos pelas leis da República Federativa do Brasil. Quaisquer disputas serão resolvidas nos tribunais brasileiros, sendo assegurado ao consumidor o foro do seu domicílio.
          </p>

          <h2>13. Alterações nos Termos</h2>
          <p>
            Podemos atualizar estes Termos periodicamente. Notificaremos você sobre mudanças significativas através de e-mail ou aviso na plataforma. O uso continuado do serviço após as alterações constitui aceitação dos novos termos; alterações que reduzam direitos de assinantes ou aumentem o preço seguem o previsto nas seções 9.1 a 9.4 e, quando exigido por lei ou pela loja, dependerão do seu consentimento.
          </p>

          <h2>14. Contato</h2>
          <p>
            Se você tiver dúvidas sobre estes Termos de Uso, entre em contato conosco:
          </p>
          <ul>
            <li>Email: gerenciamento@petmol.com.br</li>
            <li>Através do formulário de contato na plataforma</li>
          </ul>
          <p>
            <strong>Fornecedor do serviço:</strong> PETMOL NEGOCIOS DIGITAIS LTDA, CNPJ 65.625.299/0001-15, com sede na Rua Ramalhete, 474, apto. 301, bairro Serra, Belo Horizonte/MG, CEP 30.210-500.
          </p>

          <div className="mt-12 p-6 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>Versão:</strong> 2026-11-17<br />
              <strong>Data de vigência:</strong> 17 de novembro de 2026
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
