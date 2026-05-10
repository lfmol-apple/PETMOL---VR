# PETMOL - Handoff Sheets Internos + Push

## Escopo

Rodada concreta nos sheets internos e no roteamento de push.

Arquivos principais:

- `apps/web/src/components/home/FoodItemSheet.tsx`
- `apps/web/src/components/home/MedicationItemSheet.tsx`
- `apps/web/src/components/home/VaccineItemSheet.tsx`
- `apps/web/src/components/home/ParasiteItemSheet.tsx`
- `apps/web/src/components/home/GroomingItemSheet.tsx`
- `apps/web/src/components/home/HealthModal.tsx`
- `apps/web/src/components/PushActionSheet.tsx`
- `apps/web/src/app/home/page.tsx`

## Alterações

- Food: status superior mais claro, compra como CTA primário, ajuste/finalização/edição como secundários.
- Medicação: quando há tratamento ativo, `Registrar dose` vira CTA principal; compra e novo registro ficam secundários.
- Vacinas: `Registrar vacina` vira CTA principal; carteirinha, registro rápido e atualizar ficam secundários.
- Parasitas: compra vira CTA primário quando há produto atual; aplicação e edição ficam secundários.
- Higiene: `Registrar banho/tosa` vira CTA principal; `Editar próximo` fica secundário.
- HealthModal: tabs com pendência sobem em prioridade visual e banners usam linguagem menos hostil.
- PushActionSheet: simplificado visualmente e mantido só para escolha curta.
- Home push routing: push claro abre o sheet certo direto; `PushActionSheet` fica apenas com `choice=1` ou `push_sheet=1`.

## Validação local

- `npx tsc --noEmit --pretty false`: passou.
- `npm run web:build`: passou.
- Ambiente local reiniciado depois: Next em `http://localhost:3000`, CSS `/ _next/static/css/app/layout.css` respondendo como `text/css`.

## Não alterado

- Backend.
- Banco.
- Endpoints.
- Autenticação.
- Scanner/documentos fora do escopo.