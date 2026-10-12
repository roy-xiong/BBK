#!/bin/bash
# 将设备Release构建封装为可自行重签名的IPA；不创建证书、不访问签名账号。
set -euo pipefail

ios_app="build/ios/iphoneos/Runner.app"
ipa_directory="build/ipa"
test -d "$ios_app"
test -f "$ios_app/Runner"
test -f "$ios_app/Info.plist"
test -d "$ios_app/Frameworks/Flutter.framework"
test -d "$ios_app/Frameworks/App.framework"

mkdir -p "$ipa_directory"
# 使用独立临时目录，避免重复构建把上一次Payload或签名文件混入新包。
ipa_staging="$(mktemp -d "${TMPDIR:-/tmp}/bbk-unsigned-XXXXXX")"
trap 'rm -rf "$ipa_staging"' EXIT
mkdir -p "$ipa_staging/Payload"
ditto "$ios_app" "$ipa_staging/Payload/Runner.app"
ditto -c -k --keepParent "$ipa_staging/Payload" "$ipa_directory/bbk-unsigned.ipa"
unzip -tq "$ipa_directory/bbk-unsigned.ipa"
shasum -a 256 "$ipa_directory/bbk-unsigned.ipa" > "$ipa_directory/bbk-unsigned.ipa.sha256"
echo "未签名IPA已生成：$ipa_directory/bbk-unsigned.ipa"
