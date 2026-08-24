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
- [ ] nginx de produção versionado em `deploy/nginx/petmol.conf` (hoje só existe na VPS — risco documentado em `docs/DEPLOYMENT.md`)

## Segurança

- [x] JWT secret fail-closed em produção, CORS restrito, docs/redoc desativados em prod, bcrypt, rate limiting em login/registro/reset de senha, sem segredos client-side ou commitados
- [x] CI (frontend + backend) verde na branch de release

## Capacidade

- [ ] Benchmark de carga local (nunca em produção) em 50/100/250/500/1000 de concorrência nos endpoints health/login/home/pets/reminders/commerce-offers
- [ ] Documentar thresholds de escala (CPU sustentado, RAM, p95, conexões de banco) a partir do benchmark

## Android

- [x] Scaffolding do Capacitor (`npx cap init` + `@capacitor/core`/`@capacitor/browser`/`@capacitor/android`) — `capacitor.config.ts` com `server.url` apontando pro site real (app roda `output: 'standalone'`, sem export estático, então o shell nativo carrega o site ao vivo em vez de manter um segundo frontend)
- [x] Package ID definido: `br.com.petmol.app` (confirmado sem conflito em todo o repo antes de fixar)
- [x] Android SDK instalado via CLI tools (`brew install --cask android-commandlinetools` + `sdkmanager`, sem Android Studio) — `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`; JDK 21 (exigido pelo Gradle do template Capacitor 8) instalado via tarball portátil da Adoptium, sem sudo
- [x] `@capacitor/browser` (`Browser.open()`) adicionado em `navigateToPartnerUrl` para links de afiliado escaparem do WebView em plataforma nativa
- [ ] `@capacitor/push-notifications` como substituto do Web Push cru para o shell nativo
- [x] Build de release compilável + AAB gerado — `./gradlew bundleRelease` rodou com sucesso, `app-release.aab` gerado e assinado com um keystore de TESTE (`~/.petmol-mobile-keys/TEST-ONLY-do-not-use-for-real-release.jks`, fora do repo, senha só em env var). **Esse keystore de teste não deve ser usado para a submissão real** — gerar um keystore de produção novo, guardar senha e arquivo com backup seguro (perda = não consegue mais atualizar o app depois do primeiro upload)
- [ ] Ícone adaptativo e splash ainda são os placeholders genéricos do Capacitor — trocar pela marca PETMOL antes de submeter
- [ ] Validar permissões declaradas no `AndroidManifest.xml` (câmera, notificações) contra o que o app realmente usa
- [ ] Play Console: Internal Testing track

## iOS

- [x] Projeto Xcode gerado (`npx cap add ios` não exige Xcode, só build/archive exigem) — mesmo shell Capacitor do Android (`server.url` remoto), bundle id `br.com.petmol.app` herdado automaticamente do `capacitor.config.ts`
- [x] Usage descriptions de câmera/fotos adicionadas no `Info.plist` (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`) — faltavam no template padrão
- [ ] Entitlement de notificação push (`aps-environment`) — adicionar quando `@capacitor/push-notifications` entrar
- [ ] **Bloqueado hoje**: Xcode completo não está instalado neste Mac (só Command Line Tools) — `xcodebuild` recusa rodar; requer instalação interativa via App Store com o Apple ID do usuário, não pode ser feito de forma não-interativa. CocoaPods também não está instalado (necessário pra `pod install` antes de abrir o projeto no Xcode)
- [ ] Ícones e launch screen ainda são os placeholders genéricos do Capacitor — trocar pela marca PETMOL antes de submeter
- [ ] Documentar para App Review que o app usa recursos nativos reais do PETMOL (cadastro de pet, scanner, alimentação, saúde, lembretes, medicação, comparação de produtos) — não é apenas um WebView passivo
- [ ] Build de release compilável + archive — depende do Xcode estar instalado
- [ ] TestFlight interno

## Metadados de loja

- [ ] Apple App Privacy — mapear com base no código real: nome, email, ID de conta, informações do pet, fotos, dados de saúde do pet, analytics de uso, dados de crash, dados de clique de afiliado
- [ ] Google Data Safety — matriz equivalente (coletado? compartilhado? propósito? obrigatório? criptografado em trânsito? deletável?)
- [ ] Conta de revisor dedicada (nunca uma conta real) com pet, ração, vacina, medicação e antiparasitário cadastrados — credenciais documentadas fora do Git
- [ ] Review notes para App Store e Google Play (como logar, cadastrar pet, scanner, vacinas, notificações, Loja, links externos, explicação de afiliados)
- [ ] Copy de loja sem "grátis"/"menor preço garantido"/"diagnóstico"/"garantia de saúde"

## Estado geral (24/08/2026)

Todo o código local/reversível identificado como P0 nesta rodada está commitado na PR #55 (`fix/release-day-p0-legal-copy`), CI verde, aguardando merge. Android já tem shell Capacitor funcional com build de release + AAB assinado (com keystore de teste) gerado localmente. O que resta é: (1) build iOS bloqueado por falta de Xcode neste Mac — ação manual do usuário, (2) gerar o keystore de produção real do Android (fora do repo, com backup seguro) antes da submissão de verdade, (3) ícone/splash com a marca PETMOL em vez dos placeholders do Capacitor, (4) preparação de metadados de loja, (5) benchmark de capacidade, (6) configurar destino real de backup off-site.
