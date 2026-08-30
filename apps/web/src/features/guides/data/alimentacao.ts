import type { Guide } from '../types';

export const alimentacaoGuides: Guide[] = [
  {
    slug: 'como-escolher-racao-ideal-cachorro',
    title: 'Como escolher a ração ideal para o seu cachorro',
    category: 'alimentacao',
    description:
      'Idade, porte, nível de atividade e condições de saúde definem a ração certa — não a embalagem mais bonita nem o maior preço. Um passo a passo prático.',
    summary:
      'A ração certa é a que combina com a fase de vida, o porte e o estado de saúde do cão, tem rótulo claro e cabe no orçamento de forma sustentável. Marca cara não é sinônimo de adequada, e trocar por impulso costuma sair caro.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 8,
    blocks: [
      {
        type: 'p',
        text: 'Escolher ração parece simples até você parar na frente da prateleira: dezenas de marcas, "premium", "super premium", "natural", "sem grãos", faixas de preço que variam três ou quatro vezes para o mesmo peso. A boa notícia é que a decisão se resume a poucos critérios objetivos. O resto é marketing.',
      },
      { type: 'h2', text: 'A resposta rápida', id: 'resposta-rapida' },
      {
        type: 'p',
        text: 'A ração ideal é a que atende quatro coisas ao mesmo tempo: é formulada para a fase de vida do cão (filhote, adulto ou sênior), é adequada ao porte dele, tem um rótulo que você consegue ler e entender, e tem um custo que você consegue manter todo mês sem apertar. Se uma ração falha em qualquer um desses pontos, ela não é a ideal — mesmo que seja a mais cara da loja.',
      },
      { type: 'h2', text: '1. Fase de vida', id: 'fase-de-vida' },
      {
        type: 'p',
        text: 'Filhotes precisam de mais energia, cálcio e fósforo por causa do crescimento. Adultos precisam de manutenção. Cães idosos costumam se beneficiar de fórmulas com menos calorias e ajustes que ajudam rins e articulações. Usar ração de adulto em filhote (ou o contrário) por meses seguidos é um erro real de nutrição, não um detalhe.',
      },
      {
        type: 'p',
        text: 'A transição de filhote para adulto normalmente acontece quando o cão atinge cerca de 90% do peso adulto esperado — o que é por volta de 10 a 12 meses em raças pequenas e pode passar de 18 meses em raças grandes. Na dúvida sobre o momento exato, o veterinário que acompanha o cão é quem tem o histórico de peso para dizer.',
      },
      { type: 'h2', text: '2. Porte', id: 'porte' },
      {
        type: 'p',
        text: 'Rações "raças pequenas" costumam ter croquete menor (mais fácil de mastigar para mandíbulas pequenas) e densidade calórica um pouco maior, porque cães pequenos comem pouco volume. Rações "raças grandes" ajustam minerais e às vezes incluem suporte articular, porque cães grandes têm mais carga sobre as juntas. Não é obrigatório seguir a linha de porte, mas ela existe por um motivo.',
      },
      { type: 'h2', text: '3. Como ler o rótulo sem ser nutricionista', id: 'rotulo' },
      {
        type: 'p',
        text: 'Você não precisa decorar tabela nutricional. Precisa saber onde olhar:',
      },
      {
        type: 'ul',
        items: [
          'Fase de vida e porte: tem que estar escrito claramente na frente da embalagem, não escondido.',
          'Primeiros ingredientes: a lista vem em ordem de quantidade. Uma fonte de proteína nomeada ("frango", "carne de frango") entre os primeiros itens é um bom sinal. "Farinha de vísceras" não é necessariamente ruim, mas termos vagos demais merecem atenção.',
          'Nível de garantia (proteína bruta, gordura, fibra, umidade): serve para comparar rações da mesma categoria entre si.',
          'Registro no Ministério da Agricultura (MAPA): toda ração vendida legalmente no Brasil tem. A ausência é um alerta grande.',
          'Recomendação de porção diária por peso: você vai usar isso todo dia. Se a tabela for confusa ou não existir, é um problema prático.',
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: '"Sem grãos" virou argumento de venda, mas dieta sem grãos não é automaticamente melhor. Para a maioria dos cães saudáveis não faz diferença. Só faz sentido se houver indicação veterinária específica.',
      },
      { type: 'h2', text: '4. Nível de atividade e peso atual', id: 'atividade' },
      {
        type: 'p',
        text: 'Um cão que corre no parque todo dia gasta mais energia do que um cão de apartamento que sai duas vezes por dia para a rua curta. Cães castrados tendem a gastar menos e ganhar peso mais fácil. Cães acima do peso se beneficiam de fórmulas "light" ou de controle de peso — mas a fórmula sozinha não resolve, o que resolve é a porção certa (veja o guia de porções).',
      },
      { type: 'h2', text: 'O custo entra na conta — e como comparar', id: 'custo' },
      {
        type: 'p',
        text: 'O preço da etiqueta engana. Uma ração mais concentrada rende mais gramas de energia por quilo, então o cão come menos por dia. O número que importa é o custo por dia de alimentação, não o preço do pacote. Um saco de R$ 200 que dura 45 dias é mais barato no uso do que um saco de R$ 150 que dura 25 dias.',
      },
      { type: 'tool', tool: 'custo-mensal-racao' },
      {
        type: 'p',
        text: 'Escolher a ração mais cara "por precaução" só faz sentido se você consegue manter essa compra todos os meses. Trocar de ração cara para barata de repente, no fim do mês, é justamente o que mais causa problema digestivo. Consistência vale mais do que categoria.',
      },
      { type: 'h2', text: 'Erros comuns', id: 'erros' },
      {
        type: 'ul',
        items: [
          'Trocar de ração toda hora atrás da "melhor" — cada troca é um risco de diarreia e o cão nunca se adapta a nada.',
          'Comprar por indicação de vizinho sem olhar fase de vida e porte.',
          'Ignorar a tabela de porção e medir "no olho" com um copo.',
          'Achar que ração cara dispensa consulta veterinária quando o cão tem alguma condição de saúde.',
          'Comprar saco grande demais para um cão pequeno — a ração perde qualidade antes de acabar.',
        ],
      },
      {
        type: 'checklist',
        title: 'Antes de comprar, confirme',
        items: [
          'A ração diz claramente a fase de vida (filhote / adulto / sênior)?',
          'É adequada ao porte do cão?',
          'Tem registro no MAPA e tabela de porção legível?',
          'O custo por dia cabe no orçamento todo mês, não só neste?',
          'Se o cão tem alguma condição de saúde, a escolha foi conversada com o veterinário?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'A ração ideal é uma decisão de encaixe, não de status: fase de vida certa, porte certo, rótulo claro, custo sustentável. Depois de escolher, o próximo passo é medir a porção direito e guardar o saco corretamente — é aí que a maioria dos problemas de alimentação realmente aparece.',
      },
    ],
    tool: 'custo-mensal-racao',
    faq: [
      {
        question: 'Ração "super premium" é sempre melhor?',
        answer:
          'Não. As categorias comerciais ("premium", "super premium") não são definidas por lei de forma rígida. Uma ração de categoria mais alta costuma ser mais concentrada e ter ingredientes melhores, mas o que decide se ela é adequada para o seu cão é fase de vida, porte e saúde — não o rótulo de categoria.',
      },
      {
        question: 'Posso misturar ração seca com ração úmida?',
        answer:
          'Pode, e muita gente faz para aumentar a palatabilidade e a hidratação. O cuidado é somar as calorias das duas para não passar da porção diária total. Se a ração úmida for de uma condição específica (renal, por exemplo), isso precisa ser orientado pelo veterinário.',
      },
      {
        question: 'Cachorro pode comer ração de gato (ou o contrário)?',
        answer:
          'Não como dieta. Ração de gato tem mais proteína e alguns nutrientes em níveis que não são adequados para cães a longo prazo, e ração de cão não tem taurina suficiente para gatos. Um roubo pontual de petisco não é emergência, mas alimentação cruzada por semanas é.',
      },
    ],
    sources: [
      {
        label: 'Guias de nutrição para cães e gatos',
        publisher: 'WSAVA (World Small Animal Veterinary Association)',
        url: 'https://wsava.org/committees/global-nutrition-committee/',
      },
      {
        label: 'Registro de produtos para alimentação animal',
        publisher: 'Ministério da Agricultura e Pecuária (MAPA)',
        url: 'https://www.gov.br/agricultura/pt-br/assuntos/insumos-agropecuarios/insumos-pecuarios/alimentacao-animal',
      },
    ],
    relatedSlugs: ['quanto-tempo-dura-saco-de-racao', 'quanto-custa-alimentar-cachorro-por-mes', 'comparar-racoes-custo-diario'],
    vetContext: true,
  },

  {
    slug: 'quanto-tempo-dura-saco-de-racao',
    title: 'Quanto tempo dura um saco de ração?',
    category: 'alimentacao',
    description:
      'Dá para calcular exatamente: peso do saco em gramas dividido pelo consumo diário. Use a calculadora e planeje a recompra antes de acabar.',
    summary:
      'A duração de um saco de ração é o peso dele em gramas dividido pelo consumo diário em gramas. Um saco de 7,5 kg com 200 g por dia dura cerca de 37 dias. Saber esse número evita ficar sem ração no fim de semana e ajuda a comprar o tamanho certo.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 4,
    blocks: [
      {
        type: 'p',
        text: 'Toda tutora e todo tutor já ficou sem ração num domingo à noite. A conta para nunca mais passar por isso é simples e você faz uma vez a cada compra.',
      },
      { type: 'h2', text: 'A fórmula', id: 'formula' },
      {
        type: 'p',
        text: 'Transforme o peso do saco em gramas (1 kg = 1.000 g) e divida pelo quanto o cão come por dia, também em gramas:',
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'duração em dias = (peso do saco em kg × 1000) ÷ consumo diário em gramas',
      },
      {
        type: 'p',
        text: 'Exemplo: saco de 7,5 kg, cão come 200 g por dia. São 7.500 ÷ 200 = 37,5 dias. Ou seja, comprar um saco por mês deixa uma pequena folga; comprar a cada 40 dias já é arriscado.',
      },
      { type: 'tool', tool: 'duracao-saco-racao' },
      { type: 'h2', text: 'Onde encontrar o consumo diário', id: 'consumo-diario' },
      {
        type: 'p',
        text: 'O número de gramas por dia está na tabela de porção da embalagem, na coluna do peso do cão. Essa tabela é uma referência de manutenção para um cão adulto com atividade média — cães muito ativos, filhotes em crescimento ou cães que precisam perder peso podem ter uma porção diferente, e nesse caso a orientação vem do veterinário.',
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'Se o cão come duas refeições por dia, o consumo diário é a soma das duas, não o valor de uma refeição.',
      },
      { type: 'h2', text: 'Por que o tamanho do saco importa', id: 'tamanho-saco' },
      {
        type: 'p',
        text: 'Sacos grandes costumam ter preço por quilo menor, então parece sempre vantajoso comprar o maior. Mas depois de aberta, a maioria das rações recomenda consumo em até 4 a 6 semanas — a gordura da fórmula oxida em contato com o ar e o cão pode passar a recusar. Se um saco de 15 kg vai levar dois meses para acabar na casa de um cão pequeno, parte dele vai ser consumida já sem frescor. Para cães pequenos, o "desconto" do saco grande pode virar desperdício.',
      },
      {
        type: 'table',
        caption: 'Referência: quanto tempo cada saco dura conforme o consumo diário',
        headers: ['Consumo diário', 'Saco 3 kg', 'Saco 7,5 kg', 'Saco 15 kg'],
        rows: [
          ['80 g/dia', '~37 dias', '~93 dias', '~187 dias'],
          ['150 g/dia', '~20 dias', '~50 dias', '~100 dias'],
          ['250 g/dia', '~12 dias', '~30 dias', '~60 dias'],
          ['400 g/dia', '~7 dias', '~19 dias', '~37 dias'],
        ],
      },
      {
        type: 'p',
        text: 'A regra prática: escolha o tamanho de saco que o seu cão consome em até 5 ou 6 semanas. Isso equilibra preço por quilo e frescor.',
      },
      { type: 'h2', text: 'Erros comuns', id: 'erros' },
      {
        type: 'ul',
        items: [
          'Medir por volume ("uma xícara") em vez de peso — a xícara varia com a densidade da ração e a conta fica errada.',
          'Esquecer de somar as duas refeições diárias.',
          'Comprar o saco maior "porque compensa" sem checar se o cão termina antes de perder o frescor.',
          'Não anotar a data de abertura — sem isso, é impossível saber se a ração ainda está boa.',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Uma divisão de 10 segundos por compra resolve o problema de ficar sem ração e ainda ajuda a escolher o tamanho de saco que faz sentido para o seu cão. Se quiser ir além e comparar o custo real entre marcas, o próximo passo é calcular o custo por dia.',
      },
    ],
    tool: 'duracao-saco-racao',
    faq: [
      {
        question: 'A ração rende diferente do que a tabela diz?',
        answer:
          'A tabela é uma média. O rendimento real depende do metabolismo do cão, do nível de atividade e de quanto ele recebe de petisco fora da ração. Se a duração real ficar muito diferente do calculado, vale rever a porção com o veterinário — pode ser sinal de que a quantidade não está adequada.',
      },
      {
        question: 'Ração vencida ou velha faz mal?',
        answer:
          'Ração muito além da validade, ou aberta há muito tempo, perde nutrientes, muda de sabor e pode desenvolver fungos e ranço. Antes de causar doença, ela costuma causar recusa. Não vale a pena arriscar: se passou muito da data de abertura, descarte.',
      },
    ],
    sources: [
      {
        label: 'Recomendações de armazenamento de alimentos para animais de estimação',
        publisher: 'FDA — U.S. Food and Drug Administration',
        url: 'https://www.fda.gov/animal-veterinary/animal-health-literacy/proper-storage-pet-food-treats',
      },
    ],
    relatedSlugs: ['quanto-custa-alimentar-cachorro-por-mes', 'como-escolher-racao-ideal-cachorro', 'comparar-racoes-custo-diario'],
    vetContext: true,
  },

  {
    slug: 'quanto-custa-alimentar-cachorro-por-mes',
    title: 'Quanto custa alimentar um cachorro por mês?',
    category: 'alimentacao',
    description:
      'Depende do porte do cão e da ração, mas o cálculo é direto: custo por quilo da ração vezes o consumo diário, vezes 30. A calculadora faz a conta.',
    summary:
      'O custo mensal de ração é o preço por quilo multiplicado pelo consumo diário em quilos, multiplicado por 30. Para um cão médio comendo 250 g por dia de uma ração de R$ 25/kg, dá cerca de R$ 187 por mês só de ração. Petisco, antiparasitário e higiene entram por fora.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'Antes de adotar, ou quando o orçamento aperta, a pergunta prática é quanto pesa um cão na conta do mês. A parte mais previsível é a ração — e ela dá para calcular com precisão.',
      },
      { type: 'h2', text: 'Só a ração: como calcular', id: 'racao' },
      {
        type: 'ol',
        items: [
          'Custo por quilo da ração = preço do saco ÷ peso do saco em kg.',
          'Custo por dia = custo por quilo × (consumo diário em gramas ÷ 1000).',
          'Custo em 30 dias = custo por dia × 30.',
        ],
      },
      {
        type: 'p',
        text: 'Exemplo: saco de 15 kg por R$ 300 → R$ 20/kg. Cão come 300 g/dia → R$ 20 × 0,3 = R$ 6/dia → R$ 180 em 30 dias.',
      },
      { type: 'tool', tool: 'custo-mensal-racao' },
      { type: 'h2', text: 'Faixas de referência (só ração)', id: 'faixas' },
      {
        type: 'table',
        caption: 'Estimativa mensal de ração por porte, variando a categoria da ração',
        headers: ['Porte do cão', 'Consumo diário aproximado', 'Ração econômica', 'Ração intermediária', 'Ração premium'],
        rows: [
          ['Pequeno (até 10 kg)', '80–150 g', 'R$ 40–80', 'R$ 90–150', 'R$ 150–260'],
          ['Médio (10–25 kg)', '150–300 g', 'R$ 80–150', 'R$ 150–280', 'R$ 280–480'],
          ['Grande (25–45 kg)', '300–500 g', 'R$ 150–260', 'R$ 280–450', 'R$ 450–800'],
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'Os valores acima são ordens de grandeza para orientar o planejamento, não uma tabela de preços — variam por região, marca, promoção e pelo consumo real do cão.',
      },
      { type: 'h2', text: 'O que entra por fora da ração', id: 'por-fora' },
      {
        type: 'ul',
        items: [
          'Antiparasitário (pulgas, carrapatos, vermífugo): costuma ser mensal ou a cada poucos meses, e some no cálculo se você só pensa em ração.',
          'Petiscos e ossos: fáceis de subestimar. Se usados no adestramento ou "porque ele pede", podem representar 10 a 20% a mais no gasto de alimentação.',
          'Higiene: tapete higiênico, sacos para passeio, shampoo, banho.',
          'Vacinas anuais e consulta de rotina: gasto anual que, dividido por 12, entra no mês.',
          'Imprevistos de saúde: não dá para prever, mas dá para reservar um valor todo mês.',
        ],
      },
      { type: 'h2', text: 'Como reduzir sem prejudicar o cão', id: 'reduzir' },
      {
        type: 'ul',
        items: [
          'Compare pelo custo por dia, não pelo preço do saco — às vezes a ração "mais cara" sai mais barata no uso.',
          'Compre o tamanho de saco que o cão consome em 4 a 6 semanas: preço por quilo melhor sem desperdício por perda de frescor.',
          'Meça a porção com balança. "No olho" quase sempre é para mais, e ração jogada fora é dinheiro jogado fora.',
          'Reduza petisco industrializado — pedacinhos de cenoura ou da própria ração funcionam no adestramento e custam quase nada.',
          'Aproveite recompra programada e comparadores de preço em vez de comprar sempre na primeira loja.',
        ],
      },
      {
        type: 'checklist',
        title: 'Para montar o orçamento mensal do cão',
        items: [
          'Calculei o custo mensal só da ração com a calculadora acima?',
          'Somei antiparasitário (dividido pelo intervalo de uso)?',
          'Incluí petisco, higiene e sacos de passeio?',
          'Dividi por 12 as vacinas anuais e a consulta de rotina?',
          'Reservei um valor fixo para imprevisto de saúde?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'A ração é a despesa mais fácil de prever e a mais fácil de otimizar sem prejudicar o cão. O erro clássico é olhar só o preço do pacote: quem compara pelo custo por dia costuma gastar menos comprando uma ração igual ou melhor.',
      },
    ],
    tool: 'custo-mensal-racao',
    faq: [
      {
        question: 'Ração mais barata prejudica a saúde do cão?',
        answer:
          'Não necessariamente. Toda ração vendida legalmente atende requisitos mínimos. Rações mais baratas costumam ser menos concentradas, então o cão precisa comer mais gramas por dia — o que reduz a diferença de custo real. O que prejudica de verdade é ficar trocando de ração ou dar porção errada, não a categoria em si. Cães com condição de saúde específica são a exceção: aí a escolha é orientada pelo veterinário.',
      },
      {
        question: 'Comida caseira sai mais barato?',
        answer:
          'Comida caseira feita para dar certo (balanceada por um veterinário nutrólogo, com suplementação) raramente sai mais barata que ração, e comida caseira feita "no improviso" costuma ser desbalanceada. Não é uma decisão de economia.',
      },
    ],
    sources: [
      {
        label: 'Guias de nutrição para cães e gatos',
        publisher: 'WSAVA (World Small Animal Veterinary Association)',
        url: 'https://wsava.org/committees/global-nutrition-committee/',
      },
    ],
    relatedSlugs: ['quanto-tempo-dura-saco-de-racao', 'comparar-racoes-custo-diario', 'economizar-produtos-pet-sem-so-menor-preco'],
    vetContext: true,
  },
];
