import type { Guide } from '../types';

export const primeirosCuidadosGuides: Guide[] = [
  {
    slug: 'pet-perdido-o-que-fazer-nas-primeiras-horas',
    title: 'Pet perdido: o que fazer nas primeiras horas',
    category: 'primeiros-cuidados',
    description:
      'Seu cão ou gato sumiu? Veja o que fazer na primeira hora, como montar um aviso que funciona, onde divulgar e como evitar golpes.',
    summary:
      'Nas primeiras horas, procure por perto com calma, avise vizinhos e porteiros e publique um aviso com foto nítida, região e um telefone seu. Divulgue em grupos do bairro e confira abrigos e clínicas da região. Nunca pague adiantado a quem diz ter o pet, e guarde um detalhe que só você sabe para confirmar a identidade de quem ligar.',
    publishedAt: '2026-11-20',
    updatedAt: '2026-11-20',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'Quando um cão ou gato some, o primeiro impulso é sair correndo sem plano. A pressa é compreensível, mas as primeiras horas rendem mais quando você combina duas coisas: procurar perto de casa e já espalhar a informação certa para quem pode encontrar o pet. Este guia organiza os dois caminhos, na ordem em que costumam ajudar.',
      },
      { type: 'h2', text: 'Na primeira hora: procure perto e avise quem está por perto', id: 'primeira-hora' },
      {
        type: 'ul',
        items: [
          'Comece pelo entorno imediato: quintal, garagem, escadas, áreas de serviço, embaixo de carros e arbustos. Muitos pets ficam escondidos a poucos metros de casa, assustados.',
          'Chame com a voz e o som que ele conhece (a embalagem do petisco, o barulho do pote de ração). Evite gritar ou correr atrás dele: um pet com medo pode fugir mais.',
          'Avise vizinhos, porteiros, vigias, entregadores e comerciantes da região. Quem circula todos os dias é quem mais provavelmente o viu.',
          'Peça que alguém fique em casa: muitos pets voltam sozinhos ao lugar onde se sentem seguros.',
          'Leve uma guia, um petisco e uma foto no celular para mostrar a quem encontrar pelo caminho.',
        ],
      },
      { type: 'h2', text: 'Como montar um aviso que funciona', id: 'aviso' },
      {
        type: 'p',
        text: 'Um aviso bom é lido em dois segundos. Informação demais esconde o que importa; informação de menos não permite que alguém reconheça o pet. O equilíbrio abaixo costuma funcionar em post de rede social, mensagem de grupo e cartaz impresso.',
      },
      {
        type: 'checklist',
        title: 'O que colocar no aviso',
        items: [
          'Uma foto nítida e recente, de frente, mostrando o pet inteiro. Se tiver uma segunda foto, que mostre uma marca de identificação (mancha, cicatriz, cor das patas).',
          'Nome do pet, espécie, porte e cor. Se atende pelo nome, diga.',
          'Onde e quando foi visto pela última vez (rua, bairro, horário aproximado).',
          'Se usava coleira, plaquinha ou tem microchip.',
          'Um telefone seu com WhatsApp. Evite colocar o endereço completo de casa.',
          'Uma frase curta pedindo que, se vir o pet, a pessoa não o persiga e avise você.',
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'Guarde de propósito um detalhe que não aparece no aviso (um apelido, um hábito, uma marca escondida pelo pelo). Quando alguém ligar dizendo que encontrou o pet, peça esse detalhe: é a forma mais simples de confirmar que a pessoa realmente está com ele.',
      },
      { type: 'h2', text: 'Onde divulgar', id: 'onde-divulgar' },
      {
        type: 'ul',
        items: [
          'Grupos do bairro e do condomínio em aplicativos de mensagem e redes sociais, com o aviso completo.',
          'Perfis e grupos de pets perdidos da sua cidade ou região. Publique com a foto e a região logo na primeira linha.',
          'Clínicas veterinárias, pet shops e escolas de adestramento num raio de alguns quilômetros: deixe a foto e o telefone.',
          'Órgãos e abrigos de proteção animal do seu município. Ligue e pergunte se há animais recolhidos com a descrição do seu pet; visitar pessoalmente costuma ser mais seguro do que confiar só em fotos.',
          'Cartazes simples em postes, padarias e portarias, com autorização de quem administra o local.',
        ],
      },
      { type: 'h2', text: 'Nos dias seguintes: continue sem se desgastar', id: 'dias-seguintes' },
      {
        type: 'ul',
        items: [
          'Volte a procurar nos horários mais calmos, como início da manhã e fim da tarde, quando há menos barulho e o pet tende a se sentir mais seguro para sair do esconderijo.',
          'Atualize o aviso se aparecer informação nova (um avistamento, uma região para reforçar).',
          'Se você tem microchip registrado, ligue para o cadastro e confirme que o telefone está atualizado. Um chip só ajuda se os dados de contato estiverem corretos.',
          'Peça ajuda a amigos e familiares para dividir as tarefas: uns procuram, outros divulgam, outros atendem as mensagens.',
        ],
      },
      { type: 'h2', text: 'Cuidado com golpes', id: 'golpes' },
      {
        type: 'p',
        text: 'Infelizmente, tutores aflitos viram alvo de golpe. Desconfie de quem pede dinheiro adiantado, depósito, Pix ou código por mensagem antes de mostrar o pet, e de quem se recusa a enviar uma foto ou vídeo atual. Combine a devolução em local público e movimentado, leve alguém junto e, se for recompensar, entregue só quando estiver com o pet nos braços.',
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'Se o pet for encontrado ferido, doente ou muito debilitado, leve-o a uma clínica veterinária. Avaliação e tratamento são decisões do médico-veterinário.',
      },
      { type: 'h2', text: 'Como se preparar antes que aconteça', id: 'preparar' },
      {
        type: 'checklist',
        items: [
          'Coleira com plaquinha legível: nome do pet e um telefone seu. É a identificação mais rápida para quem o encontra.',
          'Fotos atuais de frente, de lado e de detalhes, guardadas em uma pasta fácil de achar no celular.',
          'Microchip implantado e com dados de contato atualizados, quando o veterinário recomendar.',
          'Portões, janelas e telas conferidos, principalmente em dias de festa, barulho ou obras.',
          'Peso, porte, cor e marcas anotados, para descrever o pet sem depender da memória em um momento de nervoso.',
        ],
      },
      { type: 'h2', text: 'Se o pet for encontrado', id: 'encontrado' },
      {
        type: 'p',
        text: 'Quando o pet voltar, avise todos os lugares onde você divulgou e apague ou atualize os avisos, para que ninguém continue procurando e as informações não circulem desatualizadas. Leve-o ao veterinário se ficou fora por muito tempo, e revise a identificação para reduzir o risco de uma nova fuga.',
      },
      {
        type: 'links',
        title: 'Leia também',
        items: [
          { slug: 'coleira-ou-peitoral-qual-escolher', label: 'Coleira ou peitoral: qual escolher para o seu cachorro?' },
          { slug: 'checklist-adotou-cachorro', label: 'Checklist para quem acabou de adotar um cachorro' },
        ],
      },
    ],
    faq: [
      {
        question: 'Quanto tempo depois posso considerar o pet perdido?',
        answer:
          'Não é preciso esperar. Se o pet não está nos lugares onde costuma ficar e não responde ao chamado, comece a procurar e a avisar quem está por perto logo na primeira hora.',
      },
      {
        question: 'Vale divulgar o endereço de casa no aviso?',
        answer:
          'Prefira divulgar a região em que ele foi visto pela última vez e um telefone de contato. O endereço completo de casa não é necessário para quem encontra o pet e expõe você desnecessariamente.',
      },
      {
        question: 'O que o PETMOL faz nesses casos?',
        answer:
          'O PETMOL tem o recurso Pet Sumido: com um toque, o tutor gera um alerta com card para Instagram e WhatsApp e um aviso para usuários do app na região. Ele complementa, e não substitui, a busca e a divulgação descritas neste guia.',
      },
    ],
    relatedSlugs: ['coleira-ou-peitoral-qual-escolher', 'checklist-adotou-cachorro', 'como-transportar-gato-com-seguranca'],
    searchTerms: ['pet perdido', 'cachorro sumiu', 'gato sumiu', 'animal desaparecido', 'como achar pet', 'cartaz pet perdido', 'pet desaparecido'],
  },
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
