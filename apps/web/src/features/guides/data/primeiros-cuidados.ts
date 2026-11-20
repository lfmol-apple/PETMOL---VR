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
      {
        type: 'callout',
        tone: 'info',
        text: 'Sobre este guia: são orientações práticas e de cautela reunidas pelo PETMOL, sem uma fonte científica única e sem garantia de resultado.',
      },
      { type: 'h2', text: 'Na primeira hora: procure perto e avise quem está por perto', id: 'primeira-hora' },
      {
        type: 'ul',
        items: [
          'Comece pelo entorno imediato: quintal, garagem, escadas, áreas de serviço, embaixo de carros e arbustos.',
          'Chame com a voz e o som que ele conhece (a embalagem do petisco, o barulho do pote de ração). Evite gritar ou correr atrás dele.',
          'Avise vizinhos, porteiros, vigias, entregadores e comerciantes da região.',
          'Se possível, peça que alguém fique em casa, caso o pet volte.',
          'Leve uma guia, um petisco e uma foto no celular para mostrar a quem encontrar pelo caminho.',
        ],
      },
      { type: 'h2', text: 'Como montar um aviso que funciona', id: 'aviso' },
      {
        type: 'p',
        text: 'Um aviso objetivo facilita que alguém reconheça o pet. A lista abaixo serve para post de rede social, mensagem de grupo e cartaz impresso.',
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
        text: 'Guarde de propósito um detalhe que não aparece no aviso (um apelido, um hábito, uma marca escondida pelo pelo). Quando alguém ligar dizendo que encontrou o pet, peça esse detalhe: é uma forma de confirmar que a pessoa realmente está com ele.',
      },
      { type: 'h2', text: 'Onde divulgar', id: 'onde-divulgar' },
      {
        type: 'ul',
        items: [
          'Grupos do bairro e do condomínio em aplicativos de mensagem e redes sociais, com o aviso completo.',
          'Perfis e grupos de pets perdidos da sua cidade ou região. Publique com a foto e a região logo na primeira linha.',
          'Clínicas veterinárias, pet shops e escolas de adestramento num raio de alguns quilômetros: deixe a foto e o telefone.',
          'Órgãos e abrigos de proteção animal do seu município. Ligue e pergunte se há animais recolhidos com a descrição do seu pet.',
          'Cartazes simples em postes, padarias e portarias, com autorização de quem administra o local.',
        ],
      },
      { type: 'h2', text: 'Nos dias seguintes: continue sem se desgastar', id: 'dias-seguintes' },
      {
        type: 'ul',
        items: [
          'Repita a busca em horários diferentes do dia.',
          'Atualize o aviso se aparecer informação nova (um avistamento, uma região para reforçar).',
          'Se você tem microchip registrado, ligue para o cadastro e confirme que o telefone está atualizado. O número do chip leva a um cadastro, então os dados de contato nele precisam estar atualizados.',
          'Peça ajuda a amigos e familiares para dividir as tarefas: uns procuram, outros divulgam, outros atendem as mensagens.',
        ],
      },
      { type: 'h2', text: 'Cuidado com golpes', id: 'golpes' },
      {
        type: 'p',
        text: 'Por precaução, desconfie de quem pede dinheiro adiantado, depósito, Pix ou código por mensagem antes de mostrar o pet, e de quem se recusa a enviar uma foto ou vídeo atual. Combine a devolução em local público e movimentado, leve alguém junto e, se for recompensar, entregue só quando estiver com o pet nos braços.',
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
          'Coleira com plaquinha legível: nome do pet e um telefone seu.',
          'Fotos atuais de frente, de lado e de detalhes, guardadas em uma pasta fácil de achar no celular.',
          'Microchip implantado e com dados de contato atualizados, quando o veterinário recomendar.',
          'Portões, janelas e telas conferidos.',
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
          { slug: 'gato-fugiu-de-casa-volta-sozinho-o-que-fazer', label: 'Gato fugiu de casa: ele volta sozinho? O que fazer' },
          { slug: 'achei-um-cachorro-o-que-fazer', label: 'Achei um cachorro na rua: o que fazer' },
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
    slug: 'gato-fugiu-de-casa-volta-sozinho-o-que-fazer',
    title: 'Gato fugiu de casa: volta sozinho? O que fazer',
    category: 'primeiros-cuidados',
    description:
      'O que um estudo com mais de mil gatos desaparecidos mostra sobre onde eles costumam ser encontrados e como organizar a busca nos primeiros dias.',
    summary:
      'Em um estudo com 1.210 gatos desaparecidos, baseado em relatos de tutores, 75% foram encontrados a até 500 metros de onde saíram, e cerca de um terço (34%) foi recuperado vivo em até 7 dias. Os autores sugerem a busca física no entorno logo na primeira semana. O estudo tem limites (participantes voluntários, fora do Brasil) e não garante que o gato volte sozinho.',
    publishedAt: '2026-11-20',
    updatedAt: '2026-11-20',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'Quando um gato some, uma dúvida comum é se ele volta sozinho. Este guia reúne o que a pesquisa disponível mostra sobre gatos desaparecidos e organiza uma busca prática. Para o que vale para qualquer pet (cartaz, divulgação e golpes), veja o guia geral de pet perdido, ligado abaixo.',
      },
      { type: 'h2', text: 'Ele volta sozinho? O que um estudo mostra', id: 'estudo' },
      {
        type: 'p',
        text: 'Pesquisadores publicaram em 2018, na revista Animals, um levantamento com 1.210 gatos desaparecidos, a partir de um questionário online respondido por tutores. Os principais resultados:',
      },
      {
        type: 'ul',
        items: [
          'Cerca de um terço dos gatos (34%) foi recuperado vivo pelo tutor em até 7 dias.',
          'Só 61% dos gatos do estudo foram encontrados em até um ano. Poucos foram encontrados vivos depois de 90 dias.',
          '75% dos gatos foram encontrados a até 500 metros do ponto de onde saíram.',
          'Gatos que saem livremente percorreram distâncias maiores do que gatos de dentro de casa. Gatos considerados muito curiosos foram encontrados dentro da casa de outras pessoas com mais frequência.',
          'A busca física, feita pelo tutor, pareceu aumentar as chances de encontrar o gato vivo (resultado no limite da significância estatística). Os autores sugerem fazê-la logo na primeira semana.',
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'Limites do estudo: os participantes se voluntariaram (podem ter sido tutores mais engajados na busca) e a pesquisa não foi feita no Brasil. Os números ajudam a orientar a busca, mas não garantem o desfecho no seu caso.',
      },
      { type: 'h2', text: 'O que fazer nas primeiras horas', id: 'primeiras-horas' },
      {
        type: 'p',
        text: 'Como os dados apontam para o entorno imediato, comece por perto. As dicas abaixo são práticas comuns entre tutores e não vêm do estudo, então use o que fizer sentido para o seu gato e a sua vizinhança.',
      },
      {
        type: 'ul',
        items: [
          'Procure primeiro dentro de casa e no entorno: armários, atrás de móveis, garagem, quintal, telhados baixos e áreas cobertas.',
          'Percorra os quarteirões próximos, a pé, num raio curto, e depois amplie. Peça a vizinhos e porteiros que olhem garagens, depósitos e áreas de serviço: o estudo encontrou gatos dentro da casa de outras pessoas.',
          'Chame com a voz e os sons que ele conhece (o barulho do pote de ração ou do pacote de petisco), sem correr atrás dele.',
          'Peça a alguém que fique em casa, com portas e janelas acessíveis ao gato, caso ele volte.',
        ],
      },
      { type: 'h2', text: 'Nos dias seguintes', id: 'dias-seguintes' },
      {
        type: 'ul',
        items: [
          'Repita a busca física em horários diferentes do dia.',
          'Anote os lugares já verificados, para não repetir e para dividir a busca com amigos e familiares.',
          'Divulgue o desaparecimento com foto nítida e a região onde ele foi visto pela última vez (veja o guia geral de pet perdido, que também explica como evitar golpes).',
          'Se o gato tem microchip, confirme que os seus dados de contato estão atualizados no cadastro do chip.',
          'Mantenha o aviso e a busca ativos: no estudo, parte dos gatos foi encontrada depois da primeira semana, mas poucos foram encontrados vivos depois de 90 dias.',
        ],
      },
      { type: 'h2', text: 'Quando o gato é encontrado', id: 'encontrado' },
      {
        type: 'p',
        text: 'Avise os lugares onde você divulgou e atualize os avisos. Leve o gato ao veterinário para uma avaliação se ele ficou fora por muito tempo, parece ferido ou diferente do normal. O diagnóstico e o tratamento são do veterinário: o PETMOL é um app para tutores.',
      },
      { type: 'h2', text: 'Como reduzir o risco de fuga', id: 'prevenir' },
      {
        type: 'checklist',
        items: [
          'Telas de proteção em janelas e sacadas, e atenção às portas abertas.',
          'Identificação no gato (coleira com plaquinha legível, quando ele aceitar) e o contato do tutor atualizado.',
          'Fotos atuais e nítidas do gato, de frente e de lado, guardadas no celular.',
          'Conversar com o veterinário sobre microchip.',
        ],
      },
      {
        type: 'links',
        title: 'Leia também',
        items: [
          { slug: 'pet-perdido-o-que-fazer-nas-primeiras-horas', label: 'Pet perdido: o que fazer nas primeiras horas (cartaz, divulgação e golpes)' },
          { slug: 'como-transportar-gato-com-seguranca', label: 'Como transportar gato com segurança' },
        ],
      },
    ],
    faq: [
      {
        question: 'Gato fugiu de casa, ele volta sozinho?',
        answer:
          'Alguns são encontrados, outros não. Em um estudo com 1.210 gatos desaparecidos, cerca de um terço foi recuperado vivo em até 7 dias, e a busca física feita pelo tutor pareceu aumentar as chances de encontrar o gato. Por isso, não vale só esperar: procure por perto e divulgue.',
      },
      {
        question: 'Até que distância devo procurar?',
        answer:
          'No estudo citado, 75% dos gatos foram encontrados a até 500 metros do ponto de onde saíram. Comece pelo entorno imediato e amplie aos poucos. É um dado de uma pesquisa, e não uma garantia para o seu gato.',
      },
      {
        question: 'Meu gato é só de dentro de casa. A busca muda?',
        answer:
          'O estudo indica que gatos que nunca saem tendem a percorrer distâncias menores do que gatos que circulam livremente, o que reforça começar pelo entorno bem próximo de casa.',
      },
    ],
    sources: [
      {
        label: 'Search methods used to locate missing cats and locations where missing cats are found',
        publisher: 'Huang et al., Animals (2018), acesso aberto',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5789300/',
      },
    ],
    relatedSlugs: ['pet-perdido-o-que-fazer-nas-primeiras-horas', 'como-transportar-gato-com-seguranca', 'checklist-adotou-cachorro'],
    vetContext: true,
    searchTerms: ['gato fugiu', 'gato desaparecido', 'gato perdido', 'gato sumiu', 'volta sozinho', 'procurar gato'],
  },
  {
    slug: 'achei-um-cachorro-o-que-fazer',
    title: 'Achei um cachorro na rua: o que fazer',
    category: 'primeiros-cuidados',
    description:
      'Encontrou um cachorro sozinho? Veja como se aproximar com segurança, procurar identificação e microchip e ajudar a devolvê-lo ao tutor.',
    summary:
      'Antes de tudo, a sua segurança e a do cão: não force a aproximação e, se ele parecer agressivo, chame o órgão responsável. Se for seguro, procure coleira e plaquinha, leve o cão para ler o microchip e divulgue na região com uma foto, sem expor dados pessoais. As regras sobre animais encontrados variam por município: confirme com o órgão local. Este guia não é orientação jurídica nem veterinária.',
    publishedAt: '2026-11-20',
    updatedAt: '2026-11-20',
    readingTimeMinutes: 6,
    blocks: [
      {
        type: 'p',
        text: 'Achar um cachorro sozinho na rua desperta vontade de ajudar, mas a melhor ajuda é organizada: proteger você e o cão, descobrir se ele tem identificação e fazer a informação chegar ao tutor. Este guia reúne passos práticos de organizações de proteção animal. Ele serve para tutores e para quem encontra, e não substitui orientação jurídica nem veterinária.',
      },
      {
        type: 'callout',
        tone: 'vet',
        text: 'Importante: este guia não é orientação jurídica e não verificou a legislação local. As regras sobre animais encontrados (qual órgão procurar, prazos, o que acontece se ninguém reclamar o cão) podem variar conforme a cidade. As fontes citadas aqui são de outros países e foram usadas só para os passos práticos. Em caso de dúvida, consulte a prefeitura ou o órgão municipal de proteção animal.',
      },
      { type: 'h2', text: '1. Aproxime-se com cuidado', id: 'aproximar' },
      {
        type: 'p',
        text: 'Nem todo cão perdido é amigável: ele pode estar assustado, estressado ou machucado. Segundo o American Kennel Club, não corra para pegar a coleira. Observe a linguagem corporal: se o cão parecer relaxado, aproxime-se devagar, de lado, e deixe que ele sinta o seu cheiro. Só segure a coleira quando ele parecer confortável ao seu lado.',
      },
      {
        type: 'ul',
        items: [
          'Se o cão não se aproximar ou parecer agressivo (corpo rígido, dentes à mostra, pelos eriçados), não tente segurá-lo. Um rabo balançando não garante que o cão é amistoso.',
          'Segundo o AKC, em caso de dúvida sobre o comportamento do cão, chame o controle animal ou a polícia local, para que ele seja retirado com segurança. No Brasil, o órgão responsável pode variar: consulte a prefeitura.',
          'Se não puder se aproximar com segurança, fotografe ou filme o cão e anote o local exato: isso ajuda a descrevê-lo melhor e a avisar o tutor.',
        ],
      },
      { type: 'h2', text: '2. Procure identificação', id: 'identificacao' },
      {
        type: 'p',
        text: 'Com o cão sob controle, verifique se há coleira com plaquinha e telefone. Se houver, ligue e deixe mensagem. Se não houver identificação, ou se o telefone não funcionar, o cão pode ter microchip: clínicas veterinárias e abrigos podem ter leitor de microchip, e o número do chip leva a um cadastro com os dados do tutor, segundo o AKC.',
      },
      { type: 'h2', text: '3. Mantenha o cão em segurança', id: 'seguranca' },
      {
        type: 'ul',
        items: [
          'Se levar o cão para casa por um tempo, mantenha-o separado dos seus animais até um veterinário avaliar. Segundo o AKC, ele pode não estar com as vacinas em dia ou ter parasitas como pulgas.',
          'Se ele parecer ferido ou doente, leve-o a uma clínica veterinária. Diagnóstico e tratamento são do veterinário.',
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'Nota: os passos 4 e 5 são cuidados de privacidade e segurança sugeridos pelo PETMOL. Eles não vêm das fontes citadas e não são exigência legal.',
      },
      { type: 'h2', text: '4. Divulgue sem expor dados', id: 'divulgar' },
      {
        type: 'p',
        text: 'Poste uma foto nítida do cão e a região onde ele foi encontrado (bairro ou ponto de referência), em grupos do bairro e perfis de pets perdidos da sua cidade. Para proteger a sua privacidade e a do tutor:',
      },
      {
        type: 'ul',
        items: [
          'Não publique o seu endereço, e prefira receber contato por mensagem, não por ligação aberta ao público.',
          'Não divulgue o endereço de ninguém: se alguém disser que o cão é dele, não peça documentos pessoais nem espalhe dados dessa pessoa.',
          'Guarde de propósito um detalhe que não aparece nas fotos (uma marca, um hábito). Quando alguém disser que é o tutor, peça esse detalhe para confirmar que realmente é o dono.',
        ],
      },
      { type: 'h2', text: '5. Quando alguém disser que é o tutor', id: 'devolver' },
      {
        type: 'ul',
        items: [
          'Peça fotos dessa pessoa com o cão, a descrição de detalhes que só o tutor sabe e, se houver, o registro do microchip ou a carteira de vacinação.',
          'Combine a entrega em um local público e movimentado, de preferência com alguém junto.',
          'Desconfie de pedidos de dinheiro, Pix ou depósito antes da entrega e de quem não consegue descrever o cão. Se houver dúvida, procure o órgão municipal.',
        ],
      },
      { type: 'h2', text: 'No PETMOL: o recurso "Achei um pet"', id: 'petmol' },
      {
        type: 'p',
        text: 'O PETMOL tem a página "Achei um pet", em que quem encontrou um animal pode enviar fotos e um contato para o tutor de um alerta de Pet Sumido ativo. O telefone do tutor não é exibido: o PETMOL entrega as informações, e o tutor decide se libera o contato. Esse caminho só ajuda quando o tutor criou um alerta no app, e complementa, não substitui, a divulgação local.',
      },
      {
        type: 'links',
        title: 'Leia também',
        items: [
          { slug: 'pet-perdido-o-que-fazer-nas-primeiras-horas', label: 'Pet perdido: o que fazer nas primeiras horas (cartaz, divulgação e golpes)' },
          { slug: 'checklist-adotou-cachorro', label: 'Checklist para quem acabou de adotar um cachorro' },
        ],
      },
    ],
    faq: [
      {
        question: 'Achei um cachorro na rua. Posso ficar com ele?',
        answer:
          'O primeiro passo é procurar o tutor: verifique coleira e plaquinha, leia o microchip e divulgue na região. As regras sobre o que fazer com animais encontrados variam por município e este guia não é orientação jurídica. Consulte o órgão municipal de proteção animal ou a prefeitura.',
      },
      {
        question: 'Como saber se o cachorro tem microchip?',
        answer:
          'Só um leitor de microchip identifica o chip. Segundo o AKC, clínicas veterinárias e abrigos podem ter o aparelho, e o número do chip leva a um cadastro com os dados do tutor.',
      },
      {
        question: 'O cachorro parece agressivo. O que fazer?',
        answer:
          'Não tente segurá-lo. Segundo o AKC, mantenha distância, fotografe ou filme se for seguro e chame o controle animal ou a polícia local. No Brasil, o órgão responsável pode variar: consulte a prefeitura.',
      },
    ],
    sources: [
      {
        label: 'What to do if you find a lost dog (como se aproximar, identificação e microchip, segurança dos outros animais)',
        publisher: 'American Kennel Club (EUA)',
        url: 'https://www.akc.org/expert-advice/advice/what-to-do-if-you-find-a-lost-dog/',
      },
      {
        label: 'What do I do if I\u2019ve found a stray dog? (identificação, microchip e contato com as autoridades locais)',
        publisher: 'Dogs Trust (Reino Unido). As regras legais citadas pela fonte valem no Reino Unido, não no Brasil.',
        url: 'https://www.dogstrust.org.uk/help-advice/dog-care/found-a-dog',
      },
    ],
    relatedSlugs: ['pet-perdido-o-que-fazer-nas-primeiras-horas', 'checklist-adotou-cachorro', 'coleira-ou-peitoral-qual-escolher'],
    vetContext: true,
    searchTerms: ['achei um cachorro', 'cachorro perdido na rua', 'encontrei um cachorro', 'cachorro abandonado', 'microchip', 'cachorro sem dono'],
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
