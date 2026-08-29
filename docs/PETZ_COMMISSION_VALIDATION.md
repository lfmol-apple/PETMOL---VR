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

## Consequência para o PETMOL

"Ver na Petz" leva o cliente à **Loja Parceira** (`/parceiro/pettmol`)
via a ponte `/go/petz` (ver `docs/AFFILIATES.md` §Petz e
`homeShoppingPartners.ts::openPetzPartnerStore`). Assim o cupom PETTMOL e
os 10% entram sozinhos e a venda é atribuída. Chegar direto na página do
produto **não** grava o cookie → sem atribuição garantida.

**Não existe deep link oficial de produto pela loja parceira** — testado
e negado: `/parceiro/pettmol/produto/<slug>` → 404;
`?q` / `?query` / `?term` / `?keyword` / `?busca` / `#termo` → ignorados
(abre a home); `/busca?q=X&parceiro=pettmol` / `&loja=pettmol` → não
grava o cookie. O cookie `petzPartner` só é gravado por uma navegação
top-level a `www.petz.com.br/parceiro/pettmol`, e a home da loja é o
único destino. Um salto duplo automático (loja parceira → produto) é
impossível: depois da nav 1 não há controle (é página da Petz).

Mitigação (decisão de produto 29/08/2026): a ponte copia o **nome do
produto** pro clipboard pra o cliente colar na busca da Petz. O cupom
**não** é copiado — já é automático na loja parceira.

## Fontes

- Painel `parceiropetz.com.br/manager` (FAQ, Divulgação) — investigado 29/08/2026
- Checkout `www.petz.com.br/checkout` — teste real até o carrinho, sem finalizar
- https://www.petz.com.br/blog/programa-de-parcerias/
- https://www.tiktok.com/@petz/video/7381580412684061958 (declaração oficial Petz)

## Registro

| Data | Produto | Caminho | Atribuição no carrinho | Desconto 10% | Observação |
|---|---|---|---|---|---|
| 29/08/2026 | Kit Enxoval Modernpet Bege (full price) | A — via `/parceiro/pettmol` | "loja pettmol do Parceiro Petz" | sim, automático (−R$ 10,00) | cupom pré-preenchido + ✓ |
| 29/08/2026 | Drontal Plus (30% OFF) | A | idem | R$ 0 extra (não acumula com promo) | promoção do produto prevalece |
| 29/08/2026 | produto direto, sem passar pela loja parceira | — | nenhuma | — | cookie `petzPartner` ausente |
