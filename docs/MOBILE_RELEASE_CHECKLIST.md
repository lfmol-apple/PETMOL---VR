# Checklist de Release Mobile (PETMOL)

Checklist de lançamento para App Store + Google Play, mantido a partir do push de release do dia 24/08/2026. Cada item tem estado, PR/commit de referência quando aplicável, e o que falta.

## Legal / conteúdo

- [x] Landing page sem promessa de "grátis para sempre" — `apps/web/src/app/page.tsx`, `login/page.tsx`, `home/page.tsx`, `profile/page.tsx` (PR #55, `567a95b`)
- [x] Termos de Uso cobrindo afiliados/comissão/parceiros/planos futuros — `apps/web/src/app/legal/terms/page.tsx` (PR #55, `263697c`)
- [x] Política de Privacidade — já cobria o escopo real de dados, pública sem login
- [x] Exclusão de conta remove dados de todas as tabelas relacionadas (LGPD) — `services/price-service/src/user_auth/router.py` (PR #55, `076246b`; ampliado no PR `fix/store-readiness-round1`: +`care_plans`, `notification_pendencies`, `push_delivery_logs`, `product_correction_events`, `product_learning_events`, com guarda `_existing_tables` p/ não quebrar entre schemas prod/sqlite; comentário errado sobre `care_plans` corrigido)

## IA / vacinas

- [x] Cadastro manual de vacina funciona sem foto/IA (3 fluxos: foto+IA, foto ruim+correção manual, 100% manual)
- [x] Falha de IA nunca bloqueia — leitura de carteirinha de vacina agora tem timeout de 30s no backend + abort de 90s no cliente + botão "Cancelar" visível (PR #55, `031b50a`)

## Commerce / afiliados

- [x] Petz bloqueada publicamente em produção enquanto a atribuição de comissão do cupom PETTMOL não for comprovada por compra real (`petz_coupon_attribution_verified=false`, ver `docs/PETZ_COMMISSION_VALIDATION.md` — status: NÃO COMPROVADO) — `/api/handoff/shop?partner=petz`, `/commerce/petz-direct-link` e `/commerce/monetized-offer?merchant=petz` todos passam por `is_petz_publicly_servable()` e retornam vazio/503 até lá (25/08/2026, auditoria de monetização — corrigiu um P0 real em que `/commerce/petz-direct-link` servia URL sem checar nenhuma flag)
- [x] Links de afiliado no mobile abrem fora do WebView em plataforma nativa — `navigateToPartnerUrl` detecta `Capacitor.isNativePlatform()` e usa `@capacitor/browser`; comportamento em PWA/tab normal inalterado

## Responsividade / UX mobile

- [x] Touch target do botão fechar em `OverdueAlertsGrid.tsx` corrigido (24px → 36px) (PR #55, `cefbee3`)
- [ ] 3 botões de fechar em ~32px identificados como borderline — não bloqueiam lançamento, ficam como P2
- [x] Spot-check em 360/375/390/412/430px de home, modal de alimentação e perfil (24/08/2026) — sem overflow, sem corte/sobreposição de conteúdo; automação para vacina/cuidados/loja/offer-picker travou num estado de fallback de câmera repetido (limitação do script de teste, não um bug confirmado do produto)
- [ ] Smoke test completo em 320/360/375/390/412/430px + tablet + desktop dos fluxos: criar conta, login, cadastrar pet, foto do pet, home, ração, vacina manual, vacina por foto, medicação, antiparasitário, Loja, busca, escolher oferta, configurações, excluir conta — cobre especificamente vacina/cuidados/loja/offer-picker, que não puderam ser verificados por automação nesta rodada

## Backup / disaster recovery

- [x] Bug de symlink vazio no backup de uploads corrigido (`tar -h`) (PR #55, `eb5d269`)
- [x] Secrets (`.env`) removidos do arquivo principal, isolados e criptografados via `BACKUP_ENCRYPTION_KEY` (PR #55, `eb5d269`)
- [x] Bug de `source` quebrando o backup em `.env` não-bash-safe corrigido (PR #55, `2205471`)
- [x] Teste de restore real executado (backup → checksum → `pg_restore` em banco isolado → contagem de linhas em 14 tabelas críticas, todas batendo) — ver `docs/BACKUP_ROTINA.md`
- [ ] Cópia off-site real configurada — `BACKUP_OFFSITE_CMD` existe como mecanismo mas nenhum destino real está setado hoje
- [x] nginx de produção versionado em `deploy/nginx/petmol.conf` — snapshot capturado via `vps-command.yml`, sem segredos, não consumido por deploy (só rastreabilidade/disaster-recovery)

## Segurança

- [x] JWT secret fail-closed em produção, CORS restrito, docs/redoc desativados em prod, bcrypt, rate limiting em login/registro/reset de senha, sem segredos client-side ou commitados
- [x] CI (frontend + backend) verde na branch de release

## Capacidade

- [x] Benchmark de carga local (nunca em produção) em 50/100/250/500/1000 de concorrência nos endpoints health/login/pets/reminders/catalog-search — ver `docs/CAPACITY_BENCHMARK.md`
- [x] Gatilhos de escala documentados a partir do benchmark — achado real: pool de conexões do banco (60 max) satura por volta de 250 requisições autenticadas simultâneas, e como produção roda um único worker uvicorn, isso cascateia pra todo o serviço, não só o endpoint ocupado. Não bloqueia lançamento (improvável bater isso sustentado com o volume inicial esperado), mas é o primeiro gatilho de escala real e barato de resolver (subir `pool_size`/`max_overflow` e/ou múltiplos workers) — não corrigido hoje por não ser otimização necessária pro lançamento

## Android

- [x] Scaffolding do Capacitor (`npx cap init` + `@capacitor/core`/`@capacitor/browser`/`@capacitor/android`) — `capacitor.config.ts` com `server.url` apontando pro site real (app roda `output: 'standalone'`, sem export estático, então o shell nativo carrega o site ao vivo em vez de manter um segundo frontend)
- [x] Package ID definido: `br.com.petmol.app` (confirmado sem conflito em todo o repo antes de fixar)
- [x] Android SDK instalado via CLI tools (`brew install --cask android-commandlinetools` + `sdkmanager`, sem Android Studio) — `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`; JDK 21 (exigido pelo Gradle do template Capacitor 8) instalado via tarball portátil da Adoptium, sem sudo
- [x] `@capacitor/browser` (`Browser.open()`) adicionado em `navigateToPartnerUrl` para links de afiliado escaparem do WebView em plataforma nativa
- [x] `POST_NOTIFICATIONS` declarada no `AndroidManifest.xml` (obrigatória a partir do Android 13/API 33 pra qualquer prompt de notificação, incluindo push, aparecer)
- [x] `@capacitor/push-notifications` instalado e sincronizado (`npx cap sync android`, plugin linkado e compilando — `./gradlew assembleDebug` com tasks `:capacitor-push-notifications:*` reais); registro de token, backend (`NativePushToken`, endpoints `/notifications/native-device`) e frontend (`nativePushService.ts`, wired em `useNotificationPermissionController.ts`) prontos — commit `09b9641` (CI verde)
- [x] Build de release compilável + AAB gerado — `./gradlew bundleRelease` rodou com sucesso, `app-release.aab` gerado e assinado com um keystore de TESTE (`~/.petmol-mobile-keys/TEST-ONLY-do-not-use-for-real-release.jks`, fora do repo, senha só em env var). **Esse keystore de teste não deve ser usado para a submissão real** — gerar um keystore de produção novo, guardar senha e arquivo com backup seguro (perda = não consegue mais atualizar o app depois do primeiro upload)
- [x] Ícone adaptativo e splash trocados pela marca PETMOL (gerados via `@capacitor/assets` a partir de `apps/web/public/icons/icon-source.svg`, o mesmo mark já usado no PWA) — build de release re-verificado com os novos assets
- [x] Validar permissões declaradas no `AndroidManifest.xml` contra o uso real (auditoria de release, PR `fix/store-readiness-round1`): `INTERNET`/`POST_NOTIFICATIONS`/`ACCESS_COARSE_LOCATION` OK; **faltava `CAMERA`** — o scanner ao vivo (`ProductDetectionSheet` usa `getUserMedia` no WebView) só cai no fallback de foto/manual sem essa permissão. Adicionada `CAMERA` + `uses-feature camera/autofocus required=false`.
- [ ] Play Console: Internal Testing track

## iOS

- [x] Projeto Xcode gerado (`npx cap add ios` não exige Xcode, só build/archive exigem) — mesmo shell Capacitor do Android (`server.url` remoto), bundle id `br.com.petmol.app` herdado automaticamente do `capacitor.config.ts`
- [x] Usage descriptions de câmera/fotos adicionadas no `Info.plist` (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`) — faltavam no template padrão
- [x] **v1.0 vai SEM push nativo.** `UIBackgroundModes: remote-notification` **removido** do `Info.plist` (PR `fix/store-readiness-round1`) — declarar background mode sem push funcional é risco de rejeição App Store 2.5.4. `nativePushService` agora só registra o token se a permissão JÁ estiver concedida (não abre prompt que não leva a nada). `App.entitlements` (`aps-environment=development`) segue no repo, órfão, pronto pra quando a APNs Auth Key existir. Ao ligar push de verdade: gerar `.p8`, no Xcode "+ Capability → Push Notifications" (conecta `CODE_SIGN_ENTITLEMENTS`), trocar `aps-environment` p/ `production`, restaurar o `UIBackgroundModes` e o prompt de permissão.
- [ ] **Bloqueado hoje**: Xcode completo não está instalado neste Mac (só Command Line Tools) — `xcodebuild` recusa rodar; requer instalação interativa via App Store com o Apple ID do usuário, não pode ser feito de forma não-interativa. CocoaPods também não está instalado (necessário pra `pod install` antes de abrir o projeto no Xcode)
- [x] Ícones e launch screen trocados pela marca PETMOL (mesmo processo do Android — `@capacitor/assets`, AppIcon + Splash light/dark)
- [x] Área Amazon US (`/recommendations`) mantida FORA do app nativo (PR `fix/store-readiness-round1`): `capacitor.config.ts` marca o UA com `PetmolApp`; a rota `/recommendations` dá `notFound()` quando o UA é do app; links "Picks"/"Recommendations" escondidos no Header/Footer/landing/InstitutionalLayout quando `Capacitor.isNativePlatform()`. Web e crawlers inalterados.
- [ ] Documentar para App Review que o app usa recursos nativos reais do PETMOL (cadastro de pet, scanner, alimentação, saúde, lembretes, medicação, comparação de produtos) — não é apenas um WebView passivo
- [ ] Build de release compilável + archive — depende do Xcode estar instalado
- [ ] TestFlight interno

## Push nativo (Android/iOS) — pendências externas

O registro do token (permissão, captura, envio ao backend, tabela `native_push_tokens`, cascade de exclusão de conta) está pronto de ponta a ponta nas duas plataformas — commit `09b9641`, CI verde. O que falta é **enviar** de fato uma notificação nativa, e isso depende de credenciais externas que este ambiente não tem e não pode gerar sozinho:

**Bloqueio 1 — Android (Firebase Cloud Messaging)**
- AÇÃO HUMANA: criar um projeto no Firebase Console, registrar o app com `applicationId br.com.petmol.app`, baixar `google-services.json` e gerar uma Server Key/Service Account
- LOCAL: https://console.firebase.google.com — precisa da conta Google que vai ser dona do projeto (decisão do usuário, não existe uma "conta certa" óbvia hoje)
- VALOR NECESSÁRIO: nenhum custo — o tier gratuito do FCM cobre o volume esperado no lançamento
- RESULTADO ESPERADO: `google-services.json` colocado em `apps/web/android/app/` (fora do Git, mesmo padrão do keystore) + credencial de servidor (Service Account JSON ou Server Key legada) configurada como secret no backend, pra o serviço poder chamar a API do FCM e efetivamente enviar os pushes cujos tokens já estão sendo coletados

**Bloqueio 2 — iOS (Apple Push Notification service)**
- AÇÃO HUMANA: no Apple Developer Program (exige conta paga, USD 99/ano — provavelmente já existe pra fins de submissão à App Store, ver seção "Metadados de loja"), gerar uma APNs Auth Key (.p8, recomendado sobre certificado porque não expira) vinculada ao App ID `br.com.petmol.app`; depois, no Xcode, ativar a capability "Push Notifications" no projeto (isso é o passo que também conecta o `App.entitlements` já preparado ao `project.pbxproj`)
- LOCAL: https://developer.apple.com/account (Certificates, Identifiers & Profiles → Keys) + Xcode, que precisa estar instalado (ver bloqueio do build iOS, já documentado abaixo)
- VALOR NECESSÁRIO: já coberto pela assinatura anual do Apple Developer Program, se o usuário já tiver — nenhum custo adicional específico do push
- RESULTADO ESPERADO: arquivo `.p8` + Key ID + Team ID guardados como secret no backend (nunca no repo), permitindo o serviço assinar requisições JWT pra APNs e enviar os pushes cujos tokens já estão sendo coletados no iOS

Registrar o token agora, mesmo sem poder enviar ainda, não tem custo nem risco — quando as duas credenciais acima existirem, os dispositivos que já instalaram o app vão precisar apenas reabrir uma vez pra o token já estar no banco.

## Metadados de loja

- [x] Apple App Privacy mapeado a partir do código real (schemas de banco + confirmação de que não há SDK de analytics/ads/crash de terceiros) — ver `docs/APP_STORE_METADATA.md`
- [x] Google Data Safety — matriz equivalente pronta em `docs/APP_STORE_METADATA.md`
- [ ] Conta de revisor dedicada — procedimento documentado em `docs/APP_STORE_METADATA.md`, mas **as credenciais (e-mail/senha) dependem de decisão sua** antes de eu criar a conta em produção
- [x] Review notes para App Store e Google Play — rascunho pronto em `docs/APP_STORE_METADATA.md`
- [x] Copy de loja sem "grátis"/"menor preço garantido"/"diagnóstico"/"garantia de saúde" — landing page já corrigida (PR #55); lembretes documentados pra aplicar na ficha das lojas também

## Suporte / feedback

- [x] "Fale com o PETMOL" — sugestão / problema / ajuda, `POST /support/feedback` + tabela `support_feedback`, minimizado (sem PII desnecessária), anonimizado (não apagado) na exclusão de conta — commit deste ciclo, CI verde

## Estado geral (24/08/2026)

Todo o código local/reversível identificado como P0 nesta rodada está commitado na PR #55 (`fix/release-day-p0-legal-copy`), CI verde, aguardando merge. Android já tem shell Capacitor funcional com build de release + AAB assinado (com keystore de teste) gerado localmente, com ícone/splash da marca real, permissão de notificação e plugin de push nativo linkado e compilando. iOS tem entitlement/background mode de push já preparados no código. Registro de token de push nativo (Android/iOS) pronto de ponta a ponta — falta só o envio de fato, bloqueado em credenciais externas (Firebase/APNs, ver seção "Push nativo" acima). "Fale com o PETMOL" implementado. Metadados de loja (Apple/Google) e benchmark de capacidade prontos e documentados. O que resta é: (1) build iOS bloqueado por falta de Xcode neste Mac — ação manual do usuário, (2) gerar o keystore de produção real do Android (fora do repo, com backup seguro) antes da submissão de verdade — decisão sua, não gerado hoje por ser um artefato permanente e de alto risco se perdido, (3) decidir e-mail/senha da conta de revisor pra eu criar em produção, (4) configurar destino real de backup off-site, (5) projeto Firebase (Android) e APNs Auth Key (iOS) pra push nativo realmente enviar notificações — ver detalhes na seção acima.
