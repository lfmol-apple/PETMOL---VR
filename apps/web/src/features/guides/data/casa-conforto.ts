import type { Guide } from '../types';

export const casaConfortoGuides: Guide[] = [
  {
    slug: 'como-escolher-tamanho-cama-cachorro',
    title: 'Como escolher o tamanho certo da cama para cachorro',
    category: 'casa-e-conforto',
    description:
      'Meça o cão deitado esticado e some de 15 a 30 cm. Cães que dormem encolhidos podem usar cama menor; cães idosos precisam de espuma que sustente.',
    summary:
      'A cama certa é aquela em que o cão consegue deitar completamente esticado com folga de 15 a 30 cm. Meça o cão dormindo na posição mais esticada. Para cães idosos ou grandes, o tipo de enchimento importa tanto quanto o tamanho: espuma de alta densidade sustenta o corpo, enchimento fofo demais afunda.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'Cama de cachorro parece um item simples, mas errar o tamanho é comum: quase toda cama de loja é vendida por "P/M/G" sem dizer para que cão. E cama pequena demais faz o cão dormir com o corpo para fora, no chão frio.',
      },
      { type: 'h2', text: 'A medida certa', id: 'medida' },
      {
        type: 'ol',
        items: [
          'Observe o cão dormindo por alguns dias e identifique a posição em que ele fica mais esticado.',
          'Com ele nessa posição, meça do focinho até a ponta do rabo, e a largura no ponto mais largo (geralmente os quadris ou os ombros).',
          'Some 15 a 30 cm em cada dimensão. A cama ideal tem essa medida interna útil (a superfície de dormir, não a borda).',
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'Cães que dormem sempre encolhidos, em bolinha, podem usar uma cama redonda menor com borda alta (efeito "ninho"). Cães que se esparramam de lado ou de barriga para cima precisam de cama retangular ampla.',
      },
      { type: 'h2', text: 'Tipos de cama e para quem servem', id: 'tipos' },
      {
        type: 'table',
        caption: 'Formato x perfil do cão',
        headers: ['Formato', 'Melhor para', 'Evite para'],
        rows: [
          ['Retangular com borda baixa', 'Cães que esparramam; qualquer idade', '—'],
          ['Redonda / iglu com borda alta', 'Cães que dormem encolhidos; que gostam de se aninhar', 'Cães grandes que esticam'],
          ['Colchonete plano (sem borda)', 'Calor; cães que rolam muito; uso em caixa de transporte', 'Cães idosos que apoiam a cabeça na borda'],
          ['Ortopédica (espuma de alta densidade)', 'Cães idosos, grandes, com artrose ou pós-operatório', '—'],
          ['Elevada (tela esticada)', 'Regiões quentes; áreas externas cobertas; cães que superaquecem', 'Cães que precisam de acolchoamento nas articulações',],
        ],
      },
      { type: 'h2', text: 'Enchimento: o detalhe que decide o conforto real', id: 'enchimento' },
      {
        type: 'p',
        text: 'Uma cama grande com enchimento fofo demais parece confortável, mas afunda sob o peso do cão e deixa as articulações apoiadas no fundo duro. Para cães idosos, grandes ou com problema articular, uma cama ortopédica de espuma de alta densidade (ou memory foam) distribui o peso e não "toca o fundo". É um dos ajustes de ambiente com efeito mais direto no bem-estar diário de um cão sênior.',
      },
      { type: 'h2', text: 'Onde colocar a cama', id: 'onde' },
      {
        type: 'ul',
        items: [
          'Longe de corrente de ar direta e de piso frio.',
          'Num canto onde o cão veja o movimento da casa, mas com opção de se recolher — a maioria dos cães quer estar por perto sem estar no meio da passagem.',
          'Cães idosos: evite que a cama fique num lugar que exija subir escada ou pular para alcançar.',
          'Vale ter mais de uma cama em casas com dois pavimentos ou ambientes muito separados.',
        ],
      },
      { type: 'h2', text: 'Higiene e durabilidade', id: 'higiene' },
      {
        type: 'ul',
        items: [
          'Capa removível e lavável na máquina não é luxo — é o que mantém a cama utilizável por anos.',
          'Base impermeável por baixo ajuda com filhotes e cães idosos.',
          'Cães que roem: prefira tecidos resistentes (ripstop, lona) e evite enchimento de bolinhas de isopor, que viram risco de ingestão se a cama rasgar.',
        ],
      },
      { type: 'h2', text: 'Erros comuns', id: 'erros' },
      {
        type: 'ul',
        items: [
          'Comprar "G" achando que serve para qualquer cão grande, sem medir.',
          'Escolher a mais fofa em vez da que sustenta — pior para cão idoso.',
          'Colocar a cama em local com corrente de ar ou piso gelado.',
          'Cama sem capa lavável — em poucos meses fica impossível de higienizar.',
          'Uma cama só numa casa grande com ambientes distantes.',
        ],
      },
      {
        type: 'checklist',
        title: 'Antes de comprar a cama',
        items: [
          'Medi o cão na posição de dormir mais esticada e somei 15 a 30 cm?',
          'O formato combina com como ele dorme (encolhido x esparramado)?',
          'Se o cão é idoso ou grande: é ortopédica / espuma de alta densidade?',
          'Tem capa removível e lavável?',
          'O lugar planejado é longe de corrente de ar e piso frio?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Tamanho pela medida do cão esticado com folga, formato pelo jeito que ele dorme, e para cães idosos ou grandes o enchimento importa mais que o resto. Capa lavável fecha a conta de durabilidade.',
      },
    ],
    faq: [
      {
        question: 'Meu cão prefere dormir no chão frio. Preciso de cama?',
        answer:
          'Cães buscam o chão frio no calor para regular a temperatura — isso é normal. Mas ainda vale ter a cama disponível para quando esfriar, e principalmente para cães idosos, cujas articulações sofrem no piso duro. Ofereça as duas opções e deixe o cão escolher conforme o clima.',
      },
      {
        question: 'Cama ortopédica vale a pena para cão jovem e saudável?',
        answer:
          'Não é obrigatória, mas não faz mal e prolonga a vida útil da compra: o cão vai envelhecer e a cama continua servindo. Para cão jovem sem problema articular, uma cama comum de bom enchimento já resolve.',
      },
    ],
    sources: [
      {
        label: 'Recomendações de bem-estar e ambiente para cães',
        publisher: 'AVMA — American Veterinary Medical Association',
        url: 'https://www.avma.org/resources-tools/pet-owners',
      },
    ],
    relatedSlugs: ['como-escolher-comedouro-cachorro', 'brinquedos-para-caes-como-escolher-com-seguranca', 'checklist-adotou-cachorro'],
    vetContext: true,
  },

  {
    slug: 'bebedouro-automatico-cachorro-vale-a-pena',
    title: 'Bebedouro automático para cachorro vale a pena?',
    category: 'casa-e-conforto',
    description:
      'A fonte de água ajuda cães (e principalmente gatos) que bebem pouco, porque água corrente é mais atrativa. Mas exige manutenção. Veja quando compensa.',
    summary:
      'A fonte de água costuma valer a pena para pets que bebem pouco, porque o movimento da água aumenta o interesse. Em troca, exige limpeza semanal e troca de filtro. Para um cão que já bebe bem numa tigela comum, o benefício é pequeno. Não substitui a atenção a sinais de que o pet está bebendo pouco.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'A fonte de água — o "bebedouro automático" que recircula a água com uma bombinha — virou item popular. Ela resolve um problema real para alguns pets e é dispensável para outros.',
      },
      { type: 'h2', text: 'Quando vale a pena', id: 'quando-vale' },
      {
        type: 'ul',
        items: [
          'Gatos: descendem de espécies de ambiente árido e naturalmente bebem pouco. Água corrente costuma aumentar bastante o consumo — e hidratação adequada tem relação com saúde urinária felina.',
          'Cães que bebem pouco: alguns cães ignoram a tigela parada e bebem mais quando a água se move.',
          'Casas onde a tigela esquenta ou junta poeira rápido: a fonte com filtro mantém a água mais limpa e fresca entre as trocas.',
          'Tutores fora o dia todo: o reservatório maior garante água disponível por mais tempo (mas isso uma tigela grande também resolve).',
        ],
      },
      { type: 'h2', text: 'Quando não faz diferença', id: 'quando-nao' },
      {
        type: 'ul',
        items: [
          'O cão já bebe bem numa tigela comum e mantém a urina em cor clara.',
          'Você troca a água da tigela duas vezes por dia e ela fica sempre limpa.',
          'O pet tem medo do barulho da bomba (alguns têm) — nesse caso a fonte piora, não melhora.',
        ],
      },
      { type: 'h2', text: 'O custo escondido: manutenção', id: 'manutencao' },
      {
        type: 'p',
        text: 'Fonte de água não é "coloca e esquece". Sem manutenção, ela vira um foco de biofilme (aquela camada viscosa) e pode incentivar menos consumo do que uma tigela limpa. A rotina mínima:',
      },
      {
        type: 'ul',
        items: [
          'Lavar o reservatório e a bomba com água quente e escova pelo menos uma vez por semana (a bomba exige desmontar e limpar as pás e o eixo).',
          'Trocar o filtro de carvão conforme o fabricante — geralmente a cada 2 a 4 semanas.',
          'Completar a água diariamente para a bomba nunca funcionar seca (isso queima o motor).',
          'Descalcificar de tempos em tempos em regiões de água dura.',
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'Material: fontes de cerâmica ou aço inox são mais fáceis de higienizar e acumulam menos biofilme que as de plástico. Se for de plástico, prefira as de superfície lisa e troque se aparecerem ranhuras.',
      },
      { type: 'h2', text: 'O que a fonte não resolve', id: 'nao-resolve' },
      {
        type: 'p',
        text: 'A fonte incentiva o consumo, mas não é diagnóstico nem tratamento. Sinais de que o pet pode estar bebendo pouco — urina muito concentrada (cor forte), letargia, pele que demora a voltar ao lugar quando beliscada de leve — merecem avaliação veterinária, não só um equipamento novo. E o contrário também vale: um pet que de repente passa a beber muito mais do que o normal também precisa ser avaliado.',
      },
      {
        type: 'checklist',
        title: 'Decidindo pela fonte de água',
        items: [
          'O pet bebe pouco ou ignora a tigela parada? (Se sim, a fonte tende a ajudar.)',
          'Tenho disposição para limpar a bomba toda semana e trocar o filtro?',
          'O pet não se assusta com o barulho da bomba?',
          'Vou manter também uma tigela comum como reserva (para caso de falta de luz ou pane)?',
          'Sei diferenciar "bebe pouco" de sinais que pedem veterinário?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Vale muito a pena para gato e para pet que bebe pouco; vale pouco para cão que já se hidrata bem. Em qualquer caso, ela só cumpre a função se for higienizada de verdade — uma fonte suja incentiva menos consumo que uma tigela limpa.',
      },
    ],
    faq: [
      {
        question: 'Quanto de água um cão deve beber por dia?',
        answer:
          'A referência geral é em torno de 50 a 60 ml por quilo de peso por dia, mas varia muito com temperatura, atividade e tipo de alimentação (cão que come ração úmida bebe menos). Mais importante que o número exato é conhecer o padrão do seu cão e notar mudanças bruscas para mais ou para menos.',
      },
      {
        question: 'Posso deixar só a fonte, sem tigela?',
        answer:
          'É melhor manter uma tigela comum como reserva. Se faltar luz, a bomba parar ou o pet se assustar com ela num dia, o cão não pode ficar sem acesso a água.',
      },
    ],
    sources: [
      {
        label: 'Hidratação e saúde urinária em gatos',
        publisher: 'International Cat Care',
        url: 'https://icatcare.org/advice/',
      },
    ],
    relatedSlugs: ['como-escolher-comedouro-cachorro', 'como-escolher-tamanho-cama-cachorro', 'como-escolher-racao-ideal-cachorro'],
    vetContext: true,
  },

  {
    slug: 'brinquedos-para-caes-como-escolher-com-seguranca',
    title: 'Brinquedos para cães: como escolher com segurança',
    category: 'casa-e-conforto',
    description:
      'Tamanho maior que a boca do cão, material resistente à mordida dele, sem peças pequenas que soltem. Veja como escolher por perfil e o que evitar.',
    summary:
      'Brinquedo seguro é o que não cabe inteiro na boca do cão (risco de engasgo), aguenta a força de mordida dele sem lascar, e não tem peças pequenas que se soltem. Combine o brinquedo ao que o cão gosta de fazer — mastigar, buscar, resolver — e supervisione os primeiros usos.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 7,
    blocks: [
      {
        type: 'p',
        text: 'Brinquedo bom para o cão é brinquedo que ele usa e não te dá sustos. A maioria dos acidentes com brinquedo — engasgo, pedaço engolido, obstrução — vem de tamanho errado ou material que não aguenta a mordida daquele cão específico.',
      },
      { type: 'h2', text: 'Os três testes de segurança', id: 'testes' },
      {
        type: 'ol',
        items: [
          'Tamanho: o brinquedo não pode caber inteiro na boca do cão nem passar pela garganta. Na dúvida, maior é mais seguro. Isso muda com o porte — a bola perfeita para um pinscher é risco de engasgo para um labrador.',
          'Resistência: o material tem que aguentar a força de mordida do seu cão. Um cão que destrói pelúcia em minutos precisa de borracha rígida; um cão delicado pode usar pelúcia sem problema.',
          'Integridade: nada de olhos de plástico costurados, guizos soltos, cordas que desfiam em fios longos, ou peças que se destacam. Se uma parte solta, ela vira risco de ingestão.',
        ],
      },
      { type: 'h2', text: 'Escolha pelo que o cão gosta de fazer', id: 'perfil' },
      {
        type: 'table',
        caption: 'Perfil de brincadeira x tipo de brinquedo',
        headers: ['O cão gosta de...', 'Brinquedo indicado', 'Cuidado'],
        rows: [
          ['Mastigar / roer', 'Borracha natural rígida, ossos de nylon, mordedores próprios', 'Trocar quando desgastar; nunca dar osso cozido de verdade (lasca)'],
          ['Buscar (pega-pega)', 'Bolas do tamanho certo, discos macios de tecido', 'Bola pequena demais engasga; evite bola de tênis em uso intenso (o feltro desgasta os dentes)'],
          ['Resolver / comer devagar', 'Brinquedos recheáveis, tapetes de forrageamento, quebra-cabeças de petisco', 'Higienizar o recheável após cada uso'],
          ['Pelúcia / conforto', 'Pelúcias reforçadas, sem enchimento de isopor', 'Só para cães que não destroem; supervisione'],
          ['Puxar (cabo de guerra)', 'Cordas grossas de algodão, mordedores de borracha em formato de anel', 'Descartar cordas que começam a soltar fios longos'],
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'Rodízio de brinquedos: deixe 3 ou 4 disponíveis e guarde o resto. Troque a cada poucos dias. O cão trata o brinquedo "que sumiu e voltou" como novidade, e você usa menos brinquedo para manter o mesmo interesse.',
      },
      { type: 'h2', text: 'Materiais: o que preferir e o que evitar', id: 'materiais' },
      {
        type: 'p',
        text: 'O material define tanto a segurança quanto a durabilidade. Um brinquedo de material errado ou lasca (virando risco de ingestão) ou é destruído no primeiro uso. A referência prática é combinar a dureza do material com a força de mordida do cão — nem tão macio que ele engole pedaços, nem tão duro que fratura dente.',
      },
      {
        type: 'ul',
        items: [
          'Preferir: borracha natural, nylon próprio para cães, algodão trançado, pelúcia reforçada sem peças rígidas. Idealmente com indicação de porte na embalagem.',
          'Evitar: ossos cozidos e ossos de verdade (lascam e podem perfurar), objetos domésticos que lembram itens perigosos (o cão não distingue seu chinelo de um brinquedo), brinquedos infantis humanos (não são feitos para mordida canina), qualquer coisa com pilha ou ímã acessível.',
          'Cuidado com "brinquedos" muito duros (alguns chifres e ossos de nylon rígido demais): podem fraturar dentes. A regra do polegar: se você não consegue marcar o material com a unha, ele pode ser duro demais para o dente do cão.',
        ],
      },
      { type: 'h2', text: 'Supervisão e manutenção', id: 'supervisao' },
      {
        type: 'p',
        text: 'Nenhum brinquedo é 100% previsível com um cão que você ainda não conhece bem. A primeira vez que o cão usa um brinquedo é quando você descobre se ele vai roer com cuidado ou tentar arrancar pedaços. Por isso a supervisão inicial e a inspeção semanal fazem parte do uso, não são opcionais.',
      },
      {
        type: 'ul',
        items: [
          'Supervisione os primeiros usos de qualquer brinquedo novo para ver como aquele cão o trata.',
          'Cordas, pelúcias e recheáveis: uso supervisionado. Borrachas rígidas inteiras podem ficar com o cão sozinho.',
          'Inspecione os brinquedos toda semana. Ao primeiro pedaço solto, rasgo grande ou desgaste que exponha o interior, descarte.',
          'Lave os brinquedos regularmente — pelúcia na máquina em saco de roupa, borracha com água quente e sabão neutro.',
        ],
      },
      {
        type: 'checklist',
        title: 'Antes de dar o brinquedo ao cão',
        items: [
          'Ele é grande o bastante para não caber inteiro na boca do cão?',
          'O material aguenta a força de mordida deste cão específico?',
          'Não tem peça pequena, guizo solto ou olho de plástico?',
          'Combina com o que o cão gosta de fazer (mastigar, buscar, resolver)?',
          'Vou supervisionar os primeiros usos?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Brinquedo seguro é tamanho certo para o porte, material à prova da mordida daquele cão, sem peças que soltem — e escolhido pelo que o cão gosta de fazer. Supervisão nos primeiros usos e inspeção semanal fecham a conta.',
      },
    ],
    faq: [
      {
        question: 'Bola de tênis faz mal para o cão?',
        answer:
          'Em uso ocasional, não. Em uso intenso e diário, o feltro abrasivo da bola pode desgastar o esmalte dos dentes ao longo do tempo, e bolas velhas podem se partir e virar risco de engasgo. Para cães que amam buscar, existem bolas de borracha próprias, do tamanho certo, sem o feltro.',
      },
      {
        question: 'Meu cão destrói todo brinquedo em minutos. O que fazer?',
        answer:
          'Cães "destruidores" precisam de brinquedos classificados para mastigação pesada: borracha natural rígida e mordedores de nylon próprios. Pelúcia e corda não são para esse perfil. Também vale investir em brinquedos recheáveis, que canalizam a energia de mastigar para uma tarefa (chegar ao petisco) em vez de para destruir.',
      },
    ],
    sources: [
      {
        label: 'Segurança de brinquedos e enriquecimento ambiental para cães',
        publisher: 'ASPCA — American Society for the Prevention of Cruelty to Animals',
        url: 'https://www.aspca.org/pet-care/dog-care',
      },
    ],
    relatedSlugs: ['checklist-adotou-cachorro', 'como-escolher-tamanho-cama-cachorro', 'como-escolher-comedouro-cachorro'],
    vetContext: true,
  },

  {
    slug: 'como-escolher-comedouro-cachorro',
    title: 'Como escolher comedouro para cachorro',
    category: 'casa-e-conforto',
    description:
      'Material que dá para higienizar, tamanho proporcional à porção, base estável — e comedouro lento para quem come rápido demais. Comedouro elevado é caso a caso.',
    summary:
      'O comedouro certo é de material fácil de higienizar (inox ou cerâmica), do tamanho da porção do cão, com base antiderrapante. Comedouro lento ajuda cães que engolem rápido e engasgam ou vomitam. Comedouro elevado tem indicações específicas e não deve ser regra para todo cão.',
    publishedAt: '2026-08-30',
    updatedAt: '2026-08-30',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'Comedouro é barato e passa despercebido, mas a escolha influencia higiene, velocidade da refeição e até a pele do focinho de alguns cães. Vale um minuto de atenção.',
      },
      { type: 'h2', text: 'Material: inox e cerâmica na frente', id: 'material' },
      {
        type: 'table',
        caption: 'Comparação de materiais',
        headers: ['Material', 'Higiene', 'Durabilidade', 'Observação'],
        rows: [
          ['Aço inox', 'Ótima (vai à máquina, não retém odor)', 'Alta', 'Melhor custo-benefício; leve, então precisa de base antiderrapante'],
          ['Cerâmica / porcelana', 'Ótima (se o esmalte estiver íntegro)', 'Média (quebra se cair)', 'Peso ajuda a não deslizar; descartar se lascar ou trincar'],
          ['Plástico', 'Regular (arranha e retém odor/bactéria com o tempo; associado a acne no focinho de alguns cães)', 'Média', 'Aceitável se trocado com frequência e sempre liso'],
          ['Silicone (dobrável)', 'Boa', 'Média', 'Ótimo para viagem; não é o ideal para uso diário fixo'],
        ],
      },
      { type: 'h2', text: 'Tamanho: proporcional à porção, não ao cão', id: 'tamanho' },
      {
        type: 'p',
        text: 'O comedouro deve comportar a maior refeição do dia com folga para o cão não empurrar comida para fora, mas não muito maior que isso. Comedouro fundo e estreito demais dificulta cães de focinho curto; comedouro raso e largo funciona melhor para eles. Para água, aí sim vale um recipiente maior, para render mais tempo entre trocas.',
      },
      { type: 'h2', text: 'Base estável', id: 'base' },
      {
        type: 'p',
        text: 'Comedouro que desliza pela cozinha enquanto o cão come é irritante e faz o cão comer ainda mais rápido, perseguindo o prato. Prefira modelos com base emborrachada, ou use um tapete de silicone por baixo. Cerâmica pesada resolve pela massa.',
      },
      { type: 'h2', text: 'Comedouro lento: para quem serve', id: 'comedouro-lento' },
      {
        type: 'p',
        text: 'O comedouro lento tem relevos internos que obrigam o cão a pegar a ração aos poucos. É indicado para cães que engolem a refeição em segundos — o que pode causar engasgo, vômito logo depois, ou desconforto por engolir muito ar. Ele não muda a quantidade da porção, só o tempo que o cão leva para comer.',
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'Alternativa ao comedouro lento: espalhar a ração num tapete de forrageamento ou usar um brinquedo dispensador. Além de desacelerar, transforma a refeição em atividade mental — bom para cães entediados.',
      },
      { type: 'h2', text: 'Comedouro elevado: não é para todo cão', id: 'elevado' },
      {
        type: 'p',
        text: 'O comedouro elevado (numa base ou suporte) é frequentemente vendido como "melhor para a postura", mas isso é assunto controverso na medicina veterinária. Para a maioria dos cães, não há benefício comprovado, e há discussão sobre possível relação com problemas digestivos em cães grandes de peito profundo. Ele tem indicações específicas — cães com certas dificuldades de mobilidade ou de deglutição, sempre orientadas pelo veterinário. Não trate como padrão.',
      },
      { type: 'h2', text: 'Higiene', id: 'higiene' },
      {
        type: 'ul',
        items: [
          'Lave o comedouro de comida depois de cada uso, como qualquer louça — sobra de ração úmida rança e cria bactéria.',
          'Lave o de água pelo menos uma vez por dia, esfregando o fundo e as laterais (o biofilme viscoso se forma rápido).',
          'Tenha um segundo jogo para rodízio enquanto um seca.',
        ],
      },
      {
        type: 'checklist',
        title: 'Escolhendo o comedouro',
        items: [
          'É de inox ou cerâmica (ou plástico liso trocado com frequência)?',
          'Comporta a maior refeição com folga, sem ser enorme?',
          'Tem base antiderrapante ou peso para não deslizar?',
          'Se o cão come rápido demais: escolhi um comedouro lento?',
          'Se pensei em comedouro elevado: tenho indicação veterinária para isso?',
        ],
      },
      { type: 'h2', text: 'Conclusão', id: 'conclusao' },
      {
        type: 'p',
        text: 'Inox ou cerâmica, tamanho da porção, base estável — e comedouro lento se o cão engole rápido. Comedouro elevado só com indicação. O item é barato; o que faz diferença é a higiene diária.',
      },
    ],
    faq: [
      {
        question: 'Comedouro de plástico causa mesmo espinha no focinho do cão?',
        answer:
          'A "acne canina" no queixo e no focinho tem várias causas, e o plástico arranhado que acumula bactéria é apontado como um fator contribuinte em alguns cães. Trocar para inox ou cerâmica e higienizar bem costuma ajudar. Se as lesões persistem, é caso para o veterinário avaliar.',
      },
      {
        question: 'Devo deixar comida disponível o dia todo (à vontade)?',
        answer:
          'Para a maioria dos cães, não. Refeições em horários definidos ajudam a controlar a porção, a monitorar o apetite (mudança de apetite é um sinal precoce de problema) e a estabelecer rotina. Comida à vontade dificulta perceber quando o cão parou de comer.',
      },
    ],
    sources: [
      {
        label: 'Alimentação e comportamento alimentar em cães',
        publisher: 'AAHA — American Animal Hospital Association',
        url: 'https://www.aaha.org/for-pet-parents/',
      },
    ],
    relatedSlugs: ['bebedouro-automatico-cachorro-vale-a-pena', 'como-escolher-racao-ideal-cachorro', 'como-escolher-tamanho-cama-cachorro'],
    vetContext: true,
  },
];
