# Área editorial pública — Guias PETMOL

Criada em **2026-08-30**. É a propriedade de conteúdo pública do PETMOL:
guias práticos, originais e sem login, com calculadoras. Serve tanto ao
tutor quanto à exigência de "conteúdo suficiente e original" para uma
futura candidatura ao Programa de Associados Amazon Brasil.

**Esta área é aditiva.** Não altera autenticação, dashboard, cadastro de
pets, price-service, OCR, push nem integrações comerciais existentes.

---

## 1. O que existe

| Rota | Tipo | Origem |
|---|---|---|
| `/guias` | estática | `features/guides` (índice) |
| `/guias/[slug]` | SSG (15 páginas) | `generateStaticParams` de `getAllGuides()` |
| `/sobre` | estática | institucional |
| `/politica-editorial` | estática | institucional |
| `/transparencia` | estática | institucional |

Nav pública: link **Guias** no `Header` (desktop + mobile); **Sobre /
Política editorial / Transparência** no `Footer`; seção "Guias PETMOL"
na home (`app/page.tsx`, 3 slugs fixos).

Flags: `app/publicCommercePages.ts` —
`PUBLIC_GUIDES_PAGE_ENABLED` / `PUBLIC_GUIDE_DETAIL_PAGE_ENABLED` = `true`.
`PUBLIC_STORE_PAGE_ENABLED` continua `false` (decisão comercial, `/loja`
segue 404). Desligar a área editorial é reverter as duas flags — as
páginas passam a `notFound()` e o sitemap para de listá-las.

---

## 2. Onde mora o conteúdo

```
features/guides/
  types.ts          união discriminada de blocos (p, h2, h3, ul, ol,
                    callout, table, checklist, tool) — sem MDX, sem CMS,
                    sem `any`, sem dangerouslySetInnerHTML
  categories.ts     6 categorias (alimentacao, compras-inteligentes,
                    higiene, casa-e-conforto, passeio-e-transporte,
                    primeiros-cuidados)
  calculators.ts    funções puras das 3 calculadoras (sem DB, sem API,
                    sem persistência)
  data/*.ts         os 15 guias como dados tipados
  index.ts          agrega tudo + helpers + validateGuides()
components/guides/   renderização (Server Components) + calculadoras
                    (Client Components) + JSON-LD + disclosure
```

### Adicionar um guia

1. Escreva o objeto `Guide` no arquivo de `data/` da categoria.
2. Garanta `slug` único, `publishedAt`/`updatedAt` ISO, `relatedSlugs`
   apontando para guias reais, `sources` só com `https://`.
3. `npx vitest run` — `guides.test.ts` valida estrutura, volume de
   texto, ausência de clichê/afirmação absoluta, e `validateGuides()`.
4. `sitemap.ts` e `generateStaticParams` pegam o novo guia
   automaticamente. Sem passo manual de publicação.

---

## 3. Calculadoras

Três, todas lógica pura em `calculators.ts`, embutidas em guias via bloco
`{ type: 'tool', tool: <id> }`:

| id | o que faz | fórmula |
|---|---|---|
| `duracao-saco-racao` | dias que um saco dura | `(bagKg * 1000) / dailyGrams` |
| `custo-mensal-racao` | custo/kg, custo/dia, custo/30 dias | `bagPrice / bagKg`, etc. |
| `comparar-racoes-custo-diario` | qual ração custa menos por dia | custo/dia de cada uma |

Não recomendam marca, não dão conselho clínico, não guardam dado (as
Client Components exibem "Não guarda nenhum dado"). Entrada aceita
vírgula ou ponto decimal; rejeita vazio/zero/negativo com mensagem que
cita o campo.

---

## 4. SEO técnico

Por página de guia: `title` único (`… | Guias PETMOL`), `description`,
`canonical`, OpenGraph `type: article` com `publishedTime`/`modifiedTime`
e `authors: [/sobre]`, Twitter `summary_large_image`. JSON-LD `Article` +
`BreadcrumbList`; FAQ vira `<details>` acessível. `/guias` emite
`CollectionPage`. Institucionais emitem `WebPage`/`Organization`.

- `sitemap.ts` — deriva `/guias` + os 15 guias + institucionais de
  `getAllGuides()` (nada hardcoded); só emite se a flag estiver ligada.
- `robots.ts` — `disallow` de área logada / API / admin / rotas de
  handoff. `/guias`, `/sobre`, `/politica-editorial`, `/transparencia`
  e `/excluir-conta` continuam liberados.

---

## 5. Imagens

`GuideHero` gera arte de marca (gradiente PETMOL + ícone da categoria) —
**nenhuma imagem de terceiro, da Amazon, de fabricante ou baixada do
Google**. Um guia pode definir `hero` (caminho em `public/`) para usar
foto real; hoje nenhum define. Não se alega que a arte gerada é
fotografia.

---

## 6. Amazon — arquitetura pronta, **desligada**

`features/commerce/amazon.ts` centraliza a montagem de Link Especial:

- Tracking ID vem **só** de `NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG` (env),
  validado por regex. Ausente ou inválido → `getAmazonTrackingId()`
  retorna `null`.
- `buildAmazonLink()` retorna `null` (nunca URL sem tag) se não houver
  tracking ID válido, se o host não for `amazon.com.br`, se não for
  https, ou se a URL for malformada.
- `auditAmazonLink()` verifica se a URL final carrega a tag configurada.
- Nenhum tracking ID no código. Nada é renderizado apontando para a
  Amazon hoje.

Disclosure: `features/commerce/affiliateDisclosure.ts` —
`genericDisclosure` é uma frase verdadeira e genérica sobre links de
parceiros. `amazonDisclosure` está **vazio**; `/transparencia` só
mostra declaração de participação Amazon `if
(hasActiveProgramDisclosure(amazonDisclosure))` — hoje diz que **não
participa**. Nada de "Como associado Amazon…" antes de a conta existir.

### Para ativar a Amazon no futuro

1. Conta aprovada → definir `NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG` no
   ambiente de build.
2. Preencher `amazonDisclosure` com a frase exigida pelo programa.
3. Passar a chamar `buildAmazonLink()` onde fizer sentido (guia, loja).
4. `amazon.test.ts` já cobre o comportamento com e sem tag.

Nada disso está feito nesta entrega — é só a fundação.

---

## 7. Checagens antes de mexer aqui

```
cd apps/web
npm run lint          # sem erros novos
npx tsc --noEmit      # limpo
npx vitest run        # 16 arquivos, verde
npm run build         # /guias ○, /guias/[slug] ● (15), institucionais ○
```

Testes relevantes: `features/guides/guides.test.ts`,
`features/guides/calculators.test.ts`,
`features/commerce/amazon.test.ts`, `app/publicCommercePages.test.ts`.
