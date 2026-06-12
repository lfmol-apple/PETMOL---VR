# PETMOL Home UI Handoff

Data: 2026-04-30

## Objetivo

Refino cirurgico da Home mobile do PETMOL para priorizar o estado do pet antes dos cards coloridos.

Regra de produto:

- Cor e identidade visual continuam.
- Estado do pet define prioridade.
- Nao mexer em backend, banco, endpoints, autenticacao ou sheets existentes.

## Arquivos alterados

- `apps/web/src/app/home/page.tsx`
- `apps/web/src/components/home/HomePetHeader.tsx`
- `apps/web/src/components/home/HomePetDashboard.tsx`
- `apps/web/src/components/AppleControlButtons.tsx`
- `apps/web/src/components/Header.tsx`

## Principais mudancas

- Novo bloco superior de estado do dia:
  - "Baby esta em dia hoje"
  - "Baby precisa de atencao hoje"
- Removido o banner vermelho antigo de atencao como elemento principal.
- Lembretes/pendencias passaram a ter mais prioridade visual.
- Foto do pet reduzida no mobile.
- Badge do pet corrigido para nao mostrar "0 pets com atencao".
- Cards de Alimentacao, Saude, Higiene e Shopping mantidos coloridos, mas com saturacao e sombra mais suaves.
- Shopping deixou de competir visualmente com Saude/Alimentacao.
- Historico ficou abaixo da area de cuidado e menos dominante.
- Texto de lembretes ajustado:
  - "hoje"
  - "amanha"
  - "em 3 dias"
  - "atrasado ha N dias"
- Botao "Sair" ficou menos agressivo visualmente.

## Validacoes realizadas

- `npm run web:build`: passou.
- `npx tsc --noEmit --pretty false`: passou apos a build gerar os tipos do Next.
- `npm run lint`: nao rodou analise porque `next lint` entrou no assistente interativo de configuracao do ESLint.
- Verificacao visual mobile em Chrome headless, viewport 390x844.
- Smoke test clicou em:
  - Racao
  - Saude
  - Higiene
  - Shopping
  - Historico

## Nao alterado

- Backend.
- Banco.
- Endpoints.
- Autenticacao.
- Scheduler.
- Scanner.
- Fluxo de compra.
- Fluxo de documentos.
- Sheets existentes de Alimentacao, Saude, Higiene, Medicacao, Vacinas e Parasitas.
- `RemindersSection.tsx` foi auditado e nao parece estar renderizado diretamente na Home atual.

## Riscos residuais

- O CTA "Ver proximos" reaproveita fluxo existente para nao criar modal novo.
- Smoke test validou abertura basica dos botoes, nao cada campo interno dos sheets.

## Observacao local

Se o navegador cair direto em `/register-pet`, geralmente ha token/cookie local de uma conta sem pets.

Limpeza minima no console:

```js
localStorage.removeItem('petmol_token');
sessionStorage.removeItem('petmol_token');
document.cookie = 'petmol_auth=; path=/; max-age=0; SameSite=Lax';
location.href = '/login';
```