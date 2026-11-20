import type { Guide } from '../types';

export const higieneGuides: Guide[] = [
  {
    slug: 'como-escolher-tapete-higienico-cachorro',
    title: 'Como escolher tapete higiênico para cachorro',
    category: 'higiene',
    description:
      'Absorção real, tamanho maior que a área que o cão usa e camada antivazamento são o que importa — não o número de camadas anunciado. Veja como comparar e usar.',
    summary:
      'O bom tapete higiênico absorve o suficiente para ser trocado uma vez por dia sem vazar, é maior que a área que o cão realmente usa, e tem base impermeável. Compare pelo custo por dia de uso, não pelo preço do pacote — um tapete ruim trocado três vezes ao dia sai mais caro.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'Tapete higiênico é item de compra recorrente, então a escolha se repete todo mês. Um tapete que absorve mal parece mais barato na etiqueta e sai mais caro no uso, porque você troca mais vezes e ainda limpa vazamento.',
      },
      { type: 'h2', text: 'O que realmente importa', id: 'o-que-importa' },
      {
        type: 'ul',
        items: [
          'Capacidade de absorção: o tapete precisa segurar o volume de um dia de uso do seu cão sem a superfície ficar encharcada e sem vazar pelas bordas. "Número de camadas" no rótulo não é medida confiável — o que conta é o resultado.',
          'Base impermeável: a camada de baixo tem que impedir que o líquido chegue ao piso. Tapete sem isso mancha o chão e o rejunte.',
          'Tamanho: precisa ser maior que a área que o cão de fato usa. Cães giram antes de fazer e miram na borda — um tapete apertado vira vazamento garantido.',
          'Neutralização de odor: gel absorvente que transforma o líquido em gel reduz o cheiro e o risco de o cão pisar e espalhar.',
          'Fixação: abas adesivas ou uma bandeja porta-tapete evitam que o cão embole o tapete ou o arraste.',
        ],
      },
      { type: 'h2', text: 'Tamanho por porte', id: 'tamanho' },
      {
        type: 'table',
        caption: 'Referência de tamanho de tapete',
        headers: ['Porte do cão', 'Tamanho aproximado de tapete', 'Observação'],
        rows: [
          ['Filhote / pequeno (até 8 kg)', '~60 × 60 cm', 'Filhote erra a mira — comece com um tamanho acima'],
          ['Médio (8–20 kg)', '~60 × 80 cm ou ~80 × 80 cm', '—'],
          ['Grande (acima de 20 kg)', '~80 × 90 cm ou maior; ou dois tapetes lado a lado', 'Volume maior exige mais superfície'],
        ],
      },
      { type: 'h2', text: 'Descartável x lavável', id: 'descartavel-lavavel' },
      {
        type: 'table',
        caption: 'Comparação',
        headers: ['', 'Descartável', 'Lavável (tecido)'],
        rows: [
          ['Custo inicial', 'Baixo', 'Alto'],
          ['Custo no longo prazo', 'Recorrente', 'Menor, se durar e você tiver máquina'],
          ['Trabalho', 'Só trocar e descartar', 'Recolher, lavar (ciclo próprio, sem amaciante), secar'],
          ['Impacto de resíduo', 'Alto', 'Menor'],
          ['Melhor para', 'Rotina prática, viagem, filhote em fase de erro', 'Uso fixo, quem quer reduzir lixo e tem estrutura de lavagem'],
        ],
      },
      { type: 'h2', text: 'Comparar pelo custo por dia', id: 'custo-por-dia' },
      {
        type: 'p',
        text: 'Um pacote de 30 tapetes por R$ 40 que rende um por dia custa R$ 1,33/dia. Um pacote de 50 por R$ 45 que absorve mal e você troca 2,5 vezes ao dia custa R$ 2,25/dia — mais caro, apesar do preço por unidade menor. O número a comparar é sempre preço ÷ dias de uso reais.',
      },
      { type: 'h2', text: 'Como usar bem (a parte que economiza tapete)', id: 'como-usar' },
      {
        type: 'ul',
        items: [
          'Posicione o tapete num canto de pouco movimento, mesmo local sempre — cães fazem por hábito de lugar.',
          'Use uma bandeja porta-tapete ou fixe com fita — tapete que enruga vaza pela dobra.',
          'Não espere encher para trocar: um tapete muito usado o cão evita, e passa a fazer ao lado.',
          'Na fase de treino do filhote, ter um segundo ponto de tapete ajuda até ele fixar o lugar.',
          'Limpe o piso embaixo do tapete de vez em quando com produto sem amônia (a amônia lembra o cheiro de xixi e "convida" o cão a fazer ali de novo).',
        ],
      },
      { type: 'h2', text: 'Erros comuns', id: 'erros' },
      {
        type: 'ul',
        items: [
          'Comprar pelo menor preço por unidade sem testar a absorção.',
          'Tapete pequeno demais para o porte do cão.',
          'Mudar o tapete de lugar toda hora — o cão perde a referência.',
          'Deixar o tapete saturado o dia todo — o cão passa a rejeitar.',
          'Limpar o chão com produto à base de amônia.',
        ],
      },
      {
        type: 'checklist',
        title: 'Antes de comprar o tapete',
        items: [
          'A absorção segura um dia de uso do meu cão sem vazar?',
          'É maior que a área que ele realmente usa?',
          'Tem base impermeável?',
          'Calculei o custo por dia de uso, não só o preço do pacote?',
          'Tenho onde fixar (bandeja ou abas) para não enrugar?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Tapete bom é o que aguenta um dia sem vazar, cobre a área que o cão usa e sai barato no custo por dia. Depois, metade do resultado é uso: local fixo, fixação, e trocar antes de saturar.',
      },
    ],
    faq: [
      {
        question: 'Tapete higiênico atrapalha o treino de fazer na rua?',
        answer:
          'Para filhotes muito novos, o tapete é uma etapa antes de o esquema de vacinas permitir a rua. Depois, alguns cães fazem a transição para a rua sem problema e outros mantêm o tapete como opção para dias de chuva ou ausência longa. Não há regra única — depende da rotina da casa e do cão.',
      },
      {
        question: 'Meu cão rasga o tapete. O que fazer?',
        answer:
          'Cães que rasgam costumam fazer isso por tédio ou por o tapete estar solto e "convidativo". Use uma bandeja porta-tapete que prende as bordas, aumente o enriquecimento (brinquedos, passeios), e troque o tapete antes de ele ficar muito usado. Filhotes normalmente param quando amadurecem.',
      },
    ],
    sources: [],
    relatedSlugs: ['economizar-produtos-pet-sem-so-menor-preco', 'checklist-adotou-cachorro', 'como-escolher-comedouro-cachorro'],
  },
  {
    slug: 'de-quanto-em-quanto-tempo-dar-banho-no-cachorro',
    title: 'De quanto em quanto tempo dar banho no cachorro',
    category: 'higiene',
    description:
      'Não existe um intervalo único. Entenda o que pesa na decisão (pelagem, atividade, pele), o que uma fonte veterinária diz e quando falar com o veterinário.',
    summary:
      'Não há um intervalo de banho que sirva para todos os cães. Depende da raça, do tamanho e do tipo de pelo, da rotina do cão e da saúde da pele. Um hospital veterinário universitário afirma que, em geral, é seguro dar banho uma vez por semana com shampoo veterinário, mas que banho demais remove a oleosidade protetora do pelo. Se o cão tem coceira, feridas ou um problema de pele, o veterinário define o produto e a frequência.',
    publishedAt: '2026-11-20',
    updatedAt: '2026-11-20',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'A pergunta mais comum de quem acabou de adotar um cachorro costuma ser esta: de quanto em quanto tempo ele precisa tomar banho? A resposta honesta é que depende do cão. Este guia explica o que pesa na decisão e o que as fontes veterinárias dizem, sem prometer um calendário que valha para todos. Ele ajuda o tutor a se organizar e não substitui a orientação do veterinário.',
      },
      { type: 'h2', text: 'A resposta rápida', id: 'resposta-rapida' },
      {
        type: 'p',
        text: 'Não existe um intervalo único. O hospital veterinário da Washington State University explica que a frequência depende da raça, do comprimento do pelo, das atividades do cão e de eventuais problemas de saúde. Ele informa que, em geral, é seguro dar banho uma vez por semana com um shampoo de uso veterinário, mas que banhos muito frequentes podem remover a oleosidade protetora do pelo.',
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'Verificado em fonte: a frequência depende de raça, pelagem, rotina e saúde, e o excesso de banho remove a oleosidade protetora do pelo. Depende do veterinário: o intervalo ideal para o seu cão, principalmente se ele tiver problema de pele ou usar shampoo medicamentoso.',
      },
      { type: 'h2', text: 'O que pesa na decisão', id: 'o-que-pesa' },
      {
        type: 'table',
        caption: 'Fatores que mudam a frequência de banho',
        headers: ['Fator', 'Por que importa'],
        rows: [
          ['Raça e tipo de pelo', 'Pelos longos, densos ou cacheados acumulam sujeira e embaraçam mais. Pelos curtos costumam pedir menos manutenção.'],
          ['Rotina do cão', 'Cães que brincam na terra, na lama ou na água sujam mais e podem precisar de banhos extras de vez em quando.'],
          ['Saúde da pele', 'Cães com alergia ou problema de pele podem precisar de um plano próprio, com produto e frequência definidos pelo veterinário.'],
          ['Cheiro e aparência do pelo', 'Cheiro forte, pelo oleoso ou sujeira visível indicam que é hora do banho. Mas cheiro muito forte e persistente, junto com coceira, pode ser sinal de problema e vale uma consulta.'],
        ],
      },
      { type: 'h2', text: 'Qual shampoo usar', id: 'shampoo' },
      {
        type: 'p',
        text: 'Use produtos feitos para cães. A fonte veterinária citada neste guia explica que sabão de louça ou o seu shampoo podem tirar a sujeira e o cheiro, mas também retiram a oleosidade natural do pelo e podem irritar a pele. Produtos veterinários são formulados para a pele do cão. Se o shampoo for medicamentoso ou tiver algum ativo contra parasitas, siga a orientação do veterinário.',
      },
      { type: 'h2', text: 'Antes do banho: escove', id: 'escovar' },
      {
        type: 'p',
        text: 'Em cães de pelo mais longo, penteie o pelo antes de molhar. O pelo molhado embola mais e fica difícil de desembaraçar, o que torna a escovação depois do banho mais desconfortável para o cão.',
      },
      { type: 'h2', text: 'Filhote pode tomar banho?', id: 'filhote' },
      {
        type: 'p',
        text: 'Essa é uma dúvida para o veterinário. O momento do primeiro banho e os cuidados com a temperatura e a secagem dependem da idade, da saúde e do esquema de vacinas do filhote. Pergunte na primeira consulta, quando o veterinário avalia o seu filhote.',
      },
      { type: 'h2', text: 'Banho e tosa: não são a mesma coisa', id: 'banho-tosa' },
      {
        type: 'p',
        text: 'O banho é a limpeza do pelo e da pele. A tosa é o corte do pelo, e a frequência dela depende do tipo de pelagem e da preferência do tutor. Muitos tutores marcam banho e tosa juntos em pet shops. Se você preferir fazer o banho em casa, use produtos próprios para cães e siga as orientações do veterinário.',
      },
      { type: 'h2', text: 'E o gato? Em geral, não precisa', id: 'gato' },
      {
        type: 'p',
        text: 'Uma veterinária do College of Veterinary Medicine da Texas A&M afirma que, em geral, gatos não precisam receber banho dos tutores, porque se limpam sozinhos. Uma boa escovação costuma bastar. Ela cita exceções, como gatos sem pelo (da raça Sphynx), e lembra que alguns problemas de saúde, como infecções fúngicas e alergias, podem ter banho com shampoo medicamentoso como parte do tratamento. Se o seu gato parar de se limpar, leve ao veterinário: pode haver dor, obesidade ou outra causa.',
      },
      { type: 'h2', text: 'Quando falar com o veterinário', id: 'veterinario' },
      {
        type: 'callout',
        tone: 'vet',
        text: 'Procure o veterinário se o cão tiver coceira intensa, feridas, vermelhidão, perda de pelo, caspa, cheiro forte que não passa depois do banho ou qualquer mudança que você não saiba explicar na pele. O PETMOL é um app para tutores e não faz diagnóstico: o veterinário avalia e indica o tratamento.',
      },
      { type: 'h2', text: 'Erros comuns', id: 'erros' },
      {
        type: 'ul',
        items: [
          'Usar shampoo humano ou sabão de louça no cachorro.',
          'Dar banho com frequência demais sem orientação, para disfarçar o cheiro, em vez de investigar a causa.',
          'Molhar o cão sem desembaraçar antes, quando ele tem pelo longo.',
          'Usar shampoo medicamentoso por conta própria, sem receita.',
        ],
      },
      {
        type: 'checklist',
        title: 'Antes do banho',
        items: [
          'Tenho um shampoo próprio para cães?',
          'Escovei ou penteei o pelo antes de molhar?',
          'Sei se o meu cão tem alguma indicação do veterinário sobre frequência ou produto?',
        ],
      },
    ],
    faq: [
      {
        question: 'Posso dar banho no meu cachorro toda semana?',
        answer:
          'Uma fonte veterinária universitária diz que, em geral, é seguro dar banho semanal com shampoo de uso veterinário, mas que banhos frequentes demais podem retirar a oleosidade protetora do pelo. Como a frequência depende da raça, da pele e da rotina do cão, o veterinário é quem indica o ideal para o seu.',
      },
      {
        question: 'Qual shampoo usar no cachorro?',
        answer:
          'Um produto feito para cães. Shampoo humano e sabão de louça podem irritar a pele e retirar a oleosidade natural do pelo. Se houver problema de pele, o veterinário indica o produto adequado.',
      },
      {
        question: 'Cachorro filhote pode tomar banho?',
        answer:
          'Pergunte ao veterinário. O momento do primeiro banho e os cuidados dependem da idade, da saúde e do esquema de vacinas do filhote.',
      },
      {
        question: 'Preciso dar banho no meu gato?',
        answer:
          'Em geral, não. Gatos costumam se limpar sozinhos, e uma boa escovação costuma bastar. Há exceções, como gatos sem pelo ou problemas de saúde em que o veterinário indica banho, e o veterinário deve ser consultado se o gato deixar de se limpar.',
      },
    ],
    sources: [
      {
        label: 'Bathing your dog (como dar banho no seu cachorro)',
        publisher: 'Washington State University, Veterinary Teaching Hospital',
        url: 'https://hospital.vetmed.wsu.edu/2021/11/10/bathing-your-dog/',
      },
      {
        label: 'When you should and shouldn\u2019t give your cat a bath (quando dar banho no gato)',
        publisher: 'Texas A&M University, College of Veterinary Medicine & Biomedical Sciences',
        url: 'https://vetmed.tamu.edu/news/pet-talk/cat-baths',
      },
    ],
    relatedSlugs: ['como-escolher-tapete-higienico-cachorro', 'checklist-adotou-cachorro', 'como-escolher-areia-higienica-para-gatos'],
    vetContext: true,
    searchTerms: ['banho', 'dar banho no cachorro', 'frequência de banho', 'banho e tosa', 'shampoo', 'banho em gato', 'tosa'],
  },
];
