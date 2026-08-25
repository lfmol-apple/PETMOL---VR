# Gate de política/compliance antes de submeter à loja

Checklist curto, só sobre política/compliance/legal — não sobre
prontidão técnica geral (isso é `docs/MOBILE_RELEASE_CHECKLIST.md`).
Cada item aqui aponta pra onde a evidência real está; não marcar como
feito sem conferir a fonte.

## Privacidade

- [x] Política de Privacidade reflete o processamento real (Supabase/
      OpenAI removidos por não serem usados; backup/monitoramento
      descritos com precisão) — `apps/web/src/app/legal/privacy/page.tsx`,
      auditado linha a linha em 25/08/2026 contra código + env de
      produção (read-only). Companion técnico: `docs/PRIVACY_DATA_MAP.md`.
- [x] Consentimento explícito e prévio antes de enviar foto ao Gemini,
      nos dois fluxos que fazem isso (`VaccineCardUpload.tsx`,
      `ProductDetectionSheet.tsx`) — `features/ai/aiPhotoConsent.ts`.
- [x] Página pública de exclusão de conta, funcional, sem exigir o app
      — `apps/web/src/app/excluir-conta/page.tsx`.
- [ ] **Ação humana pendente**: revisão jurídica dos PRs de política
      (Privacy Policy) antes de considerar isto definitivamente GO —
      esta auditoria corrigiu inconsistências técnicas objetivas, não
      substitui revisão jurídica formal.

## Apple App Privacy / Google Data Safety

- [x] `docs/APP_STORE_METADATA.md` já reflete corretamente: nenhum SDK
      de terceiros (analytics/ads/crash), compartilhamento com Gemini
      declarado, URL de exclusão de dados agora presente
      (`petmol.com.br/excluir-conta`).
- [ ] **Ação humana pendente**: preencher de fato os formulários App
      Store Connect / Play Console com o conteúdo de
      `docs/APP_STORE_METADATA.md` — este repo documenta o que
      declarar, não substitui o preenchimento no console.

## Saúde / disclaimer

- [x] `apps/web/src/app/legal/terms/page.tsx` já tem o disclaimer correto ("ferramenta de
      organização e lembretes... sempre consulte um médico veterinário
      qualificado") — confirmado coerente nesta revisão, nenhuma mudança
      necessária.

## Afiliados / monetização

- [x] Nenhum buy-path público sem prova comercial — ver
      `docs/BUY_PATH_AUDIT.md` (resposta explícita: NÃO).
- [x] Petz bloqueada até prova real de comissão — ver
      `docs/PETZ_COMMISSION_VALIDATION.md`.

## Segurança / repositório

- [ ] Repositório segue público — sem urgência (nenhum secret
      encontrado no histórico), mas ver `docs/PRIVATE_REPO_MIGRATION_CHECKLIST.md`
      pra decisão futura.
- [ ] **Achado fora do escopo desta tarefa, ação humana**: senha do
      Postgres de produção hardcoded em texto puro num script na VPS
      (`backup_pg_prod.sh`, não versionado neste repo) — não corrigido
      aqui porque a REGRA ABSOLUTA desta tarefa proíbe alterar a VPS;
      ver `docs/PRIVATE_REPO_MIGRATION_CHECKLIST.md`.

## Resumo

**GO técnico** nos itens que o código controla (privacidade, consentimento
de IA, exclusão de conta, buy-paths, Petz). **NO-GO só em ações
humanas fora do código**: revisão jurídica formal do texto legal,
preenchimento real dos formulários das lojas, e a senha hardcoded na
VPS (achado, não corrigido — fora do escopo/regra desta tarefa).
