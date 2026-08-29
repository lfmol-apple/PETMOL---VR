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

## Consequência para o PETMOL — TWO-HOP WEB

O cookie `petzPartner` tem `Path=/` e sobrevive a uma navegação na
**mesma sessão** de `/parceiro/pettmol` → `/produto/...` (comprovado:
carrinho continua "loja pettmol"). "Ver na Petz"
(`homeShoppingPartners.ts::openPetzPartnerStore`):

```
gesto → window.open('about:blank')            (síncrono, no gesto)
      → win.location.href = /parceiro/pettmol   (Petz grava petzPartner)
      → aguarda 2000ms
      → win.location.replace(URL REAL do produto)   (JS, mesma janela)
```

O cliente vê o **produto exato** e a venda continua atribuída. Todas as
navegações são JS → `/produto/*` não é entregue ao app da Petz.

**2º hop**, na ordem de preferência (o cookie `petzPartner` tem `Path=/`,
então vale nos dois):
- `direct_product_url` (`/produto/...`) — só com `PetzProductMapping`
  confirmado (7 produtos hoje) → cliente cai NA página exata;
- `search_url` (`/busca?q=<marca + palavras-chave>`) — qualquer outro
  produto → cliente cai na BUSCA da Petz já com o termo e escolhe da lista.

**Só faz o two-hop web** quando há um 2º hop utilizável **e não** é
Capacitor (`window.open` não devolve handle no app).

### TWO-HOP NATIVO (Capacitor — app PETMOL)

No app, sem `window.open` utilizável, `openPetzNativeTwoHop` encadeia dois
`@capacitor/browser`:

```
gesto → Browser.open(/parceiro/pettmol)     (SFSafariViewController / Custom Tabs;
                                              Petz grava petzPartner no header)
      → aguarda 'browserPageLoaded' (teto 3500ms)
      → Browser.close()  →  aguarda 700ms  (SFSafariVC desmontar; 8.0.4 só
                                             aceita a 2ª open com safariVC==nil)
      → Browser.open(URL REAL do produto)   (mesma sessão do navegador do
                                             sistema → cookie persiste)
```

A comissão já está garantida quando o 1º hop carrega. Se a 2ª `open` for
recusada (view ainda montada) → reabre `/parceiro/pettmol` (destino seguro).
Se o usuário fecha a loja antes do load → não força o produto.
**Falta validar em iPhone/Android reais** que o cookie sobrevive ao
fechar/reabrir o navegador do sistema.

**Fallback** (nem o 1º hop nativo abriu / popup bloqueado / produto sem URL
exata): ponte `/go/petz` → só a Loja Parceira, copiando o **nome do
produto** pro clipboard pra busca. Comissão garantida; só o produto exato
que não acontece.

**Deep link oficial de produto pela loja parceira NÃO existe** —
`/parceiro/pettmol/produto/<slug>` → 404; `?q` / `?query` / `?term` /
`?keyword` / `?busca` / `#termo` → ignorados; `/busca?q=X&parceiro=pettmol`
/ `&loja=pettmol` → não grava o cookie. E **`/parceiro/pettmol` não faz
nenhuma chamada de backend de atribuição** — é 100% o `Set-Cookie`,
**não** account-linked.

**Desconto 10% visível:** logado na Petz → automático. Deslogado (a
maioria) → atribuição fica, mas o cliente digita `PETTMOL` (aceito,
aplica 10%). Por isso o two-hop copia `PETTMOL` pro clipboard como
segurança.

**Prioridade:** comissão garantida > produto exato > 10% automático >
conveniência. O two-hop só é usado se a atribuição permanecer.

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
| 29/08/2026 | **two-hop via `window.open('about:blank')` + `w.location`** | deslogado | **atribuição preservada, produto exato** | idem | comprovado no Chrome (web/PWA) |
| 29/08/2026 | **two-hop nativo**: `Browser.open(/parceiro/pettmol)` → `close()` → `Browser.open(/produto/X)` | — | *a validar em device* | — | premissa: SFSafariVC/Custom Tabs mantêm o cookie entre `open`s no mesmo app |
