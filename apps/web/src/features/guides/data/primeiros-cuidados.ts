import type { Guide } from '../types';

export const primeirosCuidadosGuides: Guide[] = [
  {
    slug: 'checklist-adotou-cachorro',
    title: 'Checklist para quem acabou de adotar um cachorro',
    category: 'primeiros-cuidados',
    description:
      'O que providenciar antes de o cão chegar, o que fazer nas primeiras 48 horas e o que agendar na primeira semana — sem gastar em tudo de uma vez.',
    summary:
      'Antes da chegada, providencie comedouro, bebedouro, cama, guia, coleira com identificação e a mesma ração que o cão comia. Nas primeiras 48 horas, foque em rotina e segurança da casa. Na primeira semana, agende a consulta veterinária inicial. O resto pode ser comprado ao longo das semanas.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 8,
    blocks: [
      {
        type: 'p',
        text: 'Adotar um cão gera uma lista de compras que parece infinita e um orçamento que assusta se você tenta resolver tudo no primeiro dia. Este checklist separa o que é essencial antes da chegada do que pode esperar — a maior parte pode.',
      },
      { type: 'h2', text: 'Antes de o cão chegar (o essencial mesmo)', id: 'antes' },
      {
        type: 'checklist',
        title: 'Compre / providencie',
        items: [
          'Comedouro e bebedouro (inox ou cerâmica — veja o guia de comedouro).',
          'A MESMA ração que o cão vinha comendo, na quantidade de pelo menos uma semana. Trocar de ração na mudança de casa é dose dupla de estresse digestivo.',
          'Cama ou uma manta confortável, num canto tranquilo.',
          'Coleira com plaquinha de identificação (nome do cão + seu telefone) e guia fixa de 1,2 a 1,5 m. Peitoral se ele for filhote, puxar ou ter focinho curto.',
          'Sacos para recolher fezes e, se for filhote ou for usar tapete, tapetes higiênicos.',
          'Um ou dois brinquedos seguros para o porte dele.',
        ],
      },
      { type: 'h2', text: 'Segurança da casa', id: 'seguranca-casa' },
      {
        type: 'ul',
        items: [
          'Guarde fios, produtos de limpeza, medicamentos humanos e plantas tóxicas (comigo-ninguém-pode, lírio, azaleia, entre outras) fora do alcance.',
          'Tampe o lixo. Feche o acesso a áreas de risco (piscina sem cerca, sacada baixa, escada íngreme para filhote).',
          'Recolha objetos pequenos que caibam na boca do cão — meias, tampinhas, elásticos.',
          'Defina, com todos da casa, onde o cão pode ficar e onde não pode, e mantenha isso consistente desde o primeiro dia.',
        ],
      },
      { type: 'h2', text: 'As primeiras 48 horas', id: '48-horas' },
      {
        type: 'ul',
        items: [
          'Ambiente calmo: menos visitas, menos barulho, deixe o cão explorar no ritmo dele. Não force interação.',
          'Rotina desde já: horários de refeição, de passeio (se já pode sair) e de descanso. Cães se acalmam com previsibilidade.',
          'Um espaço só dele (a cama, um canto, ou uma caixa de transporte aberta com manta) onde ele possa se recolher.',
          'Observe e anote: quanto ele come, se bebe água, como estão as fezes, se tem tosse, espirro, coceira excessiva. Isso é informação para a primeira consulta.',
          'Não espere que ele "seja ele mesmo" nos primeiros dias — muitos cães ficam quietos, sem apetite total ou grudados, e vão soltando a personalidade ao longo de semanas.',
        ],
      },
      { type: 'h2', text: 'Primeira semana', id: 'primeira-semana' },
      {
        type: 'checklist',
        title: 'Agende / resolva',
        items: [
          'Consulta veterinária inicial: avaliação geral, conferência da carteira de vacinação e do calendário de vacinas, orientação de antiparasitário (pulgas, carrapatos, vermífugo), conversa sobre castração se ainda não foi feita.',
          'Se o cão veio sem histórico: o veterinário orienta os primeiros exames e o esquema de vacinas do zero.',
          'Microchip / identificação: verifique se tem, e se o cadastro está no seu nome e com contato atual. Se não tem, converse sobre implantar.',
          'Comece o registro de saúde (peso, vacinas, vermífugo, consultas) desde a primeira consulta — é mais fácil manter do que reconstruir depois.',
        ],
      },
      {
        type: 'callout',
        tone: 'vet',
        text: 'A consulta inicial não é opcional nem "só quando ficar doente". É o que define o calendário de vacinas, o antiparasitário certo para a região e o peso ideal do cão. Tudo o mais (dieta, adestramento, acessórios) fica mais fácil com essa base.',
      },
      { type: 'h2', text: 'O que pode esperar (compre ao longo das semanas)', id: 'pode-esperar' },
      {
        type: 'ul',
        items: [
          'Caixa de transporte (a não ser que você já tenha uma viagem marcada).',
          'Cama ortopédica, fonte de água, comedouro lento — só se houver necessidade específica.',
          'Roupinha, mais brinquedos, petiscos variados — nada disso é urgente.',
          'Itens de adestramento (clicker, pochete de petisco) quando você começar o trabalho de comandos.',
        ],
      },
      { type: 'h2', text: 'Adestramento básico desde o começo', id: 'adestramento' },
      {
        type: 'p',
        text: 'Você não precisa de curso caro na primeira semana, mas três coisas vale começar cedo: ensinar o nome, associar o local de fazer as necessidades, e recompensar comportamento calmo (em vez de dar atenção só quando o cão está agitado). Reforço positivo — recompensar o certo — funciona melhor e cria menos medo que punição. Se aparecerem problemas de comportamento sérios (agressividade, ansiedade de separação intensa), aí vale procurar um profissional.',
      },
      {
        type: 'checklist',
        title: 'Resumo — o que fazer em cada momento',
        items: [
          'Antes da chegada: comedouro, bebedouro, cama, coleira + identificação, guia, a mesma ração, sacos de higiene.',
          'Casa segura: fios, produtos, lixo, objetos pequenos, áreas de risco.',
          '48 horas: ambiente calmo, rotina, espaço só dele, observar e anotar.',
          '1ª semana: consulta veterinária inicial, identificação/microchip, começar o registro de saúde.',
          'Depois: caixa de transporte, itens de conforto específicos, adestramento estruturado.',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Adotar bem é menos sobre comprar tudo e mais sobre acertar a base: itens essenciais, casa segura, rotina calma e a consulta veterinária inicial na primeira semana. O resto entra aos poucos, conforme você conhece o cão.',
      },
    ],
    faq: [
      {
        question: 'Quanto custa o primeiro mês com um cão adotado?',
        answer:
          'Varia muito com o porte e a região, mas os maiores gastos do primeiro mês costumam ser a consulta veterinária inicial (com possíveis vacinas e exames), o antiparasitário e os itens duráveis (cama, comedouro, guia). A ração é a despesa recorrente — veja o guia de custo mensal de ração para estimar essa parte. Muitos itens de conveniência podem ser adiados.',
      },
      {
        question: 'O cão não come nos primeiros dias. É normal?',
        answer:
          'Redução de apetite nos primeiros dias em ambiente novo é comum, por estresse. Ofereça a ração de sempre, em local calmo, e retire depois de 20 minutos. Se o cão passar mais de 24 a 48 horas sem comer nada, ou tiver vômito, diarreia ou prostração junto, procure o veterinário — aí não é só adaptação.',
      },
      {
        question: 'Preciso registrar o cão em algum lugar?',
        answer:
          'Muitos municípios têm cadastro/registro de animais e alguns exigem. Independente disso, manter a identificação (plaquinha e, idealmente, microchip com cadastro atualizado) é o que aumenta a chance de reencontro se o cão se perder.',
      },
    ],
    sources: [
      {
        label: 'Cuidados iniciais com cães recém-adotados',
        publisher: 'ASPCA — American Society for the Prevention of Cruelty to Animals',
        url: 'https://www.aspca.org/pet-care/dog-care/general-dog-care',
      },
      {
        label: 'Plantas tóxicas para animais de companhia',
        publisher: 'ASPCA Animal Poison Control',
        url: 'https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants',
      },
    ],
    relatedSlugs: ['como-escolher-racao-ideal-cachorro', 'coleira-ou-peitoral-qual-escolher', 'brinquedos-para-caes-como-escolher-com-seguranca'],
    vetContext: true,
  },
];
