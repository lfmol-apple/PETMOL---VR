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
];
