/**
 * Clusters editoriais — as jornadas que ligam guias soltos numa sequência
 * lógica ("como escolher ração → quanto comer → quanto dura o saco → quanto
 * custa → comparar → como guardar").
 *
 * Um cluster é só uma lista ordenada de slugs de guias REAIS. A página de
 * cada guia mostra em que cluster ele está e qual é o próximo passo. Nada
 * aqui cria conteúdo — só organiza o que já existe.
 */
import type { Guide } from './types';
import { getGuideBySlug } from './index';

export interface GuideCluster {
  id: string;
  label: string;
  /** Uma frase sobre a jornada — aparece no topo do cluster. */
  intro: string;
  icon: string;
  /** Slugs em ordem de leitura. Todos precisam existir (validado nos testes). */
  steps: string[];
}

export const GUIDE_CLUSTERS: readonly GuideCluster[] = [
  {
    id: 'alimentacao',
    label: 'Alimentação do cão, do rótulo ao orçamento',
    intro:
      'Escolher a ração é só o começo. Esta sequência vai da escolha ao gasto mensal, passando por porção, duração do saco e como guardar.',
    icon: '🥣',
    steps: [
      'como-escolher-racao-ideal-cachorro',
      'quanto-meu-cachorro-deve-comer-por-dia',
      'quanto-tempo-dura-saco-de-racao',
      'quanto-custa-alimentar-cachorro-por-mes',
      'comparar-racoes-custo-diario',
      'como-armazenar-racao-depois-de-aberta',
    ],
  },
  {
    id: 'passeio-transporte',
    label: 'Passeio e transporte, do equipamento à viagem',
    intro:
      'Da primeira compra de coleira à mala do cão para a estrada — o que escolher, como ajustar e o que levar.',
    icon: '🧳',
    steps: [
      'coleira-ou-peitoral-qual-escolher',
      'como-escolher-guia-para-cachorro',
      'como-escolher-caixa-transporte-cachorro',
      'kit-viajar-de-carro-com-cachorro',
      'o-que-levar-viagem-com-cachorro',
    ],
  },
  {
    id: 'casa-conforto',
    label: 'O espaço do pet dentro de casa',
    intro:
      'Cama, comedouro, bebedouro e fonte — como dimensionar cada item pelo pet, não pela embalagem.',
    icon: '🛏️',
    steps: [
      'como-escolher-tamanho-cama-cachorro',
      'como-escolher-comedouro-cachorro',
      'bebedouro-automatico-cachorro-vale-a-pena',
    ],
  },
  {
    id: 'higiene',
    label: 'Higiene em casa, do tapete ao odor',
    intro:
      'Como escolher tapete higiênico pela absorção real e pelo custo por dia — e como usar bem para gastar menos.',
    icon: '🧼',
    steps: [
      'como-escolher-tapete-higienico-cachorro',
      'economizar-produtos-pet-sem-so-menor-preco',
    ],
  },
  {
    id: 'primeiros-cuidados',
    label: 'Adotei um pet. E agora?',
    intro:
      'A jornada de quem acabou de adotar: o essencial antes da chegada, a primeira semana e o que pode esperar.',
    icon: '🐾',
    steps: [
      'checklist-adotou-cachorro',
      'como-escolher-racao-ideal-cachorro',
      'coleira-ou-peitoral-qual-escolher',
      'brinquedos-para-caes-como-escolher-com-seguranca',
      'como-escolher-tamanho-cama-cachorro',
    ],
  },
  {
    id: 'gatos',
    label: 'Gatos: o que muda',
    intro:
      'Gato não é cachorro pequeno. Areia, número de caixas, arranhador e transporte têm critérios próprios.',
    icon: '🐱',
    steps: [
      'como-escolher-areia-higienica-para-gatos',
      'quantas-caixas-de-areia-para-gatos',
      'como-escolher-arranhador-para-gatos',
      'como-transportar-gato-com-seguranca',
    ],
  },
];

export function getClusterById(id: string): GuideCluster | undefined {
  return GUIDE_CLUSTERS.find((c) => c.id === id);
}

export interface ClusterPlacement {
  cluster: GuideCluster;
  index: number;
  total: number;
  prev?: Guide;
  next?: Guide;
}

/** Onde este guia aparece nos clusters (pode estar em mais de um). */
export function getClusterPlacements(slug: string): ClusterPlacement[] {
  const out: ClusterPlacement[] = [];
  for (const cluster of GUIDE_CLUSTERS) {
    const i = cluster.steps.indexOf(slug);
    if (i === -1) continue;
    out.push({
      cluster,
      index: i,
      total: cluster.steps.length,
      prev: i > 0 ? getGuideBySlug(cluster.steps[i - 1]!) : undefined,
      next: i < cluster.steps.length - 1 ? getGuideBySlug(cluster.steps[i + 1]!) : undefined,
    });
  }
  return out;
}

/** Guias de um cluster, resolvidos e em ordem. */
export function getClusterGuides(id: string): Guide[] {
  const cluster = getClusterById(id);
  if (!cluster) return [];
  return cluster.steps
    .map((s) => getGuideBySlug(s))
    .filter((g): g is Guide => Boolean(g));
}

/** Validação estrutural dos clusters — roda nos testes. */
export function validateClusters(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const c of GUIDE_CLUSTERS) {
    if (ids.has(c.id)) errors.push(`cluster id duplicado: ${c.id}`);
    ids.add(c.id);
    if (c.steps.length < 2) errors.push(`cluster ${c.id}: precisa de ao menos 2 passos`);
    if (new Set(c.steps).size !== c.steps.length) errors.push(`cluster ${c.id}: passo repetido`);
    for (const s of c.steps) {
      if (!getGuideBySlug(s)) errors.push(`cluster ${c.id}: passo "${s}" não é um guia real`);
    }
  }
  return errors;
}
