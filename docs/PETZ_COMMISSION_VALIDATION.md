# Validação de comissão — Parceiro Petz (cupom PETTMOL)

Status: **COMPROVADO** — `PETZ_COUPON_ATTRIBUTION_VERIFIED=true` em
produção desde 29/08/2026.

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
| `direct_product_url` (mapping confirmado, 7 hoje) | `/produto/<slug>` | a página exata do produto |
| só `search_url` | `/busca?q=<marca+palavras>` | a busca da Petz com o resultado |
| nenhum | `/parceiro/pettmol` | a Loja Parceira |

- ponte faz `window.location.replace(to)` (redirect JS, nunca `<a href>`)
  → o app da Petz **não intercepta** no iPhone. Vale em web, PWA e app.
- **cupom `PETTMOL` copiado pro clipboard** no gesto do clique — é o
  mecanismo de atribuição deste caminho (Caminho B da FAQ). Chegar direto
  na página do produto **não grava** `petzPartner`.
- **10% / comissão dependem do cliente colar `PETTMOL` no carrinho.**
  Não acumula com promoção maior do produto.

**Trade-off aceito:** comissão passa a depender do cupom colado (vs.
automático) em troca de o produto aparecer na tela em **todas** as
plataformas, inclusive o app. Decisão do usuário (29/08/2026):
"pelo menos conseguíamos colocar o produto na tela do usuário".

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
| 29/08/2026 | two-hop web direto: `/parceiro/pettmol` → `/produto/drontal-83755` → add ao carrinho | **deslogado** | **"Você está comprando na loja pettmol do Parceiro Petz"** | campo de cupom vazio (deslogado); Drontal tinha 30% OFF próprio | re-comprovado no Playwright — cookie `idPartner 41281` persiste em todos os hops |
