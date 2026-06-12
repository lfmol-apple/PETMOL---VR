# PETMOL — Audit Notes

## Pronto para auditoria

- Home com bloco de prioridade "Atenção agora" em `apps/web/src/app/home/page.tsx`, priorizando pendências persistentes e caindo para alerta inline quando necessário.
- Persistência interna de alertas em `apps/web/src/hooks/usePendencies.ts` + `services/price-service/src/notifications/pendencies.py`, garantindo visibilidade mesmo quando o push do sistema falha ou expira.
- Engine de notificações/push em `services/price-service/src/notifications/__init__.py`, com agendamento em `services/price-service/src/main.py`, deep links no frontend em `apps/web/src/features/notifications/handleNotificationClick.ts` e envio via `apps/web/src/features/notifications/pushService.ts`.
- Push web / service worker presentes em `apps/web/public/sw.js` e tela de controle em `apps/web/src/app/admin/notifications/page.tsx`.
- Onboarding leve centralizado em `apps/web/src/components/OnboardingWizard.tsx`, com integração de tutor/pet e tratamento de erros no fluxo atual.
- Documentos consolidados em `apps/web/src/components/PetDocumentVault.tsx`, com rota legada redirecionada/deprecada em `apps/web/src/app/documents/[petId]/page.tsx` e backend forte em `services/price-service/src/pets/document_router.py`.
- Saúde orientada à ação com `MedicationItemSheet`, `ParasiteItemSheet`, `VaccineItemSheet`, `GroomingItemSheet`, `FoodControlTab` e integração da Home em `apps/web/src/components/home/HealthModal.tsx` e `apps/web/src/app/home/page.tsx`.
- Resolução de produtos barcode-first em `apps/web/src/components/ProductDetectionSheet.tsx`, `apps/web/src/components/ProductBarcodeScanner.tsx`, `apps/web/src/lib/productScanner.ts` e `apps/web/src/features/product-detection/**`.
- Scanner com fallback real para foto/manual/lista quando a leitura falha ou o navegador não suporta `BarcodeDetector`.

## Integrações externas atuais

- Cosmos Bluesoft para GTIN: `apps/web/src/features/product-detection/apis/cosmos.ts` e proxy em `apps/web/src/app/api/barcode/route.ts`.
- OpenFoodFacts, UPC API e Barcode Lookup no motor paralelo de barcode: `apps/web/src/features/product-detection/apis/global.ts`.
- Google Maps / Places em rotas Next e backend.
- Web Push via VAPID / `pywebpush`.
- Supabase em fluxos de sync/health, quando configurado.
- Mercado Livre / afiliados no backend de handoff/commerce.

## Limitações e pontos ainda incompletos

- Ainda existem `alert()` em fluxos relevantes, especialmente em `apps/web/src/components/home/MedicationItemSheet.tsx`, `apps/web/src/hooks/useVaccineCardWorkflow.ts` e `apps/web/src/features/interactions/userPromptChannel.ts`. Isso reduz consistência de UX e deve ser removido antes de pré-loja.
- O motor de barcode fica mais competitivo quando `NEXT_PUBLIC_COSMOS_TOKEN`/`COSMOS_TOKEN` e `NEXT_PUBLIC_BARCODE_LOOKUP_API_KEY` estão configurados. Sem essas chaves, o sistema opera com fallback parcial.
- Push depende de `FEATURE_REMINDERS_PUSH`, `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` corretamente configurados no backend, além da inscrição do navegador/dispositivo.
- O scanner full-screen depende de suporte do navegador a `BarcodeDetector`; quando indisponível, o app cai para foto/manual em vez de travar.
- Há menção antiga a `PETMOL VL` em `docs/LIMPEZA_LEVE_PRE_AJUSTES.md`, mas isso está fora do runtime do produto.

## Resposta estratégica esperada do auditor

- PETMOL já opera como produto de alerta + ação nas áreas de saúde e documentos: o push dispara ação, a Home mantém prioridade visível e as pendências persistem além do push.
- A experiência de produto já não depende só de cadastro/histórico, porque a superfície principal da Home prioriza itens vencidos e leva a sheets/ações específicas.
- O fluxo de barcode já é competitivo por usar múltiplas fontes, cache local, histórico e fallback operacional, embora a cobertura máxima dependa das chaves externas.
- O pacote está apto para teste final / pré-loja, com ressalva de polimento de UX em alertas restantes e validação final das integrações externas em ambiente produtivo.