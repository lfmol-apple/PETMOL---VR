/**
 * Conteúdo dos 10 guias públicos (/guias/[slug]) — SEO, acesso sem login.
 * Cada guia liga a produtos estratégicos relacionados (strategicProducts.ts,
 * via `relatedProductIds`) — mesma fonte editorial da página /loja, nunca
 * um catálogo próprio.
 *
 * Conteúdo de saúde nunca substitui avaliação veterinária — todo guia com
 * viés de saúde carrega o aviso `vetDisclaimer`.
 */

export type GuideCategory =
  | 'alimentacao'
  | 'prevencao'
  | 'transporte'
  | 'medicacao'
  | 'porcoes'
  | 'hidratacao'
  | 'conforto_senior';

export interface Guide {
  slug: string;
  title: string;
  category: GuideCategory;
  /** Usado em <meta name="description"> e no card do índice /guias. */
  metaDescription: string;
  /** ISO date — "atualizado em" visível no artigo. */
  updatedAt: string;
  /** Parágrafos em texto simples — renderizados como <p>. Sem HTML embutido. */
  paragraphs: string[];
  /** Tópicos de lista, quando fizer sentido (renderizados como <ul>). */
  bulletPoints?: string[];
  vetDisclaimer?: boolean;
  relatedProductIds: string[];
}

export const GUIDES: Guide[] = [
  {
    slug: 'controlar-porcoes-sem-culpa',
    title: 'Como controlar as porções de ração sem culpa (nem balança na sorte)',
    category: 'porcoes',
    metaDescription: 'Aprenda a calcular e manter a porção certa de ração do seu pet, sem depender de "meia xícara" e sem sentir culpa quando o pet pede mais.',
    updatedAt: '2026-08-01',
    paragraphs: [
      'É comum sentir que está errando a mão na ração — ou de menos, com medo do pet passar fome, ou de mais, "porque ele pede". Na prática, a maioria dos erros de porção não vem de falta de carinho: vem de medir por volume ("uma xícara") em vez de peso (gramas), o que varia muito conforme a densidade da ração.',
      'O primeiro passo é olhar a tabela de porção do fabricante na embalagem — ela é calculada pelo peso do pet, não pelo tamanho do prato. A partir daí, uma balança de cozinha simples (a mesma usada pra cozinhar) resolve: pesar em gramas elimina a variação de "quanto cabe na xícara hoje".',
      'Pets que comem rápido demais — engolindo ar, engasgando ou vomitando logo depois — costumam se beneficiar de um comedouro lento, que obriga a mastigar mais devagar sem mudar a quantidade da porção. Não é sobre "ele está comendo rápido porque tem fome", é sobre o formato do prato.',
      'Se o pet parece sempre com fome mesmo na porção recomendada, vale registrar o peso dele ao longo do tempo antes de simplesmente aumentar a quantidade — pets podem pedir comida por hábito, tédio ou ansiedade, não só fome real. Uma conversa com o veterinário ajuda a diferenciar isso de uma porção genuinamente insuficiente.',
      'Culpa não resolve porção errada — medir resolve. Uma vez que a rotina de pesar vira hábito, leva menos de um minuto por refeição.',
    ],
    bulletPoints: [
      'Use a tabela de porção por peso do fabricante como ponto de partida, não "quanto parece certo".',
      'Prefira pesar em gramas a medir em xícaras/copos — o volume varia com a densidade da ração.',
      'Comedouro lento ajuda quem come rápido demais, sem mudar a quantidade da porção.',
      'Fome constante mesmo na porção certa merece conversa com o veterinário antes de simplesmente aumentar.',
    ],
    vetDisclaimer: true,
    relatedProductIds: ['comedouro-lento', 'balanca-cozinha'],
  },
  {
    slug: 'guia-racao-armazenamento',
    title: 'Como guardar ração aberta sem perder qualidade (nem atrair bicho)',
    category: 'alimentacao',
    metaDescription: 'O saco de ração aberto perde qualidade rápido se guardado do jeito errado. Veja como armazenar corretamente e evitar desperdício.',
    updatedAt: '2026-08-01',
    paragraphs: [
      'Ração aberta não dura pra sempre — a gordura da fórmula oxida com o contato com ar e luz, o que muda o sabor e reduz a palatabilidade. Um pet que "de repente não quer mais comer a mesma ração de sempre" às vezes só está reagindo a uma ração que perdeu frescor, não rejeitando a marca.',
      'O ideal é manter a ração no próprio saco original (ele já tem uma camada interna pensada pra reter o cheiro/gordura) e colocar esse saco fechado dentro de um pote hermético — não despejar a ração solta direto no pote, que perde a proteção do saco.',
      'Lugar fresco, seco e longe de luz direta é melhor que embaixo da pia (umidade) ou perto do fogão (calor). Insetos como traças de despensa também são atraídos por ração mal vedada — um pote realmente hermético resolve os dois problemas de uma vez.',
      'Reparar a validade não é só a data impressa: uma vez aberta, a maioria das rações recomenda uso em até 4-6 semanas, mesmo que a validade impressa seja de meses à frente. Anotar a data de abertura no saco ajuda a não perder essa conta.',
    ],
    bulletPoints: [
      'Guarde o saco original fechado dentro de um pote hermético — não despeje a ração solta.',
      'Lugar fresco e seco, longe de luz direta, calor e umidade.',
      'Anote a data de abertura — a maioria das rações vale 4-6 semanas depois de aberta, mesmo com validade impressa mais longa.',
      'Recusa repentina da mesma ração de sempre pode ser sinal de ração que perdeu frescor, não só rejeição de sabor.',
    ],
    relatedProductIds: ['pote-hermetico-racao'],
  },
  {
    slug: 'transicao-de-racao-sem-estresse',
    title: 'Como trocar de ração sem estresse (nem diarreia)',
    category: 'alimentacao',
    metaDescription: 'Trocar de ração de uma vez costuma causar problema digestivo. Veja como fazer a transição aos poucos, de forma segura.',
    updatedAt: '2026-08-01',
    paragraphs: [
      'Trocar de ração de um dia pro outro é a causa mais comum de diarreia "sem motivo aparente" em pets que pareciam saudáveis. O sistema digestivo leva alguns dias pra se adaptar a uma fórmula nova, então a troca precisa ser gradual, não imediata.',
      'A recomendação padrão é uma transição de 7 a 10 dias: começar com a ração nova em pequena proporção misturada à antiga (algo como 25%), e ir aumentando a proporção da nova a cada 2-3 dias, até substituir completamente.',
      'Motivos comuns pra trocar de ração incluem mudança de fase de vida (filhote para adulto, adulto para sênior), indicação veterinária por alguma condição de saúde, ou simplesmente disponibilidade — e em qualquer um desses casos, a transição gradual vale igual.',
      'Se mesmo com transição gradual aparecer diarreia persistente, vômito ou recusa total da comida, o próximo passo é conversa com o veterinário — pode ser que a fórmula nova não seja adequada pro pet, não só uma questão de tempo de adaptação.',
    ],
    bulletPoints: [
      'Transição de 7 a 10 dias, misturando a ração nova com a antiga em proporção crescente.',
      'Comece com cerca de 25% da nova ração e vá aumentando a cada 2-3 dias.',
      'Diarreia/vômito persistentes mesmo com transição gradual merecem avaliação veterinária.',
    ],
    vetDisclaimer: true,
    relatedProductIds: ['pote-hermetico-racao', 'comedouro-lento'],
  },
  {
    slug: 'prevencao-pulgas-carrapatos',
    title: 'Prevenção de pulgas e carrapatos: o que realmente funciona',
    category: 'prevencao',
    metaDescription: 'Pulgas e carrapatos são mais fáceis de prevenir do que de tratar depois de uma infestação. Veja o que funciona de verdade.',
    updatedAt: '2026-08-01',
    paragraphs: [
      'Prevenção de pulgas e carrapatos funciona melhor em camadas — um único método raramente cobre tudo. O antiparasitário (oral ou tópico, prescrito pelo veterinário) é a base, porque ataca o parasita diretamente; a coleira antiparasitária complementa como proteção contínua entre as doses.',
      'Detecção precoce evita que um problema pequeno vire infestação: passar um pente/escova antipulgas semanalmente, principalmente atrás das orelhas e na base do rabo, ajuda a notar pulgas ou carrapatos antes que se multipliquem pela casa.',
      'Ambiente importa tanto quanto o pet: pulgas passam boa parte do ciclo de vida fora do animal (tapetes, sofá, cama do pet), então uma infestação real geralmente exige tratar a casa também, não só o pet — aspirar com frequência e lavar a roupa de cama do pet em água quente ajuda.',
      'Em áreas com histórico de carrapato (quintal, mato, trilhas), checar o pet fisicamente depois de passeios é um hábito simples que pega o parasita antes de ele se fixar — carrapatos levam algumas horas pra se prender de verdade.',
    ],
    bulletPoints: [
      'Antiparasitário prescrito pelo veterinário é a base — coleira e outros métodos complementam, não substituem.',
      'Pente antipulgas semanal ajuda a detectar antes de virar infestação.',
      'Infestação real geralmente exige tratar o ambiente (tapete, sofá, cama), não só o pet.',
      'Checagem física depois de passeios em área de mato/trilha pega carrapato antes de ele se fixar.',
    ],
    vetDisclaimer: true,
    relatedProductIds: ['coleira-antiparasitaria', 'escova-antipulgas'],
  },
  {
    slug: 'transporte-seguro-veterinario',
    title: 'Transporte seguro até o veterinário (sem trauma pro pet)',
    category: 'transporte',
    metaDescription: 'Levar o pet ao veterinário não precisa ser um evento estressante. Veja como tornar o transporte mais seguro e tranquilo.',
    updatedAt: '2026-08-01',
    paragraphs: [
      'Uma caixa de transporte adequada é o item mais importante — além de ser exigência legal em viagens de avião e recomendada em qualquer deslocamento de carro, ela dá ao pet um espaço fechado e previsível, o que reduz ansiedade comparado a ficar solto no colo ou no banco.',
      'Deixar a caixa acessível em casa nos dias sem viagem nenhuma (com uma manta ou brinquedo dentro) ajuda o pet a associar a caixa a um lugar seguro, não só ao momento estressante da ida ao veterinário — isso reduz bastante a resistência na hora de entrar.',
      'Pra cães que viajam soltos no carro, um cinto de segurança específico pra pet prende o animal no banco e evita que ele atrapalhe quem dirige ou se machuque numa freada brusca — é equivalente ao cinto de segurança humano, não um acessório opcional.',
      'No dia da consulta, evitar refeição pesada nas horas anteriores reduz o risco de enjoo durante o trajeto, principalmente em pets que já têm histórico de ficar mal em carro.',
    ],
    bulletPoints: [
      'Caixa de transporte reduz ansiedade comparado a ir solto no colo/banco.',
      'Deixar a caixa acessível em casa (fora dos dias de viagem) ajuda o pet a associá-la a lugar seguro.',
      'Cinto de segurança pra pet evita acidente e distração de quem dirige.',
      'Evitar refeição pesada antes do trajeto reduz risco de enjoo.',
    ],
    relatedProductIds: ['caixa-transporte', 'cinto-seguranca-pet'],
  },
  {
    slug: 'viagem-longa-de-carro-com-pet',
    title: 'Viagem longa de carro com pet: o que levar e como planejar',
    category: 'transporte',
    metaDescription: 'Planejando uma viagem longa de carro com o pet? Veja o que levar e como organizar paradas pra chegar sem estresse.',
    updatedAt: '2026-08-01',
    paragraphs: [
      'Viagem longa é diferente de ida rápida ao veterinário — além da caixa de transporte ou cinto de segurança, vale planejar paradas a cada 2-3 horas pra o pet esticar as pernas, beber água e fazer as necessidades, do mesmo jeito que uma pessoa faria.',
      'Levar a própria ração do pet (na quantidade certa pros dias de viagem, guardada num pote hermético) evita ter que trocar de marca no meio do caminho por falta de opção — e uma troca de ração de última hora é justamente o que mais causa problema digestivo em viagem.',
      'Água de casa ou engarrafada costuma ser mais segura que água de posto desconhecida, principalmente pra pets sensíveis — levar uma garrafa própria e um pote de bebida dobrável resolve sem precisar confiar na água do caminho.',
      'Se o pet tem histórico de ansiedade ou enjoo em viagem, uma conversa com o veterinário antes da viagem pode indicar opções (desde treino de dessensibilização até medicação pontual) — não é algo pra resolver por conta própria no dia da viagem.',
    ],
    bulletPoints: [
      'Paradas a cada 2-3 horas pra água, necessidades e esticar as pernas.',
      'Leve a própria ração do pet — evita trocar de marca de última hora.',
      'Água de casa/engarrafada é mais segura que água desconhecida de posto.',
      'Histórico de ansiedade/enjoo em viagem merece conversa com o veterinário antes, não solução de última hora.',
    ],
    vetDisclaimer: true,
    relatedProductIds: ['caixa-transporte', 'pote-hermetico-racao'],
  },
  {
    slug: 'organizar-medicamentos-tratamento-continuo',
    title: 'Como organizar a medicação de um pet em tratamento contínuo',
    category: 'medicacao',
    metaDescription: 'Tratamentos longos exigem organização pra não esquecer doses. Veja como manter a rotina de medicação sob controle.',
    updatedAt: '2026-08-01',
    paragraphs: [
      'Tratamentos contínuos (condições crônicas, pós-cirúrgico prolongado, mais de um pet medicado ao mesmo tempo) são onde mais se perde a régua — não por falta de cuidado, mas porque manter uma dose diária exata de memória por semanas é genuinamente difícil.',
      'Um organizador de comprimidos semanal (o mesmo tipo usado por pessoas) resolve separando a semana inteira de uma vez: um momento só de organização por semana, em vez de decidir "já dei o remédio hoje?" toda vez que bate a dúvida.',
      'Pra medicação líquida, uma seringa dosadora sem agulha garante a dose exata prescrita — muito mais preciso que tentar medir na colher, principalmente em doses pequenas onde um erro de "quase a mesma quantidade" pode fazer diferença real.',
      'Anotar horário e dose de cada aplicação (num app, caderno ou agenda) ajuda tanto a não esquecer quanto a ter esse histórico pra mostrar ao veterinário na próxima consulta — principalmente útil se mais de uma pessoa da casa participa dos cuidados.',
    ],
    bulletPoints: [
      'Organizador semanal de comprimidos separa a semana toda de uma vez.',
      'Seringa dosadora sem agulha garante dose exata em medicação líquida.',
      'Registrar horário/dose ajuda a não esquecer e cria histórico pro veterinário.',
      'Mais de um pet medicado ao mesmo tempo aumenta o risco de troca — organização evita erro.',
    ],
    vetDisclaimer: true,
    relatedProductIds: ['organizador-medicamentos', 'seringa-dosadora'],
  },
  {
    slug: 'hidratacao-pets-tips',
    title: 'Como incentivar seu pet a beber mais água',
    category: 'hidratacao',
    metaDescription: 'Pets que bebem pouca água têm mais risco de problema renal e urinário. Veja como incentivar a hidratação no dia a dia.',
    updatedAt: '2026-08-01',
    paragraphs: [
      'Gatos, em particular, descendem de espécies que evoluíram em ambiente árido e naturalmente bebem menos água — o que não significa que a hidratação seja menos importante, só que é preciso incentivar de forma mais ativa.',
      'Água parada numa tigela simples é menos atrativa pra muitos pets do que água corrente — uma fonte de água imita o movimento de uma torneira pingando, o que costuma aumentar o interesse em beber sem precisar forçar nada.',
      'Posicionamento importa: água longe do prato de comida (não do lado) e em mais de um ponto da casa aumenta a chance do pet passar perto e beber por oportunidade, em vez de precisar "decidir" ir até o único bebedouro da casa.',
      'Em casas térreas ou com jardim, formigas nas tigelas de água/comida são um problema comum que faz o pet evitar o local — um bebedouro com barreira antiformiga resolve sem precisar mudar a água de lugar toda hora.',
      'Sinais de que o pet pode estar bebendo pouco incluem urina muito concentrada (cor forte), letargia ou pele que demora a voltar ao normal quando beliscada de leve — qualquer um desses, principalmente combinados, merece avaliação veterinária, não só mais água oferecida em casa.',
    ],
    bulletPoints: [
      'Gatos bebem naturalmente menos água — precisam de incentivo mais ativo que cães.',
      'Água corrente (fonte) costuma ser mais atrativa que água parada em tigela.',
      'Mantenha a água longe do prato de comida e em mais de um ponto da casa.',
      'Formigas na tigela afastam o pet — bebedouro antiformiga resolve.',
      'Urina muito concentrada ou letargia merecem avaliação veterinária, não só mais água.',
    ],
    vetDisclaimer: true,
    relatedProductIds: ['fonte-agua-pet', 'bebedouro-gato'],
  },
  {
    slug: 'conforto-pets-idosos',
    title: 'Conforto para pets idosos: pequenos ajustes que fazem diferença',
    category: 'conforto_senior',
    metaDescription: 'Pets idosos precisam de ajustes no ambiente pra manter conforto e mobilidade. Veja o que ajuda no dia a dia.',
    updatedAt: '2026-08-01',
    paragraphs: [
      'Envelhecer traz mudanças graduais de mobilidade que muitas vezes passam despercebidas — um pet que "ficou mais preguiçoso" pode na verdade estar evitando movimentos que doem, não perdendo interesse por vontade própria.',
      'Uma cama ortopédica de espuma de memória distribui o peso de forma mais uniforme que uma cama comum, aliviando pressão em articulações que já podem estar com artrose ou desgaste — é um dos ajustes de ambiente com impacto mais direto no conforto diário.',
      'Superfícies altas que o pet costumava alcançar de salto (sofá, cama, banco do carro) passam a representar risco de lesão conforme a mobilidade reduz — uma rampa de acesso mantém o acesso ao lugar favorito sem exigir o salto que pode machucar.',
      'Chão liso (piso frio, cerâmica) fica mais escorregadio pra pets com força reduzida nas patas — tapetes antiderrapantes nos trajetos mais usados (até a água, até a cama) ajudam a evitar quedas.',
      'Mudança de comportamento sempre merece atenção: reticência a subir escada, dificuldade de levantar depois de deitado, ou claudicação (mancar) não são "só coisa da idade" a ser ignorada — são sinais pra levar ao veterinário, que pode indicar desde ajuste de dieta até manejo de dor.',
    ],
    bulletPoints: [
      'Cama ortopédica distribui peso e alivia articulações desgastadas.',
      'Rampa de acesso evita saltos que machucam em superfícies altas.',
      'Tapetes antiderrapantes ajudam em pisos lisos quando a força nas patas reduz.',
      'Dificuldade de subir/levantar ou mancar merece avaliação veterinária, não é "só da idade".',
    ],
    vetDisclaimer: true,
    relatedProductIds: ['cama-ortopedica', 'rampa-pet'],
  },
  {
    slug: 'primeiros-sinais-que-pet-precisa-de-veterinario',
    title: 'Primeiros sinais de que seu pet precisa ir ao veterinário',
    category: 'prevencao',
    metaDescription: 'Alguns sinais são fáceis de ignorar no dia a dia, mas indicam que é hora de procurar o veterinário. Veja quais prestar atenção.',
    updatedAt: '2026-08-01',
    paragraphs: [
      'Pets não conseguem dizer com palavras que algo está errado, então boa parte do cuidado preventivo é notar mudanças de rotina — o que era normal pro seu pet ontem e não é mais hoje costuma ser o primeiro sinal, antes de qualquer sintoma mais óbvio aparecer.',
      'Mudança de apetite (comendo muito menos ou muito mais que o normal), mudança de sede (bebendo visivelmente mais água), e mudança de energia (mais apático ou, ao contrário, agitado sem motivo) são três sinais simples de acompanhar no dia a dia sem precisar de nenhum equipamento.',
      'Vômito ou diarreia isolados, uma vez, geralmente não são emergência — mas se persistem por mais de um dia, vêm com sangue, ou o pet fica visivelmente prostrado junto, isso já pede avaliação mais rápida.',
      'Mancar, relutância em subir escada/sofá, ou dificuldade pra levantar depois de deitado são sinais de dor que pets tendem a mascarar bem — instinto de sobrevivência de não parecer vulnerável — então quando aparecem, geralmente já estão incomodando há um tempo.',
      'Manter um registro simples de vacinas, peso e histórico de consultas ajuda o veterinário a notar padrões ao longo do tempo, não só reagir ao problema do dia — é mais fácil perceber "ele está bebendo mais água há duas semanas" com algum registro do que de memória.',
    ],
    bulletPoints: [
      'Mudança de apetite, sede ou energia são os sinais mais simples de acompanhar no dia a dia.',
      'Vômito/diarreia isolados raramente são emergência — persistência, sangue ou prostração pedem avaliação rápida.',
      'Mancar ou relutância em subir/levantar geralmente indica dor que já incomoda há um tempo.',
      'Um registro de peso, vacinas e histórico ajuda o veterinário a notar padrões, não só reagir ao sintoma do dia.',
    ],
    vetDisclaimer: true,
    relatedProductIds: ['fonte-agua-pet', 'balanca-cozinha'],
  },
];

export function getGuideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
