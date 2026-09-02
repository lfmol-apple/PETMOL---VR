# Plano de Saúde para pets — preparação (Petlove, ainda NÃO ativo)

Bloco comercial "Plano de Saúde" na Home, preparado para futura integração
com o **Programa de Afiliados Petlove Saúde**. **A Petlove ainda não aprovou
o PETMOL no programa.** Enquanto isso o bloco fica na versão neutra.

## Estado atual (DESATIVADO)

- `NEXT_PUBLIC_PETLOVE_SAUDE_ENABLED` ausente/`false` → bloco neutro:
  título "Plano de saúde para o {pet}" + texto + selo **"Em breve"**.
- Sem marca/logo/nome Petlove. Sem afirmação de parceria. Sem CTA clicável.
  Sem cupom. Sem cobertura/preço/carência/coparticipação. `resolveHealthPlanCtaUrl()`
  retorna `null`.
- O nome do pet é reaproveitado do contexto que a Home já tem
  (`AppleControlButtons` → `PetHealthPlanCard`), sem nova consulta/API.

## Arquivos

| Arquivo | Papel |
|---|---|
| `apps/web/src/features/healthPlan/config.ts` | flags + `resolveHealthPlanCtaUrl()` |
| `apps/web/src/components/home/PetHealthPlanCard.tsx` | o bloco (neutro / ativo) |
| `apps/web/src/components/AppleControlButtons.tsx` | renderiza o bloco entre os cards e "Pet Sumido" |

## Para ATIVAR depois da aprovação Petlove

### 1. Variáveis de ambiente (nunca commitar valores)

```
NEXT_PUBLIC_PETLOVE_SAUDE_ENABLED=true
NEXT_PUBLIC_PETLOVE_SAUDE_AFFILIATE_URL=<URL oficial de afiliado fornecida pela Petlove/Pilea>
NEXT_PUBLIC_PETLOVE_SAUDE_COUPON=<cupom, se a Petlove fornecer um — é pessoal e tem restrições de uso>
```

Como o build baka `NEXT_PUBLIC_*`, essas variáveis precisam existir **no
momento do `next build`** do deploy (ver `deploy/` e `apps/web/package.json`).

### 2. Rota própria de rastreamento `/go/petlove-saude` (recomendado)

Ainda **não criada** — criar quando ativar, no padrão de `apps/web/src/app/go/petz/`:
- `apps/web/src/app/go/petz/route.ts` faz `NextResponse.redirect(...)` e
  registra o clique (`/analytics/click`).
- Criar `apps/web/src/app/go/petlove-saude/route.ts` igual, redirecionando
  para `HEALTH_PLAN_AFFILIATE_URL`.
- Trocar, em `resolveHealthPlanCtaUrl()`, o retorno de
  `HEALTH_PLAN_AFFILIATE_URL` por `HEALTH_PLAN_GO_PATH`.
- `/go/` já é rota pública no `middleware.ts` (`PUBLIC_PATHS`) e em
  `AppShell` (`AUTH_ROUTES`), então não exige login nem mostra header.

### 3. Compliance (regulamento do Programa de Afiliados Petlove)

- **"Plano de Saúde"**, NUNCA "seguro" / "seguro saúde". (o código já não usa
  essas palavras)
- Publicidade identificada: o `PetHealthPlanCard` mostra **"Publicidade •
  Parceria"** quando ativo.
- Nada de alegação enganosa sobre custo. Existe **coparticipação** — não
  descrever preço/cobertura/carência sem material oficial da Petlove.
- Uso de **marca/logotipo** depende das diretrizes da Petlove — só aplicar
  os assets/nome depois de recebê-los e conferir as condições de uso.
- **Cupom** é pessoal e tem restrições. **Proibido**: tráfego pago,
  retargeting e certas formas de divulgação do cupom. Divulgar só nos
  canais autorizados pela Petlove/Pilea.
- O PETMOL **não** compartilha dado pessoal nem dado de saúde do pet com a
  Petlove nesta arquitetura — o CTA é apenas um link de saída.

### 4. Assets da marca

Quando a Petlove liberar nome/logo, adicionar no `PetHealthPlanCard` (ramo
`isActive`) — trocar o ícone genérico `HeartPulse` e o texto neutro pelo
material aprovado. Não antes.

## O que NÃO fazer

Integração de API, scraping, cadastro automático, pixel de terceiro,
retargeting, cupom inventado, link fictício, logo Petlove antes da
autorização. Ver a seção 11 do prompt da tarefa.
