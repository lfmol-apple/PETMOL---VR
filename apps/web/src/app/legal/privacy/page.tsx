import Link from 'next/link';
import { PremiumScreenShell, PremiumCard } from '@/components/premium';

export default function PrivacyPage() {
  return (
    <PremiumScreenShell
      title="Política de Privacidade"
      backHref="/"
    >
      <PremiumCard>
        <p className="text-slate-500 text-xs mb-6">Última atualização: 25 de agosto de 2026</p>
        <div className="prose prose-sm prose-slate max-w-none">
          <h2>1. Introdução</h2>
          <p>
            A PETMOL valoriza e respeita sua privacidade. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos seus dados pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).
          </p>

          <h2>2. Dados Coletados</h2>
          
          <h3>2.1. Dados de Cadastro</h3>
          <p>Quando você cria uma conta no PETMOL, coletamos:</p>
          <ul>
            <li><strong>Dados pessoais:</strong> Nome completo, e-mail, telefone</li>
            <li><strong>Dados de endereço:</strong> CEP, rua, número, complemento, bairro, cidade, estado</li>
            <li><strong>Credenciais:</strong> Senha (armazenada de forma criptografada)</li>
          </ul>

          <h3>2.2. Dados dos Pets</h3>
          <ul>
            <li>Nome, espécie, raça, data de nascimento</li>
            <li>Sexo, peso, informações de castração</li>
            <li>Fotos do pet (opcional)</li>
            <li><strong>Dados de saúde</strong> (vacinas, vermífugos, consultas, medicamentos, controles antiparasitários) — tratados com nível de proteção equivalente a dados sensíveis nos termos da LGPD, utilizados exclusivamente para as funcionalidades do app e nunca compartilhados com terceiros para fins comerciais</li>
            <li>Fotos de carteirinha de vacinação que você escolher escanear podem ser processadas por inteligência artificial (Google Gemini) para extração automática de informações como nome da vacina e data — sempre com seu consentimento explícito antes do envio da foto (você pode optar por preencher manualmente, sem usar IA). O PETMOL <strong>não é um repositório de documentos</strong>: não armazenamos permanentemente PDFs, exames, receitas, laudos, cartões ou anexos genéricos. A imagem escaneada é usada apenas para a leitura e não fica guardada como um arquivo; o tratamento pelo provedor de IA segue os termos, configurações e controles do serviço Google Gemini contratado</li>
          </ul>

          <h3>2.3. Dados de Uso</h3>
          <ul>
            <li>Endereço IP</li>
            <li>Tipo de navegador e dispositivo</li>
            <li>Páginas visitadas e tempo de permanência</li>
            <li>Ações realizadas na plataforma</li>
            <li>Logs de acesso e segurança</li>
          </ul>

          <h3>2.4. Dados de Localização</h3>
          <ul>
            <li>Localização aproximada para busca de estabelecimentos próximos (quando autorizado)</li>
            <li>Endereço informado no cadastro</li>
          </ul>

          <h2>3. Finalidade do Tratamento de Dados</h2>
          <p>Utilizamos seus dados para:</p>
          
          <h3>3.1. Prestação do Serviço</h3>
          <ul>
            <li>Criar e gerenciar sua conta</li>
            <li>Armazenar informações de saúde dos seus pets</li>
            <li>Enviar lembretes de vacinas, medicamentos e eventos</li>
            <li>Permitir busca de estabelecimentos próximos</li>
            <li>Gerar carteirinha digital de vacinação</li>
          </ul>

          <h3>3.2. Comunicação</h3>
          <ul>
            <li>Enviar notificações importantes sobre o serviço</li>
            <li>Responder suas dúvidas e solicitações</li>
            <li>Enviar atualizações sobre novos recursos (se autorizado)</li>
          </ul>

          <h3>3.3. Melhoria do Serviço</h3>
          <ul>
            <li>Analisar uso da plataforma</li>
            <li>Corrigir erros e problemas técnicos</li>
            <li>Desenvolver novos recursos</li>
          </ul>

          <h3>3.4. Segurança</h3>
          <ul>
            <li>Prevenir fraudes e abusos</li>
            <li>Proteger a segurança da plataforma</li>
            <li>Cumprir obrigações legais</li>
          </ul>

          <h2>4. Base Legal</h2>
          <p>O tratamento dos seus dados pessoais é baseado em:</p>
          <ul>
            <li><strong>Consentimento:</strong> Você nos autoriza expressamente ao aceitar estes termos</li>
            <li><strong>Execução de contrato:</strong> Necessário para fornecer os serviços contratados</li>
            <li><strong>Legítimo interesse:</strong> Melhorar segurança e qualidade do serviço</li>
            <li><strong>Cumprimento de obrigação legal:</strong> Quando exigido por lei</li>
          </ul>

          <h2>5. Compartilhamento de Dados</h2>
          
          <h3>5.1. Não Vendemos Seus Dados</h3>
          <p>
            A PETMOL <strong>não vende, aluga ou comercializa</strong> seus dados pessoais com terceiros.
          </p>

          <h3>5.2. Compartilhamento Necessário</h3>
          <p>Podemos compartilhar seus dados apenas com:</p>
          <ul>
            <li><strong>Provedores de serviço:</strong> Hospedagem, e-mail, notificações push (sob contrato de confidencialidade)</li>
            <li><strong>APIs externas:</strong> Google Maps/Places (busca de estabelecimentos), Google Gemini (leitura automática de carteirinha de vacinação e identificação de produtos por foto, sempre com consentimento prévio por usuário), Cosmos Bluesoft e GTIN (consulta de código de barras de produtos)</li>
            <li><strong>Autoridades:</strong> Quando exigido por lei ou ordem judicial</li>
            <li><strong>Estabelecimentos:</strong> Apenas se você optar por compartilhar informações específicas (ex: carteirinha digital)</li>
          </ul>

          <h3>5.3. Compartilhamento com Cuidadores</h3>
          <p>
            Se você convidar outra pessoa para cuidar do seu pet junto com você (recurso de família/cuidador), essa pessoa passa a ter acesso aos dados daquele pet específico — não aos seus dados pessoais de conta. Você pode remover o acesso dela a qualquer momento.
          </p>

          <h3>5.4. Links de Afiliados e Lojas Parceiras</h3>
          <p>
            O PETMOL pode apresentar links para lojas e serviços de terceiros (ex: na seção &quot;Lojas&quot; e em &quot;Comprar novamente&quot;). Alguns desses links fazem parte de programas de afiliação e podem gerar comissão ao PETMOL quando você realiza uma compra, sem custo adicional para você decorrente dessa relação. Ao acessar a loja externa, você passa a estar sujeito aos termos, política de privacidade e condições de pagamento e entrega dessa loja — o PETMOL não participa da transação, não processa pagamentos e não recebe dados financeiros da sua compra.
          </p>

          <h2>6. Armazenamento e Segurança</h2>
          
          <h3>6.1. Onde Armazenamos</h3>
          <ul>
            <li>Servidores localizados no Brasil ou países com nível adequado de proteção</li>
            <li>Backups diários do banco de dados armazenados localmente na infraestrutura de hospedagem, com retenção operacional de até 14 dias; não há destino off-site ativo documentado no momento</li>
          </ul>

          <h3>6.2. Medidas de Segurança</h3>
          <ul>
            <li>Criptografia de senhas (bcrypt/argon2)</li>
            <li>Conexões HTTPS (SSL/TLS)</li>
            <li>Controle de acesso restrito</li>
            <li>Backups regulares (diários)</li>
          </ul>

          <h3>6.3. Tempo de Retenção</h3>
          <p>
            Mantemos seus dados enquanto sua conta estiver ativa ou conforme necessário para:
          </p>
          <ul>
            <li>Cumprir obrigações legais enquanto a conta estiver ativa</li>
            <li>Resolver disputas e fazer cumprir nossos acordos</li>
          </ul>
          <p>
            Ao solicitar a exclusão da conta, todos os seus dados pessoais e dos pets são
            removidos permanentemente do nosso banco de dados ativo e dos servidores de arquivo
            de forma imediata. Cópias de segurança automáticas (backups diários) podem manter uma
            versão dos dados por até 14 dias após a exclusão, até serem descartadas pela rotina
            normal de retenção — essas cópias não são acessadas nem restauradas individualmente.
          </p>

          <h2>7. Seus Direitos (LGPD)</h2>
          <p>Você tem direito a:</p>
          <ul>
            <li><strong>Acesso:</strong> Solicitar cópia dos seus dados</li>
            <li><strong>Correção:</strong> Atualizar dados incorretos ou incompletos</li>
            <li><strong>Exclusão:</strong> Solicitar remoção dos seus dados (&quot;direito ao esquecimento&quot;)</li>
            <li><strong>Portabilidade:</strong> Receber seus dados em formato estruturado</li>
            <li><strong>Revogação:</strong> Retirar consentimento a qualquer momento</li>
            <li><strong>Oposição:</strong> Opor-se a determinados usos dos seus dados</li>
            <li><strong>Informação:</strong> Saber com quem seus dados foram compartilhados</li>
          </ul>

          <h3>Como Exercer Seus Direitos</h3>
          <ul>
            <li>Através das configurações da sua conta (exclusão de conta disponível diretamente no app)</li>
            <li>Pela página pública <Link href="/excluir-conta" className="text-[#0056D2] hover:underline">petmol.com.br/excluir-conta</Link>, sem precisar do aplicativo instalado</li>
            <li>Enviando e-mail para: privacidade@petmol.com.br</li>
          </ul>
          <p className="text-sm text-gray-600">
            Responderemos sua solicitação em até 15 dias úteis.
          </p>

          <h2>8. Cookies e Tecnologias Similares</h2>
          <p>Utilizamos cookies para:</p>
          <ul>
            <li><strong>Essenciais:</strong> Manter sua sessão ativa</li>
            <li><strong>Funcionais:</strong> Lembrar preferências</li>
            <li><strong>Analíticos:</strong> Entender como você usa o serviço</li>
          </ul>
          <p>
            Você pode gerenciar cookies através das configurações do seu navegador.
          </p>

          <h2>9. Transferência Internacional</h2>
          <p>
            Seus dados são armazenados prioritariamente no Brasil. Se precisarmos transferi-los para outros países, garantiremos:
          </p>
          <ul>
            <li>Nível adequado de proteção</li>
            <li>Cláusulas contratuais padrão</li>
            <li>Conformidade com a LGPD</li>
          </ul>

          <h2>10. Crianças e Adolescentes</h2>
          <p>
            O PETMOL não coleta intencionalmente dados de menores de 13 anos. Se você é pai/mãe ou responsável e acredita que seu filho forneceu dados sem consentimento, entre em contato conosco.
          </p>

          <h2>11. Alterações nesta Política</h2>
          <p>
            Podemos atualizar esta Política periodicamente. Notificaremos você sobre mudanças significativas através de:
          </p>
          <ul>
            <li>E-mail</li>
            <li>Aviso na plataforma</li>
            <li>Notificação push</li>
          </ul>

          <h2>12. Encarregado de Dados (DPO)</h2>
          <p>
            Para questões relacionadas à proteção de dados, entre em contato com nosso Encarregado:
          </p>
          <ul>
            <li><strong>E-mail:</strong> dpo@petmol.com.br</li>
            <li><strong>Resposta em:</strong> até 15 dias úteis</li>
          </ul>

          <h2>13. Autoridade Nacional</h2>
          <p>
            Você também pode registrar reclamação junto à Autoridade Nacional de Proteção de Dados (ANPD):
          </p>
          <ul>
            <li><strong>Website:</strong> www.gov.br/anpd</li>
            <li><strong>Canal:</strong> Sistema de Atendimento ao Cidadão</li>
          </ul>

          <h2>14. Contato</h2>
          <p>
            Para dúvidas sobre esta Política de Privacidade:
          </p>
          <ul>
            <li><strong>E-mail:</strong> privacidade@petmol.com.br</li>
            <li><strong>Suporte:</strong> Através do chat na plataforma</li>
          </ul>

          <div className="mt-12 p-6 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-green-900">
              <strong>✓ Compromisso PETMOL:</strong> Adotamos medidas técnicas e organizacionais para proteger seus dados e buscamos ser transparentes sobre como eles são usados. Você pode acessar, corrigir e excluir suas informações a qualquer momento.
            </p>
          </div>

          <div className="mt-4 p-6 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>Versão:</strong> 2026-08-25<br />
              <strong>Data de vigência:</strong> 25 de agosto de 2026<br />
              <strong>Conformidade:</strong> LGPD (Lei 13.709/2018)
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-4 flex-wrap">
          <Link href="/legal/terms" className="text-[#0056D2] hover:text-[#003889] text-sm font-medium hover:underline transition-colors">
            Termos de Uso
          </Link>
          <Link href="/" className="text-slate-500 hover:text-slate-800 text-sm hover:underline transition-colors">
            Voltar ao Início
          </Link>
        </div>
      </PremiumCard>
    </PremiumScreenShell>
  );
}
