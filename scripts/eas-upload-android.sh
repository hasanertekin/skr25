#!/usr/bin/env bash
set -euo pipefail

ACCOUNT="${1:-ertekinhss-team}"

if [[ ! -f "eas.json" || ! -f "app.config.ts" ]]; then
  echo "Bu script'i Expo projesinin kök dizininde çalıştırın." >&2
  exit 1
fi
if ! grep -Fq "owner: \"$ACCOUNT\"" app.config.ts; then
  echo "app.config.ts hedef Expo hesabı @$ACCOUNT ile eşleşmiyor; önce EAS bağlantısını kontrol edin." >&2
  exit 1
fi
if ! grep -q 'projectId: "[0-9a-f-]\{36\}"' app.config.ts; then
  echo "app.config.ts içinde EAS projectId bulunamadı." >&2
  exit 1
fi

if [[ -z "${EXPO_TOKEN:-}" ]]; then
  read -r -s -p "Expo Personal Access Token (giriş gizlidir): " EXPO_TOKEN
  printf '\n'
fi
if [[ -z "${EXPO_TOKEN:-}" ]]; then
  echo "Token girilmedi; işlem iptal edildi." >&2
  exit 1
fi
export EXPO_TOKEN
export EXPO_NO_TELEMETRY=1
trap 'unset EXPO_TOKEN' EXIT

cat <<EOF
Hedef Expo: @${ACCOUNT}/sukur-gunlugu
Build profili: preview (Android internal APK)
Google Play'e gönderim: yapılmayacak
EOF
read -r -p "Hedef projeye kaynakları yükleyip Android APK build'ini başlatayım mı? [y/N] " CONFIRM
case "$CONFIRM" in
  y|Y|yes|YES|evet|EVET) ;;
  *) echo "İşlem iptal edildi."; exit 0 ;;
esac

npx --yes eas-cli@latest whoami
npx --yes eas-cli@latest project:info
npx --yes eas-cli@latest build --platform android --profile preview
