# SDK da Meta (Facebook) no app iOS — campanhas de instalação iOS 14+

App: PETMOL · Bundle ID `br.com.petmol.app` · App Store ID `6809570555` · Facebook App ID `976747438068822`.
Versão desta atualização: **1.1 (build 8)** (antes: 1.0 build 7).

## O que mudou (só o app iOS; nada do site/backend)
| Arquivo | Mudança |
|---|---|
| `apps/web/ios/App/App.xcodeproj/project.pbxproj` | Facebook iOS SDK 18.1.1 (SPM, produto `FacebookCore`) ligado direto ao alvo `App` (não ao `CapApp-SPM`, que o Capacitor regenera). `MARKETING_VERSION` 1.0→1.1, `CURRENT_PROJECT_VERSION` 7→8 (Debug e Release). |
| `.../xcshareddata/swiftpm/Package.resolved` | Fixa o SDK da Meta em 18.1.1 (rev `80d0ee8`). |
| `apps/web/ios/App/App/Info.plist` | `FacebookAppID`, `FacebookClientToken`, `FacebookDisplayName`=PETMOL, `FacebookAutoLogAppEventsEnabled`=true, `FacebookAdvertiserIDCollectionEnabled`=true, `SKAdNetworkItems` (`v9wttpbfk9.skadnetwork`, `n38lu8286q.skadnetwork`), `NSUserTrackingUsageDescription` (pt-BR). |
| `apps/web/ios/App/App/AppDelegate.swift` | Inicializa o SDK em `didFinishLaunching`; ao ficar ativo (notificação `UIApplication.didBecomeActiveNotification`, porque o app usa cenas e o iOS não chama `applicationDidBecomeActive` do AppDelegate) pede o ATT (com pequeno atraso, só uma vez por vez) e depois chama `AppEvents.shared.activateApp()`; no iOS < 17 repassa o status do ATT ao SDK (no 17+ o SDK lê sozinho). Nada do que já existia (push APNs, cenas) foi alterado. |
| `apps/web/ios/App/App/PrivacyInfo.xcprivacy` | `NSPrivacyTracking`=true, domínio `ep1.facebook.com` (o mesmo do manifesto do SDK) e dado coletado "ID do dispositivo" (rastreamento/publicidade/analytics). |

> O Client Token é público por design (vai dentro do app). Não é segredo.
> **Compilado e rodado no simulador (iPad Pro 13") em 26/09/2026**: build OK, aviso do ATT aparece com o texto em pt-BR e o SDK envia a ativação ao App ID. **Não testado ainda no iPhone real** (IDFA, "Testar eventos") — é o passo 1 abaixo.

## Testar antes de enviar
1. Abra `apps/web/ios/App/App.xcodeproj` no Xcode, deixe o Xcode baixar o pacote da Meta (Product ▸ Resolve Package Versions) e rode no **iPhone real** (o ATT não aparece direito no simulador).
2. Na 1ª abertura deve aparecer o aviso da Apple com o texto "Usamos essa permissão para mostrar anúncios mais relevantes para você." (Se vier junto outro aviso, como notificações, o do ATT pode aparecer na abertura seguinte — é esperado.)
3. Para rever o aviso: apague o app do iPhone e instale de novo (ou Ajustes ▸ Privacidade ▸ Rastreamento).
4. **Eventos chegando na Meta:** Gerenciador de Eventos ▸ fonte de dados do app PETMOL ▸ **Testar eventos** ▸ informe o ID de publicidade (IDFA) do iPhone (Ajustes ▸ Privacidade ▸ Rastreamento tem que estar permitido) ▸ abra o app: devem aparecer `fb_mobile_activate_app` e "App Installs". Pode levar de 1 a 2 minutos. Se você recusou o ATT, o evento pode não aparecer aqui (a Meta usa o SKAdNetwork).
5. Depois de publicado, a "Campanha para iOS 14+" no Gerenciador de Anúncios deixa de mostrar o bloqueio (pode levar até 24 h após os primeiros eventos).

## Antes de enviar à App Store (conformidade)
- **App Store Connect ▸ Privacidade do app**: declarar que o app **rastreia** o usuário e coleta **ID do dispositivo** para publicidade de terceiros e análise.
- **Política de Privacidade (site)**: mencionar o uso do SDK da Meta e do identificador de publicidade (LGPD). *Não alterada neste PR.*
- Conferir no painel da Meta que a plataforma iOS tem Bundle ID e App Store ID acima.
- Screenshots da loja: atualizar, se for o caso (ver checklist de release).

## Gerar o build e enviar (passo a passo)
1. `git pull` do `main` já com este PR mergeado.
2. `cd apps/web && npx cap sync ios` **não é necessário** (nenhum plugin mudou). Se rodar, o SDK da Meta continua, pois está no projeto e não no `CapApp-SPM`.
3. Xcode ▸ abra `App.xcodeproj` ▸ alvo **App** ▸ Signing & Capabilities com o time correto ▸ confirme **Version 1.1 / Build 8**.
4. Destino **Any iOS Device (arm64)** ▸ **Product ▸ Archive**.
5. Organizer ▸ **Distribute App ▸ App Store Connect ▸ Upload**.
6. App Store Connect ▸ PETMOL ▸ **+ Versão** 1.1 ▸ selecione o build 8 ▸ preencha "Novidades", atualize privacidade e screenshots ▸ **Enviar para revisão**.
7. Nas respostas de exportação/criptografia, siga como na 1.0 (`ITSAppUsesNonExemptEncryption` = false).

## Como desfazer
Reverter este PR (`git revert`) e gerar novo build; o app em produção (1.0 build 7) não é afetado até a 1.1 ser lançada.
