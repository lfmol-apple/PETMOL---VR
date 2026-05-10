# PETMOL — Zip Checklist

## Estrutura e escopo

- [x] `apps/web/src` incluído
- [x] `apps/web/public` incluído
- [x] `apps/web/package.json` incluído
- [x] `apps/web/src/middleware.ts` incluído
- [x] `apps/web/next.config.mjs`, `tailwind.config.ts`, `tsconfig.json`, `.env.example` incluídos
- [x] `services/price-service/src` incluído
- [x] `services/price-service/requirements.txt` incluído
- [x] rotas, notificações, scheduler, storage e uploads do fluxo real representados no pacote
- [x] `shared/` incluído
- [x] diretórios auxiliares úteis para auditoria (`docs`, `deploy`, `functions`, `ARCHITECTURE.md`) incluídos

## Arquivos críticos confirmados

- [x] Home / bloco "Atenção agora": `apps/web/src/app/home/page.tsx`
- [x] Persistência interna de alertas: `apps/web/src/hooks/usePendencies.ts`
- [x] Engine de notificações: `services/price-service/src/notifications/__init__.py`
- [x] Pendências persistentes: `services/price-service/src/notifications/pendencies.py`
- [x] Deep links / ação de notificação: `apps/web/src/features/notifications/handleNotificationClick.ts`
- [x] Service worker: `apps/web/public/sw.js`
- [x] Onboarding atual: `apps/web/src/components/OnboardingWizard.tsx`
- [x] Documentos consolidados: `apps/web/src/components/PetDocumentVault.tsx`
- [x] Scanner / barcode / fallback: `apps/web/src/components/ProductDetectionSheet.tsx`
- [x] Trigger do scanner: `apps/web/src/components/ProductBarcodeScanner.tsx`
- [x] Motor barcode / cache / histórico / APIs: `apps/web/src/lib/productScanner.ts` e `apps/web/src/features/product-detection/**`
- [x] Saúde com ação imediata: `MedicationItemSheet`, `ParasiteItemSheet`, `VaccineItemSheet`, `GroomingItemSheet`, `FoodControlTab`

## Verificações técnicas obrigatórias

- [x] não há hardcodes críticos de ambiente no runtime principal
  Observação: existem fallbacks de desenvolvimento para `localhost`, o que é esperado e não bloqueia auditoria.
- [x] não há domínio antigo indevido no runtime principal
  Observação: referência a `PETMOL VL` encontrada apenas em `docs/LIMPEZA_LEVE_PRE_AJUSTES.md`.
- [x] não há nomes fixos de pet em produção detectados por busca direcionada
  Observação: não foram encontrados hardcodes evidentes de nomes de pet no fluxo principal auditado.
- [ ] não há `alert()` restantes nos fluxos principais
  Problema registrado: ainda há `alert()` em `apps/web/src/components/home/MedicationItemSheet.tsx`, `apps/web/src/hooks/useVaccineCardWorkflow.ts` e `apps/web/src/features/interactions/userPromptChannel.ts`.
- [x] não há comentários de mock em rotas públicas relevantes
  Observação: artefato temporário `DocumentManager.tsx.patch` foi removido do pacote.
- [x] imports principais estão íntegros
- [x] scanner e fluxo de produto estão incluídos
- [x] engine / push / deep links estão incluídos
- [x] documentos consolidados estão incluídos
- [x] onboarding atual está incluído
- [x] `.env.example` está atualizado
- [x] o pacote exclui `node_modules`, `.next`, `.venv`, uploads pesados, caches, logs e zips antigos

## Limpeza aplicada no pacote

- [x] exclusão de `node_modules`
- [x] exclusão de `.next`
- [x] exclusão de `.venv`
- [x] exclusão de `services/price-service/uploads/*`
- [x] exclusão de caches e artefatos (`__pycache__`, `.pytest_cache`, `.DS_Store`)
- [x] exclusão de `.git`
- [x] exclusão de zips antigos

## Variáveis obrigatórias mapeadas

- [x] API / site: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, `BACKEND_URL`, `FRONTEND_URL`
- [x] barcode: `NEXT_PUBLIC_COSMOS_TOKEN`, `COSMOS_TOKEN`, `NEXT_PUBLIC_BARCODE_LOOKUP_API_KEY`
- [x] push: `FEATURE_REMINDERS_PUSH`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
- [x] banco e auth: `DATABASE_URL`, `JWT_SECRET`, `SECRET_KEY`
- [x] storage: `STORAGE_BACKEND`, `UPLOADS_DIR`, `R2_*`
- [x] maps/places: `GOOGLE_MAPS_API_KEY`, `GOOGLE_PLACES_API_KEY`, `PLACES_ENABLED`, `PLACES_AUTOCOMPLETE_ENABLED`
- [x] sync/health: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Nome final do pacote

- [x] `PETMOL_ALERTA_ACAO_AUDIT.zip`