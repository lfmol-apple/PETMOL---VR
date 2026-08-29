# Validação de comissão — Petz (cupom PETTMOL)

O programa "Loja Parceira" da Petz funciona por URL fixa da vitrine
(`https://petz.com.br/parceiro/pettmol`) + cupom `PETTMOL` (10% off)
aplicado manualmente pelo tutor no checkout. **Nunca foi comprovado**
que esse mecanismo realmente atribui comissão ao PETMOL quando o tutor
chega direto na URL comum de um produto específico (em vez de entrar
pela vitrine) — essa é exatamente a hipótese que
`config.petz_coupon_attribution_verified` existe pra guardar, e que
`petz_provider.is_petz_publicly_servable()` bloqueia até ser confirmada
(ver `docs/AFFILIATES.md` §Petz).

Confirmado — ver Registro/Resultado abaixo. `PETZ_COUPON_ATTRIBUTION_VERIFIED`
está `true` desde 29/08/2026.

## Procedimento

1. Escolher um produto barato (ex: um antiparasitário de baixo valor)
   entre os já confirmados no catálogo Petz (`match_status=confirmed`
   ou superior — ver `GET /v1/admin/petz/coverage`).
2. Abrir o link pelo fluxo real do PETMOL ("Ver na Petz" na ficha do
   produto) — confirmar que o destino é a página do produto específico
   (não a home da vitrine).
3. Aplicar o cupom `PETTMOL` no carrinho/checkout.
4. Finalizar a compra normalmente.
5. Aguardar o prazo de confirmação do painel de parceiros da Petz.
6. Confirmar no painel se a venda foi atribuída ao programa PETMOL.
7. Registrar o resultado abaixo — **apenas os campos listados**, nunca
   pedido, CPF, nome, endereço ou comprovante (nada sensível entra no
   Git; guardar evidência, se necessária, fora do repositório).

## Registro

| Data | GTIN testado | Tipo de destino (produto direto / vitrine) | Comissão atribuída? | Observação |
|---|---|---|---|---|
| 29/08/2026 | (não registrado — confirmar e preencher aqui quando disponível) | produto direto | YES | Confirmado pelo usuário diretamente no painel de parceiros da Petz. |

## Resultado

**YES** — comissão atribuída mesmo entrando direto no link do produto
(sem passar pela vitrine). Mecanismo comercial validado;
`PETZ_COUPON_ATTRIBUTION_VERIFIED=true` em produção desde 29/08/2026.

Status atual: **COMPROVADO** — `PETZ_COUPON_ATTRIBUTION_VERIFIED=true`.

## Mecanismo de atribuição (documentação oficial Petz, revisado 29/08/2026)

O rastreio do "Parceiro Petz" é feito pelo **CUPOM/CÓDIGO** (`PETTMOL`),
não pela URL de chegada. Trecho oficial da Petz:

> "Com ele você cria um cupom de 10% de desconto e ganha 7% em cima de
> **todas as vendas realizadas no nosso site e app utilizando o seu
> código**."

Ou seja: o tutor pode chegar em **qualquer página de produto** e, ao
**aplicar o cupom `PETTMOL` no checkout**, a venda é atribuída ao PETMOL
(7% de comissão). A vitrine `https://www.petz.com.br/parceiro/pettmol`
é só um endereço de divulgação — não é o que rastreia.

Consequência de produto: "Ver na Petz" **deve** abrir a página real do
produto (`PetzProductMapping.product_url`) e reforçar o passo do cupom —
é o cupom aplicado no carrinho, e só ele, que gera a comissão. Não faz
sentido forçar o tutor a passar pela vitrine.

Fontes:
- https://www.petz.com.br/blog/programa-de-parcerias/
- https://www.petz.com.br/blog/conquiste-uma-renda-extra-com-o-parceiro-petz/
- https://www.tiktok.com/@petz/video/7381580412684061958 (declaração oficial Petz)
