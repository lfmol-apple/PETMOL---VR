import type { Guide } from '../types';

export const comprasInteligentesGuides: Guide[] = [
  {
    slug: 'comparar-racoes-custo-diario',
    title: 'Como comparar rações pelo custo diário (e não pelo preço do pacote)',
    category: 'compras-inteligentes',
    description:
      'O preço do saco não diz quase nada. O que importa é o custo por dia de alimentação. Compare duas rações lado a lado com a calculadora.',
    summary:
      'Para comparar duas rações de forma justa, calcule o custo por dia de cada uma: preço por quilo vezes o consumo diário. Uma ração mais concentrada rende mais e pode custar menos por dia mesmo custando mais por pacote. A diferença mensal entre duas opções pode passar de R$ 100.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'Duas rações do mesmo peso podem ter preços parecidos e custar valores muito diferentes por mês. O motivo é que rações não rendem igual: uma fórmula mais concentrada entrega mais energia por grama, então o cão come menos por dia.',
      },
      { type: 'h2', text: 'Por que o preço do saco engana', id: 'preco-engana' },
      {
        type: 'p',
        text: 'Imagine duas rações de 15 kg: a A custa R$ 210 e a B custa R$ 270. Parece óbvio que a A é mais barata. Mas se o cão come 350 g/dia da A e 240 g/dia da B (porque a B é mais concentrada), o cálculo muda:',
      },
      {
        type: 'table',
        caption: 'Mesma quantidade de cão, duas rações',
        headers: ['', 'Ração A', 'Ração B'],
        rows: [
          ['Preço do saco de 15 kg', 'R$ 210', 'R$ 270'],
          ['Preço por quilo', 'R$ 14,00', 'R$ 18,00'],
          ['Consumo diário', '350 g', '240 g'],
          ['Custo por dia', 'R$ 4,90', 'R$ 4,32'],
          ['Custo em 30 dias', 'R$ 147', 'R$ 130'],
        ],
      },
      {
        type: 'p',
        text: 'Nesse cenário, a ração "mais cara" custa R$ 17 a menos por mês — R$ 204 por ano — e ainda pode ser de melhor qualidade. O preço do pacote levou você para a decisão errada.',
      },
      { type: 'h2', text: 'O número certo: custo por dia', id: 'custo-por-dia' },
      {
        type: 'ol',
        items: [
          'Custo por quilo = preço do saco ÷ peso em kg.',
          'Custo por dia = custo por quilo × (consumo diário em gramas ÷ 1000).',
          'Compare o custo por dia das duas rações. Multiplique a diferença por 30 para ver o impacto mensal.',
        ],
      },
      { type: 'tool', tool: 'comparar-racoes-custo-diario' },
      { type: 'h2', text: 'De onde tirar o consumo diário de cada ração', id: 'consumo' },
      {
        type: 'p',
        text: 'Cada embalagem tem a própria tabela de porção, na linha do peso do cão. Rações diferentes recomendam gramagens diferentes para o mesmo cão — é exatamente essa diferença que a comparação por preço ignora. Use o valor da tabela de cada ração; se o cão já come uma delas, use o consumo real dele.',
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'A comparação só é justa entre rações da mesma fase de vida e do mesmo porte. Comparar uma ração de filhote com uma de adulto pelo custo por dia não faz sentido.',
      },
      { type: 'h2', text: 'O que o custo por dia não mede', id: 'limites' },
      {
        type: 'ul',
        items: [
          'Qualidade dos ingredientes: duas rações com o mesmo custo por dia podem ser muito diferentes no rótulo.',
          'Aceitação do cão: uma ração que o cão recusa tem custo infinito, porque vira desperdício.',
          'Adequação de saúde: cães com condição específica precisam da fórmula indicada pelo veterinário, e aí o custo por dia é secundário.',
        ],
      },
      {
        type: 'p',
        text: 'O custo por dia é a ferramenta para desempatar entre rações que já passaram no filtro de fase de vida, porte e rótulo. Não substitui esse filtro.',
      },
      {
        type: 'checklist',
        title: 'Comparação justa entre duas rações',
        items: [
          'As duas são da mesma fase de vida e porte?',
          'Peguei o consumo diário da tabela de cada embalagem (ou o consumo real do cão)?',
          'Calculei o custo por dia das duas, não só o preço do saco?',
          'Multipliquei a diferença por 30 para ver o impacto no mês?',
          'Considerei se o cão aceita bem as duas?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Comparar ração pelo preço do pacote é como comparar carro só pelo preço do tanque cheio. O custo por dia é o número que reflete o gasto real e, com frequência, aponta para uma ração melhor que também é mais barata no uso.',
      },
    ],
    tool: 'comparar-racoes-custo-diario',
    faq: [
      {
        question: 'E se eu não souber o consumo diário da ração nova?',
        answer:
          'Use a tabela de porção da embalagem na linha do peso do cão. É uma estimativa de manutenção, mas serve para a comparação. Depois de alguns dias de uso real, recalcule com o consumo observado.',
      },
      {
        question: 'Vale a pena trocar de ração só para economizar alguns reais por mês?',
        answer:
          'Só se a diferença for relevante e a ração nova for adequada. Toda troca de ração tem custo digestivo e exige transição gradual de 7 a 10 dias. Economizar R$ 5 por mês não compensa o risco; economizar R$ 80 por mês, sim — desde que a ração nova passe nos outros critérios.',
      },
    ],
    sources: [],
    relatedSlugs: ['quanto-custa-alimentar-cachorro-por-mes', 'como-escolher-racao-ideal-cachorro', 'economizar-produtos-pet-sem-so-menor-preco'],
    vetContext: true,
  },

  {
    slug: 'economizar-produtos-pet-sem-so-menor-preco',
    title: 'Como economizar na compra de produtos para pets sem escolher só pelo menor preço',
    category: 'compras-inteligentes',
    description:
      'Economia de verdade em produtos pet vem de comparar custo por uso, comprar o tamanho certo e evitar troca por impulso — não de pegar sempre o mais barato da prateleira.',
    summary:
      'O item mais barato quase nunca é o mais econômico. O que reduz o gasto no ano é comparar custo por uso, acertar o tamanho da embalagem, aproveitar recompra programada e não trocar de produto por impulso. O menor preço isolado costuma custar mais no fim.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 7,
    blocks: [
      {
        type: 'p',
        text: 'Escolher sempre o produto mais barato parece economia, mas costuma ser o oposto: produtos baratos rendem menos, duram menos ou são recusados, e você acaba comprando de novo. Economia real em produto pet é uma questão de método, não de reflexo.',
      },
      { type: 'h2', text: '1. Compare por custo de uso, não por preço de etiqueta', id: 'custo-de-uso' },
      {
        type: 'ul',
        items: [
          'Ração: custo por dia de alimentação (veja o guia de comparação por custo diário).',
          'Tapete higiênico: custo por unidade útil — um tapete de baixa absorção que precisa ser trocado duas vezes por dia sai mais caro que um bom trocado uma vez.',
          'Antiparasitário: custo por mês de proteção, considerando a duração de cada dose.',
          'Petisco: custo por sessão de adestramento — pedacinho de cenoura ou da própria ração custa quase nada.',
        ],
      },
      {
        type: 'p',
        text: 'A conta é sempre a mesma: preço ÷ quantas vezes o produto realmente serve. É esse número que compara maçãs com maçãs.',
      },
      { type: 'h2', text: '2. Acerte o tamanho da embalagem', id: 'tamanho' },
      {
        type: 'p',
        text: 'Embalagens grandes têm preço por unidade menor, mas só valem a pena se você consome antes de perder qualidade ou validade. Ração aberta rende bem por 4 a 6 semanas. Shampoo, antiparasitário e outros itens com validade também estragam. Comprar grande "porque compensa" e jogar metade fora é o desperdício mais comum.',
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'Regra prática: compre o tamanho que você usa dentro do prazo de frescor/validade com uma folga pequena. Nem o menor (caro por unidade), nem o gigante (desperdício).',
      },
      { type: 'h2', text: '3. Não troque de produto por impulso', id: 'impulso' },
      {
        type: 'p',
        text: 'Trocar de ração custa uma transição de 7 a 10 dias e risco de diarreia. Trocar de tapete higiênico ou de coleira sem necessidade custa o valor do item que ainda estava bom. A "nova marca em promoção" só é economia se substituir algo que você ia comprar de qualquer jeito — e se passar nos seus critérios.',
      },
      { type: 'h2', text: '4. Use recompra programada e comparadores', id: 'recompra' },
      {
        type: 'ul',
        items: [
          'Itens recorrentes (ração, antiparasitário, tapete) se beneficiam de recompra programada: você evita a compra de emergência de última hora, que costuma ser a mais cara.',
          'Comparar o preço do mesmo produto em duas ou três lojas antes de comprar leva um minuto e muda o valor com frequência.',
          'Acompanhar o histórico de preço evita cair no falso "desconto" sobre um preço inflado.',
        ],
      },
      { type: 'h2', text: '5. Separe o que é essencial do que é conveniência', id: 'essencial' },
      {
        type: 'p',
        text: 'Alguns itens têm impacto direto na saúde e no bem-estar — ração adequada, antiparasitário, uma cama que sustenta o corpo do cão idoso. Outros são conveniência — comedouro elevado, fonte de água, brinquedo novo. Economizar faz mais sentido nos itens de conveniência (onde o "suficiente" resolve) do que nos essenciais (onde poupar demais cobra depois).',
      },
      {
        type: 'checklist',
        title: 'Antes de comprar, pergunte',
        items: [
          'Qual o custo por uso deste produto, não só o preço?',
          'É o tamanho de embalagem que eu consumo dentro da validade/frescor?',
          'Estou trocando de marca por necessidade ou por impulso de promoção?',
          'Comparei o preço em mais de uma loja?',
          'Este é um item essencial (não vale poupar demais) ou de conveniência (o suficiente resolve)?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Economia sustentável em produto pet não é caçar o menor preço toda semana — é um punhado de hábitos: comparar por custo de uso, acertar o tamanho, evitar troca por impulso e usar recompra. Quem faz isso gasta menos no ano comprando produtos iguais ou melhores.',
      },
    ],
    faq: [
      {
        question: 'Marca de loja (marca própria) é confiável?',
        answer:
          'Depende do item. Para ração, vale aplicar os mesmos critérios de qualquer marca: fase de vida, porte, rótulo, registro no MAPA. Para itens de higiene e acessórios, marca própria costuma entregar o essencial por menos. Teste em quantidade pequena antes de comprar em volume.',
      },
      {
        question: 'Vale a pena comprar em atacado com outras pessoas?',
        answer:
          'Para itens não perecíveis e de uso garantido (sacos de passeio, alguns tapetes) pode reduzir o custo por unidade. Para ração e itens com validade, o rateio só compensa se cada pessoa consome a parte dela dentro do prazo de frescor.',
      },
    ],
    sources: [],
    relatedSlugs: ['comparar-racoes-custo-diario', 'quanto-custa-alimentar-cachorro-por-mes', 'checklist-adotou-cachorro'],
  },
];
