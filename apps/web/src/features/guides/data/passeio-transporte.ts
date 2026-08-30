import type { Guide } from '../types';

export const passeioTransporteGuides: Guide[] = [
  {
    slug: 'coleira-ou-peitoral-qual-escolher',
    title: 'Coleira ou peitoral: qual escolher para o seu cachorro?',
    category: 'passeio-e-transporte',
    description:
      'Peitoral é mais seguro para a maioria dos cães, principalmente os que puxam ou têm focinho curto. A coleira ainda tem usos. Veja como decidir.',
    summary:
      'Para a maioria dos cães, o peitoral é a escolha mais segura para o passeio: distribui a tração pelo tórax em vez de concentrar no pescoço. Coleira funciona bem para cães que já andam calmos na guia e é onde vai a identificação. Cães braquicefálicos e filhotes se beneficiam ainda mais do peitoral.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 7,
    blocks: [
      {
        type: 'p',
        text: 'A dúvida entre coleira e peitoral aparece na primeira compra de qualquer tutor. A resposta curta: os dois têm função, mas para o passeio a segurança pende para o peitoral na maioria dos casos.',
      },
      { type: 'h2', text: 'A diferença que importa: onde a força vai parar', id: 'onde-a-forca-vai' },
      {
        type: 'p',
        text: 'Quando o cão puxa a guia, a coleira concentra toda essa força numa faixa estreita ao redor do pescoço — perto da traqueia, da tireoide e da coluna cervical. O peitoral espalha a mesma força pelo peito e pelos ombros, que são estruturas feitas para suportar carga. Para um cão que puxa com frequência, isso é a diferença entre pressão repetida numa região delicada e pressão distribuída.',
      },
      { type: 'h2', text: 'Quando o peitoral é claramente melhor', id: 'peitoral-melhor' },
      {
        type: 'ul',
        items: [
          'Cães que puxam a guia — a maioria dos cães jovens e não treinados.',
          'Raças de focinho curto (braquicefálicas), como pugs, buldogues e boxers: elas já têm via aérea mais estreita, e pressão no pescoço piora isso.',
          'Filhotes: estruturas ainda em formação, mais sensíveis a pressão localizada.',
          'Cães com histórico de problema cervical, de traqueia ou de tireoide.',
          'Cães que se assustam e dão arrancadas — o peitoral reduz o risco de lesão numa puxada brusca e é mais difícil de escapar.',
        ],
      },
      { type: 'h2', text: 'Quando a coleira ainda faz sentido', id: 'coleira-faz-sentido' },
      {
        type: 'ul',
        items: [
          'Cães adultos que já andam do lado, com guia frouxa, sem puxar.',
          'Como suporte para a plaquinha de identificação e para a coleira antiparasitária — mesmo que o passeio seja no peitoral, muitos cães usam a coleira o tempo todo para isso.',
          'Situações de controle rápido em ambiente conhecido e seguro.',
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'Coleira de enforcamento e coleira de espículos (pinos) são desaconselhadas: funcionam por dor e podem causar lesão. Não é o caminho para um cão que puxa — treino de guia frouxa e um bom peitoral resolvem sem machucar.',
      },
      { type: 'h2', text: 'Tipos de peitoral', id: 'tipos-peitoral' },
      {
        type: 'table',
        caption: 'Onde fica a argola da guia e o que muda',
        headers: ['Tipo', 'Argola', 'Melhor para'],
        rows: [
          ['Peitoral tipo H / costas', 'Nas costas', 'Cães que já não puxam; passeio tranquilo'],
          ['Peitoral com engate frontal', 'No peito', 'Cães que puxam — a frente redireciona o cão para o lado do tutor'],
          ['Peitoral tipo colete', 'Nas costas, com mais tecido', 'Cães pequenos e filhotes; mais conforto, menos ajuste fino'],
        ],
      },
      { type: 'h2', text: 'Ajuste: o ponto que quase todo mundo erra', id: 'ajuste' },
      {
        type: 'p',
        text: 'Um peitoral (ou coleira) mal ajustado anula a vantagem. A regra dos dois dedos: você deve conseguir passar dois dedos entre a fita e o corpo do cão, sem folga maior que isso. Muito frouxo, o cão escapa numa arrancada e o atrito machuca as axilas. Muito apertado, marca a pele e limita o movimento do ombro. Meça o cão com fita métrica antes de comprar e refaça o ajuste conforme ele cresce ou muda de peso.',
      },
      { type: 'h2', text: 'Erros comuns', id: 'erros' },
      {
        type: 'ul',
        items: [
          'Usar coleira em cão braquicefálico que puxa.',
          'Comprar pelo "tamanho P/M/G" sem medir o cão.',
          'Deixar o peitoral folgado demais — o cão escapa exatamente na hora do susto.',
          'Achar que o peitoral resolve o puxão — ele reduz o risco de lesão, mas o cão que puxa continua puxando. O treino de guia frouxa é o que resolve.',
          'Guia retrátil em rua movimentada: dá pouco controle e o cabo fino pode causar corte. Guia fixa de 1,2 a 1,5 m é mais segura no dia a dia urbano.',
        ],
      },
      {
        type: 'checklist',
        title: 'Escolhendo o equipamento de passeio',
        items: [
          'O cão puxa, é filhote ou tem focinho curto? → peitoral.',
          'Medi o peito e o pescoço do cão com fita métrica?',
          'A plaquinha de identificação está numa coleira que o cão usa sempre?',
          'Consigo passar exatamente dois dedos entre a fita e o corpo?',
          'A guia é fixa de 1,2 a 1,5 m para o uso urbano?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Peitoral para a segurança do passeio, coleira para a identificação e para cães que já andam calmos. O mais importante não é o tipo, é o ajuste correto e, se o cão puxa, o treino de guia frouxa em paralelo.',
      },
    ],
    faq: [
      {
        question: 'O peitoral incentiva o cão a puxar mais?',
        answer:
          'É um mito comum. O que faz o cão puxar é a falta de treino de guia frouxa e a empolgação com o ambiente, não o equipamento. Um peitoral com engate frontal pode até ajudar no manejo enquanto o treino avança.',
      },
      {
        question: 'Cachorro pode dormir de coleira?',
        answer:
          'Coleira leve e bem ajustada, com a plaquinha, costuma ser tolerada o tempo todo. O peitoral, por ter mais tecido e pontos de atrito, é melhor tirar em casa e nos momentos de descanso.',
      },
    ],
    sources: [
      {
        label: 'Orientações sobre equipamentos de contenção e bem-estar',
        publisher: 'Conselho Federal de Medicina Veterinária (CFMV)',
        url: 'https://www.cfmv.gov.br/',
      },
    ],
    relatedSlugs: ['como-escolher-caixa-transporte-cachorro', 'o-que-levar-viagem-com-cachorro', 'checklist-adotou-cachorro'],
    vetContext: true,
  },

  {
    slug: 'como-escolher-caixa-transporte-cachorro',
    title: 'Como escolher uma caixa de transporte para cachorro',
    category: 'passeio-e-transporte',
    description:
      'O tamanho certo é aquele em que o cão fica em pé, se vira e se deita — nem maior. Veja como medir, que tipo escolher e o que a viagem de avião exige.',
    summary:
      'A caixa de transporte certa é aquela em que o cão consegue ficar em pé sem encostar a cabeça, se virar e deitar esticado — e nada além disso, porque espaço demais reduz a segurança em freada. Rígida para carro e avião, ventilação em pelo menos três lados, trava firme.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 8,
    blocks: [
      {
        type: 'p',
        text: 'A caixa de transporte é um dos poucos itens em que errar o tamanho tem consequência de segurança, não só de conforto. Uma caixa grande demais deixa o cão ser arremessado dentro dela numa freada; uma pequena demais é sofrimento numa viagem longa.',
      },
      { type: 'h2', text: 'A regra de tamanho', id: 'regra-tamanho' },
      {
        type: 'p',
        text: 'O cão precisa conseguir três coisas dentro da caixa: ficar em pé sem encostar a cabeça no teto, virar-se completamente, e deitar esticado de lado. Se ele consegue essas três, a caixa serve. Se sobra muito mais espaço que isso, a caixa é grande demais para transporte seguro (mas pode servir como toca em casa).',
      },
      { type: 'h2', text: 'Como medir o cão', id: 'medir' },
      {
        type: 'ol',
        items: [
          'Comprimento: do focinho até a base do rabo (não a ponta). Some 5 a 10 cm.',
          'Altura: do chão até o topo da cabeça com o cão sentado ou em pé, o que for maior. Some 5 a 8 cm.',
          'Escolha a caixa cujo comprimento e altura internos sejam iguais ou pouco maiores que essas medidas.',
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'Filhote em crescimento: comprar pela medida atual significa trocar em poucos meses. Uma opção é comprar já a caixa do tamanho adulto esperado e reduzir o espaço interno com uma divisória ou almofada até ele crescer.',
      },
      { type: 'h2', text: 'Rígida ou maleável?', id: 'rigida-maleavel' },
      {
        type: 'table',
        caption: 'Quando usar cada tipo',
        headers: ['Tipo', 'Carro', 'Avião (porão)', 'Cabine / colo', 'Observações'],
        rows: [
          ['Rígida (plástico)', 'Sim', 'Sim', 'Não', 'Mais protetora em impacto; exigida para despacho aéreo'],
          ['Maleável (tecido)', 'Só presa ao cinto', 'Não', 'Sim (cães pequenos, conforme a companhia)', 'Leve e dobrável; não protege em colisão'],
          ['Bolsa de transporte', 'Não recomendado', 'Não', 'Sim (cães muito pequenos)', 'Só para trajetos curtos a pé / transporte público'],
        ],
      },
      { type: 'h2', text: 'O que checar antes de comprar', id: 'checar' },
      {
        type: 'ul',
        items: [
          'Ventilação em pelo menos três lados — cão superaquece rápido em espaço fechado.',
          'Trava da porta firme e que não abre sozinha com o balanço. Para avião, travas nos quatro cantos.',
          'Piso antiderrapante ou com forração fixa — cão escorregando dentro da caixa fica mais estressado.',
          'Alças ou pegada que aguentem o peso do cão sem ceder.',
          'Para avião: a IATA e cada companhia têm exigências específicas (caixa rígida, sem rodinhas travadas, pote de água acoplado, etiquetas). Confirme com a companhia antes de comprar.',
        ],
      },
      { type: 'h2', text: 'Fazer o cão gostar da caixa', id: 'dessensibilizacao' },
      {
        type: 'p',
        text: 'A maior parte do estresse com caixa de transporte vem de o cão só entrar nela quando algo ruim vai acontecer (veterinário, viagem). Deixe a caixa aberta em casa nos dias normais, com uma manta e um brinquedo dentro. Jogue petiscos lá dentro sem fechar a porta. Em poucas semanas a caixa vira um lugar seguro, e a resistência na hora de verdade cai muito.',
      },
      { type: 'h2', text: 'Erros comuns', id: 'erros' },
      {
        type: 'ul',
        items: [
          'Comprar "a maior que couber no carro" — espaço demais é perigoso em freada.',
          'Usar caixa maleável solta no banco do carro.',
          'Só apresentar a caixa no dia da viagem.',
          'Ignorar as regras da companhia aérea e descobrir no balcão que a caixa não é aceita.',
          'Deixar o cão sem acesso a água numa viagem longa.',
        ],
      },
      {
        type: 'checklist',
        title: 'Antes de comprar a caixa',
        items: [
          'Medi comprimento e altura do cão e somei a folga?',
          'O cão fica em pé, se vira e deita esticado — sem sobrar muito além disso?',
          'É rígida (se vai de carro ou avião)?',
          'Tem ventilação em três lados e trava firme?',
          'Se for avião: confirmei as regras da companhia?',
          'Tenho tempo de apresentar a caixa em casa antes da viagem?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Tamanho certo (em pé, vira, deita — e nada muito além disso), material rígido para carro e avião, boa ventilação e trava firme. O resto é apresentar a caixa com calma antes da viagem para o cão associá-la a segurança, não a estresse.',
      },
    ],
    faq: [
      {
        question: 'Posso levar o cão solto no banco de trás?',
        answer:
          'Não é seguro nem para o cão nem para quem está no carro. Numa freada ou colisão, um cão solto vira projétil. As opções seguras são caixa rígida presa, ou cinto de segurança específico para cães preso ao peitoral (nunca à coleira).',
      },
      {
        question: 'Cachorro grande demais para caixa, como transportar no carro?',
        answer:
          'Cães grandes costumam ir de cinto de segurança para pet preso ao peitoral, ou atrás de uma grade divisória no porta-malas de utilitários. Caixa rígida do tamanho deles existe, mas é volumosa — avalie o espaço do carro.',
      },
    ],
    sources: [
      {
        label: 'Container Requirements — transporte de animais vivos',
        publisher: 'IATA (International Air Transport Association)',
        url: 'https://www.iata.org/en/programs/cargo/live-animals/pets/',
      },
    ],
    relatedSlugs: ['o-que-levar-viagem-com-cachorro', 'kit-viajar-de-carro-com-cachorro', 'coleira-ou-peitoral-qual-escolher'],
    vetContext: true,
  },

  {
    slug: 'o-que-levar-viagem-com-cachorro',
    title: 'O que levar em uma viagem com cachorro',
    category: 'passeio-e-transporte',
    description:
      'Lista prática do que separar para viajar com o cão: documentos, ração medida, água, itens de higiene, kit de conforto e o que checar antes de sair.',
    summary:
      'Para viajar com o cão sem sufoco: caixa ou cinto de segurança, ração da casa já medida para os dias, água conhecida, pote dobrável, sacos de higiene, carteira de vacinação, coleira com identificação e um item de cheiro familiar. Confirme antes se o destino aceita animais.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 7,
    blocks: [
      {
        type: 'p',
        text: 'Viajar com cão dá certo quando você trata a bagagem dele com o mesmo cuidado da sua. A maioria dos perrengues — cão sem comida no meio do caminho, sem lugar para dormir, problema digestivo — vem de improviso, não de azar.',
      },
      { type: 'h2', text: 'Antes de fazer a mala: confirme o básico', id: 'antes' },
      {
        type: 'ul',
        items: [
          'O destino aceita animais? Hotel, pousada, casa de parente — confirme por escrito, não por suposição.',
          'A carteira de vacinação está em dia? Alguns lugares e a maioria das viagens de avião exigem vacina antirrábica válida e, às vezes, atestado de saúde recente.',
          'Se for de avião: regras da companhia sobre cabine x porão, tipo de caixa, peso, reserva antecipada da vaga do animal.',
          'O microchip (se houver) está com o cadastro atualizado, e a plaquinha da coleira tem um telefone que funciona longe de casa?',
        ],
      },
      { type: 'h2', text: 'A mala do cão', id: 'a-mala' },
      {
        type: 'h3',
        text: 'Alimentação',
      },
      {
        type: 'ul',
        items: [
          'Ração da casa, já pesada para os dias da viagem mais uma folga de 1 a 2 dias, num pote hermético. Trocar de ração no meio da viagem é a causa número um de diarreia em viagem.',
          'Água: leve de casa ou compre engarrafada da mesma marca. Água desconhecida de posto pode incomodar cães sensíveis.',
          'Pote de comida e bebedouro dobrável (silicone) — ocupam quase nada.',
          'Petisco conhecido para as paradas e para o hotel.',
        ],
      },
      { type: 'h3', text: 'Segurança e transporte' },
      {
        type: 'ul',
        items: [
          'Caixa de transporte rígida OU cinto de segurança para pet preso ao peitoral.',
          'Guia fixa reserva (se a principal quebrar, você não fica sem).',
          'Coleira com plaquinha de identificação atualizada.',
        ],
      },
      { type: 'h3', text: 'Higiene' },
      {
        type: 'ul',
        items: [
          'Sacos para recolher fezes — mais do que você acha que vai usar.',
          'Tapetes higiênicos para o quarto do hotel e para paradas onde não dá para o cão descer.',
          'Toalha (para patas molhadas e para forrar) e lenços umedecidos próprios para pet.',
          'Saco plástico para roupa/manta suja.',
        ],
      },
      { type: 'h3', text: 'Conforto e rotina' },
      {
        type: 'ul',
        items: [
          'A caminha ou uma manta que já tem o cheiro de casa — âncora de segurança em ambiente novo.',
          'Um ou dois brinquedos conhecidos.',
          'Medicação de uso contínuo, se houver, com a dose separada por dia e a receita.',
        ],
      },
      {
        type: 'callout',
        tone: 'vet',
        text: 'Cão com histórico de ansiedade ou enjoo em viagem: converse com o veterinário antes da viagem. Existem desde treino de dessensibilização até medicação pontual — mas isso se resolve com antecedência, não no dia, e nunca por conta própria.',
      },
      { type: 'h2', text: 'Na estrada', id: 'na-estrada' },
      {
        type: 'ul',
        items: [
          'Paradas a cada 2 a 3 horas para o cão beber água, esticar as pernas e fazer as necessidades — sempre na guia, mesmo que ele seja obediente em casa.',
          'Refeição leve antes de pegar a estrada e nunca durante o trajeto, para reduzir enjoo.',
          'Nunca deixe o cão sozinho no carro parado, principalmente no calor — a temperatura interna sobe a níveis perigosos em minutos.',
          'Ventilação e sombra dentro do carro; o cão não deve viajar com a cabeça para fora da janela (risco de detrito no olho e de queda).',
        ],
      },
      {
        type: 'checklist',
        title: 'Antes de sair de casa',
        items: [
          'Destino confirmado que aceita o cão?',
          'Carteira de vacinação e (se preciso) atestado de saúde?',
          'Ração da casa medida para os dias + folga, em pote hermético?',
          'Água conhecida e pote dobrável?',
          'Caixa de transporte ou cinto de segurança preso ao peitoral?',
          'Sacos de higiene, tapetes e toalha?',
          'Manta com cheiro de casa e brinquedo conhecido?',
          'Medicação contínua separada por dia, com receita?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'A viagem tranquila com cão é quase toda planejamento: confirmar o destino, manter a ração e a água da casa, garantir transporte seguro e levar um pedaço de casa junto. Para a viagem de carro especificamente, vale montar um kit fixo que fica pronto no porta-malas.',
      },
    ],
    faq: [
      {
        question: 'Preciso de atestado de saúde para viajar dentro do Brasil?',
        answer:
          'Para viagem de carro, geralmente não. Para viagem de avião, a maioria das companhias exige atestado de saúde emitido por médico-veterinário poucos dias antes do embarque, além da vacina antirrábica em dia. Confirme sempre as regras da companhia e do destino com antecedência.',
      },
      {
        question: 'Posso dar calmante para o cão na viagem?',
        answer:
          'Só com orientação do veterinário. Sedativos usados por conta própria podem ter efeito paradoxal, prejudicar a regulação de temperatura e são desaconselhados especialmente em viagem de avião. Se o cão sofre com viagem, planeje isso com o veterinário antes.',
      },
    ],
    sources: [
      {
        label: 'Transporte de animais domésticos',
        publisher: 'ANAC — Agência Nacional de Aviação Civil',
        url: 'https://www.gov.br/anac/pt-br/assuntos/passageiros/transporte-de-animais',
      },
    ],
    relatedSlugs: ['kit-viajar-de-carro-com-cachorro', 'como-escolher-caixa-transporte-cachorro', 'quanto-tempo-dura-saco-de-racao'],
    vetContext: true,
  },

  {
    slug: 'kit-viajar-de-carro-com-cachorro',
    title: 'Como montar um kit básico para viajar de carro com cachorro',
    category: 'passeio-e-transporte',
    description:
      'Um kit fixo que mora no porta-malas: transporte seguro, água e comida, higiene e conforto. Monta uma vez, confere antes de cada viagem.',
    summary:
      'O kit de carro é um conjunto pequeno que fica sempre pronto: cinto de segurança ou caixa, pote dobrável e garrafa de água, ração em pote hermético, sacos e tapetes de higiene, toalha, manta com cheiro de casa e um brinquedo. Montado uma vez, você só repõe consumíveis antes de sair.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 5,
    blocks: [
      {
        type: 'p',
        text: 'Quem viaja de carro com o cão com alguma frequência ganha tempo e evita esquecimento montando um kit fixo. Ele fica numa caixa organizadora no porta-malas; antes de cada viagem você só repõe o que é consumível.',
      },
      {
        type: 'p',
        text: 'A lógica do kit é a mesma de um kit de primeiros socorros: você monta com calma uma vez, quando não está com pressa, e depois só confere. Isso resolve os dois problemas mais comuns de viajar com cão — o cão viajar solto por falta de equipamento à mão, e chegar ao destino sem algo essencial porque a mala foi feita correndo.',
      },
      { type: 'h2', text: 'Segurança no carro (o item que não é opcional)', id: 'seguranca' },
      {
        type: 'p',
        text: 'Cão solto no carro é risco para todos. Numa freada a 60 km/h, um cão de 15 kg é projetado para a frente com força equivalente a mais de 400 kg — o suficiente para ferir gravemente o cão e quem está no banco da frente. As duas formas seguras de transportar são: cinto de segurança para pet preso ao peitoral, ou caixa rígida presa.',
      },
      {
        type: 'ul',
        items: [
          'Cinto de segurança para pet, preso ao peitoral (nunca à coleira), OU caixa de transporte rígida presa. Cão solto no banco é risco para todos numa freada.',
          'Guia fixa de reserva.',
          'Uma capa ou forração para o banco — protege o estofado e dá aderência para o cão não escorregar.',
        ],
      },
      { type: 'h2', text: 'Água e comida', id: 'agua-comida' },
      {
        type: 'ul',
        items: [
          'Garrafa de água (de casa ou engarrafada) — encha antes de sair.',
          'Bebedouro e pote de comida dobráveis, de silicone.',
          'Pote hermético pequeno com a ração da casa, na quantidade da viagem mais uma folga.',
          'Petisco conhecido para as paradas.',
        ],
      },
      { type: 'h2', text: 'Higiene', id: 'higiene' },
      {
        type: 'ul',
        items: [
          'Rolo de sacos para fezes.',
          'Alguns tapetes higiênicos (paradas sem lugar para descer, ou o quarto no destino).',
          'Toalha para patas e lenços umedecidos próprios para pet.',
          'Um ou dois sacos plásticos grandes para roupa/manta suja.',
        ],
      },
      { type: 'h2', text: 'Conforto', id: 'conforto' },
      {
        type: 'ul',
        items: [
          'Manta ou caminha dobrável com o cheiro de casa.',
          'Um brinquedo conhecido (de preferência silencioso, para não distrair quem dirige).',
        ],
      },
      { type: 'h2', text: 'Saúde e documentos', id: 'saude-documentos' },
      {
        type: 'ul',
        items: [
          'Cópia da carteira de vacinação (física ou foto no celular).',
          'Medicação de uso contínuo, separada por dia, com a receita.',
          'Contato do veterinário e, para viagens longas, o de uma clínica 24h na região do destino.',
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'Deixe uma etiqueta na caixa organizadora com a data da última conferência. Antes de cada viagem: repor água, ração e sacos; checar validade dos consumíveis; conferir se o cinto/caixa está no carro.',
      },
      {
        type: 'checklist',
        title: 'Kit de carro — conferência rápida antes de sair',
        items: [
          'Cinto de segurança para pet (ou caixa) no carro?',
          'Garrafa de água cheia + potes dobráveis?',
          'Ração da casa medida, em pote hermético?',
          'Sacos de fezes, tapetes e toalha?',
          'Manta com cheiro de casa + brinquedo?',
          'Cópia da vacinação e medicação contínua (se houver)?',
          'Contato do veterinário salvo?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'O kit de carro resolve dois problemas de uma vez: segurança (o cão nunca viaja solto) e esquecimento (a lista está montada). Monte uma vez, confira antes de cada viagem, e viajar com o cão vira rotina em vez de operação.',
      },
    ],
    faq: [
      {
        question: 'Cinto de segurança para cão funciona mesmo?',
        answer:
          'Um cinto de boa qualidade, curto e preso ao peitoral, impede que o cão seja arremessado e que ele atrapalhe quem dirige. Não substitui a proteção de uma caixa rígida numa colisão séria, mas é muito melhor que o cão solto. Prenda sempre ao peitoral, nunca à coleira, para não causar lesão no pescoço numa freada.',
      },
      {
        question: 'Quanto tempo o cão aguenta no carro sem parar?',
        answer:
          'A referência prática é parar a cada 2 a 3 horas para água, necessidades e movimento — o mesmo que uma pessoa faria. Filhotes, cães idosos e cães que bebem muita água podem precisar de paradas mais frequentes.',
      },
    ],
    sources: [],
    relatedSlugs: ['o-que-levar-viagem-com-cachorro', 'como-escolher-caixa-transporte-cachorro', 'coleira-ou-peitoral-qual-escolher'],
    vetContext: true,
  },
];
