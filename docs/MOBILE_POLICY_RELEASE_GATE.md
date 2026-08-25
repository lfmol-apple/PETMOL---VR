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
- [x] Consentimento explícito e prévio por usuário antes de enviar foto
      ao Gemini, nos dois fluxos que fazem isso (`VaccineCardUpload.tsx`,
      `ProductDetectionSheet.tsx`) — backend em `vision/router.py`
      (`user_consents`) e frontend em `features/ai/aiPhotoConsent.ts`.
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

- [x] Conteúdo versionado atual sem padrões de segredo PostgreSQL
      (`postgres://usuario:senha@`, `DATABASE_URL` com senha ou
      atribuição direta de senha PostgreSQL) — verificado em 25/08/2026
      sem imprimir valores.
- [ ] **ROTATE_REQUIRED — ação humana imediata**: uma credencial
      PostgreSQL de produção foi exposta e deve ser considerada
      comprometida. A remoção/redação no Git não torna a senha segura.
      Ver `docs/SECURITY_ROTATION_REQUIRED.md`.

## Resumo

**GO técnico condicionado aos testes/deploy gates** nos itens que o código
controla (privacidade, consentimento de IA, exclusão de conta, buy-paths,
Petz/PetLove fail-closed). **AÇÃO HUMANA**: revisão jurídica formal,
preenchimento real dos formulários das lojas e rotação coordenada da
credencial PostgreSQL comprometida.
