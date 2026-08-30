# Validação de comissão — Parceiro Petz (cupom PETTMOL)

Status: **DESATIVADA em produção 2026-08-30** (kill-switch
`petz_publicly_disabled=True` em `config.py` + `affiliateStatus: 'disabled'`
no frontend). A comissão via cupom foi comprovada (abaixo), mas a Petz
não oferece deep link de produto pra parceiros e a página de busca do
site tem bugs fora do nosso controle (link da foto abre outro produto /
o app) — "Ver na Petz" não tinha como ficar bom sem cooperação da Petz.
Todo o código do caminho Petz (ponte `/go/petz`, `openPetzPartnerStore`,
`PETZ_CURATED_SEARCH`) continua no lugar, dormente. Pra reativar: ver
`petz_provider.is_petz_publicly_servable`.

Histórico (`PETZ_COUPON_ATTRIBUTION_VERIFIED=true` em produção 29–30/08/2026):

## Mecanismo real (investigação no navegador do painel + checkout, 29/08/2026)

O Parceiro Petz tem **dois** caminhos de comissão direta (7% do valor
líquido). Trecho da FAQ oficial do painel (`parceiropetz.com.br/manager`
→ Dúvidas → comissão):

> "Comissão Direta: Você ganha 7% do valor líquido de cada pedido que
> **usar o seu cupom** no aplicativo ou site da Petz, **OU compras feitas
> na sua loja virtual do Parceiro**."

### Caminho A — entrar pela Loja Parceira (recomendado)

Ao abrir **`https://www.petz.com.br/parceiro/pettmol`** (navegação
top-level), a Petz grava um cookie first-party:

| Cookie | `petzPartner` |
|---|---|
| Domínio / path | `www.petz.com.br` / `/` |
| Conteúdo | JSON URL-encoded com `idPartner` + `pettmol` (~126 chars, legível por JS) |
| SameSite / Secure / HttpOnly | `Lax` / não / não |
| Expiração | **~30 minutos**, renovada a cada visita à loja parceira |

Com esse cookie presente, no carrinho (`/checkout`):
- aparece **"Você está comprando na loja pettmol do Parceiro Petz"**
  (atribuição ativa — vale mesmo sem login);
- o campo "Cupom de desconto" vem **pré-preenchido com `PETTMOL`** e
  validado (✓);
- o desconto de **10% é aplicado automaticamente** (testado em produto
  sem promoção: R$ 99,99 → −R$ 10,00).

**Não existe deep link oficial de produto.** O painel (Divulgação) só
oferece: cupom `PETTMOL`, código de convite `PETTMOL` e o link fixo
`petz.com.br/parceiro/pettmol`. Testado e negado:
`/parceiro/pettmol/produto/<slug>` → 404; `?redirectUrl=` / `?url=` /
`?q=` → ignorados. A loja parceira tem catálogo completo (mesmo do site)
e busca própria — o cliente procura o produto lá dentro.

### Caminho B — cupom PETTMOL digitado

Também atribui, mas: **não acumula com promoção maior do produto**
(ex: produto com 30% OFF → PETTMOL adiciona R$ 0). Serve de reserva
quando o cookie do Caminho A expira.

## Consequência para o PETMOL — PRODUTO NA TELA + CUPOM (a partir de 29/08/2026, PR #110)

O caminho pela Loja Parceira (`/parceiro/pettmol` → cookie `petzPartner`
→ atribuição automática) foi tentado em duas formas e **abandonado**:

| Tentativa | PR | Por que caiu |
|---|---|---|
| two-hop web (`window.open` + `w.location`) | #106/#108 | só funciona em **aba real** de navegador; na PWA instalada e no **app Capacitor** o `window.open` não devolve handle utilizável |
| two-hop nativo (`Browser.open` loja → `close()` → `Browser.open` produto) | #107 | **iOS suspende o JS do WebView** enquanto o navegador do sistema está por cima → o 2º hop nunca roda; o cliente ficava preso na home da Loja Parceira |

A Petz **não expõe deep link de produto** pela loja parceira — então não
há como ter "produto na tela" **e** "cookie de atribuição" ao mesmo tempo.

**Comportamento atual** (`homeShoppingPartners.ts::openPetzPartnerStore`
→ ponte `/go/petz?to=<url petz>&q=<nome>`):

| Backend devolve | `?to=` | Cliente vê |
|---|---|---|
| `search_url` (produto mapeado) | `/busca?q=<busca curada>` | o produto no topo (às vezes único resultado) |
| `search_url` (produto não mapeado) | `/busca?q=<marca+palavras>` | a busca da Petz com o termo |
| sem `search_url` | `/parceiro/pettmol` | a Loja Parceira |

**Busca curada dos mapeados** (`PETZ_CURATED_SEARCH` em `affiliate_links.py`,
verificada em petz.com.br/busca 30/08): a heurística por nome do catálogo
dava resultados ruins (ex: "Drontal Vermífugo Plus +" → 20 produtos
aleatórios). Cada `petz_product_id` confirmado tem um termo curado que
traz o produto no topo (Drontal / RC Urinary = 1 resultado exato). Sem
curadoria → deslug da própria URL do produto (`deslug_petz_product_url`).

- **NUNCA `/produto/<slug>`.** A AASA da Petz reivindica `/`, `/produto/*`,
  `/colecao/*`, `/minhas-assinaturas/*` — redirecionar (mesmo por
  `location.replace` no SFSafariViewController) pra qualquer um deles faz
  o iOS entregar ao app da Petz → tela **"DETALHES" quebrada** (bug real,
  iPhone, 30/08). `/busca` e `/parceiro/*` não são reivindicados.
  `isPetzAppClaimedUrl()` barra os reivindicados; `direct_product_url`
  fica na resposta do backend mas o frontend ignora.
- ponte faz `window.location.replace(to)` (redirect JS, nunca `<a href>`)
  pra um path fora da AASA. Vale em web, PWA e app.
- **cupom `PETTMOL` copiado pro clipboard** — mecanismo de atribuição
  (Caminho B da FAQ). A busca da Petz **não grava** `petzPartner`.
- **10% / comissão dependem do cliente colar `PETTMOL` no carrinho.**
  Não acumula com promoção maior do produto.

**Trade-off aceito:** (a) comissão depende do cupom colado; (b) produto
mapeado abre a busca (1º resultado), não a página exata — em troca de
funcionar em todas as plataformas sem cair no app quebrado. Decisão do
usuário (29/08/2026): "pelo menos conseguíamos colocar o produto na tela".

## Fontes

- Painel `parceiropetz.com.br/manager` (FAQ, Divulgação) — investigado 29/08/2026
- Checkout `www.petz.com.br/checkout` — teste real até o carrinho, sem finalizar
- https://www.petz.com.br/blog/programa-de-parcerias/
- https://www.tiktok.com/@petz/video/7381580412684061958 (declaração oficial Petz)

## Registro

| Data | Produto | Caminho | Atribuição no carrinho | Desconto 10% | Observação |
|---|---|---|---|---|---|
| 29/08/2026 | Kit Enxoval Modernpet (full price) | logado, `/parceiro/pettmol` → produto | "loja pettmol do Parceiro Petz" | sim, automático (−R$ 10,00) | cupom pré-preenchido + ✓ |
| 29/08/2026 | Drontal Plus (30% OFF) | logado | idem | R$ 0 extra (não acumula com promo) | promoção do produto prevalece |
| 29/08/2026 | produto direto, sem passar pela loja parceira | — | nenhuma | — | cookie `petzPartner` ausente |
| 29/08/2026 | **two-hop**: `/parceiro/pettmol` → nav JS (`location.href`/`replace`) → `/produto/X` | **deslogado** | **"loja pettmol" — atribuição PRESERVADA** | não auto (deslogado); ao digitar PETTMOL → −R$ 10,00 | delays 800/1500/2500ms todos ok |
| 29/08/2026 | **two-hop via `window.open('about:blank')` + `w.location`** | deslogado | **atribuição preservada, produto exato** | idem | comprovado no Chrome (aba real); NÃO na PWA nem no app |
| 29/08/2026 | **two-hop nativo** (Capacitor): `Browser.open(loja)` → `close()` → `Browser.open(produto)` | app | — | — | **NÃO FUNCIONA**: iOS suspende o JS do WebView enquanto o SFSafariVC está aberto → o 2º hop nunca roda |
| 29/08/2026 | **ABANDONADO o caminho pela Loja Parceira** (PR #110) — "Ver na Petz" → `/go/petz?to=` → página do produto / busca; cupom `PETTMOL` copiado | todas | não (cliente cola o cupom) | ao colar PETTMOL | produto na tela em web/PWA/app; comissão via cupom |
| 30/08/2026 | **BUG: `/go/petz` → `/produto/...` cai no app da Petz** ("DETALHES" quebrada, iPhone). AASA da Petz reivindica `/produto/*`. Fix (PR #112): ponte só redireciona pra `/busca` (fora da AASA); `/produto/` nunca usado. | app iOS | — | — | `isPetzAppClaimedUrl()` barra `/`, `/produto/*`, `/colecao/*`, `/minhas-assinaturas/*` |
| 29/08/2026 | two-hop web direto: `/parceiro/pettmol` → `/produto/drontal-83755` → add ao carrinho | **deslogado** | **"Você está comprando na loja pettmol do Parceiro Petz"** | campo de cupom vazio (deslogado); Drontal tinha 30% OFF próprio | re-comprovado no Playwright — cookie `idPartner 41281` persiste em todos os hops |
