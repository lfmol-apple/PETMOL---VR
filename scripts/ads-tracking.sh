#!/usr/bin/env bash
# Atalhos do rastreamento de anúncios (Meta + TikTok) nos apps iOS/Android.
# Uso: scripts/ads-tracking.sh <comando>   (veja docs/ADS_TRACKING_RUNBOOK.md)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"
JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@24/libexec/openjdk.jdk/Contents/Home}"
export JAVA_HOME
CREDS="$HOME/.petmol-mobile-keys/RELEASE-KEYSTORE-CREDENTIALS.txt"

keyhash() { # keystore storepass alias -> SHA1 + Key Hash da Meta (nunca imprime senha)
  local tmp; tmp="$(mktemp)"
  if ! "$JAVA_HOME/bin/keytool" -exportcert -keystore "$1" -storepass "$2" -alias "$3" -file "$tmp" >/dev/null 2>&1; then
    rm -f "$tmp"; echo "  (falhou: senha/alias não confere)"; return
  fi
  echo "  SHA-1:         $(openssl dgst -sha1 -binary < "$tmp" | xxd -p | tr -d '\n' | sed 's/../&:/g;s/:$//' | tr a-f A-F)"
  echo "  Key Hash Meta: $(openssl dgst -sha1 -binary < "$tmp" | base64)"
  rm -f "$tmp"
}

case "${1:-}" in
  hashes)
    echo "== Debug"; keyhash "$HOME/.android/debug.keystore" android androiddebugkey
    if [ -f "$CREDS" ]; then
      SP="$(grep '^STORE_PASS=' "$CREDS" | cut -d= -f2- | tr -d '\r"'"'"' ')"; AL="$(grep '^KEY_ALIAS=' "$CREDS" | cut -d= -f2- | tr -d '\r"'"'"' ')"
      k="$HOME/.petmol-mobile-keys/petmol-release.jks"
      [ -f "$k" ] && { echo "== UPLOAD KEY — assina o AAB da Play (.petmol-mobile-keys, 12/09): $k"; keyhash "$k" "$SP" "$AL"; }
    else echo "(sem $CREDS: release de 12/09 não calculado)"; fi
    N="$HOME/Desktop/petmol-android-release-keystore/LEIA-E-GUARDE-COM-SEGURANCA.txt"; K2="$HOME/Desktop/petmol-android-release-keystore/petmol-release.keystore"
    if [ -f "$N" ] && [ -f "$K2" ]; then
      SP2="$(grep -i '^Senha' "$N" | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r')"; AL2="$(grep -i '^Alias:' "$N" | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r ')"
      echo "== Desktop 19/09 (NÃO é a da Play — não usar para o AAB): $K2"; keyhash "$K2" "$SP2" "$AL2"
    fi
    echo; echo "Play App Signing ativo: a Key Hash que vale para a Meta é a da CHAVE DE ASSINATURA DO APP = lNRcLd9/0OstZbR3AuWIy/rgNvI= (conferida na Play Console). O keystore de 12/09 é a chave de UPLOAD (assina o AAB); o do Desktop (19/09) a Play não conhece."
    ;;
  set-ios-token)
    [ -n "${2:-}" ] || { echo "uso: $0 set-ios-token <ACCESS_TOKEN_TIKTOK_IOS>"; exit 1; }
    printf 'TIKTOK_ACCESS_TOKEN = %s\n' "$2" > "$WEB/ios/Secrets.xcconfig"; chmod 600 "$WEB/ios/Secrets.xcconfig"
    echo "ok: ios/Secrets.xcconfig gravado (fora do git)."
    ;;
  set-android-secret)
    [ -n "${2:-}" ] || { echo "uso: $0 set-android-secret <APP_SECRET_TIKTOK_ANDROID>"; exit 1; }
    f="$WEB/android/local.properties"; touch "$f"; grep -v '^petmol.tiktok.appSecret=' "$f" > "$f.tmp" || true
    printf 'petmol.tiktok.appSecret=%s\n' "$2" >> "$f.tmp"; mv "$f.tmp" "$f"
    echo "ok: android/local.properties atualizado (fora do git)."
    ;;
  check)
    ok=1
    [ -s "$WEB/ios/Secrets.xcconfig" ] && grep -q 'TIKTOK_ACCESS_TOKEN = .\+' "$WEB/ios/Secrets.xcconfig" && echo "OK   Access Token do TikTok (iOS)" || { echo "FALTA Access Token do TikTok (iOS) -> $0 set-ios-token <token>"; ok=0; }
    grep -q '^petmol.tiktok.appSecret=.\+' "$WEB/android/local.properties" 2>/dev/null && echo "OK   App Secret do TikTok (Android)" || { echo "FALTA App Secret do TikTok (Android) -> $0 set-android-secret <secret>"; ok=0; }
    grep -c '\.skadnetwork' "$WEB/ios/App/App/Info.plist" | xargs echo "INFO identificadores SKAdNetwork no Info.plist:"
    [ $ok = 1 ] && echo "Tudo pronto para gerar os builds." || exit 1
    ;;
  build-android)
    ( cd "$WEB/android" && ./gradlew :app:assembleDebug :app:bundleRelease --console=plain -q )
    echo "APK de teste: $WEB/android/app/build/outputs/apk/debug/app-debug.apk"
    echo "AAB (Play Store; assina só se PETMOL_ANDROID_KEYSTORE_* estiverem no ambiente): $WEB/android/app/build/outputs/bundle/release/app-release.aab"
    ;;
  build-ios)
    ( cd "$WEB/ios/App" && xcodebuild -project App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build | tail -1 )
    echo "Para enviar à App Store: abra apps/web/ios/App/App.xcodeproj no Xcode > Product > Archive > Distribute App."
    ;;
  *)
    echo "comandos: hashes | set-ios-token <t> | set-android-secret <s> | check | build-android | build-ios"; exit 1;;
esac
