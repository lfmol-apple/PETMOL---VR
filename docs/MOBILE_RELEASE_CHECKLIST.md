# Checklist de Release Mobile (PETMOL)

Checklist de lançamento para App Store + Google Play, mantido a partir do push de release do dia 24/08/2026. Cada item tem estado, PR/commit de referência quando aplicável, e o que falta.

## Legal / conteúdo

- [x] Landing page sem promessa de "grátis para sempre" — `apps/web/src/app/page.tsx`, `login/page.tsx`, `home/page.tsx`, `profile/page.tsx` (PR #55, `567a95b`)
- [x] Termos de Uso cobrindo afiliados/comissão/parceiros/planos futuros — `apps/web/src/app/legal/terms/page.tsx` (PR #55, `263697c`)
- [x] Política de Privacidade — já cobria o escopo real de dados, pública sem login
- [x] Exclusão de conta remove dados de todas as tabelas relacionadas (LGPD) — `services/price-service/src/user_auth/router.py` (PR #55, `076246b`)

## IA / vacinas

- [x] Cadastro manual de vacina funciona sem foto/IA (3 fluxos: foto+IA, foto ruim+correção manual, 100% manual)
- [x] Falha de IA nunca bloqueia — leitura de carteirinha de vacina agora tem timeout de 30s no backend + abort de 90s no cliente + botão "Cancelar" visível (PR #55, `031b50a`)

## Commerce / afiliados

- [x] Araujo (advertiser Awin 17919) excluído em todas as camadas — confirmado ao vivo em produção: nenhum path público (`/api/catalog/search/v2`, `/api/commerce/offers`, `/api/catalog/search`) retorna `araujo`
- [x] Petz confirmado desativado em produção — `/api/handoff/shop?partner=petz` → 503 `partner_url_not_configured`
- [x] Links de afiliado no mobile abrem fora do WebView em plataforma nativa — `navigateToPartnerUrl` detecta `Capacitor.isNativePlatform()` e usa `@capacitor/browser`; comportamento em PWA/tab normal inalterado

## Responsividade / UX mobile

- [x] Touch target do botão fechar em `OverdueAlertsGrid.tsx` corrigido (24px → 36px) (PR #55, `cefbee3`)
- [ ] 3 botões de fechar em ~32px identificados como borderline — não bloqueiam lançamento, ficam como P2
- [ ] Smoke test completo em 320/360/375/390/412/430px + tablet + desktop dos fluxos: criar conta, login, cadastrar pet, foto do pet, home, ração, vacina manual, vacina por foto, medicação, antiparasitário, Loja, busca, escolher oferta, configurações, excluir conta

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
- [ ] `@capacitor/push-notifications` como substituto do Web Push cru para o shell nativo
- [x] Build de release compilável + AAB gerado — `./gradlew bundleRelease` rodou com sucesso, `app-release.aab` gerado e assinado com um keystore de TESTE (`~/.petmol-mobile-keys/TEST-ONLY-do-not-use-for-real-release.jks`, fora do repo, senha só em env var). **Esse keystore de teste não deve ser usado para a submissão real** — gerar um keystore de produção novo, guardar senha e arquivo com backup seguro (perda = não consegue mais atualizar o app depois do primeiro upload)
- [x] Ícone adaptativo e splash trocados pela marca PETMOL (gerados via `@capacitor/assets` a partir de `apps/web/public/icons/icon-source.svg`, o mesmo mark já usado no PWA) — build de release re-verificado com os novos assets
- [ ] Validar permissões declaradas no `AndroidManifest.xml` (câmera, notificações) contra o que o app realmente usa
- [ ] Play Console: Internal Testing track

## iOS

- [x] Projeto Xcode gerado (`npx cap add ios` não exige Xcode, só build/archive exigem) — mesmo shell Capacitor do Android (`server.url` remoto), bundle id `br.com.petmol.app` herdado automaticamente do `capacitor.config.ts`
- [x] Usage descriptions de câmera/fotos adicionadas no `Info.plist` (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`) — faltavam no template padrão
- [ ] Entitlement de notificação push (`aps-environment`) — adicionar quando `@capacitor/push-notifications` entrar
- [ ] **Bloqueado hoje**: Xcode completo não está instalado neste Mac (só Command Line Tools) — `xcodebuild` recusa rodar; requer instalação interativa via App Store com o Apple ID do usuário, não pode ser feito de forma não-interativa. CocoaPods também não está instalado (necessário pra `pod install` antes de abrir o projeto no Xcode)
- [x] Ícones e launch screen trocados pela marca PETMOL (mesmo processo do Android — `@capacitor/assets`, AppIcon + Splash light/dark)
- [ ] Documentar para App Review que o app usa recursos nativos reais do PETMOL (cadastro de pet, scanner, alimentação, saúde, lembretes, medicação, comparação de produtos) — não é apenas um WebView passivo
- [ ] Build de release compilável + archive — depende do Xcode estar instalado
- [ ] TestFlight interno

## Metadados de loja

- [x] Apple App Privacy mapeado a partir do código real (schemas de banco + confirmação de que não há SDK de analytics/ads/crash de terceiros) — ver `docs/APP_STORE_METADATA.md`
- [x] Google Data Safety — matriz equivalente pronta em `docs/APP_STORE_METADATA.md`
- [ ] Conta de revisor dedicada — procedimento documentado em `docs/APP_STORE_METADATA.md`, mas **as credenciais (e-mail/senha) dependem de decisão sua** antes de eu criar a conta em produção
- [x] Review notes para App Store e Google Play — rascunho pronto em `docs/APP_STORE_METADATA.md`
- [x] Copy de loja sem "grátis"/"menor preço garantido"/"diagnóstico"/"garantia de saúde" — landing page já corrigida (PR #55); lembretes documentados pra aplicar na ficha das lojas também

## Estado geral (24/08/2026)

Todo o código local/reversível identificado como P0 nesta rodada está commitado na PR #55 (`fix/release-day-p0-legal-copy`), CI verde, aguardando merge. Android já tem shell Capacitor funcional com build de release + AAB assinado (com keystore de teste) gerado localmente, com ícone/splash da marca real. Metadados de loja (Apple/Google) e benchmark de capacidade prontos e documentados. O que resta é: (1) build iOS bloqueado por falta de Xcode neste Mac — ação manual do usuário, (2) gerar o keystore de produção real do Android (fora do repo, com backup seguro) antes da submissão de verdade — decisão sua, não gerado hoje por ser um artefato permanente e de alto risco se perdido, (3) decidir e-mail/senha da conta de revisor pra eu criar em produção, (4) configurar destino real de backup off-site.
