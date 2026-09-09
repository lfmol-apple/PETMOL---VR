# Validação de comissão — Parceiro Petz (cupom PETMOL)

> **08/09/2026 — flag `petz_cart_prefill` (default OFF): carrinho da Petz
> JÁ montado (produto + cupom PETMOL aplicado), sem o cliente digitar
> nada.** Engenharia reversa da loja da Petz (plataforma Stoom) achou dois
> endpoints **legados Struts** ainda no ar, que a loja nova (Next.js/Vue)
> não usa mais:
>
> | URL | Efeito |
> |---|---|
> | `www.petz.com.br/aplicarCupom_Loja.html?cupom=PETMOL` | registra o cupom na sessão do carrinho (`petzCarrinho`, `SameSite=Lax`) — página em branco, sem redirect |
> | `www.petz.com.br/comprarAgora_Loja.html?prod=<petz_product_id>&qtde=1` | adiciona o produto e **redireciona pro `/checkout/cart/<id>`** |
>
> **Nessa ordem, 2 navegações top-level → carrinho da Petz com o produto e
> `✓ PETMOL` (−10%) já aplicado.** Provado em aba anônima zerada, do zero,
> várias vezes, 08/09/2026 (Baby: `prod=100223`, R$ 154,99 → R$ 139,49).
> A comissão é a MESMA de sempre — cupom PETMOL no checkout = 7% "vendas
> com seu cupom" — só que colado automático.
>
> **Restrições confirmadas nos testes:**
> - `comprarAgora_Loja.html` **não** aceita param de cupom (`cupom`,
>   `cupomPromocional`, `promocode`, … — 14 nomes testados, nenhum).
> - `aplicarCupom_Loja.html` **não** aceita param de redirect (`redirect`,
>   `url`, `dest`, `proximaPagina`, … — ~25 nomes testados). É beco sem
>   saída: aplica e para numa página em branco. Por isso são 2 navegações,
>   não 1.
> - `fetch`/`<iframe>` cross-origin de petmol.com.br **não** funcionam a
>   frio: o cookie de sessão é `SameSite=Lax`, só nasce/viaja em navegação
>   top-level. Confirmado que falha em incognito limpo.
> - 3 abas separadas na mesma sessão (= cookie jar compartilhado) funcionam.
>   Mas **`@capacitor/browser` (SFSafariViewController) NÃO serve**: no
>   iOS 11+ cada `Browser.open` é uma sessão isolada — o cupom registrado
>   no 1º hop **some** no 2º. **Testado num iPhone real 08/09: o produto
>   aparecia, o cupom não colava.** (2× `Browser.open` foi a 1ª tentativa,
>   no PR #284 — revertida.)
>
> **Entrega — SÓ no app nativo, numa ÚNICA WKWebView (`@capgo/inappbrowser`):**
> uma WKWebView persistente onde dá pra navegar (`setUrl`), então os 2
> hops dividem os cookies — igual a 2 navegações numa aba de navegador.
> `runPetzCartPrefill` em `homeShoppingPartners.ts`:
>   1. `openWebView(coupon_apply_url, { hidden: true, preventDeeplink: true })` — registra o cupom, invisível
>   2. `setUrl(cart_add_url)` — adiciona o produto; a Petz redireciona pro `/checkout/cart`, ainda invisível
>   3. no `urlChangeEvent` com `/checkout/cart` → `show()` — o tutor vê o carrinho pronto e finaliza a compra ali
>   4. timeout de 9 s revela a WebView mesmo se algum passo travar
> Fora do app nativo (web/PWA), ou se o plugin não estiver no binário, ou
> erro → cai no fluxo de `petz_product_search_link` / vitrine + clipboard.
> Só vale pra produto com `PetzProductMapping` confirmado E `petz_product_id` numérico.
>
> **Backend:** `/commerce/petz-direct-link` devolve `petz_product_id`,
> `coupon_apply_url`, `cart_add_url` e `destination: "cart"` quando a flag
> está ON e há `petz_product_id`. Helpers em `affiliate_links.py`
> (`PETZ_COUPON_APPLY_URL`, `petz_cart_add_url`). Frontend valida os dois
> paths de novo (`isPetzCouponApplyUrl`, `isPetzCartAddUrl`) antes de abrir.
>
> **Native (obrigatório antes de o fluxo funcionar no app):** `@capgo/inappbrowser`
> é plugin nativo — `npm install` + `npx cap sync ios && npx cap sync android`
> + rebuild + **nova submissão App Store / Play**. Até o binário novo
> subir, o `import('@capgo/inappbrowser')` falha graciosamente → fallback.
>
> **Riscos:** endpoints Struts não documentados — a Petz pode removê-los
> (fallback automático). A compra acontece numa WKWebView isolada (o
> tutor pode ter que logar na Petz de novo, ou comprar como convidado).
> Rollback = `PETZ_CART_PREFILL=false` + restart do petmol-api, sem deploy.

> **08/09/2026 — flag `petz_product_search_link` (default OFF).** Investigação
> a fundo (VTEX, API do parceiro, iframe, redirect params, app da Petz,
> two-hop) confirmou: **a Petz não tem deep link de produto pro programa
> Parceiro**, o app da Petz ainda abre `/produto/*` numa tela "DETALHES"
> quebrada (bug de 30/08 reconfirmado num iPhone físico), e o two-hop não
> roda dentro do SFSafariViewController do app. O `/busca?q=...` é AASA-safe
> e mostra o produto; a comissão de 7% vem do **cupom PETMOL no carrinho**
> ("Caminho B", comprovado em compra real 29/08). Com a flag **ON**, "Ver
> na Petz" por produto passa a abrir `/busca?q=<produto>` (produto na tela)
> em vez da vitrine fixa — trade-off: cliente logado na Petz perde o
> pré-preenchimento automático do cupom (só o cookie `petzPartner` dá).
> **OFF (padrão)** = comportamento de hoje (`/parceiro/PETMOL`). Rollback =
> `PETZ_PRODUCT_SEARCH_LINK=false` + restart do petmol-api, sem deploy.
> Backend: `main.py` devolve `destination: "store" | "search"`. Frontend:
> `openPetzPartnerStore({ preferSearch })`.

> **07/09/2026 — cupom e link mudaram.** O painel do Parceiro Petz passou a
> emitir o cupom/código de convite **`PETMOL`** (antes `PETTMOL`) e o link
> fixo **`https://www.petz.com.br/parceiro/PETMOL`** (antes `.../pettmol`).
> Código + testes atualizados. As linhas de log datadas abaixo (29/08) são
> históricas e ficam como estão — os testes daquele dia usaram `PETTMOL`.
> **Reverificado 08/09/2026 (dono confirmou):** `/parceiro/PETMOL` é o link
> correto agora; `__NEXT_DATA__` = `idPartner 41281`, `storeName "PETMOL"`,
> voucher `PETMOL` (10% OFF); `aplicarCupom_Loja.html?cupom=PETMOL` aplica
> −10% real no carrinho; carrinho mostra "Você está comprando na loja
> PETMOL do Parceiro Petz". O código já usa `PETMOL` /
> `www.petz.com.br/parceiro/PETMOL` em tudo — nada a ajustar.

Status: **REATIVADA em produção 04/09/2026** (PR #210) como card "Loja
Parceira" na grade "Ou visite uma loja parceira" da Loja do Pet —
`affiliateStatus: 'active'` no frontend. Arquitetura final, simplificada
em relação a tudo que este documento registra abaixo: **SEMPRE**
`https://www.petz.com.br/parceiro/PETMOL` — nunca busca, nunca produto,
nunca two-hop. Essa é exatamente a "Caminho A" descrita abaixo, sem as
complicações que a fizeram ser abandonada em 29/08 (essas complicações
eram todas sobre tentar mostrar o PRODUTO na tela também — como a versão
atual não tenta isso, elas não se aplicam mais):
- não precisa do two-hop (que quebrava em PWA/app) porque não há 2º hop;
- não corre risco de cair em `/produto/*` (AASA da Petz) porque nunca
  navega pra lá.

Isso volta a garantir a comissão automática (via cookie `petzPartner` —
ver "Caminho A" abaixo) em 100% dos toques em "Petz", em qualquer
plataforma (web, PWA, app nativo), o que a versão anterior (busca com
cupom copiado) não garantia sozinha. `openPetzPartnerStore` continua
copiando o cupom PETMOL pro clipboard — cobre o cliente deslogado na
Petz (a maioria), que não ganha o pré-preenchimento automático do
cookie (ver "Caminho A" abaixo).

`/commerce/petz-direct-link` (o "Ver na Petz" por PRODUTO específico —
card de recompra, resultado de busca, item sheets) **também reativado
em 04/09/2026**: `petz_affiliate_enabled`, `petz_coupon_attribution_verified`
e `petz_publicly_disabled` agora vêm True/True/False por padrão em
`config.py` — nenhuma das três precisa de env var no VPS. Isso só foi
seguro DEPOIS de `openPetzPartnerStore` (frontend) passar a ignorar
`direct_product_url`/`search_url` e sempre abrir a Loja Parceira — o
endpoint pode continuar devolvendo produto/busca (`url`), mas o cliente
nunca chega lá; só serve pra decidir SE o botão "Ver na Petz" aparece
(`available`), não PRA ONDE ele leva. Ver `petz_provider.is_petz_publicly_servable`.

Histórico (`PETZ_COUPON_ATTRIBUTION_VERIFIED=true` em produção 29–30/08/2026,
reativado como Loja Parceira fixa em 04/09/2026):

## Mecanismo real (investigação no navegador do painel + checkout, 29/08/2026)

O Parceiro Petz tem **dois** caminhos de comissão direta (7% do valor
líquido). Trecho da FAQ oficial do painel (`parceiropetz.com.br/manager`
→ Dúvidas → comissão):

> "Comissão Direta: Você ganha 7% do valor líquido de cada pedido que
> **usar o seu cupom** no aplicativo ou site da Petz, **OU compras feitas
> na sua loja virtual do Parceiro**."

### Caminho A — entrar pela Loja Parceira (recomendado)

Ao abrir **`https://www.petz.com.br/parceiro/PETMOL`** (navegação
top-level), a Petz grava um cookie first-party:

| Cookie | `petzPartner` |
|---|---|
| Domínio / path | `www.petz.com.br` / `/` |
| Conteúdo | JSON URL-encoded com `idPartner` + `PETMOL` (~126 chars, legível por JS) |
| SameSite / Secure / HttpOnly | `Lax` / não / não |
| Expiração | **~30 minutos**, renovada a cada visita à loja parceira |

Com esse cookie presente, no carrinho (`/checkout`):
- aparece **"Você está comprando na loja PETMOL do Parceiro Petz"**
  (atribuição ativa — vale mesmo sem login, é só o cookie);
- **cliente logado na Petz**: o campo "Cupom de desconto" vem
  **pré-preenchido com `PETMOL`** e validado (✓), e o desconto de
  **10% é aplicado automaticamente** (testado em produto sem promoção:
  R$ 99,99 → −R$ 10,00) — zero ação do cliente;
- **cliente deslogado (maioria dos casos reais)**: a atribuição/comissão
  do cookie continua valendo, mas o campo de cupom **não** vem
  pré-preenchido — precisa digitar/colar `PETMOL` pra ganhar os 10%. É
  por isso que `openPetzPartnerStore` (frontend) copia `PETMOL` pro
  clipboard nesse mesmo clique: transforma "digitar o código" em "colar",
  que é o mais próximo de automático que dá pra garantir sem depender do
  cliente estar logado.

**Não existe deep link oficial de produto.** O painel (Divulgação) só
oferece: cupom `PETMOL`, código de convite `PETMOL` e o link fixo
`petz.com.br/parceiro/PETMOL`. Testado e negado:
`/parceiro/pettmol/produto/<slug>` → 404; `?redirectUrl=` / `?url=` /
`?q=` → ignorados. A loja parceira tem catálogo completo (mesmo do site)
e busca própria — o cliente procura o produto lá dentro.

### Caminho B — cupom PETMOL digitado

Também atribui, mas: **não acumula com promoção maior do produto**
(ex: produto com 30% OFF → PETMOL adiciona R$ 0). Serve de reserva
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
- **cupom `PETMOL` copiado pro clipboard** — mecanismo de atribuição
  (Caminho B da FAQ). A busca da Petz **não grava** `petzPartner`.
- **10% / comissão dependem do cliente colar `PETMOL` no carrinho.**
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
