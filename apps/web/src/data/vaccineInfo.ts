import type { VaccineType } from '@/lib/petHealth';

export const vaccineInfo: Record<VaccineType, { description: string; protects: string[]; frequency: string; importance: string }> = {
  multiple: {
    description: 'Vacina polivalente que protege contra múltiplas doenças em uma única aplicação. Essencial para todos os cães.',
    protects: ['Cinomose (vírus que afeta sistema nervoso)', 'Parvovirose (vírus intestinal grave)', 'Hepatite infecciosa canina', 'Adenovírus tipo 2 (tosse)', 'Parainfluenza (gripe)', 'Leptospirose (4 cepas - afeta rins e fígado)'],
    frequency: 'Anual (reforço a cada 12 meses)',
    importance: '🔴 OBRIGATÓRIA - Essencial para a saúde do pet',
  },
  rabies: {
    description: 'Vacina obrigatória por lei que protege contra a raiva, doença viral fatal transmitida por mordidas de animais infectados. Pode ser transmitida para humanos.',
    protects: ['Raiva (doença viral fatal que afeta sistema nervoso central)'],
    frequency: 'Anual (reforço a cada 12 meses)',
    importance: '🔴 OBRIGATÓRIA POR LEI - Fatal se não tratada',
  },
  leptospirosis: {
    description: 'Protege contra bactéria transmitida pela urina de ratos em água parada ou solo contaminado. Pode afetar humanos (zoonose).',
    protects: ['Leptospirose (4 sorovares: Canicola, Icterohaemorrhagiae, Grippotyphosa, Pomona)'],
    frequency: 'Semestral ou Anual (em áreas urbanas a cada 6 meses)',
    importance: '🟡 MUITO RECOMENDADA - Especialmente em áreas urbanas',
  },
  kennel_cough: {
    description: 'Protege contra tosse altamente contagiosa em ambientes com muitos cães (creches, hotéis, parques). Aplicada via intranasal ou injetável.',
    protects: ['Bordetella bronchiseptica (bactéria da tosse dos canis)', 'Parainfluenza (componente viral)'],
    frequency: 'Anual ou semestral para cães em creches',
    importance: '🟡 RECOMENDADA - Obrigatória em creches e hotéis',
  },
  giardia: {
    description: 'Protege contra parasita intestinal microscópico que causa diarreia crônica. Comum em filhotes e ambientes coletivos.',
    protects: ['Giardia lamblia (protozoário intestinal)'],
    frequency: 'Anual, com 2 doses iniciais',
    importance: '🟢 OPCIONAL - Recomendada para ambientes coletivos',
  },
  coronavirus: {
    description: 'Protege contra coronavírus canino que causa gastroenterite (diferente do COVID-19 humano). Mais grave em filhotes.',
    protects: ['Coronavírus Canino (CCoV - causa diarreia)'],
    frequency: 'Anual',
    importance: '🟢 OPCIONAL - Mais importante em filhotes',
  },
  influenza: {
    description: 'Protege contra gripe canina altamente contagiosa. Importante para cães que frequentam creches, parques e exposições.',
    protects: ['Influenza Canina H3N8', 'Influenza Canina H3N2'],
    frequency: 'Anual',
    importance: '🟡 RECOMENDADA - Para cães socializados',
  },
  lyme: {
    description: 'Protege contra doença transmitida por carrapatos infectados. Importante em áreas de mata e fazendas.',
    protects: ['Borreliose (Doença de Lyme) - causa artrite e problemas renais'],
    frequency: 'Anual, com 2 doses iniciais',
    importance: '🟢 OPCIONAL - Recomendada em áreas rurais',
  },
  parainfluenza: {
    description: 'Protege contra vírus respiratório altamente contagioso. Normalmente incluída na V8/V10.',
    protects: ['Parainfluenza canina (infecção respiratória leve a moderada)'],
    frequency: 'Geralmente incluída na V8/V10',
    importance: '🟡 INCLUÍDA - Faz parte da vacina múltipla',
  },
  adenovirus: {
    description: 'Protege contra vírus que causa hepatite e problemas respiratórios. Normalmente incluída na V8/V10.',
    protects: ['Adenovírus tipo 1 (hepatite)', 'Adenovírus tipo 2 (tosse e pneumonia)'],
    frequency: 'Geralmente incluída na V8/V10',
    importance: '🟡 INCLUÍDA - Faz parte da vacina múltipla',
  },
  hepatitis: {
    description: 'Protege contra hepatite infecciosa canina causada por adenovírus. Normalmente incluída na V8/V10.',
    protects: ['Hepatite Infecciosa Canina (afeta fígado, rins e olhos)'],
    frequency: 'Geralmente incluída na V8/V10',
    importance: '🟡 INCLUÍDA - Faz parte da vacina múltipla',
  },
  leishmaniasis: {
    description: '⚠️ VACINA DESCONTINUADA - A vacina contra leishmaniose (LeishTec/Leishmune) foi descontinuada no Brasil. Atualmente, a prevenção é feita com coleiras repelentes, pipetas e medicamentos preventivos.',
    protects: ['Nota: Foco em prevenção com repelentes (coleira Scalibor, Advantix) e acompanhamento veterinário'],
    frequency: 'N/A - Vacina não disponível',
    importance: '⚠️ DESCONTINUADA - Use coleira repelente',
  },
  distemper: {
    description: 'Protege contra cinomose, doença viral grave que afeta múltiplos sistemas. Normalmente incluída na V8/V10.',
    protects: ['Vírus da Cinomose (afeta sistema nervoso, respiratório e digestivo)'],
    frequency: 'Geralmente incluída na V8/V10',
    importance: '🔴 INCLUÍDA - Faz parte da vacina múltipla',
  },
  parvovirus: {
    description: 'Protege contra parvovirose, doença viral intestinal grave e altamente contagiosa. Normalmente incluída na V8/V10.',
    protects: ['Parvovírus Canino (causa diarreia hemorrágica grave)'],
    frequency: 'Geralmente incluída na V8/V10',
    importance: '🔴 INCLUÍDA - Faz parte da vacina múltipla',
  },
  bordetella: {
    description: 'Protege contra tosse dos canis (Bordetella). Geralmente incluída na vacina de Tosse dos Canis.',
    protects: ['Bordetella bronchiseptica (bactéria respiratória)'],
    frequency: 'Anual ou semestral',
    importance: '🟡 INCLUÍDA - Geralmente com Tosse dos Canis',
  },
  feline_leukemia: {
    description: 'Vacina para gatos que protege contra leucemia felina, doença viral que compromete o sistema imunológico.',
    protects: ['Vírus da Leucemia Felina (FeLV)'],
    frequency: 'Anual, após 2 doses iniciais',
    importance: '🔴 ESSENCIAL - Para gatos com acesso externo',
  },
  feline_distemper: {
    description: 'Vacina polivalente V3/V4/V5 para gatos. Protege contra as principais doenças virais felinas.',
    protects: ['Panleucopenia Felina', 'Rinotraqueíte', 'Calicivirose', 'Clamidiose (V4/V5)'],
    frequency: 'Anual',
    importance: '🔴 OBRIGATÓRIA - Essencial para todos os gatos',
  },
  other: {
    description: 'Outras vacinas específicas conforme orientação veterinária (ex: leishmaniose em áreas endêmicas).',
    protects: ['Consulte seu veterinário para vacinas específicas da sua região'],
    frequency: 'Conforme orientação veterinária',
    importance: '🟢 CONSULTE - Depende da região e estilo de vida',
  },
};

export const commonVaccines: { type: VaccineType; name: string; icon: string; code: string }[] = [
  { type: 'multiple', name: 'V10', icon: '💉', code: 'DOG_POLYVALENT_V8' },
  { type: 'multiple', name: 'V8', icon: '💉', code: 'DOG_POLYVALENT_V8' },
  { type: 'rabies', name: 'Raiva', icon: '🦠', code: 'DOG_RABIES' },
  { type: 'influenza', name: 'Gripe', icon: '🤧', code: 'DOG_INFLUENZA' },
  { type: 'giardia', name: 'Giárdia', icon: '🧪', code: 'DOG_GIARDIA' },
  { type: 'leishmaniasis', name: 'Leishmaniose', icon: '🛡️', code: 'DOG_LEISH_TEC' },
  { type: 'other', name: 'Outro', icon: '➕', code: 'OTHER' },
];
