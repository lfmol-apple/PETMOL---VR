# Rastreamento de anúncios (Meta + TikTok) — roteiro único

PRs: #655 (TikTok) e #656 (Meta + eventos), empilhados. O código está pronto; falta só o que depende de painel/aparelho.
Atalhos: `scripts/ads-tracking.sh` (`check`, `hashes`, `set-ios-token`, `set-android-secret`, `build-android`, `build-ios`).

## Em uma frase
O Android nunca teve o SDK da Meta (só o iOS) — por isso a Meta atribuía zero instalações no Android. Agora tem. O TikTok também foi integrado nos dois.

## Quem faz o quê (qualquer um dos dois pode pegar qualquer item)

| # | Onde | O quê | Resultado |
|---|------|-------|-----------|
| 1 | TikTok Events Manager > fonte **PETMOL iOS** (App ID 7690157868766560262) | Copiar o **Access Token** | `scripts/ads-tracking.sh set-ios-token <token>` |
| 2 | TikTok > fonte **PETMOL Android** (App ID 7695103016026062900) | Confirmar o **App Secret** | `scripts/ads-tracking.sh set-android-secret <secret>` (só se mudou) |
| 3 | TikTok for Business Developers (doc do SDK iOS) | Conferir a lista **oficial de SKAdNetwork** | Hoje há `238da6jt44` e `22mmun2rn5` (fonte não oficial). Se faltar algum, pedir para adicionar em `ios/App/App/Info.plist` |
| 4 | Meta (app 976747438068822) > Configurações > Android | Pacote `br.com.petmol.app`, classe `br.com.petmol.app.MainActivity`, **Key Hashes** (`scripts/ads-tracking.sh hashes`) | Ajuda a Meta a reconhecer o app (não era a causa do problema) |
| 5 | Play Console | ✅ **Feito** (lido da conta em 12/10/2026) | Ver "Chaves" abaixo |

## Chaves (conferidas na Play Console em 12/10/2026)
- **Chave de assinatura do app** (a que está nos celulares de quem instala da Play Store — **esta é a Key Hash para a Meta**):
  SHA-1 `94:D4:5C:2D:DF:7F:D0:EB:2D:65:B4:77:02:E5:88:CB:FA:E0:36:F2` → **Key Hash Meta `lNRcLd9/0OstZbR3AuWIy/rgNvI=`**
  (SHA-256 `FE:B6:B8:E9:8A:CE:EF:AD:F6:E6:9D:EA:28:0C:82:AD:EB:AD:FE:FA:C7:1E:C9:C3:2B:C4:AA:A0:32:30:36:89`)
- **Chave de upload** (a que assina o AAB enviado): SHA-1 `DC:3A:BB:98:…` = keystore `~/.petmol-mobile-keys/petmol-release.jks` (12/09). **O AAB de produção precisa ser assinado com ESSE**, não com o do Desktop (19/09), que a Play não conhece.
- Debug (builds de teste): Key Hash `bnbncXL5CYjZ9VKrhiH2tlOwvxo=`.
- Cadastre na Meta: a de assinatura do app (`lNRc…`) + a de debug. A de upload não é necessária.
- Pelo Chrome: Meta e TikTok Ads **não estavam logados**; a Play Console estava.

## Depois dos itens 1–3
1. `scripts/ads-tracking.sh check` (diz o que ainda falta).
2. `scripts/ads-tracking.sh build-android` e `build-ios` (iOS: Xcode > Product > Archive > Distribute).
3. **Teste** (aparelho real):
   - Android: instalar o `app-debug.apk`, abrir; no Events Manager do TikTok (fonte Android > *Testar evento*) devem aparecer InstallApp e LaunchApp; criar conta de teste → Registration.
   - iOS: instalar o build de desenvolvimento, aceitar o pedido de rastreamento; mesma conferência na fonte iOS. Meta: Gerenciador de Eventos > Testar eventos.
4. Só então mergear #655 → #656 e publicar nas lojas.

## Eventos de negócio (Meta e TikTok, iguais nos dois sistemas)
registration (Meta: `fb_mobile_complete_registration`, TikTok: `Registration`), `first_pet_created`, `vaccine_record_created`, `food_cycle_created`, `medication_created`, onboarding concluído (Meta: `fb_mobile_tutorial_completion`, TikTok: `onboarding_completed`).
Lista e nomes: `apps/web/src/lib/adEvents.ts`. Depois do 1º disparo, marcar como conversão nos painéis.

## Privacidade (lojas)
- **Play Console > Segurança dos dados:** declarar ID de publicidade/dispositivo usado para anúncios e análise, compartilhado com terceiros (Meta, TikTok).
- **App Store Connect > Privacidade do app:** Identificadores de dispositivo — publicidade de terceiros e análise — usados para rastreamento. (Já declarado pelo Meta; conferir.)

## Segredos
Nunca no git: Access Token iOS em `ios/Secrets.xcconfig`; App Secret Android em `android/local.properties` ou na env `PETMOL_TIKTOK_APP_SECRET`. Não colar em chat/grupo; mandar só em privado.
