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

**Enquanto este documento não tiver um resultado `YES` registrado,
`PETZ_COUPON_ATTRIBUTION_VERIFIED` deve continuar `false` em produção**
— nenhuma URL Petz deve ser servida publicamente antes disso.

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
| _(nenhum teste realizado ainda)_ | | | | |

## Resultado

- **Se `YES`** (comissão atribuída mesmo entrando direto no produto):
  documentar aqui a data e o GTIN testado, e então
  `PETZ_COUPON_ATTRIBUTION_VERIFIED` pode ser virado `true` em produção
  — mecanismo comercial validado.
- **Se `NO`** (comissão não atribuída sem passar pela vitrine): a URL
  direta de produto (`PetzProductMapping.product_url`) nunca deve ser
  tratada como monetizada. Reconsiderar se o fluxo "Ver na Petz" deve
  usar só a storefront fixa (`STOREFRONT_AFFILIATE_URLS["petz"]`) em
  vez da URL de produto, mesmo perdendo a conveniência de cair direto
  no produto certo — comissão comprovada tem prioridade sobre UX.

Status atual: **NÃO COMPROVADO** — nenhum teste de compra real foi
realizado ainda. `PETZ_COUPON_ATTRIBUTION_VERIFIED=false`.
