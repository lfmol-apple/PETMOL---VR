import type { Guide } from '../types';

export const gatosGuides: Guide[] = [
  {
    slug: 'como-escolher-areia-higienica-para-gatos',
    title: 'Como escolher areia higiênica para gatos',
    category: 'gatos',
    description:
      'O que decide é o gato aceitar: textura fina, sem perfume, boa absorção e controle de odor. Aglomerante ou não, mineral ou vegetal, é escolha secundária. Veja como comparar.',
    summary:
      'A areia que funciona é a que o gato usa sem hesitar: grão fino e macio nas patas, sem perfume forte, com boa absorção e controle de odor. A maioria dos gatos prefere areia aglomerante de grãos finos. Mineral e vegetal têm prós e contras práticos, mas a aceitação do gato vem antes de qualquer preferência do tutor. Compare pelo custo por semana de uso, não pelo preço do pacote.',
    publishedAt: '2026-09-04',
    updatedAt: '2026-09-04',
    readingTimeMinutes: 7,
    blocks: [
      {
        type: 'p',
        text: 'Areia é a compra mais recorrente de quem tem gato e a que mais causa problema quando erra: gato que não gosta da areia passa a fazer fora da caixa, e aí o custo deixa de ser o do pacote. A boa notícia é que o que os gatos preferem é bem documentado, então dá para acertar na maioria dos casos.',
      },
      { type: 'h2', text: 'A resposta rápida', id: 'resposta-rapida' },
      {
        type: 'p',
        text: 'Comece por uma areia aglomerante, de grãos finos, sem perfume, com boa capacidade de absorção. É o perfil que a maioria dos gatos aceita e que mais facilita a limpeza diária (você tira só o aglomerado e o cocô). A partir daí, se houver motivo — alergia, filhote que come areia, preferência ambiental — você ajusta.',
      },
      { type: 'h2', text: 'O que os gatos preferem (e por quê)', id: 'preferencia' },
      {
        type: 'ul',
        items: [
          'Textura fina e macia: gatos preferem grãos pequenos, parecidos com a areia natural onde a espécie evoluiu para enterrar os dejetos. Grânulos grandes e duros incomodam as patas.',
          'Sem perfume: o olfato do gato é muito mais sensível que o nosso. Perfume que parece "suave" para você pode ser aversivo para ele. Controle de odor por absorção e por bicarbonato/carvão é melhor que por fragrância.',
          'Profundidade: 3 a 5 cm de areia na caixa. Pouca areia não deixa o gato enterrar; areia demais alguns gatos não gostam.',
          'Consistência: a mesma marca sempre. Trocar de areia de repente é uma das causas mais comuns de o gato começar a fazer fora da caixa.',
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'Para testar uma areia nova sem risco: ofereça uma segunda caixa com a areia nova ao lado da caixa de sempre, por alguns dias. O gato "vota" com o uso. Só troque de vez se ele adotar a nova.',
      },
      { type: 'h2', text: 'Aglomerante x não aglomerante', id: 'aglomerante' },
      {
        type: 'p',
        text: 'A aglomerante forma torrões sólidos ao redor do xixi, que você retira inteiros — a caixa fica limpa com pouca reposição e o resto da areia dura mais. A não aglomerante (sílica em pérolas, ou granulados que só absorvem) exige trocar a caixa inteira com mais frequência, porque a urina se espalha pelo fundo. Para a rotina da maioria das casas, a aglomerante de grão fino é mais prática e econômica no uso.',
      },
      { type: 'h2', text: 'Mineral x vegetal x sílica', id: 'tipos' },
      {
        type: 'table',
        caption: 'Comparação prática',
        headers: ['Tipo', 'A favor', 'Contra'],
        rows: [
          ['Mineral (bentonita) aglomerante', 'Aglomera bem, textura fina que os gatos aceitam, custo médio', 'Pesada para carregar, gera pó (ruim para gato e tutor com via aérea sensível), descarte no lixo comum'],
          ['Vegetal (madeira, milho, mandioca, tofu)', 'Leve, menos pó, biodegradável, algumas versões aglomeram', 'Custa mais, textura varia muito entre marcas, algumas têm cheiro próprio que certos gatos recusam'],
          ['Sílica (cristais)', 'Absorção alta, pouco odor, dura semanas', 'Pérolas grandes que muitos gatos não gostam de pisar, não aglomera o cocô, preço por quilo alto'],
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'Nenhuma areia deve ser jogada no vaso sanitário, nem as vendidas como "descartáveis no vaso" — o risco de entupimento e, no caso de gestantes, de contato com Toxoplasma no esgoto, não compensa. Descarte no lixo, em saco fechado.',
      },
      { type: 'h2', text: 'Comparar pelo custo de uso', id: 'custo' },
      {
        type: 'p',
        text: 'O número que importa não é o preço do pacote, é quanto você gasta por semana mantendo a caixa limpa. Uma areia barata que aglomera mal obriga a trocar a caixa inteira a cada poucos dias e acaba mais cara do que uma areia melhor em que você só retira os torrões. Para comparar duas areias de forma justa, use a mesma caixa, o mesmo gato e meça quantos dias cada pacote dura com a limpeza diária feita.',
      },
      {
        type: 'links',
        title: 'Leia também',
        items: [
          { slug: 'quantas-caixas-de-areia-para-gatos', label: 'Quantas caixas de areia ter (e onde colocar)' },
          { slug: 'economizar-produtos-pet-sem-so-menor-preco', label: 'Como economizar em produtos pet sem escolher só pelo menor preço' },
        ],
      },
      { type: 'h2', text: 'Erros comuns', id: 'erros' },
      {
        type: 'ul',
        items: [
          'Escolher pela fragrância que agrada o tutor — o gato pode odiar.',
          'Trocar de marca de repente, sem período de adaptação com as duas caixas.',
          'Pouca areia na caixa (menos de 3 cm), o que impede o gato de enterrar.',
          'Comprar sílica achando que "não dá trabalho" e o gato recusar a textura.',
          'Comparar só o preço do pacote, ignorando quanto tempo cada um dura no uso real.',
        ],
      },
      {
        type: 'checklist',
        title: 'Antes de comprar a areia',
        items: [
          'É de grão fino e sem perfume?',
          'Aglomera bem (ou eu aceito trocar a caixa inteira com frequência)?',
          'Se for trocar de marca: vou oferecer as duas caixas por alguns dias?',
          'Vou manter 3 a 5 cm de areia na caixa?',
          'Comparei quanto cada pacote dura no uso, não só o preço?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Grão fino, sem perfume, boa absorção e — se der — aglomerante. O tipo (mineral, vegetal, sílica) é secundário diante da aceitação do gato. Teste com duas caixas antes de trocar, mantenha a marca constante e compare pelo custo por semana de uso.',
      },
    ],
    faq: [
      {
        question: 'Meu gato começou a fazer fora da caixa depois que troquei a areia. O que faço?',
        answer:
          'Volte imediatamente para a areia antiga e observe se resolve. Se o gato voltar a usar a caixa, era a areia. Se continuar fazendo fora mesmo com a areia de sempre, pode ser a caixa (suja, coberta, mal localizada), estresse, ou um problema de saúde — cistite e infecção urinária fazem o gato associar a caixa à dor. Fazer fora da caixa de forma persistente é sempre motivo para avaliação veterinária.',
      },
      {
        question: 'Areia com sílica ou "clara" mostra sangue na urina?',
        answer:
          'Algumas areias claras ajudam a notar mudança de cor da urina, o que pode ser útil. Mas não substituem observação: qualquer alteração de frequência, esforço para urinar, vocalização na caixa ou sangue visível pede veterinário no mesmo dia — obstrução urinária em gato macho é emergência.',
      },
      {
        question: 'Preciso de areia especial para filhote?',
        answer:
          'Filhotes muito novos podem provar a areia. Nesse período, prefira areia sem aglomerante mineral (a bentonita ingerida pode formar massa no trato digestivo) — granulados vegetais ou de papel são mais seguros até ele parar de mordiscar. Depois, migre para a areia definitiva com o método das duas caixas.',
      },
    ],
    sources: [
      {
        label: 'Litter and litter box guidance',
        publisher: 'International Cat Care',
        url: 'https://icatcare.org/advice/',
      },
      {
        label: 'Environmental needs and litter box care',
        publisher: 'AAFP — American Association of Feline Practitioners',
        url: 'https://catvets.com/guidelines/practice-guidelines',
      },
    ],
    relatedSlugs: ['quantas-caixas-de-areia-para-gatos', 'como-escolher-arranhador-para-gatos', 'economizar-produtos-pet-sem-so-menor-preco'],
    vetContext: true,
    searchTerms: ['areia', 'areia de gato', 'granulado', 'sílica', 'bentonita', 'areia vegetal', 'caixa de areia', 'gato'],
  },

  {
    slug: 'quantas-caixas-de-areia-para-gatos',
    title: 'Quantas caixas de areia ter (e onde colocar)',
    category: 'gatos',
    description:
      'A regra é uma caixa por gato mais uma extra, espalhadas pela casa em lugares calmos e de fácil acesso — nunca todas juntas no mesmo canto.',
    summary:
      'O padrão recomendado é o número de gatos mais um: dois gatos, três caixas. Elas devem ficar em pontos diferentes da casa, em locais tranquilos, ventilados e sem rota de fuga bloqueada — longe de comedouro e bebedouro. Caixa grande (1,5 vez o comprimento do gato), aberta, com limpeza diária.',
    publishedAt: '2026-09-04',
    updatedAt: '2026-09-04',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'Muito problema de xixi fora da caixa não é o gato "fazendo manha" — é a caixa errada, suja, ou no lugar errado. Antes de trocar de areia ou pensar em comportamento, vale acertar quantas caixas ter e onde colocá-las.',
      },
      { type: 'h2', text: 'A regra: número de gatos + 1', id: 'regra' },
      {
        type: 'p',
        text: 'A recomendação consolidada em medicina felina é ter uma caixa por gato mais uma adicional. Um gato: duas caixas. Dois gatos: três caixas. Três gatos: quatro caixas. Parece exagero, mas gatos são territoriais em relação à eliminação: um pode "bloquear" o acesso de outro a uma caixa, e alguns gatos não gostam de urinar e defecar no mesmo lugar.',
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'Em casa de dois ou mais andares, tenha pelo menos uma caixa por andar. Gato idoso ou com dor articular pode simplesmente não descer a escada a tempo.',
      },
      { type: 'h2', text: 'Onde colocar', id: 'onde' },
      {
        type: 'ul',
        items: [
          'Espalhadas: caixas em pontos diferentes da casa, não todas enfileiradas no mesmo cômodo — duas caixas coladas contam quase como uma só para o gato.',
          'Local calmo, mas não isolado: um canto tranquilo de um cômodo usado, não o fundo de um armário ou a área de serviço barulhenta com máquina de lavar.',
          'Sem beco sem saída: o gato precisa conseguir ver quem se aproxima e ter para onde sair. Caixa encurralada deixa o gato vulnerável e ele pode evitá-la.',
          'Longe da comida e da água: gatos não eliminam onde comem. Caixa ao lado do comedouro é motivo comum de recusa.',
          'Ventilado: lugar sem circulação de ar concentra odor e afasta o gato (e você limpa menos por não sentir).',
        ],
      },
      { type: 'h2', text: 'Como deve ser a caixa', id: 'a-caixa' },
      {
        type: 'ul',
        items: [
          'Grande: pelo menos 1,5 vez o comprimento do gato do focinho à base do rabo. A maioria das caixas de pet shop é pequena demais para gato adulto — bandeja de organização plástica grande costuma servir melhor.',
          'Borda acessível: filhotes e gatos idosos precisam de um lado mais baixo para entrar sem esforço.',
          'Aberta, de preferência: muitos gatos não gostam de caixa fechada (retém odor, limita a visão, é apertada). Se o seu usa a fechada sem problema, tudo bem — mas na dúvida, comece pela aberta.',
          'Sem forro plástico: o forro engancha nas unhas quando o gato cava e alguns passam a evitar a caixa.',
        ],
      },
      { type: 'h2', text: 'Limpeza', id: 'limpeza' },
      {
        type: 'ul',
        items: [
          'Retire fezes e aglomerados de urina pelo menos uma vez por dia — duas é melhor. Gato evita caixa suja e pode segurar a urina, o que favorece problema urinário.',
          'Complete a areia para manter a profundidade de 3 a 5 cm.',
          'Lave a caixa inteira com água e sabão neutro periodicamente (a cada 1 a 4 semanas conforme o tipo de areia). Evite produtos com cheiro forte ou amônia.',
          'Troque a caixa plástica quando ficar arranhada e encardida — o plástico poroso segura odor que você não tira mais.',
        ],
      },
      {
        type: 'links',
        title: 'Leia também',
        items: [
          { slug: 'como-escolher-areia-higienica-para-gatos', label: 'Como escolher areia higiênica para gatos' },
          { slug: 'como-escolher-arranhador-para-gatos', label: 'Como escolher arranhador para gatos' },
        ],
      },
      { type: 'h2', text: 'Erros comuns', id: 'erros' },
      {
        type: 'ul',
        items: [
          'Uma caixa só para vários gatos.',
          'Todas as caixas no mesmo cômodo.',
          'Caixa na área de serviço barulhenta ou no fundo de um armário.',
          'Caixa pequena demais para o tamanho do gato.',
          'Limpeza a cada dois ou três dias em vez de diária.',
          'Caixa ao lado do comedouro.',
        ],
      },
      {
        type: 'checklist',
        title: 'Revisão das caixas de areia',
        items: [
          'Tenho o número de gatos + 1 caixa?',
          'Elas estão em pontos diferentes da casa (e por andar)?',
          'Cada caixa está em local calmo, ventilado e sem beco sem saída?',
          'Nenhuma caixa está ao lado da comida ou da água?',
          'As caixas são grandes o suficiente (1,5× o comprimento do gato)?',
          'Faço a limpeza pelo menos uma vez por dia?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Número de gatos mais um, caixas espalhadas por locais calmos e acessíveis, grandes, abertas e limpas todo dia. Acertar isso resolve ou previne a maior parte dos problemas de eliminação fora da caixa — o resto é areia e, quando persiste, veterinário.',
      },
    ],
    faq: [
      {
        question: 'Tenho um gato só. Preciso mesmo de duas caixas?',
        answer:
          'É a recomendação, e resolve casos em que o gato não gosta de fazer xixi e cocô no mesmo lugar, ou em que uma caixa fica suja rápido demais no seu dia. Se o seu gato usa uma caixa só sem nenhum problema há tempos, não precisa forçar — mas a segunda caixa é barata e evita dor de cabeça.',
      },
      {
        question: 'Caixa fechada ou com filtro ajuda com o cheiro?',
        answer:
          'Reduz o cheiro para o tutor, mas concentra o odor para o gato dentro dela e pode fazê-lo evitar a caixa. O que resolve o cheiro de verdade é limpeza diária, areia com boa absorção, e a caixa em local ventilado. Se optar pela fechada, mantenha também uma aberta como alternativa.',
      },
      {
        question: 'Posso usar caixa autolimpante?',
        answer:
          'Algumas funcionam, mas o mecanismo e o barulho assustam parte dos gatos, e a caixa costuma ser pequena para o corpo do gato. Se for testar, mantenha uma caixa comum disponível ao mesmo tempo e observe qual o gato escolhe.',
      },
    ],
    sources: [
      {
        label: 'Litter box guidance and problem prevention',
        publisher: 'International Cat Care',
        url: 'https://icatcare.org/advice/',
      },
      {
        label: 'AAFP and ISFM guidelines on environmental needs',
        publisher: 'AAFP — American Association of Feline Practitioners',
        url: 'https://catvets.com/guidelines/practice-guidelines',
      },
    ],
    relatedSlugs: ['como-escolher-areia-higienica-para-gatos', 'como-escolher-arranhador-para-gatos', 'como-transportar-gato-com-seguranca'],
    vetContext: true,
    searchTerms: ['caixa de areia', 'quantas caixas', 'banheiro do gato', 'litter box', 'xixi fora da caixa', 'gato'],
  },

  {
    slug: 'como-escolher-arranhador-para-gatos',
    title: 'Como escolher arranhador para gatos',
    category: 'gatos',
    description:
      'Arranhar é comportamento normal e necessário. O arranhador certo é alto e firme o bastante para o gato esticar o corpo todo, no material e na orientação que ele prefere, e no lugar certo da casa.',
    summary:
      'Um bom arranhador é estável (não balança), alto ou longo o suficiente para o gato se esticar por inteiro, e feito de um material que ele goste de fincar as unhas — sisal, papelão ondulado ou madeira. Precisa ficar em local visível e de passagem, não escondido. Ter mais de um, em orientações diferentes (vertical e horizontal), aumenta a chance de o gato usar em vez do sofá.',
    publishedAt: '2026-09-04',
    updatedAt: '2026-09-04',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'Gato não arranha para "estragar" o sofá. Arranhar mantém as unhas saudáveis, alonga a musculatura, marca território com o cheiro das patas e alivia estresse. Um gato sem arranhador adequado vai arranhar o que tiver — então a pergunta não é "como impedir", é "como oferecer algo melhor que o sofá".',
      },
      { type: 'h2', text: 'Os quatro critérios que importam', id: 'criterios' },
      {
        type: 'ol',
        items: [
          'Estabilidade: o arranhador não pode balançar nem tombar quando o gato puxa com força. Um arranhador instável assusta o gato uma vez e ele não volta. Base pesada e larga, ou fixação na parede.',
          'Tamanho: o gato precisa conseguir esticar o corpo inteiro, patas para cima, sem dobrar. Para a maioria dos gatos adultos isso significa um poste vertical de pelo menos 70 a 80 cm de altura útil, ou um arranhador horizontal com comprimento equivalente.',
          'Material: sisal (corda ou tecido), papelão ondulado prensado e madeira/tronco são os preferidos. Carpete é menos eficaz e confunde o gato (o tapete e o carpete da casa viram alvo). Teste qual seu gato prefere.',
          'Orientação: alguns gatos arranham na vertical (poste, quina de parede), outros na horizontal (tapete, papelão no chão), outros na diagonal. Observar onde seu gato já arranha diz qual oferecer.',
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'Na dúvida sobre material e orientação, ofereça um poste de sisal vertical e uma placa de papelão horizontal. É barato e cobre os dois perfis mais comuns.',
      },
      { type: 'h2', text: 'Onde colocar', id: 'onde' },
      {
        type: 'ul',
        items: [
          'Perto do lugar que o gato já arranha: se ele ataca o canto do sofá, ponha o arranhador exatamente ali, na frente. Depois que ele adotar, você pode afastar alguns centímetros por semana.',
          'Em área de passagem e convívio: gatos arranham para marcar presença, então gostam de fazer isso à vista, não num quarto fechado. Arranhador na sala funciona; arranhador na lavanderia costuma ser ignorado.',
          'Perto de onde o gato dorme: muitos gatos arranham ao acordar, para se espreguiçar. Um arranhador ao lado da caminha é muito usado.',
          'Vários pontos: em casa com mais de um gato, ou casa grande, distribua arranhadores em cômodos diferentes.',
        ],
      },
      { type: 'h2', text: 'Como fazer o gato usar', id: 'como-fazer-usar' },
      {
        type: 'ul',
        items: [
          'Nunca pegue as patas do gato e "arranhe" por ele — isso costuma criar aversão.',
          'Passe catnip (erva-do-gato) ou brinque com uma varinha levando o gato a subir e fincar as unhas no arranhador.',
          'Recompense com petisco ou elogio toda vez que ele usar o arranhador.',
          'Torne o alvo errado menos atraente temporariamente: fita dupla-face no canto do sofá, ou um protetor plástico, enquanto o hábito no arranhador se forma.',
          'Mantenha as unhas aparadas se o gato não desgasta o suficiente sozinho — corte só a ponta transparente, nunca a parte rosada.',
        ],
      },
      {
        type: 'callout',
        tone: 'vet',
        text: 'A retirada cirúrgica das unhas (onicectomia) é uma amputação da última falange, dolorosa e com sequelas de comportamento e de apoio das patas. É condenada pelas principais entidades veterinárias e não deve ser considerada uma solução para arranhões.',
      },
      {
        type: 'links',
        title: 'Leia também',
        items: [
          { slug: 'quantas-caixas-de-areia-para-gatos', label: 'Quantas caixas de areia ter (e onde colocar)' },
          { slug: 'brinquedos-para-caes-como-escolher-com-seguranca', label: 'Brinquedos: como escolher com segurança (princípios que valem para gato também)' },
        ],
      },
      { type: 'h2', text: 'Erros comuns', id: 'erros' },
      {
        type: 'ul',
        items: [
          'Arranhador baixo demais — o gato não consegue se esticar e não usa.',
          'Arranhador que balança ou tomba.',
          'Colocar num quarto isolado em vez de na área de convívio.',
          'Só de carpete — material pouco atraente e que confunde com o tapete da casa.',
          'Um arranhador só, numa casa com vários gatos ou vários cômodos.',
          'Desistir nos primeiros dias sem usar catnip, brincadeira e recompensa.',
        ],
      },
      {
        type: 'checklist',
        title: 'Escolhendo o arranhador',
        items: [
          'É firme e não balança quando puxado?',
          'Permite o gato esticar o corpo inteiro (vertical ~70–80 cm, ou horizontal equivalente)?',
          'O material é sisal, papelão ou madeira (não só carpete)?',
          'A orientação combina com onde o gato já arranha?',
          'Vou colocá-lo em área de passagem, perto do alvo atual ou da cama do gato?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Firme, alto ou longo o bastante para o gato se esticar, no material e na orientação que ele prefere, e num lugar visível e de passagem. Ofereça mais de um, recompense o uso, e o sofá deixa de ser o alvo — sem nunca recorrer à retirada das unhas.',
      },
    ],
    faq: [
      {
        question: 'Meu gato ignora o arranhador que comprei. O que fazer?',
        answer:
          'Reveja três coisas: estabilidade (balança?), tamanho (ele consegue esticar todo?) e local (está escondido?). Mude o arranhador para o lado do móvel que ele arranha, passe catnip, e brinque com varinha guiando as patas dele até o material. Se ainda assim não usar, provavelmente é o material ou a orientação errados — teste papelão horizontal se o poste vertical falhou, e vice-versa.',
      },
      {
        question: 'Arranhadores de papelão valem a pena, mesmo durando pouco?',
        answer:
          'Sim. Muitos gatos preferem a textura do papelão ondulado, e o custo por mês costuma ser baixo. Vire ou substitua a placa quando estiver muito desgastada. É uma boa forma de descobrir se seu gato é do time "horizontal".',
      },
      {
        question: 'Preciso de uma árvore para gatos grande?',
        answer:
          'Não é obrigatório, mas ambientes verticais (prateleiras, árvore para gatos, nichos) fazem muita diferença no bem-estar de gato de apartamento, e a maioria das árvores já traz postes de sisal. Se o orçamento permite, resolve arranhador e enriquecimento de uma vez.',
      },
    ],
    sources: [
      {
        label: 'Scratching behaviour and how to manage it',
        publisher: 'International Cat Care',
        url: 'https://icatcare.org/advice/',
      },
      {
        label: 'Position statement on declawing',
        publisher: 'AAFP — American Association of Feline Practitioners',
        url: 'https://catvets.com/guidelines/position-statements',
      },
    ],
    relatedSlugs: ['quantas-caixas-de-areia-para-gatos', 'como-escolher-areia-higienica-para-gatos', 'como-transportar-gato-com-seguranca'],
    vetContext: true,
    searchTerms: ['arranhador', 'gato arranhando sofá', 'sisal', 'árvore para gatos', 'unhas do gato', 'gato'],
  },

  {
    slug: 'como-transportar-gato-com-seguranca',
    title: 'Como transportar gato com segurança',
    category: 'gatos',
    description:
      'Caixa rígida com abertura por cima e pela frente, do tamanho certo, apresentada em casa com calma. A maior parte do estresse vem de a caixa só aparecer no dia do veterinário.',
    summary:
      'A melhor caixa para gato é rígida, com tampa removível ou abertura superior além da frontal, grande o bastante para o gato ficar em pé e se virar. No carro, ela vai presa pelo cinto, no chão atrás do banco ou no assento. O que mais reduz o estresse é deixar a caixa aberta em casa como um móvel comum, com forro e petisco, o ano inteiro — não só na véspera da consulta.',
    publishedAt: '2026-09-04',
    updatedAt: '2026-09-04',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'Transportar gato tem uma dificuldade que o cão não tem: para a maioria dos gatos, a caixa de transporte só significa uma coisa — ir ao veterinário. O resultado é a perseguição pela casa, o gato encolhido no fundo do armário e uma viagem estressante para todos. Dá para mudar isso, e começa pela escolha da caixa.',
      },
      { type: 'h2', text: 'Que caixa comprar', id: 'que-caixa' },
      {
        type: 'ul',
        items: [
          'Rígida, de plástico: protege em caso de queda ou freada, é fácil de higienizar e o gato se sente mais contido e seguro do que numa bolsa mole.',
          'Com abertura por cima E pela frente: a superior permite colocar e tirar o gato sem puxar (essencial com gato assustado), e a frontal serve para ele sair sozinho quando quiser. Melhor ainda se a tampa toda se solta por clipes — no veterinário, o gato pode ser examinado dentro da metade de baixo.',
          'Tamanho: o gato deve conseguir ficar em pé sem encostar a cabeça e se virar. Nem muito maior que isso — espaço demais joga o gato de um lado para o outro numa freada.',
          'Trava firme e alça resistente que aguente o peso do gato sem ceder.',
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'Bolsa de transporte maleável serve para trajetos curtos a pé e para gato já acostumado e tranquilo. Não protege numa colisão e dá menos sensação de abrigo — não é a primeira opção.',
      },
      { type: 'h2', text: 'Fazer o gato aceitar a caixa', id: 'aceitar' },
      {
        type: 'ol',
        items: [
          'Deixe a caixa aberta em casa o ano todo, num lugar que o gato gosta, com um forro macio dentro. Ela vira mais um esconderijo, não um objeto de ameaça.',
          'Jogue petiscos dentro sem fechar a porta. Alimente o gato perto dela e, com o tempo, dentro dela.',
          'Use um borrifo de feromônio facial sintético (tipo Feliway) no forro 15 a 30 minutos antes, se o gato for muito reativo.',
          'No dia, coloque o gato pela abertura de cima com calma, ou incline a caixa na vertical e baixe o gato de bumbum. Nunca empurre pela frente.',
        ],
      },
      { type: 'h2', text: 'No carro', id: 'no-carro' },
      {
        type: 'ul',
        items: [
          'A caixa vai presa: no chão atrás do banco dianteiro (lugar mais estável), ou no assento com o cinto de segurança passado pela alça/estrutura da caixa.',
          'Nunca com o gato solto no carro nem no colo — numa freada ele vira projétil e pode se enfiar embaixo dos pedais.',
          'Cubra a caixa com uma toalha leve para reduzir estímulos visuais, deixando a ventilação livre. Muitos gatos se acalmam no escuro.',
          'Dirija com suavidade, sem som alto. Em viagem longa, ofereça água nas paradas, mas não abra a caixa fora de ambiente fechado e seguro — gato assustado foge e some.',
          'Nunca deixe o gato na caixa dentro do carro parado, principalmente no calor: a temperatura sobe a níveis fatais em minutos.',
        ],
      },
      { type: 'h2', text: 'Avião e viagens longas', id: 'aviao' },
      {
        type: 'p',
        text: 'Para voar, a maioria das companhias aceita o gato na cabine, numa caixa que caiba sob o banco da frente, com reserva antecipada da vaga do animal, vacina antirrábica em dia e atestado de saúde recente emitido por veterinário. As regras variam por companhia e por destino — confirme sempre antes de comprar a passagem e a caixa. Sedação por conta própria é desaconselhada, principalmente em voo; se o gato sofre muito, converse com o veterinário com antecedência.',
      },
      {
        type: 'links',
        title: 'Leia também',
        items: [
          { slug: 'como-escolher-caixa-transporte-cachorro', label: 'Caixa de transporte para cães (regras de avião e medidas)' },
          { slug: 'o-que-levar-viagem-com-cachorro', label: 'O que levar numa viagem com o pet' },
        ],
      },
      { type: 'h2', text: 'Erros comuns', id: 'erros' },
      {
        type: 'ul',
        items: [
          'Guardar a caixa no armário e só tirar no dia da consulta.',
          'Caixa que só abre pela frente — vira um cabo de guerra com o gato.',
          'Empurrar o gato de cabeça pela porta da frente.',
          'Levar o gato solto ou no colo dentro do carro.',
          'Abrir a caixa ao ar livre numa parada de viagem.',
          'Deixar o gato no carro parado, mesmo "por um minuto".',
        ],
      },
      {
        type: 'checklist',
        title: 'Antes de transportar o gato',
        items: [
          'A caixa é rígida, com abertura por cima e pela frente?',
          'O gato fica em pé e se vira dentro dela, sem sobrar muito espaço?',
          'A caixa fica aberta em casa como um esconderijo comum?',
          'Trabalhei petisco/refeição dentro da caixa antes do dia?',
          'No carro, a caixa vai presa e coberta com uma toalha?',
          'Se for avião: confirmei regras da companhia, vacina e atestado?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Caixa rígida com abertura dupla, do tamanho certo, que mora aberta na sala o ano todo. No carro, presa e coberta. A diferença entre uma viagem traumática e uma tranquila é quase toda feita nas semanas anteriores, não no dia.',
      },
    ],
    faq: [
      {
        question: 'Meu gato chora a viagem inteira. Posso dar calmante?',
        answer:
          'Só com orientação veterinária e nunca pela primeira vez no dia da viagem. Alguns gatos se beneficiam de feromônio sintético, de dessensibilização à caixa ao longo de semanas, ou de medicação prescrita e testada antes em casa. Sedativo por conta própria pode causar efeito paradoxal e prejudicar a regulação de temperatura.',
      },
      {
        question: 'Dois gatos podem ir na mesma caixa?',
        answer:
          'Melhor não. Mesmo gatos que convivem bem podem redirecionar o medo um no outro dentro de um espaço apertado e estressante. Uma caixa por gato, e se possível lado a lado para eles se verem.',
      },
      {
        question: 'Como limpar a caixa se o gato fizer xixi ou vomitar no caminho?',
        answer:
          'Leve um forro extra, sacos plásticos e lenços umedecidos. Troque o forro sujo numa parada em ambiente fechado (dentro do carro com as portas travadas, ou num banheiro). Lave a caixa com água e sabão neutro ao chegar — resíduo de urina antiga faz o gato resistir mais na próxima vez.',
      },
    ],
    sources: [
      {
        label: 'Getting your cat to the vet — carrier training',
        publisher: 'International Cat Care',
        url: 'https://icatcare.org/advice/',
      },
      {
        label: 'Transporte de animais domésticos',
        publisher: 'ANAC — Agência Nacional de Aviação Civil',
        url: 'https://www.gov.br/anac/pt-br/assuntos/passageiros/transporte-de-animais',
      },
    ],
    relatedSlugs: ['como-escolher-caixa-transporte-cachorro', 'o-que-levar-viagem-com-cachorro', 'quantas-caixas-de-areia-para-gatos'],
    vetContext: true,
    searchTerms: ['transporte de gato', 'caixa de transporte', 'levar gato ao veterinário', 'viajar com gato', 'gato no carro', 'gato'],
  },
];
